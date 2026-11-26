import { PlatformAdapter, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, sanitizeHttpUrl, getPlatformSecurityCookies } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';
import { normalizeResolutionFromDimensions } from './probe.js';

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

  private inferResFromVariant(v: any): string {
    const dimRes = normalizeResolutionFromDimensions(v?.width, v?.height);
    if (dimRes) return dimRes;
    const urlMatch = String(v?.url || '').match(/\/vid\/(?:avc1\/)?(\d+)x(\d+)\//i);
    if (urlMatch) {
      return (
        normalizeResolutionFromDimensions(parseInt(urlMatch[1], 10), parseInt(urlMatch[2], 10)) ||
        'original'
      );
    }
    const bitrate = Number(v?.bitrate) || 0;
    if (bitrate >= 2000000) return '720p';
    if (bitrate >= 800000) return '480p';
    if (bitrate > 0) return '360p';
    return 'original';
  }

  private async tryFxTwitter(statusId: string, originalUrl: string): Promise<MediaMetadata> {
    const fxRes = await fetch(`https://api.fxtwitter.com/status/${statusId}`, {
      signal: AbortSignal.timeout(4800),
      headers: {
        'User-Agent': 'WuKong-Vid/2.0 (Media Extractor)',
        Accept: 'application/json',
      },
    });
    if (!fxRes.ok) throw new Error(`FxTwitter HTTP ${fxRes.status}`);

    const fxData: any = await fxRes.json();
    const tweet = fxData?.tweet;
    const videos = tweet?.media?.videos || [];
    const firstVideo =
      videos[0] ||
      tweet?.media?.all?.find((m: any) => m.type === 'video' || m.type === 'gif');
    if (!firstVideo) throw new Error('FxTwitter returned no video');

    const variants: any[] = Array.isArray(firstVideo.variants)
      ? firstVideo.variants
          .filter((v: any) => v.content_type === 'video/mp4' && v.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
      : [];

    const bestUrl = sanitizeHttpUrl(variants[0]?.url || firstVideo.url);
    if (!bestUrl) throw new Error('FxTwitter returned no MP4 variant');

    const isGif = firstVideo.type === 'gif';
    const qualities: QualityOption[] = [];
    const seenUrls = new Set<string>();
    const seenRes = new Set<string>();

    if (variants.length > 0) {
      variants.forEach((v, idx) => {
        const cleanV = sanitizeHttpUrl(v.url);
        if (!cleanV || seenUrls.has(cleanV)) return;
        const res = this.inferResFromVariant(v);
        if (seenRes.has(res)) return;
        seenUrls.add(cleanV);
        seenRes.add(res);
        qualities.push({
          id: `${res}_${idx}`,
          label: `${res.toUpperCase()} MP4`,
          resolution: res,
          format: 'mp4',
          url: cleanV,
          width: v.width,
          height: v.height,
          isNative: qualities.length === 0,
          hasAudio: !isGif,
        });
      });
    } else {
      qualities.push({
        id: 'original_mp4',
        label: 'Original MP4',
        resolution: 'original',
        format: 'mp4',
        url: bestUrl,
        isNative: true,
        hasAudio: !isGif,
      });
    }

    if (!isGif) {
      qualities.push({
        id: 'audio',
        label: 'MP3 Audio (320 kbps)',
        resolution: 'audio',
        format: 'mp3',
        bitrateKbps: 320,
        url: bestUrl,
        isNative: true,
        hasAudio: true,
      });
    }

    const durationSec = Math.round(Number(firstVideo.duration) || 0);
    return {
      id: statusId,
      originalUrl,
      platform: 'twitter',
      title: tweet?.text
        ? tweet.text.slice(0, 110)
        : `Post by @${tweet?.author?.screen_name || 'user'}`,
      description: tweet?.text || '',
      author: {
        name: tweet?.author?.name || 'X User',
        username: tweet?.author?.screen_name || 'user',
        profileUrl: `https://x.com/${tweet?.author?.screen_name || ''}`,
        avatarUrl: sanitizeHttpUrl(tweet?.author?.avatar_url) || undefined,
      },
      thumbnailUrl: sanitizeHttpUrl(firstVideo.thumbnail_url),
      durationSeconds: durationSec,
      durationFormatted: formatDuration(durationSec),
      qualities,
      extractedAt: new Date().toISOString(),
      sourceType: isGif ? 'clip' : 'video',
    };
  }

  private async tryVxTwitter(statusId: string, originalUrl: string, cookies: string): Promise<MediaMetadata> {
    const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${statusId}`, {
      signal: AbortSignal.timeout(4800),
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Cookie: cookies,
      },
    });
    if (!vxRes.ok) throw new Error(`VxTwitter HTTP ${vxRes.status}`);

    const vxData: any = await vxRes.json();
    const mediaUrl = sanitizeHttpUrl(
      vxData.media_extended?.[0]?.url || vxData.video_url || vxData.mediaURLs?.[0]
    );
    if (!mediaUrl || (!mediaUrl.includes('.mp4') && !vxData.has_video)) {
      throw new Error('VxTwitter returned no video');
    }

    const isGif = vxData.media_extended?.[0]?.type === 'gif';
    const qualities: QualityOption[] = [
      {
        id: 'original_mp4',
        label: 'Original MP4 Stream',
        resolution: 'original',
        format: 'mp4',
        url: mediaUrl,
        isNative: true,
        hasAudio: !isGif,
      },
    ];
    if (!isGif) {
      qualities.push({
        id: 'audio',
        label: 'MP3 Audio (320 kbps)',
        resolution: 'audio',
        format: 'mp3',
        bitrateKbps: 320,
        url: mediaUrl,
        isNative: true,
        hasAudio: true,
      });
    }

    return {
      id: statusId,
      originalUrl,
      platform: 'twitter',
      title: vxData.text
        ? vxData.text.slice(0, 100)
        : `Post by @${vxData.user_screen_name || 'user'}`,
      description: vxData.text || '',
      author: {
        name: vxData.user_name || 'X User',
        username: vxData.user_screen_name || 'user',
        profileUrl: `https://x.com/${vxData.user_screen_name || ''}`,
        avatarUrl: sanitizeHttpUrl(vxData.user_profile_image_url) || undefined,
      },
      thumbnailUrl: sanitizeHttpUrl(vxData.media_extended?.[0]?.thumbnail_url),
      qualities,
      extractedAt: new Date().toISOString(),
      sourceType: isGif ? 'clip' : 'video',
    };
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

      if (statusId) {
        try {
          const fastMeta = await Promise.any([
            this.tryFxTwitter(statusId, url),
            this.tryVxTwitter(statusId, url, activeCookies),
          ]);
          return { success: true, data: fastMeta };
        } catch {
          // Both fast JSON resolvers failed; fall back to yt-dlp
        }
      }

      try {
        const ytdlpResult = await extractWithYtDlp(url, 'twitter', activeCookies);
        if (ytdlpResult.success && ytdlpResult.data) {
          return ytdlpResult;
        }
      } catch {
        // yt-dlp unavailable
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
