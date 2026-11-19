import { PlatformAdapter, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

export class TwitterAdapter implements PlatformAdapter {
  readonly platformName = 'Twitter / X';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'twitter.com' ||
        host === 'www.twitter.com' ||
        host === 'x.com' ||
        host === 'www.x.com' ||
        host === 'fxtwitter.com' ||
        host === 'vxtwitter.com' ||
        host.endsWith('.twitter.com') ||
        host.endsWith('.x.com')
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

      const activeCookies = getPlatformSecurityCookies('twitter', cookies);
      const statusMatch = url.match(/status(?:es)?\/(\d+)/i);
      const statusId = statusMatch ? statusMatch[1] : '';

      // Method A: FxTwitter API (fast, reliable multi-bitrate MP4 variants)
      if (statusId) {
        try {
          const fxRes = await fetch(`https://api.fxtwitter.com/status/${statusId}`, {
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent': 'WuKong-Vid/2.0 (Media Extractor)',
              Accept: 'application/json',
            },
          });

          if (fxRes.ok) {
            const fxData: any = await fxRes.json();
            const tweet = fxData?.tweet;
            const videos = tweet?.media?.videos || [];
            const firstVideo =
              videos[0] ||
              tweet?.media?.all?.find((m: any) => m.type === 'video' || m.type === 'gif');

            if (firstVideo) {
              const variants: any[] = Array.isArray(firstVideo.variants)
                ? firstVideo.variants
                    .filter((v: any) => v.content_type === 'video/mp4' && v.url)
                    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
                : [];

              const bestUrl = variants[0]?.url || firstVideo.url;
              if (bestUrl) {
                const qualities: QualityOption[] = [];

                if (variants.length >= 3) {
                  qualities.push(
                    {
                      id: '1080p',
                      label: '1080p Full HD (High Bitrate)',
                      resolution: '1080p',
                      format: 'mp4',
                      url: variants[0].url,
                      isNative: true,
                      hasAudio: true,
                    },
                    {
                      id: '720p',
                      label: '720p HD',
                      resolution: '720p',
                      format: 'mp4',
                      url: variants[Math.floor(variants.length / 2)].url,
                      isNative: true,
                      hasAudio: true,
                    },
                    {
                      id: '480p',
                      label: '480p SD (Compact)',
                      resolution: '480p',
                      format: 'mp4',
                      url: variants[variants.length - 1].url,
                      isNative: true,
                      hasAudio: true,
                    }
                  );
                } else {
                  const midUrl = variants[1]?.url || bestUrl;
                  qualities.push(
                    {
                      id: '1080p',
                      label: '1080p Full HD (Original Video)',
                      resolution: '1080p',
                      format: 'mp4',
                      url: bestUrl,
                      isNative: true,
                      hasAudio: true,
                    },
                    {
                      id: '720p',
                      label: '720p HD',
                      resolution: '720p',
                      format: 'mp4',
                      url: midUrl,
                      isNative: Boolean(variants[1]?.url),
                      hasAudio: true,
                    },
                    {
                      id: '480p',
                      label: '480p SD (Fast)',
                      resolution: '480p',
                      format: 'mp4',
                      url: midUrl,
                      isNative: false,
                      hasAudio: true,
                    }
                  );
                }

                qualities.push({
                  id: 'audio',
                  label: 'Audio Track (MP3)',
                  resolution: 'audio',
                  format: 'mp3',
                  url: bestUrl,
                  isNative: true,
                  hasAudio: true,
                });

                const durationSec = Math.round(Number(firstVideo.duration) || 0);
                const metadata: MediaMetadata = {
                  id: statusId,
                  originalUrl: url,
                  platform: 'twitter',
                  title: tweet?.text
                    ? tweet.text.slice(0, 110)
                    : `Post by @${tweet?.author?.screen_name || 'user'}`,
                  description: tweet?.text || '',
                  author: {
                    name: tweet?.author?.name || 'X User',
                    username: tweet?.author?.screen_name || 'user',
                    profileUrl: `https://x.com/${tweet?.author?.screen_name || ''}`,
                    avatarUrl: tweet?.author?.avatar_url,
                  },
                  thumbnailUrl: firstVideo.thumbnail_url || '',
                  durationSeconds: durationSec,
                  durationFormatted: formatDuration(durationSec),
                  qualities,
                  extractedAt: new Date().toISOString(),
                  sourceType: 'video',
                };

                return { success: true, data: metadata };
              }
            }
          }
        } catch {
          // Continue to next Twitter extraction fallback
        }
      }

      // Method B: Try yt-dlp core
      try {
        const ytdlpResult = await extractWithYtDlp(url, 'twitter', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch {
        // Continue to VxTwitter fallback
      }

      // Method C: Public VxTwitter API Fallback
      if (statusId) {
        try {
          const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${statusId}`, {
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent': 'Mozilla/5.0',
              Cookie: activeCookies,
            },
          });

          if (vxRes.ok) {
            const vxData: any = await vxRes.json();
            const mediaUrl =
              vxData.media_extended?.[0]?.url || vxData.video_url || vxData.mediaURLs?.[0];

            if (mediaUrl && (mediaUrl.includes('.mp4') || vxData.has_video)) {
              const qualities: QualityOption[] = [
                {
                  id: '1080p',
                  label: '1080p Full HD (Original Video)',
                  resolution: '1080p',
                  format: 'mp4',
                  url: mediaUrl,
                  isNative: true,
                  hasAudio: true,
                },
                {
                  id: '720p',
                  label: '720p HD',
                  resolution: '720p',
                  format: 'mp4',
                  url: mediaUrl,
                  isNative: false,
                  hasAudio: true,
                },
                {
                  id: '480p',
                  label: '480p SD',
                  resolution: '480p',
                  format: 'mp4',
                  url: mediaUrl,
                  isNative: false,
                  hasAudio: true,
                },
                {
                  id: 'audio',
                  label: 'Audio Track (MP3)',
                  resolution: 'audio',
                  format: 'mp3',
                  url: mediaUrl,
                  isNative: true,
                  hasAudio: true,
                },
              ];

              const metadata: MediaMetadata = {
                id: statusId,
                originalUrl: url,
                platform: 'twitter',
                title: vxData.text
                  ? vxData.text.slice(0, 100)
                  : `Post by @${vxData.user_screen_name || 'user'}`,
                description: vxData.text || '',
                author: {
                  name: vxData.user_name || 'X User',
                  username: vxData.user_screen_name || 'user',
                  profileUrl: `https://x.com/${vxData.user_screen_name || ''}`,
                  avatarUrl: vxData.user_profile_image_url,
                },
                thumbnailUrl: vxData.media_extended?.[0]?.thumbnail_url || '',
                qualities,
                extractedAt: new Date().toISOString(),
                sourceType: 'video',
              };

              return { success: true, data: metadata };
            }
          }
        } catch {
          // VxTwitter fallback unavailable
        }
      }

      return {
        success: false,
        error: 'No downloadable video found in this post or the account is private.',
        statusCode: 404,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract X / Twitter video' };
    }
  }
}
