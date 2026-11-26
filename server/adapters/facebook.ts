import dns from 'node:dns';
import { PlatformAdapter, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import {
  validateSafeUrl,
  safeFetch,
  sanitizeHttpUrl,
  getPlatformSecurityCookies,
  unpackPackedJs,
} from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';

function parseDurationToSeconds(raw: string): number {
  const parts = raw
    .trim()
    .split(':')
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

function decodeEscapedFbUrl(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003C/gi, '<')
    .replace(/\\u003E/gi, '>')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/\\/g, '')
    .trim();
}

function stripHtmlTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

let fbSnapQueue: Promise<void> = Promise.resolve();
let lastFbSnapDoneAt = 0;
let cachedSnapCookie = '';
let cachedSnapCookieAt = 0;
const FB_CACHE_MAX = 150;
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
    if (elapsed < 850) {
      await new Promise((r) => setTimeout(r, 850 - elapsed));
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
      signal: AbortSignal.timeout(5500),
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

interface ShortlinkResolution {
  resolvedUrl: string;
  ogVideoUrl?: string;
  ogTitle?: string;
  ogImage?: string;
  fbAppVideoId?: string;
}

async function resolveFacebookShortlink(
  rawUrl: string,
  cookies: string
): Promise<ShortlinkResolution> {
  const crawlerAgents = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ];

  const probeWithUa = async (ua: string): Promise<ShortlinkResolution> => {
    const { response, finalUrl } = await safeFetch(rawUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(4200),
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookies ? { Cookie: cookies } : {}),
      },
    });

    const html = response.ok || response.status < 500 ? await response.text() : '';
    let candidateUrl = finalUrl || response.url || '';

    if (candidateUrl) {
      try {
        const redir = new URL(candidateUrl);
        if (redir.pathname.startsWith('/login') && redir.searchParams.get('next')) {
          candidateUrl = redir.searchParams.get('next')!;
        }
      } catch {}
    }

    let ogVideoUrl: string | undefined;
    let ogTitle: string | undefined;
    let ogImage: string | undefined;
    let fbAppVideoId: string | undefined;

    if (html) {
      const metaUrlMatch =
        html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      if (metaUrlMatch?.[1]) {
        const decodedMetaUrl = decodeEscapedFbUrl(metaUrlMatch[1]);
        if (decodedMetaUrl && !decodedMetaUrl.includes('/share/') && !decodedMetaUrl.includes('/login')) {
          candidateUrl = decodedMetaUrl;
        }
      }

      const appIdMatch = html.match(/fb:\/\/(?:video|reel)\/(\d{6,25})/i);
      if (appIdMatch?.[1]) {
        fbAppVideoId = appIdMatch[1];
      }

      const vidMatch =
        html.match(/<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/"playable_url_quality_hd":"([^"]+)"/) ||
        html.match(/"playable_url":"([^"]+)"/) ||
        html.match(/"browser_native_hd_url":"([^"]+)"/) ||
        html.match(/"browser_native_sd_url":"([^"]+)"/);
      if (vidMatch?.[1]) {
        const cleaned = sanitizeHttpUrl(decodeEscapedFbUrl(vidMatch[1]));
        if (cleaned) {
          const safeVid = await validateSafeUrl(cleaned);
          if (safeVid.safe) ogVideoUrl = cleaned;
        }
      }

      const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      if (titleMatch?.[1] && !titleMatch[1].toLowerCase().includes('log in')) {
        ogTitle = decodeEscapedFbUrl(titleMatch[1]);
      }

      const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (imgMatch?.[1]) {
        ogImage = sanitizeHttpUrl(decodeEscapedFbUrl(imgMatch[1])) || undefined;
      }
    }

    let validCandidate = '';
    if (candidateUrl && candidateUrl !== rawUrl && !candidateUrl.includes('/login')) {
      const safeCheck = await validateSafeUrl(candidateUrl);
      if (safeCheck.safe) {
        validCandidate = candidateUrl;
      }
    }

    if (ogVideoUrl || (validCandidate && !validCandidate.includes('/share/')) || fbAppVideoId) {
      return {
        resolvedUrl: validCandidate || (fbAppVideoId ? `https://www.facebook.com/watch/?v=${fbAppVideoId}` : rawUrl),
        ogVideoUrl,
        ogTitle,
        ogImage,
        fbAppVideoId,
      };
    }

    throw new Error('Share link unresolved by UA probe');
  };

  try {
    return await Promise.any(crawlerAgents.map((ua) => probeWithUa(ua)));
  } catch {
    return { resolvedUrl: rawUrl };
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
      let shortlinkFallback: ShortlinkResolution = { resolvedUrl: targetUrl };

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
        shortlinkFallback = await resolveFacebookShortlink(targetUrl, activeCookies);
        if (shortlinkFallback.resolvedUrl) {
          targetUrl = shortlinkFallback.resolvedUrl;
        }
      }

      const fbIdMatch =
        targetUrl.match(/[?&]v=(\d{6,25})/i) ||
        targetUrl.match(/\/(?:videos|reel|reels|video\.php|share\/v)\/(?:[^/]+\/)?(\d{6,25})/i);
      const fbVideoId = fbIdMatch?.[1] || shortlinkFallback.fbAppVideoId || '';
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

      const flightPromise = this.extractUncached(url, targetUrl, fbVideoId, activeCookies, shortlinkFallback);
      fbInFlight.set(cacheKey, flightPromise);
      try {
        const res = await flightPromise;
        if (res.success && res.data) {
          if (fbCache.size >= FB_CACHE_MAX) {
            const oldestKey = fbCache.keys().next().value;
            if (oldestKey) fbCache.delete(oldestKey);
          }
          fbCache.set(cacheKey, { expiresAt: Date.now() + 60000, result: res });
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
    activeCookies: string,
    shortlinkFallback: ShortlinkResolution
  ): Promise<AdapterResult> {
    try {
      const snapTargetCandidates = Array.from(
        new Set(
          [
            targetUrl.replace('://m.facebook.com', '://www.facebook.com'),
            fbVideoId ? `https://www.facebook.com/watch/?v=${fbVideoId}` : '',
            targetUrl,
            url,
          ].filter(Boolean)
        )
      );

      const queryUrl = snapTargetCandidates[0] || targetUrl;

      const tryFbDownloaderTo = async (): Promise<AdapterResult> => {
        let html = '';
        for (const candidate of snapTargetCandidates.slice(0, 2)) {
          try {
            const form = new URLSearchParams();
            form.append('q', candidate);
            form.append('lang', 'en');
            const res = await fetch('https://fbdownloader.to/api/ajaxSearch', {
              method: 'POST',
              body: form.toString(),
              signal: AbortSignal.timeout(8000),
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
              continue;
            }
            const json: any = await res.json();
            if (json?.status === 'ok' && json?.data) {
              html = String(json.data);
              break;
            }
          } catch {
            // Try next candidate
          }
        }

        if (!html) {
          throw new Error('FBDownloader returned empty data');
        }

        const qualities: QualityOption[] = [];
        const seenResUrls = new Set<string>();

        let url1080: string | undefined;
        let audio1080: string | undefined;
        let url720: string | undefined;
        let url480: string | undefined;
        let url360: string | undefined;

        const audioInputMatch = html.match(/id="audioUrl"\s+value="(https:\/\/[^"]+)"/i);
        const rawAudioUrl = audioInputMatch?.[1]?.replace(/&amp;/g, '&').trim();
        let validAudioUrl: string | undefined;
        if (rawAudioUrl) {
          const safeAud = await validateSafeUrl(rawAudioUrl);
          if (safeAud.safe) validAudioUrl = rawAudioUrl;
        }

        const rowMatches = [
          ...html.matchAll(
            /<tr[^>]*>[\s\S]*?<td[^>]*class="video-quality"[^>]*>([^<]+)<\/td>[\s\S]*?(?:<a[^>]*href="(https:\/\/[^"]+)"|data-videourl="(https:\/\/[^"]+)")(?:[\s\S]*?data-audiourl="(https:\/\/[^"]+)")?[\s\S]*?<\/tr>/gi
          ),
        ];

        for (const match of rowMatches) {
          const qualityLabel = (match[1] || '').trim();
          const dlUrl = (match[2] || match[3] || '').replace(/&amp;/g, '&').trim();
          const rowAudio = (match[4] || '').replace(/&amp;/g, '&').trim();
          if (!dlUrl || seenResUrls.has(`${qualityLabel}:${dlUrl}`)) continue;
          const safeCheckDl = await validateSafeUrl(dlUrl);
          if (!safeCheckDl.safe) continue;
          seenResUrls.add(`${qualityLabel}:${dlUrl}`);

          let safeRowAudio: string | undefined;
          if (rowAudio) {
            const safeAudCheck = await validateSafeUrl(rowAudio);
            if (safeAudCheck.safe) safeRowAudio = rowAudio;
          }

          const qLower = qualityLabel.toLowerCase();
          if (qLower.includes('1080') || qLower.includes('full hd')) {
            url1080 = url1080 || dlUrl;
            audio1080 = audio1080 || safeRowAudio || (match[3] ? validAudioUrl : undefined);
          } else if (qLower.includes('720') || qLower.includes('hd')) {
            url720 = url720 || dlUrl;
          } else if (qLower.includes('480')) {
            url480 = url480 || dlUrl;
          } else {
            url360 = url360 || dlUrl;
          }
        }

        // Also check embedded direct progressive <video src="..."> if present
        const embeddedVideoMatch = html.match(/<video[^>]*\ssrc="(https:\/\/[^"]+)"/i);
        const embeddedVideoUrl = embeddedVideoMatch?.[1]?.replace(/&amp;/g, '&').trim();
        if (embeddedVideoUrl && !url1080 && !url720 && !url480 && !url360) {
          const safeEmbed = await validateSafeUrl(embeddedVideoUrl);
          if (safeEmbed.safe) {
            url720 = embeddedVideoUrl;
          }
        }

        const primaryVideo = url1080 || url720 || url480 || url360;
        if (!primaryVideo) {
          throw new Error('FBDownloader parsed no valid stream links');
        }

        if (url1080) {
          qualities.push({
            id: '1080p',
            label: '1080p Full HD',
            resolution: '1080p',
            format: 'mp4',
            url: url1080,
            audioUrl: audio1080,
            isNative: true,
            height: 1080,
            hasAudio: true,
          });
        }

        if (url720 && url720 !== url1080) {
          qualities.push({
            id: '720p',
            label: '720p HD Stream',
            resolution: '720p',
            format: 'mp4',
            url: url720,
            isNative: true,
            height: 720,
            hasAudio: true,
          });
        }

        if (url480 && url480 !== url720 && url480 !== url1080) {
          qualities.push({
            id: '480p',
            label: '480p SD Stream',
            resolution: '480p',
            format: 'mp4',
            url: url480,
            isNative: true,
            height: 480,
            hasAudio: true,
          });
        }

        if (url360 && url360 !== url480 && url360 !== url720 && url360 !== url1080) {
          qualities.push({
            id: '360p',
            label: '360p SD Stream',
            resolution: '360p',
            format: 'mp4',
            url: url360,
            isNative: true,
            height: 360,
            hasAudio: true,
          });
        }

        const bestAudioSource = validAudioUrl || audio1080 || primaryVideo;
        const progressiveBackup = url720 || url480 || url360;
        qualities.push({
          id: 'audio',
          label: 'MP3 Audio (320 kbps)',
          resolution: 'audio',
          format: 'mp3',
          bitrateKbps: 320,
          codec: 'MP3 320k',
          url: bestAudioSource,
          audioUrl: progressiveBackup && progressiveBackup !== bestAudioSource ? progressiveBackup : undefined,
          isNative: true,
          hasAudio: true,
        });

        const headingMatch = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
        const extractedTitle = headingMatch?.[1] ? stripHtmlTags(headingMatch[1]) : '';
        const title =
          extractedTitle && !extractedTitle.toLowerCase().includes('undefined')
            ? extractedTitle
            : shortlinkFallback.ogTitle || (fbVideoId ? `Facebook Video ${fbVideoId}` : 'Facebook Video Stream');

        const durMatch = html.match(/<p[^>]*>\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*<\/p>/i);
        const durationSeconds = durMatch?.[1] ? parseDurationToSeconds(durMatch[1]) : 0;

        const thumbMatch =
          html.match(/class="image-fb[^"]*"[\s\S]*?<img[^>]*src="(https:\/\/[^"]+)"/i) ||
          html.match(/<video[^>]*poster="(https:\/\/[^"]+)"/i);
        const thumbnailUrl = sanitizeHttpUrl(
          thumbMatch?.[1]?.replace(/&amp;/g, '&') || shortlinkFallback.ogImage || ''
        );

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
            durationSeconds: durationSeconds || undefined,
            durationFormatted: durationSeconds > 0 ? formatDuration(durationSeconds) : undefined,
            qualities,
            extractedAt: new Date().toISOString(),
            sourceType: targetUrl.includes('/reel/') || url.includes('/share/r/') ? 'reel' : 'video',
          },
        };
      };

      const trySnapSave = async (): Promise<AdapterResult> => {
        for (let attempt = 0; attempt < snapTargetCandidates.length && attempt < 2; attempt++) {
          const snapResData = await runWithSnapSaveLock(async () => {
            const sessionCookie = await getSnapSaveSessionCookie(attempt > 0);
            const snapForm = new URLSearchParams();
            snapForm.append('url', snapTargetCandidates[attempt] || queryUrl);
            const snapRes = await fetch('https://snapsave.app/action.php?lang=en', {
              method: 'POST',
              body: snapForm.toString(),
              signal: AbortSignal.timeout(4800),
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
            const decodedHtml = unpackPackedJs(snapResData);
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
                let url1080: string | undefined;
                let url720: string | undefined;
                let url480: string | undefined;
                let url360: string | undefined;

                for (const match of rowMatches) {
                  const qualityLabel = match.length >= 3 ? match[1]?.trim() || 'HD' : 'HD';
                  const downloadUrl = (match.length >= 3 ? match[2] : match[1])?.replace(/&amp;/g, '&').trim();

                  if (!downloadUrl || seenUrls.has(`${qualityLabel}:${downloadUrl}`)) continue;
                  const safeCheckDl = await validateSafeUrl(downloadUrl);
                  if (!safeCheckDl.safe) continue;
                  seenUrls.add(`${qualityLabel}:${downloadUrl}`);

                  const qLower = qualityLabel.toLowerCase();
                  if (qLower.includes('1080') || qLower.includes('full hd')) {
                    url1080 = url1080 || downloadUrl;
                  } else if (qLower.includes('720') || qLower.includes('hd')) {
                    url720 = url720 || downloadUrl;
                  } else if (qLower.includes('480')) {
                    url480 = url480 || downloadUrl;
                  } else {
                    url360 = url360 || downloadUrl;
                  }
                }

                const primaryVideo = url1080 || url720 || url480 || url360;
                if (primaryVideo) {
                  if (url1080) {
                    qualities.push({
                      id: '1080p',
                      label: '1080p Full HD',
                      resolution: '1080p',
                      format: 'mp4',
                      url: url1080,
                      isNative: true,
                      height: 1080,
                      hasAudio: true,
                    });
                  }

                  if (url720 && url720 !== url1080) {
                    qualities.push({
                      id: '720p',
                      label: '720p HD Stream',
                      resolution: '720p',
                      format: 'mp4',
                      url: url720,
                      isNative: true,
                      height: 720,
                      hasAudio: true,
                    });
                  }

                  if (url480 && url480 !== url720 && url480 !== url1080) {
                    qualities.push({
                      id: '480p',
                      label: '480p SD Stream',
                      resolution: '480p',
                      format: 'mp4',
                      url: url480,
                      isNative: true,
                      height: 480,
                      hasAudio: true,
                    });
                  }

                  if (url360 && url360 !== url480 && url360 !== url720 && url360 !== url1080) {
                    qualities.push({
                      id: '360p',
                      label: '360p SD Stream',
                      resolution: '360p',
                      format: 'mp4',
                      url: url360,
                      isNative: true,
                      height: 360,
                      hasAudio: true,
                    });
                  }

                  qualities.push({
                    id: 'audio',
                    label: 'MP3 Audio (320 kbps)',
                    resolution: 'audio',
                    format: 'mp3',
                    bitrateKbps: 320,
                    codec: 'MP3 320k',
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
                      : shortlinkFallback.ogTitle || 'Facebook Video';
                  if (title === '...' || title === 'Video Facebook' || !title) {
                    title = shortlinkFallback.ogTitle || 'Facebook Video Stream';
                  }

                  const thumbMatch = unescapedHtml.match(/<img[^>]*src="([^"]+)"/i);
                  const thumbnailUrl = sanitizeHttpUrl(
                    thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : shortlinkFallback.ogImage || ''
                  );

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
                      sourceType: targetUrl.includes('/reel/') || url.includes('/share/r/') ? 'reel' : 'video',
                    },
                  };
                }
              }
            }
          }
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 120));
          }
        }
        throw new Error('SnapSave failed');
      };

      const tryYtDlp = async (): Promise<AdapterResult> => {
        for (const candidate of snapTargetCandidates.slice(0, 2)) {
          const ytdlpResult = await extractWithYtDlp(candidate, 'facebook', activeCookies);
          if (ytdlpResult.success && ytdlpResult.data) {
            return ytdlpResult;
          }
        }
        throw new Error('yt-dlp Facebook unavailable');
      };

      // Method A+B+C Race: Launch FBDownloader, yt-dlp, and SnapSave concurrently; fastest valid wins!
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

      // Method C: Parallel Facebook Desktop + Mobile + Crawler + Plugin Embed Scrape
      let dynamicCookies = activeCookies;
      const htmlCandidates: Array<{ candidateUrl: string; ua: string }> = [
        {
          candidateUrl: targetUrl,
          ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        },
        {
          candidateUrl: targetUrl,
          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        ...(fbVideoId
          ? [
              {
                candidateUrl: `https://m.facebook.com/watch/?v=${fbVideoId}`,
                ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
              },
            ]
          : []),
        {
          candidateUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(targetUrl)}&show_text=0`,
          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      ];

      const scrapeHtmlCandidate = async (candidateUrl: string, ua: string): Promise<AdapterResult> => {
        const { response } = await safeFetch(candidateUrl, {
          signal: AbortSignal.timeout(5500),
          headers: {
            'User-Agent': ua,
            'Accept-Language': 'en-US,en;q=0.9',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            ...(dynamicCookies ? { Cookie: dynamicCookies } : {}),
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
          await response.body?.cancel().catch(() => {});
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        let url1080: string | null = null;
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

        if (hdMatch?.[1]) {
          const decoded = decodeEscapedFbUrl(hdMatch[1]);
          const safe = await validateSafeUrl(decoded);
          if (safe.safe) hdUrl = decoded;
        }

        if (sdMatch?.[1]) {
          const decoded = decodeEscapedFbUrl(sdMatch[1]);
          const safe = await validateSafeUrl(decoded);
          if (safe.safe) sdUrl = decoded;
        }

        // Progressive array scan (modern Meta GraphQL payload)
        if (!url1080 && !hdUrl) {
          const progMatches = [
            ...html.matchAll(/"progressive_url":"([^"]+)"[^}]*"metadata":\{"quality":"(HD|SD)"/gi),
          ];
          for (const pm of progMatches) {
            const decoded = decodeEscapedFbUrl(pm[1]);
            const safe = await validateSafeUrl(decoded);
            if (!safe.safe) continue;
            if (pm[2].toUpperCase() === 'HD') {
              hdUrl = hdUrl || decoded;
            } else {
              sdUrl = sdUrl || decoded;
            }
          }
        }

        // DASH audio/video representations (supports separated 1080p)
        const dashAudioMatch =
          html.match(/"mime_type":"audio\\\/mp4"[^}]*"base_url":"([^"]+)"/) ||
          html.match(/mimeType="audio\/mp4"[\s\S]{0,200}?<BaseURL>([^<]+)<\/BaseURL>/i);
        if (dashAudioMatch?.[1]) {
          const decoded = decodeEscapedFbUrl(dashAudioMatch[1]);
          const safe = await validateSafeUrl(decoded);
          if (safe.safe) dashAudioUrl = decoded;
        }

        const dashVideoMatches = [
          ...html.matchAll(/"mime_type":"video\\\/mp4"[^}]*"height":(\d+)[^}]*"base_url":"([^"]+)"/g),
        ];
        if (dashVideoMatches.length > 0 && dashAudioUrl) {
          for (const m of dashVideoMatches) {
            const h = Number(m[1]);
            const decoded = decodeEscapedFbUrl(m[2]);
            const safe = await validateSafeUrl(decoded);
            if (!safe.safe) continue;
            if (h >= 1080 && !url1080) url1080 = decoded;
            else if (h >= 720 && !hdUrl) hdUrl = decoded;
            else if (h >= 360 && !sdUrl) sdUrl = decoded;
          }
        }

        if (!url1080 && !hdUrl && !sdUrl) {
          const ogVideoMatch =
            html.match(/<meta property="og:video" content="([^"]+)"/i) ||
            html.match(/<meta property="og:video:url" content="([^"]+)"/i) ||
            html.match(/<meta property="og:video:secure_url" content="([^"]+)"/i) ||
            html.match(/<meta name="twitter:player:stream" content="([^"]+)"/i);
          if (ogVideoMatch?.[1]) {
            const decoded = decodeEscapedFbUrl(ogVideoMatch[1]);
            const safe = await validateSafeUrl(decoded);
            if (safe.safe) sdUrl = decoded;
          }
        }

        if (!url1080 && !hdUrl && !sdUrl) {
          const jsonMatches = html.matchAll(/"(https:\/\/[^"]*fbcdn\.net[^"]*)"/g);
          for (const match of jsonMatches) {
            const cleanCandidate = decodeEscapedFbUrl(match[1]);
            if (cleanCandidate.includes('.mp4') || cleanCandidate.includes('bytestart')) {
              const safe = await validateSafeUrl(cleanCandidate);
              if (!safe.safe) continue;
              if (cleanCandidate.includes('_hd') || cleanCandidate.includes('hd_')) {
                hdUrl = hdUrl || cleanCandidate;
              } else {
                sdUrl = sdUrl || cleanCandidate;
              }
            }
          }
        }

        if (!url1080 && !hdUrl && !sdUrl && shortlinkFallback.ogVideoUrl) {
          hdUrl = shortlinkFallback.ogVideoUrl;
        }

        if (!url1080 && !hdUrl && !sdUrl) {
          throw new Error('No video stream found in HTML');
        }

        let title = shortlinkFallback.ogTitle || 'Facebook Video';
        const titleMatch =
          html.match(/<meta property="og:title" content="([^"]+)"/i) ||
          html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch?.[1] && !titleMatch[1].toLowerCase().includes('log in')) {
          title = decodeEscapedFbUrl(titleMatch[1]);
        }

        let thumbnailUrl = shortlinkFallback.ogImage || '';
        const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (imgMatch?.[1]) {
          thumbnailUrl = decodeEscapedFbUrl(imgMatch[1]);
        }

        const qualities: QualityOption[] = [];
        const primaryVideo = url1080 || hdUrl || sdUrl!;

        if (url1080 && dashAudioUrl) {
          qualities.push({
            id: '1080p',
            label: '1080p Full HD',
            resolution: '1080p',
            format: 'mp4',
            url: url1080,
            audioUrl: dashAudioUrl,
            isNative: true,
            height: 1080,
            hasAudio: true,
          });
        }

        if (hdUrl) {
          qualities.push({
            id: '720p',
            label: '720p HD Stream',
            resolution: '720p',
            format: 'mp4',
            url: hdUrl,
            isNative: true,
            height: 720,
            hasAudio: true,
          });
        }

        if (sdUrl && sdUrl !== hdUrl) {
          qualities.push({
            id: '480p',
            label: '480p SD Stream',
            resolution: '480p',
            format: 'mp4',
            url: sdUrl,
            isNative: true,
            height: 480,
            hasAudio: true,
          });
        }

        const bestAudioSource = dashAudioUrl || hdUrl || sdUrl || url1080;
        const progressiveBackup = hdUrl || sdUrl;
        if (bestAudioSource) {
          qualities.push({
            id: 'audio',
            label: 'MP3 Audio (320 kbps)',
            resolution: 'audio',
            format: 'mp3',
            bitrateKbps: 320,
            codec: 'MP3 320k',
            url: bestAudioSource,
            audioUrl: progressiveBackup && progressiveBackup !== bestAudioSource ? progressiveBackup : undefined,
            isNative: true,
            hasAudio: true,
          });
        }

        const metadata: MediaMetadata = {
          id: fbVideoId ? `fb_${fbVideoId}` : `fb_${Date.now()}`,
          originalUrl: url,
          platform: 'facebook',
          title,
          description: 'Facebook Public Video',
          author: {
            name: 'Facebook Creator',
            username: 'facebook_user',
            profileUrl: 'https://facebook.com',
          },
          thumbnailUrl: sanitizeHttpUrl(thumbnailUrl),
          qualities,
          extractedAt: new Date().toISOString(),
          sourceType: targetUrl.includes('/reel/') || url.includes('/share/r/') ? 'reel' : 'video',
        };

        return { success: true, data: metadata };
      };

      try {
        const htmlWinner = await Promise.any(
          htmlCandidates.map((c) => scrapeHtmlCandidate(c.candidateUrl, c.ua))
        );
        if (htmlWinner.success && htmlWinner.data) {
          return htmlWinner;
        }
      } catch {
        // Fall through cleanly to mbasic fallback
      }

      // Direct OG video emergency fallback (if resolved during shortlink lookup)
      if (shortlinkFallback.ogVideoUrl) {
        return {
          success: true,
          data: {
            id: fbVideoId ? `fb_${fbVideoId}` : `fb_${Date.now()}`,
            originalUrl: url,
            platform: 'facebook',
            title: shortlinkFallback.ogTitle || 'Facebook Video',
            description: 'Facebook Video Stream',
            author: {
              name: 'Facebook Creator',
              username: 'facebook_user',
              profileUrl: 'https://facebook.com',
            },
            thumbnailUrl: sanitizeHttpUrl(shortlinkFallback.ogImage),
            qualities: [
              {
                id: '720p',
                label: '720p HD Stream',
                resolution: '720p',
                format: 'mp4',
                url: shortlinkFallback.ogVideoUrl,
                isNative: true,
                height: 720,
                hasAudio: true,
              },
              {
                id: 'audio',
                label: 'MP3 Audio (320 kbps)',
                resolution: 'audio',
                format: 'mp3',
                bitrateKbps: 320,
                codec: 'MP3 320k',
                url: shortlinkFallback.ogVideoUrl,
                isNative: true,
                hasAudio: true,
              },
            ],
            extractedAt: new Date().toISOString(),
            sourceType: targetUrl.includes('/reel/') || url.includes('/share/r/') ? 'reel' : 'video',
          },
        };
      }

      // Method D: Fallback to mbasic Facebook endpoint
      try {
        const mobileUrl = targetUrl
          .replace('www.facebook.com', 'mbasic.facebook.com')
          .replace('web.facebook.com', 'mbasic.facebook.com')
          .replace('m.facebook.com', 'mbasic.facebook.com')
          .replace('touch.facebook.com', 'mbasic.facebook.com');

        const { response: mResponse } = await safeFetch(mobileUrl, {
          signal: AbortSignal.timeout(4500),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...(dynamicCookies ? { Cookie: dynamicCookies } : {}),
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
            const safeMobileVid = await validateSafeUrl(mVideoUrl);
            if (safeMobileVid.safe) {
              return {
                success: true,
                data: {
                  id: fbVideoId ? `fb_${fbVideoId}` : `fb_${Date.now()}`,
                  originalUrl: url,
                  platform: 'facebook',
                  title: shortlinkFallback.ogTitle || 'Facebook Video',
                  description: 'Facebook Mobile Stream',
                  author: {
                    name: 'Facebook Creator',
                    username: 'facebook_user',
                    profileUrl: 'https://facebook.com',
                  },
                  thumbnailUrl: sanitizeHttpUrl(shortlinkFallback.ogImage),
                  qualities: [
                    {
                      id: '480p',
                      label: '480p SD Stream',
                      resolution: '480p',
                      format: 'mp4',
                      url: mVideoUrl,
                      isNative: true,
                      height: 480,
                      hasAudio: true,
                    },
                    {
                      id: 'audio',
                      label: 'MP3 Audio (320 kbps)',
                      resolution: 'audio',
                      format: 'mp3',
                      bitrateKbps: 320,
                      codec: 'MP3 320k',
                      url: mVideoUrl,
                      isNative: true,
                      hasAudio: true,
                    },
                  ],
                  extractedAt: new Date().toISOString(),
                  sourceType: targetUrl.includes('/reel/') || url.includes('/share/r/') ? 'reel' : 'video',
                },
              };
            }
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
