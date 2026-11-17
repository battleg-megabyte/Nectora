import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

export class FacebookAdapter implements PlatformAdapter {
  readonly platformName = 'Facebook';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'facebook.com' ||
        host === 'www.facebook.com' ||
        host === 'm.facebook.com' ||
        host === 'web.facebook.com' ||
        host === 'fb.watch' ||
        host === 'fb.com' ||
        host.endsWith('.facebook.com')
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

      const activeCookies = getPlatformSecurityCookies('facebook', cookies);

      // Step 1: Resolve fb.watch / share shortlinks cleanly before all extractors
      let targetUrl = url;
      if (url.includes('fb.watch') || url.includes('/share/') || url.includes('fb.com')) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Cookie: activeCookies,
            },
          });
          if (res.url && res.url !== url) {
            const redirectSafe = await validateSafeUrl(res.url);
            if (redirectSafe.safe) {
              targetUrl = res.url;
            }
          }
        } catch (e) {
          console.warn('Facebook shortlink resolution notice:', e);
        }
      }

      // Method A: yt-dlp Core
      try {
        const ytdlpResult = await extractWithYtDlp(targetUrl, 'facebook', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch (ytdlpErr) {
        console.warn('Facebook yt-dlp notice:', ytdlpErr);
      }

      // Method B: Fetch Facebook video page with desktop headers
      let dynamicCookies = activeCookies;
      try {
        const response = await fetch(targetUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            Cookie: dynamicCookies,
          },
        });

        const setCookies = response.headers.get('set-cookie');
        if (setCookies) {
          dynamicCookies = `${dynamicCookies}; ${setCookies
            .split(',')
            .map((c) => c.split(';')[0].trim())
            .join('; ')}`;
        }

        if (response.ok) {
          const html = await response.text();

          let hdUrl: string | null = null;
          let sdUrl: string | null = null;

          const hdMatch =
            html.match(/hd_src:"([^"]+)"/) ||
            html.match(/"browser_native_hd_url":"([^"]+)"/) ||
            html.match(/"playable_url_quality_hd":"([^"]+)"/) ||
            html.match(/"hd_src_no_ratelimit":"([^"]+)"/);

          const sdMatch =
            html.match(/sd_src:"([^"]+)"/) ||
            html.match(/"browser_native_sd_url":"([^"]+)"/) ||
            html.match(/"playable_url":"([^"]+)"/) ||
            html.match(/"sd_src_no_ratelimit":"([^"]+)"/) ||
            html.match(/"progressive_download_url":"([^"]+)"/);

          if (hdMatch && hdMatch[1]) {
            hdUrl = hdMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          }

          if (sdMatch && sdMatch[1]) {
            sdUrl = sdMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          }

          if (!hdUrl && !sdUrl) {
            const ogVideoMatch =
              html.match(/<meta property="og:video" content="([^"]+)"/i) ||
              html.match(/<meta property="og:video:url" content="([^"]+)"/i) ||
              html.match(/<meta property="og:video:secure_url" content="([^"]+)"/i) ||
              html.match(/<meta name="twitter:player:stream" content="([^"]+)"/i);
            if (ogVideoMatch && ogVideoMatch[1]) {
              sdUrl = ogVideoMatch[1].replace(/&amp;/g, '&');
            }
          }

          if (!hdUrl && !sdUrl) {
            const jsonMatches = html.matchAll(/"(https:\/\/[^"]*fbcdn\.net[^"]*)"/g);
            for (const match of jsonMatches) {
              const cleanCandidate = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
              if (cleanCandidate.includes('.mp4') || cleanCandidate.includes('bytestart')) {
                if (cleanCandidate.includes('_hd') || cleanCandidate.includes('hd_')) {
                  hdUrl = hdUrl || cleanCandidate;
                } else {
                  sdUrl = sdUrl || cleanCandidate;
                }
              }
            }
          }

          if (hdUrl || sdUrl) {
            let title = 'Facebook Video';
            const titleMatch =
              html.match(/<meta property="og:title" content="([^"]+)"/i) ||
              html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].replace(/&amp;/g, '&').trim();
            }

            let thumbnailUrl = '';
            const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (imgMatch && imgMatch[1]) {
              thumbnailUrl = imgMatch[1].replace(/&amp;/g, '&');
            }

            const qualities: QualityOption[] = [];

            if (hdUrl) {
              qualities.push({
                id: '1080p',
                label: '1080p Full HD (HD Stream)',
                resolution: '1080p',
                format: 'mp4',
                url: hdUrl,
                isNative: true,
                hasAudio: true,
              });

              qualities.push({
                id: '720p',
                label: '720p HD',
                resolution: '720p',
                format: 'mp4',
                url: hdUrl,
                isNative: false,
                hasAudio: true,
              });
            }

            if (sdUrl) {
              qualities.push({
                id: '480p',
                label: '480p SD (Standard Stream)',
                resolution: '480p',
                format: 'mp4',
                url: sdUrl,
                isNative: !hdUrl,
                hasAudio: true,
              });
            }

            const bestUrl = hdUrl || sdUrl;
            if (bestUrl) {
              qualities.push({
                id: 'audio',
                label: 'Audio Track (MP3)',
                resolution: 'audio',
                format: 'mp3',
                url: bestUrl,
                isNative: true,
                hasAudio: true,
              });
            }

            const metadata: MediaMetadata = {
              id: `fb_${Date.now()}`,
              originalUrl: url,
              platform: 'facebook',
              title,
              description: 'Facebook Public Video',
              author: {
                name: 'Facebook Creator',
                username: 'facebook_user',
                profileUrl: 'https://facebook.com',
              },
              thumbnailUrl,
              qualities,
              extractedAt: new Date().toISOString(),
              sourceType: 'video',
            };

            return { success: true, data: metadata };
          }
        }
      } catch (desktopErr) {
        console.warn('Facebook desktop scrape notice:', desktopErr);
      }

      // Method C: SnapSave Engine Integration for Facebook
      try {
        const snapForm = new URLSearchParams();
        snapForm.append('url', targetUrl);
        const snapRes = await fetch('https://snapsave.app/action.php?lang=en', {
          method: 'POST',
          body: snapForm,
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://snapsave.app/',
            Origin: 'https://snapsave.app',
          },
        });

        if (snapRes.ok) {
          const snapScript = await snapRes.text();
          if (snapScript.includes('eval(')) {
            const modifiedScript = snapScript.replace(
              /eval\(/g,
              'globalThis.__snapsave_payload = ('
            );
            try {
              const runUnpack = new Function(modifiedScript);
              runUnpack();
              const decodedHtml: string = (globalThis as any).__snapsave_payload || '';
              delete (globalThis as any).__snapsave_payload;

              if (decodedHtml) {
                const rowMatches = [
                  ...decodedHtml.matchAll(
                    /<td[^>]*class=\\"video-quality\\">([^<]+)<\/td>[\s\S]*?<a\s+href=\\"([^\\"]+)\\"/g
                  ),
                  ...decodedHtml
                    .replace(/\\"/g, '"')
                    .matchAll(
                      /<td[^>]*class="video-quality">([^<]+)<\/td>[\s\S]*?<a\s+href="([^"]+)"/g
                    ),
                ];

                if (rowMatches.length > 0) {
                  const qualities: QualityOption[] = [];
                  const seenUrls = new Set<string>();

                  for (const match of rowMatches) {
                    const qualityLabel = match[1]?.trim() || 'HD';
                    const downloadUrl = match[2]?.trim();

                    if (!downloadUrl || seenUrls.has(downloadUrl)) continue;
                    seenUrls.add(downloadUrl);

                    const isHd =
                      qualityLabel.toLowerCase().includes('1080') ||
                      qualityLabel.toLowerCase().includes('hd') ||
                      qualityLabel.toLowerCase().includes('720');
                    const resId = isHd ? '720p' : '480p';

                    qualities.push({
                      id: resId,
                      label: isHd ? '720p HD Stream' : '480p SD Stream',
                      resolution: resId,
                      format: 'mp4',
                      url: downloadUrl,
                      isNative: true,
                      hasAudio: true,
                    });
                  }

                  const has720p = qualities.some((q) => q.resolution === '720p');
                  const has480p = qualities.some((q) => q.resolution === '480p');

                  if (has720p && !has480p && qualities.length > 0) {
                    const master720 = qualities.find((q) => q.resolution === '720p')!;
                    qualities.push({
                      id: '480p',
                      label: '480p SD Stream',
                      resolution: '480p',
                      format: 'mp4',
                      url: master720.url,
                      isNative: false,
                      hasAudio: true,
                    });
                  } else if (has480p && !has720p && qualities.length > 0) {
                    const master480 = qualities.find((q) => q.resolution === '480p')!;
                    qualities.unshift({
                      id: '720p',
                      label: '720p HD Stream',
                      resolution: '720p',
                      format: 'mp4',
                      url: master480.url,
                      isNative: false,
                      hasAudio: true,
                    });
                  }

                  if (qualities.length > 0) {
                    const bestStream = qualities[0].url;
                    qualities.push({
                      id: 'audio',
                      label: 'Audio Track (MP3)',
                      resolution: 'audio',
                      format: 'mp3',
                      url: bestStream,
                      isNative: true,
                      hasAudio: true,
                    });

                    const titleMatch =
                      decodedHtml.match(
                        /<strong>Video Facebook<\/strong><span[^>]*>([^<]+)<\/span>/i
                      ) || decodedHtml.match(/<strong>([^<]+)<\/strong>/i);
                    let title =
                      titleMatch && titleMatch[1]?.trim()
                        ? titleMatch[1].trim()
                        : 'Facebook Video';
                    if (title === '...' || title === 'Video Facebook' || !title) {
                      title = 'Facebook Video Stream';
                    }

                    const thumbMatch =
                      decodedHtml.match(/<img src=\\"([^\\"]+)\\"/i) ||
                      decodedHtml.match(/<img src="([^"]+)"/i);
                    const thumbnailUrl = thumbMatch ? thumbMatch[1].replace(/\\"/g, '') : '';

                    return {
                      success: true,
                      data: {
                        id: `fb_${Date.now()}`,
                        originalUrl: url,
                        platform: 'facebook',
                        title,
                        description: 'Facebook High-Definition Video Stream',
                        author: {
                          name: 'Facebook Creator',
                          username: 'facebook_user',
                          profileUrl: 'https://facebook.com',
                        },
                        thumbnailUrl,
                        qualities,
                        extractedAt: new Date().toISOString(),
                        sourceType: 'video',
                      },
                    };
                  }
                }
              }
            } catch (unpackErr) {
              console.warn('SnapSave unpack notice:', unpackErr);
            }
          }
        }
      } catch (snapErr) {
        console.warn('SnapSave fetch notice:', snapErr);
      }

      // Method D: Fallback to mbasic Facebook endpoint
      try {
        const mobileUrl = targetUrl
          .replace('www.facebook.com', 'mbasic.facebook.com')
          .replace('web.facebook.com', 'mbasic.facebook.com')
          .replace('m.facebook.com', 'mbasic.facebook.com');

        const mResponse = await fetch(mobileUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Cookie: dynamicCookies,
          },
        });

        if (mResponse.ok) {
          const mHtml = await mResponse.text();
          const redirectMatch = mHtml.match(/\/video_redirect\/\?src=([^"&]+)/i);
          let mVideoUrl: string | null = null;
          if (redirectMatch && redirectMatch[1]) {
            mVideoUrl = decodeURIComponent(redirectMatch[1]);
          } else {
            const videoTagMatch = mHtml.match(/<video[^>]*src="([^"]+)"/i);
            if (videoTagMatch && videoTagMatch[1]) {
              mVideoUrl = videoTagMatch[1].replace(/&amp;/g, '&');
            }
          }

          if (mVideoUrl) {
            return {
              success: true,
              data: {
                id: `fb_${Date.now()}`,
                originalUrl: url,
                platform: 'facebook',
                title: 'Facebook Video',
                description: 'Facebook Mobile Stream',
                author: {
                  name: 'Facebook Creator',
                  username: 'facebook_user',
                  profileUrl: 'https://facebook.com',
                },
                thumbnailUrl: '',
                qualities: [
                  {
                    id: '720p',
                    label: '720p HD Stream',
                    resolution: '720p',
                    format: 'mp4',
                    url: mVideoUrl,
                    isNative: true,
                    hasAudio: true,
                  },
                  {
                    id: '480p',
                    label: '480p SD Stream',
                    resolution: '480p',
                    format: 'mp4',
                    url: mVideoUrl,
                    isNative: false,
                    hasAudio: true,
                  },
                  {
                    id: 'audio',
                    label: 'Audio Track (MP3)',
                    resolution: 'audio',
                    format: 'mp3',
                    url: mVideoUrl,
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
      } catch (mErr) {
        console.warn('Facebook mobile fallback notice:', mErr);
      }

      return {
        success: false,
        error:
          'Could not locate downloadable stream. The video may be private, group-only, or geo-blocked.',
        statusCode: 404,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract Facebook video' };
    }
  }
}
