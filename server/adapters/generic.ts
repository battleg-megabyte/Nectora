import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

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
          qualities.push({
            id: `${p.height || 720}p_${i}`,
            label: `${p.quality || `${p.height || 720}p`} MP4`,
            resolution: p.quality || `${p.height || 720}p`,
            format: 'mp4',
            url: p.url,
            isNative: i === 0,
            hasAudio: true,
          });
        });
      } else if (hlsUrl && !isDrmHls) {
        qualities.push(
          {
            id: '1080p',
            label: '1080p Full HD (HLS to MP4)',
            resolution: '1080p',
            format: 'mp4',
            url: hlsUrl,
            isNative: true,
            hasAudio: true,
          },
          {
            id: '720p',
            label: '720p HD (HLS to MP4)',
            resolution: '720p',
            format: 'mp4',
            url: hlsUrl,
            isNative: false,
            hasAudio: true,
          },
          {
            id: '480p',
            label: '480p SD (HLS to MP4)',
            resolution: '480p',
            format: 'mp4',
            url: hlsUrl,
            isNative: false,
            hasAudio: true,
          }
        );
      }

      if (qualities.length > 0) {
        qualities.push({
          id: 'audio',
          label: 'Audio Track (MP3)',
          resolution: 'audio',
          format: 'mp3',
          url: qualities[0].url,
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
              avatarUrl: cfg?.video?.owner?.img,
              profileUrl: cfg?.video?.owner?.url,
            },
            thumbnailUrl: cfg?.video?.thumbs?.['1280'] || cfg?.video?.thumbs?.base || '',
            durationSeconds: cfg?.video?.duration || 0,
            qualities,
            extractedAt: new Date().toISOString(),
            sourceType: 'video',
          },
        };
      }
    } catch (vimeoErr) {
      console.warn('Vimeo config fallback notice:', vimeoErr);
    }
    return null;
  }

  async extract(url: string, cookies?: string): Promise<AdapterResult> {
    try {
      const safeCheck = await validateSafeUrl(url);
      if (!safeCheck.safe) {
        return { success: false, error: safeCheck.error || 'Invalid URL' };
      }

      // Method A: yt-dlp Core Engine (supports 1000+ video sites: Vimeo, Pinterest, Threads, Twitch, Streamable, etc.)
      try {
        const ytdlpResult = await extractWithYtDlp(url, undefined, cookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch (ytdlpErr) {
        console.warn('Generic yt-dlp notice:', ytdlpErr);
      }

      // Method B: Vimeo public player config fallback (supports progressive + HLS streams)
      const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-z0-9]+))?/i);
      if (vimeoMatch && vimeoMatch[1]) {
        const parsedVimeo = new URL(url);
        const hParam = parsedVimeo.searchParams.get('h') || vimeoMatch[2] || undefined;
        const vimeoResult = await this.extractVimeoConfig(vimeoMatch[1], url, hParam);
        if (vimeoResult) return vimeoResult;
      }

      // Method C: Deep Webpage HTML OpenGraph, JSON-LD, HTML5 <video>, and embedded stream scanner
      try {
        const headers: Record<string, string> = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        };
        if (cookies) {
          headers['Cookie'] = cookies;
        }

        const pageRes = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        });

        if (pageRes.ok) {
          const html = await pageRes.text();

          // If page embeds a Vimeo player iframe with hash token (?h=...), resolve real streams via Vimeo config
          const embeddedVimeo = html.match(/player\.vimeo\.com\/video\/(\d+)(?:\?h=([a-z0-9]+))?/i);
          if (embeddedVimeo && embeddedVimeo[1]) {
            const vimeoResult = await this.extractVimeoConfig(
              embeddedVimeo[1],
              url,
              embeddedVimeo[2]
            );
            if (vimeoResult) return vimeoResult;
          }

          // Search for direct playable media streams (ignoring HTML embed iframe players)
          const rawCandidates = [
            html.match(/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i)?.[1],
            html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1],
            html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/i)?.[1],
            html.match(/"contentUrl"\s*:\s*"([^"]+\.(?:mp4|m3u8|webm)[^"]*)"/i)?.[1],
            html.match(/(https?:\/\/[^\s"'<>\\]+\.(?:mp4|m3u8)(?:\?[^\s"'<>\\]*)?)/i)?.[1],
            html.match(/<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i)?.[1],
            html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i)?.[1],
          ].filter((c): c is string => Boolean(c));

          let videoUrl: string | null = null;
          for (const candidate of rawCandidates) {
            const cleaned = candidate
              .replace(/&amp;/g, '&')
              .replace(/\\u0026/g, '&')
              .replace(/\\\//g, '/');
            // Skip known HTML iframe embed players
            if (
              cleaned.includes('player.vimeo.com/video/') ||
              cleaned.includes('/embed/') ||
              cleaned.includes('.swf')
            ) {
              continue;
            }
            videoUrl = cleaned;
            break;
          }

          if (videoUrl) {
            if (videoUrl.startsWith('//')) {
              videoUrl = `https:${videoUrl}`;
            } else if (videoUrl.startsWith('/')) {
              const origin = new URL(url).origin;
              videoUrl = `${origin}${videoUrl}`;
            }

            const titleMatch =
              html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<title>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : 'Web Video';

            const imgMatch =
              html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
            const thumbnailUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, '&') : '';

            const parsed = new URL(url);

            const qualities: QualityOption[] = [
              {
                id: '1080p',
                label: '1080p Full HD (Master Stream)',
                resolution: '1080p',
                format: 'mp4',
                url: videoUrl,
                isNative: true,
                hasAudio: true,
              },
              {
                id: '720p',
                label: '720p HD Stream',
                resolution: '720p',
                format: 'mp4',
                url: videoUrl,
                isNative: false,
                hasAudio: true,
              },
              {
                id: '480p',
                label: '480p SD Stream',
                resolution: '480p',
                format: 'mp4',
                url: videoUrl,
                isNative: false,
                hasAudio: true,
              },
              {
                id: 'audio',
                label: 'Audio Stream (MP3)',
                resolution: 'audio',
                format: 'mp3',
                url: videoUrl,
                isNative: true,
                hasAudio: true,
              },
            ];

            const metadata: MediaMetadata = {
              id: `web_${Date.now()}`,
              originalUrl: url,
              platform: 'direct',
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
              sourceType: 'video',
            };

            return { success: true, data: metadata };
          }
        }
      } catch (crawlerErr) {
        console.warn('HTML crawler notice:', crawlerErr);
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
