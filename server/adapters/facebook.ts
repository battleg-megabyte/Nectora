import dns from 'node:dns';
import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

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

let fbSnapQueue: Promise<void> = Promise.resolve();
let lastFbSnapDoneAt = 0;
let cachedSnapCookie = '';
let cachedSnapCookieAt = 0;
const fbInFlight = new Map<string, Promise<AdapterResult>>();
const fbCache = new Map<string, { expiresAt: number; result: AdapterResult }>();

async function runWithSnapSaveLock<T>(task: () => Promise<T>): Promise<T> {
  const prev = fbSnapQueue;
  let release!: () => void;
  fbSnapQueue = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    const elapsed = Date.now() - lastFbSnapDoneAt;
    if (elapsed < 1200) {
      await new Promise((r) => setTimeout(r, 1200 - elapsed));
    }
    return await task();
  } finally {
    lastFbSnapDoneAt = Date.now();
    release();
  }
}

async function getSnapSaveSessionCookie(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedSnapCookie && Date.now() - cachedSnapCookieAt < 120000) {
    return cachedSnapCookie;
  }
  try {
    const ssLanding = await fetch('https://snapsave.app/download-facebook-video', {
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    const rawSetCookie = ssLanding.headers.get('set-cookie') || '';
    const parsedCookie = rawSetCookie
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
    await ssLanding.body?.cancel().catch(() => {});
    if (parsedCookie) {
      cachedSnapCookie = parsedCookie;
      cachedSnapCookieAt = Date.now();
    }
    return cachedSnapCookie;
  } catch {
    return cachedSnapCookie;
  }
}

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
        host === 'mbasic.facebook.com' ||
        host === 'touch.facebook.com' ||
        host === 'l.facebook.com' ||
        host === 'fb.watch' ||
        host === 'www.fb.watch' ||
        host === 'm.fb.watch' ||
        host === 'fb.com' ||
        host === 'www.fb.com' ||
        host === 'fb.me' ||
        host.endsWith('.facebook.com') ||
        host.endsWith('.fb.watch')
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

      // Step 1: Unwrap l.facebook.com/l.php?u=... or plugins/video.php?href=... & resolve fb.watch / /share/ shortlinks
      let targetUrl = url.trim();
      try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname.includes('l.facebook.com') && parsed.searchParams.get('u')) {
          const unwrapped = parsed.searchParams.get('u')!;
          const unwrapSafe = await validateSafeUrl(unwrapped);
          if (unwrapSafe.safe) targetUrl = unwrapped;
        } else if (parsed.pathname.includes('/plugins/video.php') && parsed.searchParams.get('href')) {
          const unwrapped = parsed.searchParams.get('href')!;
          const unwrapSafe = await validateSafeUrl(unwrapped);
          if (unwrapSafe.safe) targetUrl = unwrapped;
        }
      } catch {}

      if (
        targetUrl.includes('fb.watch') ||
        targetUrl.includes('fb.me') ||
        targetUrl.includes('fb.com') ||
        targetUrl.includes('/share/')
      ) {
        try {
          const res = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              Cookie: activeCookies,
            },
          });
          await res.body?.cancel().catch(() => {});
          if (res.url && res.url !== targetUrl) {
            let finalRedirect = res.url;
            // If FB redirected to /login/?next=..., extract the clean target from `next`
            try {
              const redirUrl = new URL(res.url);
              if (redirUrl.pathname.startsWith('/login') && redirUrl.searchParams.get('next')) {
                finalRedirect = redirUrl.searchParams.get('next')!;
              }
            } catch {}

            const redirectSafe = await validateSafeUrl(finalRedirect);
            if (redirectSafe.safe) {
              targetUrl = finalRedirect;
            }
          }
        } catch {
          // Handled shortlink timeout/error cleanly — continue with original URL
        }
      }

      const fbIdMatch =
        targetUrl.match(/[?&]v=(\d{6,25})/i) ||
        targetUrl.match(/\/(?:videos|reel|reels|video\.php)\/(?:[^/]+\/)?(\d{6,25})/i);
      const fbVideoId = fbIdMatch?.[1] || '';
      const cacheKey = fbVideoId ? `fb:${fbVideoId}` : targetUrl;

      const cachedEntry = fbCache.get(cacheKey);
      if (cachedEntry && cachedEntry.expiresAt > Date.now() && cachedEntry.result.success && cachedEntry.result.data) {
        return {
          success: true,
          data: {
            ...cachedEntry.result.data,
            originalUrl: url,
          },
        };
      }

      const existingFlight = fbInFlight.get(cacheKey);
      if (existingFlight) {
        const shared = await existingFlight;
        if (shared.success && shared.data) {
          return {
            success: true,
            data: {
              ...shared.data,
              originalUrl: url,
            },
          };
        }
        return shared;
      }

      const flightPromise = this.extractUncached(url, targetUrl, fbVideoId, activeCookies);
      fbInFlight.set(cacheKey, flightPromise);
      try {
        const res = await flightPromise;
        if (res.success && res.data) {
          fbCache.set(cacheKey, { expiresAt: Date.now() + 45000, result: res });
        }
        return res;
      } finally {
        fbInFlight.delete(cacheKey);
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract Facebook video' };
    }
  }

  private async extractUncached(
    url: string,
    targetUrl: string,
    fbVideoId: string,
    activeCookies: string
  ): Promise<AdapterResult> {
    try {
      const snapTargetCandidates = Array.from(
        new Set(
          [
            targetUrl.replace('://m.facebook.com', '://www.facebook.com'),
            fbVideoId ? `https://www.facebook.com/watch/?v=${fbVideoId}` : '',
            targetUrl,
          ].filter(Boolean)
        )
      );

      const queryUrl = snapTargetCandidates[0] || targetUrl;

      const tryFbDownloaderTo = async (): Promise<AdapterResult> => {
        const form = new URLSearchParams();
        form.append('q', queryUrl);
        form.append('lang', 'en');
        const res = await fetch('https://fbdownloader.to/api/ajaxSearch', {
          method: 'POST',
          body: form.toString(),
          signal: AbortSignal.timeout(7000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://fbdownloader.to',
            Referer: 'https://fbdownloader.to/',
          },
        });
        if (!res.ok) {
          await res.body?.cancel().catch(() => {});
          throw new Error(`FBDownloader HTTP ${res.status}`);
        }
        const json: any = await res.json();
        const html = String(json?.data || '');
        if (!html || json?.status !== 'ok') {
          throw new Error('FBDownloader returned empty data');
        }

        const qualities: QualityOption[] = [];
        const seenUrls = new Set<string>();
        let hdUrl: string | undefined;
        let sdUrl: string | undefined;

        const rowMatches = [
          ...html.matchAll(
            /<td[^>]*class="video-quality"[^>]*>([^<]+)<\/td>[\s\S]*?<a[^>]*href="(https:\/\/[^"]+)"/gi
          ),
        ];

        for (const match of rowMatches) {
          const qualityLabel = (match[1] || 'HD').trim();
          const dlUrl = (match[2] || '').replace(/&amp;/g, '&').trim();
          if (!dlUrl || seenUrls.has(dlUrl)) continue;
          const safeCheckDl = await validateSafeUrl(dlUrl);
          if (!safeCheckDl.safe) continue;
          seenUrls.add(dlUrl);

          const qLower = qualityLabel.toLowerCase();
          if (qLower.includes('1080') || qLower.includes('720') || qLower.includes('hd')) {
            hdUrl = hdUrl || dlUrl;
          } else {
            sdUrl = sdUrl || dlUrl;
          }
        }

        // Also check embedded direct progressive <video src="..."> if present
        const embeddedVideoMatch = html.match(/<video[^>]*\ssrc="(https:\/\/[^"]+)"/i);
        const embeddedVideoUrl = embeddedVideoMatch?.[1]?.replace(/&amp;/g, '&').trim();
        if (embeddedVideoUrl && !hdUrl) {
          const safeEmbed = await validateSafeUrl(embeddedVideoUrl);
          if (safeEmbed.safe) {
            hdUrl = embeddedVideoUrl;
          }
        }

        const primaryVideo = hdUrl || sdUrl;
        if (!primaryVideo) {
          throw new Error('FBDownloader parsed no valid stream links');
        }

        const audioInputMatch = html.match(/id="audioUrl"\s+value="(https:\/\/[^"]+)"/i);
        const rawAudioUrl = audioInputMatch?.[1]?.replace(/&amp;/g, '&').trim();
        let validAudioUrl: string | undefined;
        if (rawAudioUrl) {
          const safeAud = await validateSafeUrl(rawAudioUrl);
          if (safeAud.safe) validAudioUrl = rawAudioUrl;
        }

        if (hdUrl) {
          qualities.push({
            id: '1080p',
            label: '1080p Full HD (Master)',
            resolution: '1080p',
            format: 'mp4',
            url: hdUrl,
            audioUrl: validAudioUrl,
            isNative: false,
            hasAudio: true,
          });
          qualities.push({
            id: '720p',
            label: '720p HD Stream',
            resolution: '720p',
            format: 'mp4',
            url: hdUrl,
            audioUrl: validAudioUrl,
            isNative: true,
            hasAudio: true,
          });
        }

        if (sdUrl) {
          qualities.push({
            id: '480p',
            label: '480p SD Stream',
            resolution: '480p',
            format: 'mp4',
            url: sdUrl,
            audioUrl: validAudioUrl,
            isNative: !hdUrl,
            targetHeight: 480,
            hasAudio: true,
          });
        }

        qualities.push({
          id: 'audio',
          label: 'Audio Track (MP3)',
          resolution: 'audio',
          format: 'mp3',
          url: validAudioUrl || primaryVideo,
          isNative: true,
          hasAudio: true,
        });

        const thumbMatch =
          html.match(/class="image-fb[^"]*"[\s\S]*?<img[^>]*src="(https:\/\/[^"]+)"/i) ||
          html.match(/<video[^>]*poster="(https:\/\/[^"]+)"/i);
        const thumbnailUrl = thumbMatch?.[1]?.replace(/&amp;/g, '&') || '';

        return {
          success: true,
          data: {
            id: fbVideoId ? `fb_${fbVideoId}` : `fb_${Date.now()}`,
            originalUrl: url,
            platform: 'facebook',
            title: fbVideoId ? `Facebook Video ${fbVideoId}` : 'Facebook Video Stream',
            description: 'Facebook High-Definition Video Stream',
            author: {
              name: 'Facebook Creator',
              username: 'facebook_user',
              profileUrl: 'https://facebook.com',
            },
            thumbnailUrl,
            qualities,
            extractedAt: new Date().toISOString(),
            sourceType: targetUrl.includes('/reel/') ? 'reel' : 'video',
          },
        };
      };

      const trySnapSave = async (): Promise<AdapterResult> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const snapResData = await runWithSnapSaveLock(async () => {
            const sessionCookie = await getSnapSaveSessionCookie(attempt > 0);
            const snapForm = new URLSearchParams();
            snapForm.append('url', snapTargetCandidates[attempt % snapTargetCandidates.length] || queryUrl);
            const snapRes = await fetch('https://snapsave.app/action.php?lang=en', {
              method: 'POST',
              body: snapForm.toString(),
              signal: AbortSignal.timeout(5500),
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: 'https://snapsave.app/download-facebook-video',
                Origin: 'https://snapsave.app',
                ...(sessionCookie ? { Cookie: sessionCookie } : {}),
              },
            });
            if (!snapRes.ok) {
              await snapRes.body?.cancel().catch(() => {});
              return '';
            }
            return await snapRes.text();
          });

          if (snapResData) {
            const decodedHtml = unpackSnapSaveHtml(snapResData);
            if (decodedHtml) {
              const unescapedHtml = decodedHtml.replace(/\\"/g, '"');
              const rowMatches = [
                ...unescapedHtml.matchAll(
                  /<td[^>]*class="video-quality">([^<]+)<\/td>[\s\S]*?<a[^>]*href="([^"]+)"/gi
                ),
                ...unescapedHtml.matchAll(
                  /<div[^>]*class="download-items__btn"[^>]*>[\s\S]*?<a[^>]*href="(https:\/\/[^"]+)"/gi
                ),
              ];

              if (rowMatches.length > 0) {
                const qualities: QualityOption[] = [];
                const seenUrls = new Set<string>();
                let hdUrl: string | undefined;
                let sdUrl: string | undefined;

                for (const match of rowMatches) {
                  const qualityLabel = match.length >= 3 ? match[1]?.trim() || 'HD' : 'HD';
                  const downloadUrl = (match.length >= 3 ? match[2] : match[1])?.replace(/&amp;/g, '&').trim();

                  if (!downloadUrl || seenUrls.has(downloadUrl)) continue;
                  const safeCheckDl = await validateSafeUrl(downloadUrl);
                  if (!safeCheckDl.safe) continue;
                  seenUrls.add(downloadUrl);

                  const qLower = qualityLabel.toLowerCase();
                  if (qLower.includes('1080') || qLower.includes('full hd') || qLower.includes('hd')) {
                    hdUrl = hdUrl || downloadUrl;
                  } else {
                    sdUrl = sdUrl || downloadUrl;
                  }
                }

                const primaryVideo = hdUrl || sdUrl;
                if (primaryVideo) {
                  if (hdUrl) {
                    qualities.push({
                      id: '1080p',
                      label: '1080p Full HD (Master)',
                      resolution: '1080p',
                      format: 'mp4',
                      url: hdUrl,
                      isNative: true,
                      hasAudio: true,
                    });
                  }

                  qualities.push({
                    id: '720p',
                    label: '720p HD Stream',
                    resolution: '720p',
                    format: 'mp4',
                    url: hdUrl || primaryVideo,
                    isNative: Boolean(hdUrl),
                    hasAudio: true,
                  });

                  qualities.push({
                    id: '480p',
                    label: '480p SD Stream',
                    resolution: '480p',
                    format: 'mp4',
                    url: sdUrl || primaryVideo,
                    isNative: Boolean(sdUrl && !hdUrl),
                    targetHeight: 480,
                    hasAudio: true,
                  });

                  qualities.push({
                    id: 'audio',
                    label: 'Audio Track (MP3)',
                    resolution: 'audio',
                    format: 'mp3',
                    url: primaryVideo,
                    isNative: true,
                    hasAudio: true,
                  });

                  const titleMatch =
                    unescapedHtml.match(
                      /<strong>Video Facebook<\/strong><span[^>]*>([^<]+)<\/span>/i
                    ) || unescapedHtml.match(/<strong>([^<]+)<\/strong>/i);
                  let title =
                    titleMatch && titleMatch[1]?.trim()
                      ? titleMatch[1].trim()
                      : 'Facebook Video';
                  if (title === '...' || title === 'Video Facebook' || !title) {
                    title = 'Facebook Video Stream';
                  }

                  const thumbMatch = unescapedHtml.match(/<img[^>]*src="([^"]+)"/i);
                  const thumbnailUrl = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : '';

                  return {
                    success: true,
                    data: {
                      id: fbVideoId ? `fb_${fbVideoId}` : `fb_${Date.now()}`,
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
                      sourceType: targetUrl.includes('/reel/') ? 'reel' : 'video',
                    },
                  };
                }
              }
            }
          }
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        throw new Error('SnapSave failed');
      };

      const tryYtDlp = async (): Promise<AdapterResult> => {
        const ytdlpResult = await extractWithYtDlp(targetUrl, 'facebook', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
        throw new Error('yt-dlp Facebook unavailable');
      };

      // Method A+B+C Race: Launch FBDownloader, SnapSave + yt-dlp simultaneously; fastest valid wins!
      try {
        const fastWinner = await Promise.any([
          tryFbDownloaderTo(),
          tryYtDlp(),
          trySnapSave(),
        ]);
        if (fastWinner.success && fastWinner.data) {
          return fastWinner;
        }
      } catch {
        // Fall through cleanly to parallel HTML scrape
      }

      // Method C: Parallel Facebook Desktop + Mobile + Plugin Embed Scrape
      let dynamicCookies = activeCookies;
      const htmlCandidates = Array.from(
        new Set(
          [
            targetUrl,
            fbVideoId ? `https://m.facebook.com/watch/?v=${fbVideoId}` : '',
            `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(targetUrl)}&show_text=0`,
          ].filter(Boolean)
        )
      );

      const scrapeHtmlCandidate = async (candidateUrl: string): Promise<AdapterResult> => {
        const isMobileCandidate = candidateUrl.includes('://m.facebook.com');
        const response = await fetch(candidateUrl, {
          signal: AbortSignal.timeout(4500),
          headers: {
            'User-Agent': isMobileCandidate
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
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

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        let hdUrl: string | null = null;
        let sdUrl: string | null = null;
        let dashAudioUrl: string | null = null;

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
          const dashAudioMatch = html.match(/"mime_type":"audio\\\/mp4"[^}]*"base_url":"([^"]+)"/);
          if (dashAudioMatch?.[1]) {
            dashAudioUrl = dashAudioMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          }
          const dashVideoMatches = [
            ...html.matchAll(/"mime_type":"video\\\/mp4"[^}]*"height":(\d+)[^}]*"base_url":"([^"]+)"/g),
          ];
          if (dashVideoMatches.length > 0) {
            const sortedDash = dashVideoMatches
              .map((m) => ({ height: Number(m[1]), url: m[2].replace(/\\u0026/g, '&').replace(/\\/g, '') }))
              .sort((a, b) => b.height - a.height);
            hdUrl = sortedDash[0]?.url || null;
            sdUrl = sortedDash[sortedDash.length - 1]?.url || null;
          }
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

        if (!hdUrl && !sdUrl) {
          throw new Error('No video stream found in HTML');
        }

        let title = 'Facebook Video';
        const titleMatch =
          html.match(/<meta property="og:title" content="([^"]+)"/i) ||
          html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && !titleMatch[1].toLowerCase().includes('log in')) {
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
            audioUrl: dashAudioUrl || undefined,
            isNative: true,
            hasAudio: true,
          });

          qualities.push({
            id: '720p',
            label: '720p HD',
            resolution: '720p',
            format: 'mp4',
            url: hdUrl,
            audioUrl: dashAudioUrl || undefined,
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
            audioUrl: dashAudioUrl || undefined,
            isNative: !hdUrl,
            hasAudio: true,
          });
        }

        const bestAudioSource = dashAudioUrl || hdUrl || sdUrl;
        if (bestAudioSource) {
          qualities.push({
            id: 'audio',
            label: 'Audio Track (MP3)',
            resolution: 'audio',
            format: 'mp3',
            url: bestAudioSource,
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
          sourceType: targetUrl.includes('/reel/') ? 'reel' : 'video',
        };

        return { success: true, data: metadata };
      };

      try {
        const htmlWinner = await Promise.any(htmlCandidates.map((u) => scrapeHtmlCandidate(u)));
        if (htmlWinner.success && htmlWinner.data) {
          return htmlWinner;
        }
      } catch {
        // Fall through cleanly to mbasic fallback
      }

      // Method D: Fallback to mbasic Facebook endpoint
      try {
        const mobileUrl = targetUrl
          .replace('www.facebook.com', 'mbasic.facebook.com')
          .replace('web.facebook.com', 'mbasic.facebook.com')
          .replace('m.facebook.com', 'mbasic.facebook.com')
          .replace('touch.facebook.com', 'mbasic.facebook.com');

        const mResponse = await fetch(mobileUrl, {
          signal: AbortSignal.timeout(8000),
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
                    id: '1080p',
                    label: '1080p HD Stream',
                    resolution: '1080p',
                    format: 'mp4',
                    url: mVideoUrl,
                    isNative: false,
                    hasAudio: true,
                  },
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
                sourceType: targetUrl.includes('/reel/') ? 'reel' : 'video',
              },
            };
          }
        }
      } catch {
        // Handled mobile fallback cleanly
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
