import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

function unpackSnapSaveHtml(scriptText: string): string {
  if (!scriptText || !scriptText.includes('eval(')) return '';
  try {
    let decoded = '';
    const capture = (payload: string) => {
      decoded = String(payload || '');
    };
    const safeScript = scriptText.replace(/eval\(/g, '__wukongCapture(');
    const runner = new Function('__wukongCapture', safeScript);
    runner(capture);
    return decoded;
  } catch {
    return '';
  }
}

export class InstagramAdapter implements PlatformAdapter {
  readonly platformName = 'Instagram';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'instagram.com' ||
        host === 'www.instagram.com' ||
        host === 'm.instagram.com' ||
        host === 'instagr.am' ||
        host === 'www.instagr.am' ||
        host === 'ddinstagram.com' ||
        host === 'eeinstagram.com' ||
        host === 'www.eeinstagram.com' ||
        host.endsWith('.instagram.com')
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

      const activeCookies = getPlatformSecurityCookies('instagram', cookies);

      // Step 1: Resolve instagr.am or /share/ shortlinks safely
      let targetUrl = url.trim();
      if (
        targetUrl.includes('instagr.am') ||
        targetUrl.includes('/share/') ||
        targetUrl.includes('ddinstagram.com') ||
        targetUrl.includes('eeinstagram.com')
      ) {
        try {
          const res = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
              Cookie: activeCookies,
            },
          });
          await res.body?.cancel().catch(() => {});
          if (res.url && res.url !== targetUrl) {
            const redirectSafe = await validateSafeUrl(res.url);
            if (redirectSafe.safe) {
              targetUrl = res.url;
            }
          }
        } catch {
          // Handled shortlink resolution fallback cleanly
        }
      }

      // Extract shortcode across all URL shapes (/reel/, /reels/, /p/, /tv/, /:user/reel/, /stories/:user/:id)
      const shortcodeMatch = targetUrl.match(
        /\/(?:p|reel|reels|tv|stories\/[^/]+)\/([A-Za-z0-9_-]+)/
      );
      const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';
      const isReel = /\/(?:reel|reels)\//i.test(targetUrl);
      const isStory = /\/stories\//i.test(targetUrl);

      const canonicalUrl = shortcode
        ? isReel
          ? `https://www.instagram.com/reel/${shortcode}/`
          : isStory
            ? targetUrl
            : `https://www.instagram.com/p/${shortcode}/`
        : targetUrl;

      let videoUrl: string | null = null;
      let thumbnailUrl = shortcode ? `https://www.instagram.com/p/${shortcode}/media/?size=l` : '';
      let title = shortcode
        ? isReel
          ? `Instagram Reel (${shortcode})`
          : `Instagram Video (${shortcode})`
        : 'Instagram Video';
      let author: {
        name: string;
        username: string;
        avatarUrl?: string;
        profileUrl?: string;
      } = { name: 'Instagram Creator', username: 'instagram_user' };

      // Method A: Fast EEInstagram Embed Resolver (returns direct Instagram CDN MP4 + handle + caption)
      if (shortcode && !isStory) {
        try {
          const eePath = isReel ? `/reel/${shortcode}/` : `/p/${shortcode}/`;
          const eeRes = await fetch(`https://www.eeinstagram.com${eePath}`, {
            signal: AbortSignal.timeout(8000),
            headers: {
              'User-Agent': 'Discordbot/2.0 (+https://discordapp.com)',
              Accept: 'text/html',
            },
          });

          if (eeRes.ok) {
            const eeHtml = await eeRes.text();
            if (!eeHtml.includes('Post not found')) {
              const streamMatch =
                eeHtml.match(/<meta\s+name="twitter:player:stream"\s+content="([^"]+)"/i) ||
                eeHtml.match(/<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/i) ||
                eeHtml.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);

              if (streamMatch?.[1]) {
                let candidate = streamMatch[1].replace(/&amp;/g, '&');
                if (candidate.startsWith('/')) {
                  candidate = `https://www.eeinstagram.com${candidate}`;
                }

                // Follow redirect to lock in direct cdninstagram.com MP4 when available
                try {
                  const redir = await fetch(candidate, {
                    method: 'GET',
                    redirect: 'manual',
                    signal: AbortSignal.timeout(6000),
                    headers: { 'User-Agent': 'Discordbot/2.0 (+https://discordapp.com)' },
                  });
                  await redir.body?.cancel().catch(() => {});
                  const loc = redir.headers.get('location');
                  if (loc && loc.startsWith('http')) {
                    const locSafe = await validateSafeUrl(loc);
                    if (locSafe.safe) {
                      candidate = loc;
                    }
                  }
                } catch {}

                const safeCandidate = await validateSafeUrl(candidate);
                if (safeCandidate.safe) {
                  videoUrl = candidate;
                }
              }

              const authorMatch = eeHtml.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);
              if (authorMatch?.[1] && !authorMatch[1].toLowerCase().includes('fix instagram')) {
                const rawHandle = authorMatch[1].replace(/^@/, '').trim();
                if (rawHandle) {
                  author = {
                    name: `@${rawHandle}`,
                    username: rawHandle,
                    profileUrl: `https://www.instagram.com/${rawHandle}/`,
                  };
                }
              }

              const descMatch = eeHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
              if (descMatch?.[1] && !descMatch[1].toLowerCase().includes('post not found')) {
                title = descMatch[1].replace(/&amp;/g, '&').trim().slice(0, 120);
              }

              const imgMatch =
                eeHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                eeHtml.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
              if (imgMatch?.[1]) {
                let thumb = imgMatch[1].replace(/&amp;/g, '&');
                if (thumb.startsWith('/')) {
                  thumb = `https://www.eeinstagram.com${thumb}`;
                }
                thumbnailUrl = thumb;
              }
            }
          }
        } catch {
          // Handled EEInstagram fallback cleanly
        }
      }

      // Method B: SnapSave Session-Initialized Instagram Engine (handles Reels, Posts, IGTV, Stories)
      if (!videoUrl) {
        try {
          const ssLanding = await fetch('https://snapsave.app/instagram-reels-download', {
            signal: AbortSignal.timeout(7000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            },
          });
          const rawSetCookie = ssLanding.headers.get('set-cookie') || '';
          const sessionCookie = rawSetCookie
            .split(',')
            .map((c) => c.split(';')[0].trim())
            .filter(Boolean)
            .join('; ');
          await ssLanding.body?.cancel().catch(() => {});

          const snapBody = new URLSearchParams();
          snapBody.append('url', canonicalUrl);

          const snapRes = await fetch('https://snapsave.app/action.php?lang=en', {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Content-Type': 'application/x-www-form-urlencoded',
              Origin: 'https://snapsave.app',
              Referer: 'https://snapsave.app/instagram-reels-download',
              ...(sessionCookie ? { Cookie: sessionCookie } : {}),
            },
            body: snapBody.toString(),
          });

          if (snapRes.ok) {
            const rawScript = await snapRes.text();
            const decodedHtml = unpackSnapSaveHtml(rawScript).replace(/\\"/g, '"');
            if (decodedHtml && !decodedHtml.includes('error_api_get_instagram')) {
              const videoButtonMatch =
                decodedHtml.match(/icon-dlvideo[\s\S]*?<div[^>]*class="download-items__btn"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i) ||
                decodedHtml.match(/<div[^>]*class="download-items__btn"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Download\s*video/i) ||
                decodedHtml.match(/href="(https:\/\/d\.rapidcdn\.app\/v2\?[^"]+)"/i);

              if (videoButtonMatch?.[1]) {
                const candidate = videoButtonMatch[1].replace(/&amp;/g, '&').trim();
                const safeCand = await validateSafeUrl(candidate);
                if (safeCand.safe) {
                  videoUrl = candidate;
                }
              }

              const thumbMatch =
                decodedHtml.match(/<div[^>]*class="download-items__thumb"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                decodedHtml.match(/<img[^>]*src="(https:\/\/d\.rapidcdn\.app\/thumb\?[^"]+)"/i);
              if (thumbMatch?.[1]) {
                thumbnailUrl = thumbMatch[1].replace(/&amp;/g, '&').trim();
              }
            }
          }
        } catch {
          // Handled SnapSave fallback cleanly
        }
      }

      // Method C: yt-dlp with security cookies
      if (!videoUrl) {
        try {
          const ytdlpResult = await extractWithYtDlp(canonicalUrl, 'instagram', activeCookies);
          if (ytdlpResult.success && ytdlpResult.data) {
            return ytdlpResult;
          }
        } catch {
          // Handled yt-dlp fallback cleanly
        }
      }

      // Method D: Public Embed Endpoints (/embed/captioned/ & /embed/)
      if (!videoUrl && shortcode) {
        const embedUrls = [
          `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
          `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
          `https://www.instagram.com/p/${shortcode}/embed/`,
        ];

        for (const embedUrl of embedUrls) {
          if (videoUrl) break;
          try {
            const response = await fetch(embedUrl, {
              signal: AbortSignal.timeout(8000),
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Mode': 'navigate',
                Cookie: activeCookies,
              },
            });

            if (response.ok) {
              const html = await response.text();

              const videoMatch =
                html.match(/"video_url":"([^"]+)"/) ||
                html.match(/"content_url":"([^"]+\.mp4[^"]*)"/) ||
                html.match(/class="EmbeddedVideo"[^>]*src="([^"]+)"/) ||
                html.match(/<video[^>]+src="([^">]+)"/) ||
                html.match(/src="([^"]+\.mp4[^"]*)"/);

              if (videoMatch && videoMatch[1]) {
                videoUrl = videoMatch[1]
                  .replace(/\\u0026/g, '&')
                  .replace(/&amp;/g, '&')
                  .replace(/\\/g, '');
              }

              const imgMatch =
                html.match(/"display_url":"([^"]+)"/) ||
                html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/) ||
                html.match(/<img[^>]+class="[^"]*Embedded[^"]*"[^>]+src="([^">]+)"/);

              if (imgMatch && imgMatch[1]) {
                thumbnailUrl = imgMatch[1]
                  .replace(/\\u0026/g, '&')
                  .replace(/&amp;/g, '&')
                  .replace(/\\/g, '');
              }

              const authorMatch =
                html.match(/class="UsernameText">([^<]+)<\/span>/) ||
                html.match(/"username":"([^"]+)"/) ||
                html.match(/class="Username"[^>]*>([^<]+)<\/a>/);

              if (authorMatch && authorMatch[1]) {
                const uName = authorMatch[1].trim();
                author = {
                  name: uName,
                  username: uName.toLowerCase().replace(/[^a-z0-9_.]/g, '_'),
                  profileUrl: `https://instagram.com/${uName}`,
                };
              }

              const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);
              if (captionMatch && captionMatch[1]) {
                const rawCaption = captionMatch[1].replace(/<[^>]+>/g, '').trim();
                if (rawCaption) {
                  title = rawCaption.slice(0, 120);
                }
              }
            }
          } catch {
            // Embed scrape timed out or unavailable; continue to next fallback
          }
        }
      }

      // Method E: Public GraphQL / JSON Web Info Fallback
      if (!videoUrl && shortcode) {
        try {
          const jsonRes = await fetch(
            `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
            {
              signal: AbortSignal.timeout(8000),
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                Accept: 'application/json',
                'X-IG-App-ID': '936619743392459',
                Cookie: activeCookies,
              },
            }
          );
          if (jsonRes.ok) {
            const jsonText = await jsonRes.text();
            if (jsonText.startsWith('{')) {
              const jsonData: any = JSON.parse(jsonText);
              const item =
                jsonData?.items?.[0] || jsonData?.graphql?.shortcode_media;
              const versions = item?.video_versions;
              if (Array.isArray(versions) && versions.length > 0) {
                const sorted = [...versions].sort(
                  (a: any, b: any) => (b.width || 0) - (a.width || 0)
                );
                videoUrl = sorted[0].url;
              } else if (item?.video_url) {
                videoUrl = item.video_url;
              }
              if (item?.caption?.text) {
                title = item.caption.text.slice(0, 120);
              }
              if (item?.user?.username) {
                author = {
                  name: item.user.full_name || item.user.username,
                  username: item.user.username,
                  avatarUrl: item.user.profile_pic_url,
                  profileUrl: `https://instagram.com/${item.user.username}`,
                };
              }
              if (item?.image_versions2?.candidates?.[0]?.url) {
                thumbnailUrl = item.image_versions2.candidates[0].url;
              }
            }
          }
        } catch {
          // JSON endpoint timed out or unavailable; continue to metadata enrichment
        }
      }

      // oEmbed metadata enrichment
      if (videoUrl) {
        if (title.startsWith('Instagram Reel (') || title.startsWith('Instagram Video (')) {
          try {
            const oembedRes = await fetch(
              `https://api.instagram.com/oembed/?url=${encodeURIComponent(canonicalUrl)}`,
              {
                signal: AbortSignal.timeout(4000),
                headers: { 'User-Agent': 'Mozilla/5.0' },
              }
            );
            if (oembedRes.ok) {
              const oembedData: any = await oembedRes.json();
              if (oembedData.title) {
                title = oembedData.title;
              }
              if (oembedData.author_name && author.name === 'Instagram Creator') {
                author = {
                  name: oembedData.author_name,
                  username: oembedData.author_name.toLowerCase().replace(/\s+/g, '_'),
                  profileUrl: oembedData.author_url,
                };
              }
              if (oembedData.thumbnail_url && !thumbnailUrl) {
                thumbnailUrl = oembedData.thumbnail_url;
              }
            }
          } catch {
            // optional metadata enrichment
          }
        }

        const qualities: QualityOption[] = [
          {
            id: '1080p',
            label: '1080p Full HD',
            resolution: '1080p',
            format: 'mp4',
            url: videoUrl,
            isNative: true,
            hasAudio: true,
          },
          {
            id: '720p',
            label: '720p HD',
            resolution: '720p',
            format: 'mp4',
            url: videoUrl,
            isNative: false,
            hasAudio: true,
          },
          {
            id: '480p',
            label: '480p SD (Fast)',
            resolution: '480p',
            format: 'mp4',
            url: videoUrl,
            isNative: false,
            hasAudio: true,
          },
          {
            id: 'audio',
            label: 'Original Audio (MP3)',
            resolution: 'audio',
            format: 'mp3',
            url: videoUrl,
            isNative: true,
            hasAudio: true,
          },
        ];

        const metadata: MediaMetadata = {
          id: shortcode || `ig_${Date.now()}`,
          originalUrl: url,
          platform: 'instagram',
          title: title || `Instagram Reel #${shortcode}`,
          description: `Instagram content by ${author.name}`,
          author,
          thumbnailUrl,
          qualities,
          extractedAt: new Date().toISOString(),
          sourceType: isReel ? 'reel' : 'video',
        };

        return { success: true, data: metadata };
      }

      return {
        success: false,
        error:
          'Media could not be accessed. The Instagram post may be private, deleted, age-restricted, or requires login verification.',
        statusCode: 403,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract Instagram video' };
    }
  }
}
