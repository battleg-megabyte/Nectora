import { PlatformAdapter, formatBytes, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

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

      // Step 1: Resolve shortlinks (vt.tiktok.com / vm.tiktok.com / t.tiktok.com)
      let targetUrl = url;
      try {
        const headRes = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            Cookie: activeCookies,
          },
        });
        if (headRes.url && headRes.url !== url) {
          const redirectSafe = await validateSafeUrl(headRes.url);
          if (redirectSafe.safe) {
            targetUrl = headRes.url;
          }
        }
      } catch (redirectErr) {
        console.warn('TikTok redirect resolution notice:', redirectErr);
      }

      // Method A: TikWM Public Endpoint (fast, watermark-free HD/SD/MP3 + full metadata)
      try {
        const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}&hd=1`;
        const apiRes = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });

        if (apiRes.ok) {
          const json: any = await apiRes.json();
          if (json && json.code === 0 && json.data) {
            const data = json.data;
            const videoId = data.id || `tiktok_${Date.now()}`;
            const title = data.title || `TikTok video by ${data.author?.nickname || 'Creator'}`;
            const duration = Number(data.duration) || 0;
            const qualities: QualityOption[] = [];

            if (data.hdplay) {
              qualities.push({
                id: '1080p',
                label: '1080p Full HD (No Watermark)',
                resolution: '1080p',
                format: 'mp4',
                url: data.hdplay.startsWith('http') ? data.hdplay : `https://www.tikwm.com${data.hdplay}`,
                isNative: true,
                fileSizeBytes: data.hd_size,
                fileSizeFormatted: formatBytes(data.hd_size),
                hasAudio: true,
              });
            }

            if (data.play) {
              const playUrl = data.play.startsWith('http')
                ? data.play
                : `https://www.tikwm.com${data.play}`;
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
                hasAudio: true,
              });
            }

            if (data.music) {
              const musicUrl = data.music.startsWith('http')
                ? data.music
                : `https://www.tikwm.com${data.music}`;
              qualities.push({
                id: 'audio',
                label: `Audio (${data.music_info?.title || 'Original Sound'})`,
                resolution: 'audio',
                format: 'mp3',
                url: musicUrl,
                isNative: true,
                hasAudio: true,
              });
            }

            if (qualities.length > 0) {
              const metadata: MediaMetadata = {
                id: videoId,
                originalUrl: url,
                platform: 'tiktok',
                title,
                description: data.title || '',
                author: {
                  name: data.author?.nickname || 'TikTok User',
                  username: data.author?.unique_id || 'tiktok_user',
                  avatarUrl: data.author?.avatar,
                  profileUrl: data.author?.unique_id
                    ? `https://www.tiktok.com/@${data.author.unique_id}`
                    : targetUrl,
                },
                thumbnailUrl: data.cover || data.origin_cover || '',
                durationSeconds: duration,
                durationFormatted: formatDuration(duration),
                qualities,
                extractedAt: new Date().toISOString(),
                sourceType: 'video',
              };

              return { success: true, data: metadata };
            }
          }
        }
      } catch (apiErr) {
        console.warn('TikWM API fetch notice:', apiErr);
      }

      // Method B: yt-dlp Core Engine
      try {
        const ytdlpResult = await extractWithYtDlp(targetUrl, 'tiktok', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch (ytdlpErr) {
        console.warn('yt-dlp TikTok extraction notice:', ytdlpErr);
      }

      // Method C: SSSTik High-Speed Watermark-Free Extraction Engine
      try {
        const ssstikRes = await fetch('https://ssstik.io/abc?url=dl', {
          method: 'POST',
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'hx-request': 'true',
            'hx-target': 'target',
            'hx-current-url': 'https://ssstik.io/en',
          },
          body: `id=${encodeURIComponent(targetUrl)}&locale=en&tt=0`,
        });

        if (ssstikRes.ok) {
          const html = await ssstikRes.text();

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
          const noWatermarkMatch = html.match(
            /href="([^"]+)"[^>]*class="[^"]*download_link\s+without_watermark[^"]*"/
          );
          const mp3Match = html.match(
            /href="([^"]+)"[^>]*class="[^"]*download_link\s+music[^"]*"/
          );

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
              isNative: !hdLinkMatch,
              hasAudio: true,
            });

            qualities.push({
              id: '480p',
              label: '480p SD (Fast Stream)',
              resolution: '480p',
              format: 'mp4',
              url: sdUrl,
              isNative: false,
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

          if (qualities.length > 0) {
            const metadata: MediaMetadata = {
              id: `tiktok_${Date.now()}`,
              originalUrl: url,
              platform: 'tiktok',
              title,
              description: title,
              author: {
                name: authorName,
                username: authorName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                avatarUrl,
                profileUrl: targetUrl,
              },
              thumbnailUrl: avatarUrl || '',
              durationSeconds: 0,
              durationFormatted: '',
              qualities,
              extractedAt: new Date().toISOString(),
              sourceType: 'video',
            };

            return { success: true, data: metadata };
          }
        }
      } catch (ssstikErr) {
        console.warn('SSSTik extraction notice:', ssstikErr);
      }

      // Method D: Direct TikTok HTML Hydration Data Fallback (__UNIVERSAL_DATA_FOR_REHYDRATION__)
      try {
        const pageRes = await fetch(targetUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
            const playAddr = itemStruct?.video?.playAddr || itemStruct?.video?.downloadAddr;
            if (playAddr && typeof playAddr === 'string') {
              const duration = Number(itemStruct?.video?.duration) || 0;
              return {
                success: true,
                data: {
                  id: itemStruct.id || `tiktok_${Date.now()}`,
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
                      : targetUrl,
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
                      url: playAddr,
                      isNative: true,
                      hasAudio: true,
                    },
                    {
                      id: '720p',
                      label: '720p HD',
                      resolution: '720p',
                      format: 'mp4',
                      url: playAddr,
                      isNative: false,
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
      } catch (htmlErr) {
        console.warn('TikTok hydration fallback notice:', htmlErr);
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
