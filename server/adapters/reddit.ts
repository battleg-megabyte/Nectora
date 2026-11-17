import { PlatformAdapter, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

export class RedditAdapter implements PlatformAdapter {
  readonly platformName = 'Reddit';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'reddit.com' ||
        host === 'www.reddit.com' ||
        host === 'old.reddit.com' ||
        host === 'v.redd.it' ||
        host === 'redd.it' ||
        host.endsWith('.reddit.com')
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

      // Resolve v.redd.it / redd.it / /s/ share shortlinks cleanly
      let targetUrl = url;
      if (url.includes('v.redd.it') || url.includes('redd.it/') || url.includes('/s/')) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          });
          if (res.url && res.url !== url) {
            const redirectSafe = await validateSafeUrl(res.url);
            if (redirectSafe.safe) {
              targetUrl = res.url;
            }
          }
        } catch (err) {
          console.warn('Reddit shortlink resolution notice:', err);
        }
      }

      // Method A: yt-dlp core handles Reddit video + audio muxing seamlessly
      try {
        const ytdlpResult = await extractWithYtDlp(targetUrl, 'reddit', cookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch (ytdlpErr) {
        console.warn('Reddit yt-dlp notice:', ytdlpErr);
      }

      // Method B: Reddit Public .json API Fallback
      try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname.includes('reddit.com')) {
          const cleanPath = parsed.pathname.replace(/\/+$/, '');
          const jsonUrl = `https://www.reddit.com${cleanPath}.json`;
          const jsonRes = await fetch(jsonUrl, {
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent': 'NEcTORa/2.0 (Media Extractor)',
              Accept: 'application/json',
            },
          });

          if (jsonRes.ok) {
            const listings: any = await jsonRes.json();
            const post = listings?.[0]?.data?.children?.[0]?.data;
            const targetPost = post?.crosspost_parent_list?.[0] || post;
            const redditVideo = targetPost?.secure_media?.reddit_video || targetPost?.media?.reddit_video;

            const videoSrc =
              redditVideo?.fallback_url ||
              redditVideo?.hls_url ||
              targetPost?.preview?.reddit_video_preview?.fallback_url;

            if (videoSrc && typeof videoSrc === 'string') {
              const cleanVideoSrc = videoSrc.replace(/&amp;/g, '&');
              const baseUrl = cleanVideoSrc.split('/DASH_')[0];
              let audioUrl: string | undefined;

              if (baseUrl && cleanVideoSrc.includes('v.redd.it')) {
                const audioCandidates = [
                  `${baseUrl}/DASH_AUDIO_128.mp4`,
                  `${baseUrl}/DASH_audio.mp4`,
                  `${baseUrl}/audio`,
                ];
                for (const candidate of audioCandidates) {
                  try {
                    const headRes = await fetch(candidate, {
                      method: 'HEAD',
                      signal: AbortSignal.timeout(4000),
                    });
                    if (headRes.ok) {
                      audioUrl = candidate;
                      break;
                    }
                  } catch {
                    // try next candidate
                  }
                }
              }

              const height = Number(redditVideo?.height) || 720;
              const durationSec = Number(redditVideo?.duration) || 0;
              const thumb =
                targetPost?.thumbnail && targetPost.thumbnail.startsWith('http')
                  ? targetPost.thumbnail
                  : targetPost?.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') || '';

              const qualities: QualityOption[] = [];
              if (height >= 1080) {
                qualities.push({
                  id: '1080p',
                  label: '1080p Full HD',
                  resolution: '1080p',
                  format: 'mp4',
                  url: cleanVideoSrc,
                  audioUrl,
                  isNative: true,
                  hasAudio: true,
                });
              }

              qualities.push({
                id: '720p',
                label: '720p HD',
                resolution: '720p',
                format: 'mp4',
                url: cleanVideoSrc,
                audioUrl,
                isNative: height < 1080,
                hasAudio: true,
              });

              qualities.push({
                id: '480p',
                label: '480p SD',
                resolution: '480p',
                format: 'mp4',
                url: cleanVideoSrc,
                audioUrl,
                isNative: false,
                hasAudio: true,
              });

              qualities.push({
                id: 'audio',
                label: 'Audio Track (MP3)',
                resolution: 'audio',
                format: 'mp3',
                url: audioUrl || cleanVideoSrc,
                isNative: true,
                hasAudio: true,
              });

              const metadata: MediaMetadata = {
                id: targetPost?.id || `reddit_${Date.now()}`,
                originalUrl: url,
                platform: 'reddit',
                title: targetPost?.title || 'Reddit Video',
                description: targetPost?.selftext || `r/${targetPost?.subreddit || 'reddit'}`,
                author: {
                  name: targetPost?.author ? `u/${targetPost.author}` : 'Reddit User',
                  username: targetPost?.author || 'reddit_user',
                  profileUrl: targetPost?.author
                    ? `https://www.reddit.com/user/${targetPost.author}`
                    : undefined,
                },
                thumbnailUrl: thumb,
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
      } catch (jsonErr) {
        console.warn('Reddit JSON fallback notice:', jsonErr);
      }

      return {
        success: false,
        error: 'No video stream could be found in this Reddit post or post is private.',
        statusCode: 404,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract Reddit video' };
    }
  }
}
