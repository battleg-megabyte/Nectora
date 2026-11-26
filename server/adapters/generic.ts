import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, safeFetch, sanitizeHttpUrl } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';
import { parseHlsMasterVariants } from './probe.js';

export class GenericMediaAdapter implements PlatformAdapter {
  readonly platformName = 'Web Video';

  canHandle(url: string): boolean {
    return typeof url === 'string' && url.startsWith('http');
  }

  private async extractVimeoConfig(
    vimeoId: string,
    originalUrl: string,
    hashParam?: string
  ): Promise<AdapterResult | null> {
    try {
      const cfgUrl = `https://player.vimeo.com/video/${vimeoId}/config${hashParam ? `?h=${encodeURIComponent(hashParam)}` : ''}`;
      const cfgRes = await fetch(cfgUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://vimeo.com/',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!cfgRes.ok) return null;

      const cfg: any = await cfgRes.json();
      const progressive: any[] = cfg?.request?.files?.progressive || [];
      const hlsObj = cfg?.request?.files?.hls;
      const defaultCdn = hlsObj?.default_cdn;
      const hlsUrl =
        (defaultCdn && hlsObj?.cdns?.[defaultCdn]?.url) ||
        (hlsObj?.cdns ? (Object.values(hlsObj.cdns)[0] as any)?.url : undefined);

      const qualities: QualityOption[] = [];

      const isDrmHls = Boolean(hlsUrl && (hlsUrl.includes('/drm/') || hlsUrl.includes('cbcs')));
      if (progressive.length > 0) {
        const sorted = [...progressive].sort((a, b) => (b.height || 0) - (a.height || 0));
        sorted.forEach((p, i) => {
          const cleanP = sanitizeHttpUrl(p.url);
          if (!cleanP) return;
          qualities.push({
            id: `${p.height || 720}p_${i}`,
            label: `${p.quality || `${p.height || 720}p`} MP4`,
            resolution: p.quality || `${p.height || 720}p`,
            format: 'mp4',
            url: cleanP,
            isNative: qualities.length === 0,
            hasAudio: true,
          });
        });
      } else if (hlsUrl && !isDrmHls) {
        const safeHls = sanitizeHttpUrl(hlsUrl);
        if (safeHls) {
          const variants = await parseHlsMasterVariants(safeHls);
          if (variants.length > 0) {
            variants.forEach((v, idx) => {
              const cleanV = sanitizeHttpUrl(v.url);
              if (!cleanV) return;
              qualities.push({
                id: `${v.resolution}_${idx}`,
                label: `${v.resolution} MP4 (HLS)`,
                resolution: v.resolution,
                format: 'mp4',
                url: cleanV,
                width: v.width,
                height: v.height,
                isNative: qualities.length === 0,
                hasAudio: true,
              });
            });
          } else {
            qualities.push({
              id: 'hls_mp4',
              label: 'Original HLS Stream (MP4)',
              resolution: 'original',
              format: 'mp4',
              url: safeHls,
              isNative: true,
              hasAudio: true,
            });
          }
        }
      }

      if (qualities.length > 0) {
        qualities.push({
          id: 'audio',
          label: 'MP3 Audio (320 kbps)',
          resolution: 'audio',
          format: 'mp3',
          bitrateKbps: 320,
          codec: 'MP3 320k',
          url: qualities[qualities.length - 1].url,
          isNative: true,
          hasAudio: true,
        });

        return {
          success: true,
          data: {
            id: `vimeo_${vimeoId}`,
            originalUrl,
            platform: 'vimeo',
            title: cfg?.video?.title || `Vimeo Video #${vimeoId}`,
            author: {
              name: cfg?.video?.owner?.name || 'Vimeo Creator',
              username: cfg?.video?.owner?.account_type || 'vimeo',
              avatarUrl: sanitizeHttpUrl(cfg?.video?.owner?.img) || undefined,
              profileUrl: sanitizeHttpUrl(cfg?.video?.owner?.url) || undefined,
            },
            thumbnailUrl: sanitizeHttpUrl(cfg?.video?.thumbs?.['1280'] || cfg?.video?.thumbs?.base),
            durationSeconds: cfg?.video?.duration || 0,
            qualities,
            extractedAt: new Date().toISOString(),
            sourceType: 'video',
          },
        };
      }

      if (isDrmHls) {
        return {
          success: false,
          statusCode: 403,
          error:
            'This Vimeo video uses DRM protection (FairPlay CBCS) with no public progressive download stream.',
        };
      }
    } catch {
      // Vimeo config fallback unavailable
    }
    return null;
  }

  private async extractFromHtml(url: string, cookies?: string): Promise<AdapterResult> {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ];

    for (const ua of userAgents) {
      try {
        const headers: Record<string, string> = {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        };
        if (cookies) {
          headers['Cookie'] = cookies;
        }

        const { response: pageRes, finalUrl } = await safeFetch(url, {
          headers,
          signal: AbortSignal.timeout(7000),
        });
        if (!pageRes.ok) {
          await pageRes.body?.cancel().catch(() => {});
          continue;
        }

        const resolvedPageUrl = sanitizeHttpUrl(finalUrl || url) || url;
        const ctype = (pageRes.headers.get('content-type') || '').toLowerCase();
        if (ctype.startsWith('video/') || ctype.startsWith('audio/')) {
          await pageRes.body?.cancel().catch(() => {});
          const parsed = new URL(resolvedPageUrl);
          const isAud = ctype.startsWith('audio/');
          return {
            success: true,
            data: {
              id: `web_${Date.now()}`,
              originalUrl: url,
              platform: 'direct',
              title: parsed.hostname || 'Direct Stream',
              description: `Direct stream from ${parsed.hostname}`,
              author: { name: parsed.hostname, username: parsed.hostname, profileUrl: parsed.origin },
              thumbnailUrl: '',
              qualities: isAud
                ? [
                    {
                      id: 'audio',
                      label: 'Original Audio (MP3)',
                      resolution: 'audio',
                      format: 'mp3',
                      bitrateKbps: 320,
                      codec: 'MP3 320k',
                      url: resolvedPageUrl,
                      isNative: true,
                      hasAudio: true,
                    },
                  ]
                : [
                    {
                      id: 'original_mp4',
                      label: 'Original Video Stream (MP4)',
                      resolution: 'original',
                      format: 'mp4',
                      url: resolvedPageUrl,
                      isNative: true,
                      hasAudio: true,
                    },
                    {
                      id: 'audio',
                      label: 'MP3 Audio (320 kbps)',
                      resolution: 'audio',
                      format: 'mp3',
                      bitrateKbps: 320,
                      codec: 'MP3 320k',
                      url: resolvedPageUrl,
                      isNative: true,
                      hasAudio: true,
                    },
                  ],
              extractedAt: new Date().toISOString(),
              sourceType: isAud ? 'audio' : 'direct_stream',
            },
          };
        }

        const html = await pageRes.text();

        const embeddedVimeo = html.match(/player\.vimeo\.com\/video\/(\d+)(?:\?h=([a-z0-9]+))?/i);
        if (embeddedVimeo && embeddedVimeo[1]) {
          const vimeoResult = await this.extractVimeoConfig(
            embeddedVimeo[1],
            url,
            embeddedVimeo[2]
          );
          if (vimeoResult) return vimeoResult;
        }

        const rawCandidates = [
          html.match(/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i)?.[1],
          html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1],
          html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8|mp3|m4a|wav|ogg)[^"']*)["']/i)?.[1],
          html.match(/<audio[^>]+src=["']([^"']+)["']/i)?.[1],
          html.match(/"contentUrl"\s*:\s*"([^"]+\.(?:mp4|m3u8|webm|mp3|m4a)[^"]*)"/i)?.[1],
          html.match(/(https?:\/\/[^\s"'<>\\]+\.(?:mp4|m3u8|mp3|m4a)(?:\?[^\s"'<>\\]*)?)/i)?.[1],
          html.match(/<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i)?.[1],
          html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i)?.[1],
        ].filter((c): c is string => Boolean(c));

        let mediaUrl: string | null = null;
        for (const candidate of rawCandidates) {
          const cleaned = candidate
            .replace(/&amp;/g, '&')
            .replace(/\\u0026/g, '&')
            .replace(/\\\//g, '/');
          if (
            cleaned.includes('player.vimeo.com/video/') ||
            cleaned.includes('/embed/') ||
            cleaned.includes('.swf')
          ) {
            continue;
          }
          mediaUrl = cleaned;
          break;
        }

        if (mediaUrl) {
          if (mediaUrl.startsWith('//')) {
            mediaUrl = `https:${mediaUrl}`;
          } else if (mediaUrl.startsWith('/')) {
            const origin = new URL(url).origin;
            mediaUrl = `${origin}${mediaUrl}`;
          }

          const safeCand = await validateSafeUrl(mediaUrl);
          if (!safeCand.safe) continue;
          const sanitizedMediaUrl = sanitizeHttpUrl(mediaUrl);
          if (!sanitizedMediaUrl) continue;

          const titleMatch =
            html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<title>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : 'Web Media';

          const imgMatch =
            html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
          const thumbnailUrl = imgMatch ? sanitizeHttpUrl(imgMatch[1].replace(/&amp;/g, '&')) : '';
          mediaUrl = sanitizedMediaUrl;

          const parsed = new URL(url);
          const isAudioOnly = /\.(mp3|m4a|wav|ogg|aac|flac)(?:\?|$)/i.test(mediaUrl);
          const lowerHost = parsed.hostname.toLowerCase();
          const detectedPlat = lowerHost.includes('pinterest') || lowerHost.includes('pin.it')
            ? 'pinterest'
            : lowerHost.includes('threads.')
              ? 'threads'
              : lowerHost.includes('vimeo.com')
                ? 'vimeo'
                : 'direct';

          const qualities: QualityOption[] = isAudioOnly
            ? [
                {
                  id: 'audio',
                  label: mediaUrl.toLowerCase().includes('.m4a') ? 'Original Audio (M4A)' : 'MP3 Audio (320 kbps)',
                  resolution: 'audio',
                  format: mediaUrl.toLowerCase().includes('.m4a') ? 'm4a' : 'mp3',
                  bitrateKbps: 320,
                  url: mediaUrl,
                  isNative: true,
                  hasAudio: true,
                },
              ]
            : [
                {
                  id: 'original_mp4',
                  label: 'Original Video Stream (MP4)',
                  resolution: 'original',
                  format: 'mp4',
                  url: mediaUrl,
                  isNative: true,
                  hasAudio: true,
                },
                {
                  id: 'audio',
                  label: 'MP3 Audio (320 kbps)',
                  resolution: 'audio',
                  format: 'mp3',
                  bitrateKbps: 320,
                  url: mediaUrl,
                  isNative: true,
                  hasAudio: true,
                },
              ];

          const metadata: MediaMetadata = {
            id: `web_${Date.now()}`,
            originalUrl: url,
            platform: detectedPlat,
            title,
            description: `Media extracted from ${parsed.hostname}`,
            author: {
              name: parsed.hostname,
              username: parsed.hostname,
              profileUrl: parsed.origin,
            },
            thumbnailUrl,
            qualities,
            extractedAt: new Date().toISOString(),
            sourceType: isAudioOnly ? 'audio' : 'video',
          };

          return { success: true, data: metadata };
        }
      } catch {
        // Try next User-Agent
      }
    }

    throw new Error('No media found in HTML');
  }

  async extract(url: string, cookies?: string): Promise<AdapterResult> {
    try {
      const safeCheck = await validateSafeUrl(url);
      if (!safeCheck.safe) {
        return { success: false, error: safeCheck.error || 'Invalid URL' };
      }

      const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
      const tasks: Array<Promise<AdapterResult>> = [
        (async () => {
          const ytRes = await extractWithYtDlp(url, undefined, cookies);
          if (ytRes.success && ytRes.data) return ytRes;
          throw new Error(ytRes.error || 'yt-dlp unavailable');
        })(),
        this.extractFromHtml(url, cookies),
      ];

      let drmVimeoResult: AdapterResult | null = null;
      if (vimeoMatch && vimeoMatch[1]) {
        const parsedVimeo = new URL(url);
        const hParam = parsedVimeo.searchParams.get('h') || vimeoMatch[2] || undefined;
        tasks.unshift(
          (async () => {
            const vRes = await this.extractVimeoConfig(vimeoMatch[1], url, hParam);
            if (vRes?.success && vRes.data) return vRes;
            if (vRes && !vRes.success && vRes.statusCode === 403) {
              drmVimeoResult = vRes;
            }
            throw new Error(vRes?.error || 'Vimeo config unavailable');
          })()
        );
      }

      try {
        return await Promise.any(tasks);
      } catch {
        if (drmVimeoResult) return drmVimeoResult;
      }

      return {
        success: false,
        error:
          'Unable to detect a streamable video from this URL. Verify the link is public and contains a video.',
        statusCode: 404,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract video' };
    }
  }
}
