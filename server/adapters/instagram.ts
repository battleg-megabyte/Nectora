import { PlatformAdapter } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import {
  validateSafeUrl,
  safeFetch,
  sanitizeHttpUrl,
  getPlatformSecurityCookies,
  unpackPackedJs,
} from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';
import { normalizeResolutionFromDimensions } from './probe.js';

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

interface IgCandidate {
  videoUrl: string;
  extraVersions?: Array<{ url: string; width?: number; height?: number }>;
  thumbnailUrl?: string;
  title?: string;
  author?: { name: string; username: string; avatarUrl?: string; profileUrl?: string };
}

let cachedSnapSaveCookie = { value: '', expiresAt: 0 };

async function getSnapSaveCookie(): Promise<string> {
  if (cachedSnapSaveCookie.value && cachedSnapSaveCookie.expiresAt > Date.now()) {
    return cachedSnapSaveCookie.value;
  }
  try {
    const ssLanding = await fetch('https://snapsave.app/instagram-reels-download', {
      signal: AbortSignal.timeout(4000),
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
    if (sessionCookie) {
      cachedSnapSaveCookie = { value: sessionCookie, expiresAt: Date.now() + 5 * 60_000 };
    }
    return sessionCookie;
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

  private async tryEeInstagram(shortcode: string, isReel: boolean): Promise<IgCandidate> {
    const eePath = isReel ? `/reel/${shortcode}/` : `/p/${shortcode}/`;
    const eeRes = await fetch(`https://www.eeinstagram.com${eePath}`, {
      signal: AbortSignal.timeout(4800),
      headers: {
        'User-Agent': 'Discordbot/2.0 (+https://discordapp.com)',
        Accept: 'text/html',
      },
    });
    if (!eeRes.ok) throw new Error(`EEInstagram HTTP ${eeRes.status}`);
    const eeHtml = await eeRes.text();
    if (eeHtml.includes('Post not found')) throw new Error('EEInstagram post not found');

    const streamMatch =
      eeHtml.match(/<meta\s+name="twitter:player:stream"\s+content="([^"]+)"/i) ||
      eeHtml.match(/<meta\s+property="og:video:secure_url"\s+content="([^"]+)"/i) ||
      eeHtml.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);

    if (!streamMatch?.[1]) throw new Error('EEInstagram missing video tag');

    let candidate = sanitizeHttpUrl(
      streamMatch[1].replace(/&amp;/g, '&').startsWith('/')
        ? `https://www.eeinstagram.com${streamMatch[1].replace(/&amp;/g, '&')}`
        : streamMatch[1].replace(/&amp;/g, '&')
    );
    if (!candidate) throw new Error('Unsafe EEInstagram candidate URL');

    try {
      const { response: redir, finalUrl } = await safeFetch(candidate, {
        method: 'GET',
        signal: AbortSignal.timeout(3500),
        headers: { 'User-Agent': 'Discordbot/2.0 (+https://discordapp.com)' },
      });
      await redir.body?.cancel().catch(() => {});
      if (finalUrl && finalUrl.startsWith('http')) {
        candidate = finalUrl;
      }
    } catch {}

    const safeCandidate = await validateSafeUrl(candidate);
    if (!safeCandidate.safe) throw new Error('Unsafe redirect URL');

    const out: IgCandidate = { videoUrl: candidate };
    const authorMatch = eeHtml.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);
    if (authorMatch?.[1] && !authorMatch[1].toLowerCase().includes('fix instagram')) {
      const rawHandle = authorMatch[1].replace(/^@/, '').trim();
      if (rawHandle) {
        out.author = {
          name: `@${rawHandle}`,
          username: rawHandle,
          profileUrl: `https://www.instagram.com/${rawHandle}/`,
        };
      }
    }
    const descMatch = eeHtml.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    if (descMatch?.[1] && !descMatch[1].toLowerCase().includes('post not found')) {
      out.title = decodeHtmlEntities(descMatch[1]).slice(0, 120);
    }
    const imgMatch =
      eeHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
      eeHtml.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
    if (imgMatch?.[1]) {
      let thumb = imgMatch[1].replace(/&amp;/g, '&');
      if (thumb.startsWith('/')) thumb = `https://www.eeinstagram.com${thumb}`;
      out.thumbnailUrl = sanitizeHttpUrl(thumb);
    }
    return out;
  }

  private async tryEmbed(shortcode: string, isReel: boolean, activeCookies: string): Promise<IgCandidate> {
    const embedUrl = isReel
      ? `https://www.instagram.com/reel/${shortcode}/embed/captioned/`
      : `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

    const response = await fetch(embedUrl, {
      signal: AbortSignal.timeout(4800),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Mode': 'navigate',
        Cookie: activeCookies,
      },
    });
    if (!response.ok) throw new Error(`Embed HTTP ${response.status}`);
    const html = await response.text();

    const videoMatch =
      html.match(/"video_url":"([^"]+)"/) ||
      html.match(/"content_url":"([^"]+\.mp4[^"]*)"/) ||
      html.match(/class="EmbeddedVideo"[^>]*src="([^"]+)"/) ||
      html.match(/<video[^>]+src="([^">]+)"/) ||
      html.match(/src="([^"]+\.mp4[^"]*)"/);

    if (!videoMatch?.[1]) throw new Error('Embed returned no video');
    const cleanUrl = sanitizeHttpUrl(
      videoMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\/g, '')
    );
    if (!cleanUrl) throw new Error('Unsafe embed stream URL');
    const safeCand = await validateSafeUrl(cleanUrl);
    if (!safeCand.safe) throw new Error('Unsafe embed stream URL');

    const out: IgCandidate = { videoUrl: cleanUrl };
    const imgMatch =
      html.match(/"display_url":"([^"]+)"/) ||
      html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/) ||
      html.match(/<img[^>]+class="[^"]*Embedded[^"]*"[^>]+src="([^">]+)"/);
    if (imgMatch?.[1]) {
      out.thumbnailUrl = sanitizeHttpUrl(
        imgMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\/g, '')
      );
    }
    const authorMatch =
      html.match(/class="UsernameText">([^<]+)<\/span>/) ||
      html.match(/"username":"([^"]+)"/) ||
      html.match(/class="Username"[^>]*>([^<]+)<\/a>/);
    if (authorMatch?.[1]) {
      const uName = authorMatch[1].trim();
      out.author = {
        name: uName,
        username: uName.toLowerCase().replace(/[^a-z0-9_.]/g, '_'),
        profileUrl: `https://instagram.com/${uName}`,
      };
    }
    const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);
    if (captionMatch?.[1]) {
      const rawCaption = decodeHtmlEntities(captionMatch[1].replace(/<[^>]+>/g, ''));
      if (rawCaption) out.title = rawCaption.slice(0, 120);
    }
    return out;
  }

  private async tryGraphQl(shortcode: string, activeCookies: string): Promise<IgCandidate> {
    const jsonRes = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
      signal: AbortSignal.timeout(4800),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'X-IG-App-ID': '936619743392459',
        Cookie: activeCookies,
      },
    });
    if (!jsonRes.ok) throw new Error(`GraphQL HTTP ${jsonRes.status}`);
    const jsonText = await jsonRes.text();
    if (!jsonText.startsWith('{')) throw new Error('Non-JSON GraphQL response');

    const jsonData: any = JSON.parse(jsonText);
    const rootItem = jsonData?.items?.[0] || jsonData?.graphql?.shortcode_media;
    const carouselVideo = Array.isArray(rootItem?.carousel_media)
      ? rootItem.carousel_media.find((c: any) => Array.isArray(c?.video_versions) && c.video_versions.length > 0)
      : undefined;
    const mediaNode = Array.isArray(rootItem?.video_versions) || rootItem?.video_url ? rootItem : carouselVideo || rootItem;
    const versions: any[] = Array.isArray(mediaNode?.video_versions) ? mediaNode.video_versions : [];
    const sorted = [...versions].filter((v) => v?.url).sort((a, b) => (b.width || 0) - (a.width || 0));
    const videoUrl = sanitizeHttpUrl(sorted[0]?.url || mediaNode?.video_url || '');
    if (!videoUrl) throw new Error('GraphQL missing video');

    const safeCand = await validateSafeUrl(videoUrl);
    if (!safeCand.safe) throw new Error('Unsafe GraphQL video URL');

    return {
      videoUrl,
      extraVersions: sorted
        .map((v) => ({ url: sanitizeHttpUrl(v.url), width: v.width, height: v.height }))
        .filter((v) => Boolean(v.url)),
      title: rootItem?.caption?.text ? String(rootItem.caption.text).slice(0, 120) : undefined,
      thumbnailUrl: sanitizeHttpUrl(
        mediaNode?.image_versions2?.candidates?.[0]?.url || rootItem?.image_versions2?.candidates?.[0]?.url
      ),
      author: rootItem?.user?.username
        ? {
            name: rootItem.user.full_name || rootItem.user.username,
            username: rootItem.user.username,
            avatarUrl: sanitizeHttpUrl(rootItem.user.profile_pic_url),
            profileUrl: `https://instagram.com/${rootItem.user.username}`,
          }
        : undefined,
    };
  }

  private async trySnapSave(canonicalUrl: string): Promise<IgCandidate> {
    const sessionCookie = await getSnapSaveCookie();
    const snapBody = new URLSearchParams();
    snapBody.append('url', canonicalUrl);

    const snapRes = await fetch('https://snapsave.app/action.php?lang=en', {
      method: 'POST',
      signal: AbortSignal.timeout(9000),
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
    if (!snapRes.ok) throw new Error(`SnapSave HTTP ${snapRes.status}`);

    const rawScript = await snapRes.text();
    const decodedHtml = unpackPackedJs(rawScript).replace(/\\"/g, '"');
    if (!decodedHtml || decodedHtml.includes('error_api_get_instagram')) {
      throw new Error('SnapSave error');
    }

    const videoButtonMatch =
      decodedHtml.match(/icon-dlvideo[\s\S]*?<div[^>]*class="download-items__btn"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i) ||
      decodedHtml.match(/<div[^>]*class="download-items__btn"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Download\s*video/i) ||
      decodedHtml.match(/href="(https:\/\/d\.rapidcdn\.app\/v2\?[^"]+)"/i);

    if (!videoButtonMatch?.[1]) throw new Error('SnapSave missing video link');
    const candidate = sanitizeHttpUrl(videoButtonMatch[1].replace(/&amp;/g, '&').trim());
    if (!candidate) throw new Error('Unsafe SnapSave video link');
    const safeCand = await validateSafeUrl(candidate);
    if (!safeCand.safe) throw new Error('Unsafe SnapSave video link');

    const thumbMatch =
      decodedHtml.match(/<div[^>]*class="download-items__thumb"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
      decodedHtml.match(/<img[^>]*src="(https:\/\/d\.rapidcdn\.app\/thumb\?[^"]+)"/i);

    return {
      videoUrl: candidate,
      thumbnailUrl: thumbMatch?.[1] ? sanitizeHttpUrl(thumbMatch[1].replace(/&amp;/g, '&').trim()) : undefined,
    };
  }

  async extract(url: string, cookies?: string): Promise<AdapterResult> {
    try {
      const safeCheck = await validateSafeUrl(url);
      if (!safeCheck.safe) {
        return { success: false, error: safeCheck.error || 'Invalid URL' };
      }

      const activeCookies = getPlatformSecurityCookies('instagram', cookies);

      let targetUrl = url.trim();
      if (
        targetUrl.includes('instagr.am') ||
        targetUrl.includes('/share/') ||
        targetUrl.includes('ddinstagram.com') ||
        targetUrl.includes('eeinstagram.com')
      ) {
        try {
          const { response: res, finalUrl } = await safeFetch(targetUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
              Cookie: activeCookies,
            },
          });
          await res.body?.cancel().catch(() => {});
          if (finalUrl && finalUrl !== targetUrl) {
            targetUrl = finalUrl;
          }
        } catch {}
      }

      const shortcodeMatch = targetUrl.match(
        /\/(?:share\/(?:reel|p)|(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)|stories\/[^/]+)\/([A-Za-z0-9_-]+)/i
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

      let resolved: IgCandidate | null = null;

      if (shortcode && !isStory) {
        try {
          resolved = await Promise.any([
            this.tryEeInstagram(shortcode, isReel),
            this.tryEmbed(shortcode, isReel, activeCookies),
            this.tryGraphQl(shortcode, activeCookies),
            new Promise<IgCandidate>((res, rej) => {
              const t = setTimeout(() => {
                this.trySnapSave(canonicalUrl).then(res, rej);
              }, 750);
              t.unref?.();
            }),
          ]);
        } catch {
          // Fall through cleanly to yt-dlp
        }
      } else {
        try {
          resolved = await this.trySnapSave(canonicalUrl);
        } catch {
          // Fall through cleanly to yt-dlp
        }
      }

      if (!resolved) {
        try {
          const ytRes = await extractWithYtDlp(canonicalUrl, 'instagram', activeCookies);
          if (ytRes.success && ytRes.data) return ytRes;
        } catch {
          // Fall through to clean 403 error
        }
      }

      if (resolved) {
        if (!resolved.title && canonicalUrl) {
          try {
            const oembedRes = await fetch(
              `https://api.instagram.com/oembed/?url=${encodeURIComponent(canonicalUrl)}`,
              { signal: AbortSignal.timeout(2500), headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            if (oembedRes.ok) {
              const oembedData: any = await oembedRes.json();
              if (oembedData.title) resolved.title = String(oembedData.title);
              if (oembedData.author_name && !resolved.author) {
                resolved.author = {
                  name: String(oembedData.author_name),
                  username: String(oembedData.author_name).toLowerCase().replace(/\s+/g, '_'),
                  profileUrl: sanitizeHttpUrl(oembedData.author_url),
                };
              }
              if (oembedData.thumbnail_url && !resolved.thumbnailUrl) {
                resolved.thumbnailUrl = sanitizeHttpUrl(oembedData.thumbnail_url);
              }
            }
          } catch {}
        }

        return this.toAdapterSuccess(url, shortcode, isReel, resolved);
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

  private toAdapterSuccess(
    originalUrl: string,
    shortcode: string,
    isReel: boolean,
    resolved: IgCandidate
  ): AdapterResult {
    const rawAuthor = resolved.author || {
      name: 'Instagram Creator',
      username: 'instagram_user',
    };
    const author = {
      ...rawAuthor,
      avatarUrl: sanitizeHttpUrl(rawAuthor.avatarUrl) || undefined,
      profileUrl: sanitizeHttpUrl(rawAuthor.profileUrl) || undefined,
    };
    const title =
      resolved.title ||
      (shortcode ? (isReel ? `Instagram Reel (${shortcode})` : `Instagram Video (${shortcode})`) : 'Instagram Video');
    const thumbnailUrl = sanitizeHttpUrl(
      resolved.thumbnailUrl || (shortcode ? `https://www.instagram.com/p/${shortcode}/media/?size=l` : '')
    );

    const qualities: QualityOption[] = [];
    const seenUrls = new Set<string>();

    if (resolved.extraVersions && resolved.extraVersions.length > 0) {
      resolved.extraVersions.forEach((v, idx) => {
        const cleanV = sanitizeHttpUrl(v.url);
        if (!cleanV || seenUrls.has(cleanV)) return;
        seenUrls.add(cleanV);
        const res = normalizeResolutionFromDimensions(v.width, v.height) || 'original';
        qualities.push({
          id: `${res}_${idx}`,
          label: v.width && v.height ? `${res} (${v.width}×${v.height})` : `Original MP4 (${res})`,
          resolution: res,
          format: 'mp4',
          url: cleanV,
          width: v.width,
          height: v.height,
          isNative: idx === 0,
          hasAudio: true,
        });
      });
    }

    if (qualities.length === 0) {
      qualities.push({
        id: 'original_mp4',
        label: 'Original MP4 Stream',
        resolution: 'original',
        format: 'mp4',
        url: resolved.videoUrl,
        isNative: true,
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
      url: qualities[0].url,
      isNative: true,
      hasAudio: true,
    });

    const metadata: MediaMetadata = {
      id: shortcode || `ig_${Date.now()}`,
      originalUrl,
      platform: 'instagram',
      title,
      description: `Instagram content by ${author.name}`,
      author,
      thumbnailUrl,
      qualities,
      extractedAt: new Date().toISOString(),
      sourceType: isReel ? 'reel' : 'video',
    };

    return { success: true, data: metadata };
  }
}
