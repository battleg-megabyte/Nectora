import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

export class InstagramAdapter implements PlatformAdapter {
  readonly platformName = 'Instagram';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'instagram.com' ||
        host === 'www.instagram.com' ||
        host === 'instagr.am' ||
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

      // Step 1: Resolve instagr.am or share shortlinks safely
      let targetUrl = url;
      if (url.includes('instagr.am') || url.includes('/share/')) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
              Cookie: activeCookies,
            },
          });
          if (res.url && res.url !== url) {
            const redirectSafe = await validateSafeUrl(res.url);
            if (redirectSafe.safe) {
              targetUrl = res.url;
            }
          }
        } catch (err) {
          console.warn('Instagram shortlink resolution notice:', err);
        }
      }

      const shortcodeMatch = targetUrl.match(/\/(?:p|reel|reels|tv|stories\/[^/]+)\/([A-Za-z0-9_-]+)/);
      const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

      // Method A: Try yt-dlp with security cookies first
      try {
        const ytdlpResult = await extractWithYtDlp(targetUrl, 'instagram', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch (ytdlpErr) {
        console.warn('Instagram yt-dlp notice:', ytdlpErr);
      }

      let videoUrl: string | null = null;
      let thumbnailUrl = shortcode ? `https://www.instagram.com/p/${shortcode}/media/?size=l` : '';
      let title = shortcode ? `Instagram Reel (${shortcode})` : 'Instagram Video';
      let author: {
        name: string;
        username: string;
        avatarUrl?: string;
        profileUrl?: string;
      } = { name: 'Instagram Creator', username: 'instagram_user' };

      // Method B: Public Embed Endpoints (/embed/captioned/ & /embed/)
      if (shortcode) {
        const embedUrls = [
          `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
          `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
          `https://www.instagram.com/p/${shortcode}/embed/`,
        ];

        for (const embedUrl of embedUrls) {
          if (videoUrl) break;
          try {
            const response = await fetch(embedUrl, {
              signal: AbortSignal.timeout(10000),
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
          } catch (embedErr) {
            console.warn('Instagram embed scrape warning:', embedErr);
          }
        }
      }

      // Method C: Public GraphQL / JSON Web Info Fallback
      if (!videoUrl && shortcode) {
        try {
          const jsonRes = await fetch(
            `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
            {
              signal: AbortSignal.timeout(10000),
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
        } catch (jsonErr) {
          console.warn('Instagram JSON endpoint notice:', jsonErr);
        }
      }

      // Method D: oEmbed metadata enrichment
      if (videoUrl) {
        try {
          const oembedRes = await fetch(
            `https://api.instagram.com/oembed/?url=${encodeURIComponent(targetUrl)}`,
            {
              signal: AbortSignal.timeout(6000),
              headers: { 'User-Agent': 'Mozilla/5.0' },
            }
          );
          if (oembedRes.ok) {
            const oembedData: any = await oembedRes.json();
            if (oembedData.title && title.startsWith('Instagram Reel (')) {
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
          sourceType: 'reel',
        };

        return { success: true, data: metadata };
      }

      return {
        success: false,
        error:
          'Media could not be accessed. The Instagram post may be private, age-restricted, or requires login verification.',
        statusCode: 403,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract Instagram video' };
    }
  }
}
