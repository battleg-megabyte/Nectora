import { PlatformAdapter, formatBytes, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

function resolveTikWmUrl(raw: string): string {
  if (!raw) return '';
  return raw.startsWith('http') ? raw : `https://www.tikwm.com${raw.startsWith('/') ? '' : '/'}${raw}`;
}

let tikWmQueue: Promise<void> = Promise.resolve();
let lastTikWmDoneAt = 0;

async function withTikWmSlot<T>(fn: () => Promise<T>): Promise<T> {
  const prev = tikWmQueue;
  let release!: () => void;
  tikWmQueue = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    const elapsed = Date.now() - lastTikWmDoneAt;
    if (elapsed < 1250) {
      await new Promise((r) => setTimeout(r, 1250 - elapsed));
    }
    return await fn();
  } finally {
    lastTikWmDoneAt = Date.now();
    release();
  }
}

let sssTikQueue: Promise<void> = Promise.resolve();
let lastSssTikCallAt = 0;

async function scheduleSssTikSlot(): Promise<void> {
  const prev = sssTikQueue;
  let release!: () => void;
  sssTikQueue = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  const elapsed = Date.now() - lastSssTikCallAt;
  if (elapsed < 750) {
    await new Promise((r) => setTimeout(r, 750 - elapsed));
  }
  lastSssTikCallAt = Date.now();
  release();
}

export class TikTokAdapter implements PlatformAdapter {
  readonly platformName = 'TikTok';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'tiktok.com' ||
        host === 'www.tiktok.com' ||
        host === 'vt.tiktok.com' ||
        host === 'vm.tiktok.com' ||
        host === 't.tiktok.com' ||
        host === 'm.tiktok.com' ||
        host.endsWith('.tiktok.com')
      );
    } catch {
      return false;
    }
  }

  async extract(url: string, cookies?: string): Promise<AdapterResult> {
    try {
      const safeCheck = await validateSafeUrl(url);
      if (!safeCheck.safe) {
        return { success: false, error: safeCheck.error || 'Invalid URL' };
      }

      const activeCookies = getPlatformSecurityCookies('tiktok', cookies);

      // Step 1: Resolve shortlinks (vt.tiktok.com / vm.tiktok.com / t.tiktok.com / /t/ / m.tiktok.com)
      let targetUrl = url.trim();
      const needsRedirectResolution =
        /^(https?:\/\/)?(vt|vm|t)\.tiktok\.com\//i.test(targetUrl) ||
        targetUrl.includes('/t/');

      if (needsRedirectResolution) {
        try {
          const headRes = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
              Cookie: activeCookies,
            },
          });
          await headRes.body?.cancel().catch(() => {});
          if (headRes.url && headRes.url !== targetUrl) {
            const redirectSafe = await validateSafeUrl(headRes.url);
            if (redirectSafe.safe) {
              targetUrl = headRes.url;
            }
          }
        } catch {
          // Handled redirect resolution fallback cleanly
        }
      }

      // Normalize /embed/v2/<id>, /embed/<id>, /v/<id>.html, or strip tracking query strings cleanly
      const idMatch = targetUrl.match(/\/(?:video|photo|v|embed(?:\/v2)?)\/(\d{10,25})/);
      const canonicalTiktokUrl =
        targetUrl.includes('/embed/') || targetUrl.includes('m.tiktok.com/v/')
          ? idMatch?.[1]
            ? `https://www.tiktok.com/@tiktok/video/${idMatch[1]}`
            : targetUrl
          : targetUrl;

      const queryCandidates = Array.from(new Set([canonicalTiktokUrl, targetUrl]));

      const extractViaTikWm = async (): Promise<AdapterResult> => {
        for (const qUrl of queryCandidates) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const apiRes = await withTikWmSlot(() =>
                attempt === 0
                  ? fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(qUrl)}&hd=1`, {
                      signal: AbortSignal.timeout(10500),
                      headers: {
                        'User-Agent':
                          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                        Accept: 'application/json',
                      },
                    })
                  : fetch('https://www.tikwm.com/api/', {
                      method: 'POST',
                      signal: AbortSignal.timeout(10500),
                      headers: {
                        'User-Agent':
                          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                      },
                      body: `url=${encodeURIComponent(qUrl)}&hd=1`,
                    })
              );

              if (apiRes.ok) {
                const json: any = await apiRes.json();
                if (json && json.code === -1) {
                  await new Promise((r) => setTimeout(r, 1300));
                  continue;
                }
                if (json && json.code === 0 && json.data) {
                  const data = json.data;
                  const videoId = data.id || idMatch?.[1] || `tiktok_${Date.now()}`;
                  const title =
                    data.title || `TikTok video by ${data.author?.nickname || 'Creator'}`;
                  const duration = Number(data.duration) || 0;
                  const qualities: QualityOption[] = [];

                  if (data.hdplay) {
                    qualities.push({
                      id: '1080p',
                      label: '1080p Full HD (No Watermark)',
                      resolution: '1080p',
                      format: 'mp4',
                      url: resolveTikWmUrl(data.hdplay),
                      isNative: true,
                      fileSizeBytes: data.hd_size,
                      fileSizeFormatted: formatBytes(data.hd_size),
                      hasAudio: true,
                    });
                  }

                  if (data.play) {
                    const playUrl = resolveTikWmUrl(data.play);
                    qualities.push({
                      id: '720p',
                      label: '720p HD (No Watermark)',
                      resolution: '720p',
                      format: 'mp4',
                      url: playUrl,
                      isNative: !data.hdplay,
                      fileSizeBytes: data.size,
                      fileSizeFormatted: formatBytes(data.size),
                      hasAudio: true,
                    });

                    qualities.push({
                      id: '480p',
                      label: '480p SD (Fast Stream)',
                      resolution: '480p',
                      format: 'mp4',
                      url: playUrl,
                      isNative: false,
                      targetHeight: 480,
                      hasAudio: true,
                    });
                  }

                  const musicRaw = data.music || data.music_info?.play;
                  if (musicRaw) {
                    qualities.push({
                      id: 'audio',
                      label: `Audio (${data.music_info?.title || 'Original Sound'})`,
                      resolution: 'audio',
                      format: 'mp3',
                      url: resolveTikWmUrl(musicRaw),
                      isNative: true,
                      hasAudio: true,
                    });
                  }

                  if (qualities.length > 0) {
                    const coverRaw = data.cover || data.origin_cover || data.images?.[0] || '';
                    const metadata: MediaMetadata = {
                      id: videoId,
                      originalUrl: url,
                      platform: 'tiktok',
                      title,
                      description: data.title || '',
                      author: {
                        name: data.author?.nickname || 'TikTok User',
                        username: data.author?.unique_id || 'tiktok_user',
                        avatarUrl: data.author?.avatar ? resolveTikWmUrl(data.author.avatar) : undefined,
                        profileUrl: data.author?.unique_id
                          ? `https://www.tiktok.com/@${data.author.unique_id}`
                          : canonicalTiktokUrl,
                      },
                      thumbnailUrl: coverRaw ? resolveTikWmUrl(coverRaw) : '',
                      durationSeconds: duration,
                      durationFormatted: formatDuration(duration),
                      qualities,
                      extractedAt: new Date().toISOString(),
                      sourceType: Array.isArray(data.images) && data.images.length > 0 ? 'clip' : 'video',
                    };

                    return { success: true, data: metadata };
                  }
                }
              }
            } catch {
              // Handled TikWM retry/fallback cleanly
            }
          }
        }
        throw new Error('TikWM unavailable');
      };

      const extractViaSssTik = async (): Promise<AdapterResult> => {
        let html = '';
        let lastErr: any = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise((r) => setTimeout(r, 1100));
            }
            await scheduleSssTikSlot();
            const ssstikRes = await fetch('https://ssstik.io/abc?url=dl', {
              method: 'POST',
              signal: AbortSignal.timeout(9500),
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'hx-request': 'true',
                'hx-target': 'target',
                'hx-current-url': 'https://ssstik.io/en',
              },
              body: `id=${encodeURIComponent(canonicalTiktokUrl)}&locale=en&tt=0`,
            });

            if (!ssstikRes.ok) {
              await ssstikRes.body?.cancel().catch(() => {});
              lastErr = new Error(`SSSTik HTTP ${ssstikRes.status}`);
              continue;
            }
            const bodyText = await ssstikRes.text();
            if (bodyText && (bodyText.includes('tikcdn.io') || bodyText.includes('download_link') || bodyText.includes('data-directurl'))) {
              html = bodyText;
              lastErr = null;
              break;
            }
            lastErr = new Error('SSSTik challenge or empty response');
          } catch (err) {
            lastErr = err;
          }
        }
        if (!html) {
          throw lastErr || new Error('SSSTik unavailable');
        }

        const authorMatch =
          html.match(/<h2>([^<]+)<\/h2>/) ||
          html.match(/class="result_author"[^>]*alt="([^"]+)"/);
        const authorName = authorMatch ? authorMatch[1].trim() : 'TikTok Creator';
        const avatarMatch = html.match(/class="result_author"[^>]*src="([^"]+)"/);
        const avatarUrl = avatarMatch ? avatarMatch[1] : undefined;

        const descMatch = html.match(/<p class="maintext">([\s\S]*?)<\/p>/);
        const title = descMatch
          ? descMatch[1].replace(/<[^>]+>/g, '').trim()
          : `TikTok Video by ${authorName}`;

        const hdLinkMatch = html.match(/data-directurl="([^"]+)"/);
        const noWatermarkMatch =
          html.match(/href="([^"]+)"[^>]*class="[^"]*download_link\s+without_watermark[^"]*"/) ||
          html.match(/class="[^"]*download_link\s+without_watermark[^"]*"[^>]*href="([^"]+)"/) ||
          html.match(/(https:\/\/tikcdn\.io\/ssstik\/v\/[^\s"'<>]+)/i);
        const mp3Match =
          html.match(/href="([^"]+)"[^>]*class="[^"]*download_link\s+music[^"]*"/) ||
          html.match(/class="[^"]*download_link\s+music[^"]*"[^>]*href="([^"]+)"/);

        const qualities: QualityOption[] = [];
        const hdUrl =
          hdLinkMatch?.[1]?.startsWith('http')
            ? hdLinkMatch[1]
            : noWatermarkMatch?.[1]?.startsWith('http')
              ? noWatermarkMatch[1]
              : null;
        const sdUrl =
          noWatermarkMatch?.[1]?.startsWith('http') ? noWatermarkMatch[1] : hdUrl;

        if (hdUrl) {
          qualities.push({
            id: '1080p',
            label: '1080p Full HD (No Watermark)',
            resolution: '1080p',
            format: 'mp4',
            url: hdUrl,
            isNative: true,
            hasAudio: true,
          });
        }

        if (sdUrl) {
          qualities.push({
            id: '720p',
            label: '720p HD (No Watermark)',
            resolution: '720p',
            format: 'mp4',
            url: sdUrl,
            isNative: !hdLinkMatch && Boolean(noWatermarkMatch?.[1]),
            hasAudio: true,
          });

          qualities.push({
            id: '480p',
            label: '480p SD (Fast Stream)',
            resolution: '480p',
            format: 'mp4',
            url: sdUrl,
            isNative: false,
            targetHeight: 480,
            hasAudio: true,
          });
        }

        if (mp3Match && mp3Match[1] && mp3Match[1].startsWith('http')) {
          qualities.push({
            id: 'audio',
            label: 'Original Audio (MP3)',
            resolution: 'audio',
            format: 'mp3',
            url: mp3Match[1],
            isNative: true,
            hasAudio: true,
          });
        }

        if (qualities.length === 0) {
          throw new Error('SSSTik returned no links');
        }

        return {
          success: true,
          data: {
            id: idMatch?.[1] || `tiktok_${Date.now()}`,
            originalUrl: url,
            platform: 'tiktok',
            title,
            description: title,
            author: {
              name: authorName,
              username: authorName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              avatarUrl,
              profileUrl: canonicalTiktokUrl,
            },
            thumbnailUrl: avatarUrl || '',
            durationSeconds: 0,
            durationFormatted: '',
            qualities,
            extractedAt: new Date().toISOString(),
            sourceType: 'video',
          },
        };
      };

      // Method A+B: Race SSSTik (~670ms) and TikWM concurrently — fastest valid result wins immediately
      try {
        const fastWinner = await Promise.any([extractViaSssTik(), extractViaTikWm()]);
        if (fastWinner.success && fastWinner.data) {
          return fastWinner;
        }
      } catch {
        // Both primary fast extractors failed; fall through to yt-dlp and hydration
      }

      // Method C: yt-dlp Core Engine
      try {
        const ytdlpResult = await extractWithYtDlp(canonicalTiktokUrl, 'tiktok', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch {
        // Handled yt-dlp fallback cleanly
      }

      // Method D: Direct TikTok HTML Hydration Data Fallback (__UNIVERSAL_DATA_FOR_REHYDRATION__)
      try {
        const pageRes = await fetch(canonicalTiktokUrl, {
          signal: AbortSignal.timeout(9000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: activeCookies,
          },
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const rehydrationMatch = html.match(
            /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
          );
          if (rehydrationMatch?.[1]) {
            const parsedJson = JSON.parse(rehydrationMatch[1]);
            const itemStruct =
              parsedJson?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
            const bitrates: any[] = itemStruct?.video?.bitrateInfo || [];
            const hdEntry = bitrates.find((b) => (b?.PlayAddr?.Height || 0) >= 1080 || String(b?.GearName || '').includes('1080'));
            const medEntry = bitrates.find((b) => (b?.PlayAddr?.Height || 0) >= 720);

            const playAddr =
              itemStruct?.video?.playAddr ||
              itemStruct?.video?.downloadAddr ||
              bitrates[0]?.PlayAddr?.UrlList?.[0];

            const hdAddr = hdEntry?.PlayAddr?.UrlList?.[0] || medEntry?.PlayAddr?.UrlList?.[0] || playAddr;

            if (playAddr && typeof playAddr === 'string') {
              const duration = Number(itemStruct?.video?.duration) || 0;
              return {
                success: true,
                data: {
                  id: itemStruct.id || idMatch?.[1] || `tiktok_${Date.now()}`,
                  originalUrl: url,
                  platform: 'tiktok',
                  title: itemStruct.desc || 'TikTok Video',
                  description: itemStruct.desc || '',
                  author: {
                    name: itemStruct.author?.nickname || 'TikTok Creator',
                    username: itemStruct.author?.uniqueId || 'tiktok_user',
                    avatarUrl: itemStruct.author?.avatarLarger || itemStruct.author?.avatarMedium,
                    profileUrl: itemStruct.author?.uniqueId
                      ? `https://www.tiktok.com/@${itemStruct.author.uniqueId}`
                      : canonicalTiktokUrl,
                  },
                  thumbnailUrl: itemStruct.video?.cover || itemStruct.video?.originCover || '',
                  durationSeconds: duration,
                  durationFormatted: formatDuration(duration),
                  qualities: [
                    {
                      id: '1080p',
                      label: '1080p Full HD (Original)',
                      resolution: '1080p',
                      format: 'mp4',
                      url: hdAddr,
                      isNative: true,
                      hasAudio: true,
                    },
                    {
                      id: '720p',
                      label: '720p HD',
                      resolution: '720p',
                      format: 'mp4',
                      url: medEntry?.PlayAddr?.UrlList?.[0] || playAddr,
                      isNative: !hdEntry,
                      hasAudio: true,
                    },
                    {
                      id: '480p',
                      label: '480p SD',
                      resolution: '480p',
                      format: 'mp4',
                      url: playAddr,
                      isNative: false,
                      hasAudio: true,
                    },
                    {
                      id: 'audio',
                      label: 'Original Audio (MP3)',
                      resolution: 'audio',
                      format: 'mp3',
                      url: itemStruct.music?.playUrl || playAddr,
                      isNative: true,
                      hasAudio: true,
                    },
                  ],
                  extractedAt: new Date().toISOString(),
                  sourceType: 'video',
                },
              };
            }
          }
        }
      } catch {
        // Handled hydration fallback cleanly
      }

      return {
        success: false,
        error:
          'Media could not be accessed. The TikTok video may be private, removed, or region-restricted.',
        statusCode: 404,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract TikTok video' };
    }
  }
}
