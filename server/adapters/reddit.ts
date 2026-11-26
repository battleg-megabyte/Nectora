import { PlatformAdapter, formatDuration } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, safeFetch, sanitizeHttpUrl } from '../security.js';
import { extractWithYtDlp } from './ytdlp.js';
import { normalizeResolutionFromDimensions } from './probe.js';

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

  private async tryJsonApi(targetUrl: string, originalUrl: string): Promise<AdapterResult> {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.includes('reddit.com')) {
      throw new Error('Not a reddit.com permalink');
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    const jsonUrl = `https://www.reddit.com${cleanPath}.json`;
    const jsonRes = await fetch(jsonUrl, {
      signal: AbortSignal.timeout(5500),
      headers: {
        'User-Agent': 'WuKong-Vid/2.0 (Media Extractor)',
        Accept: 'application/json',
      },
    });
    if (!jsonRes.ok) throw new Error(`Reddit JSON HTTP ${jsonRes.status}`);

    const listings: any = await jsonRes.json();
    const post = listings?.[0]?.data?.children?.[0]?.data;
    const targetPost = post?.crosspost_parent_list?.[0] || post;
    const redditVideo = targetPost?.secure_media?.reddit_video || targetPost?.media?.reddit_video;

    const videoSrc =
      redditVideo?.fallback_url ||
      redditVideo?.hls_url ||
      targetPost?.preview?.reddit_video_preview?.fallback_url;

    if (!videoSrc || typeof videoSrc !== 'string') {
      throw new Error('No Reddit video stream in post JSON');
    }

    const cleanVideoSrc = sanitizeHttpUrl(videoSrc.replace(/&amp;/g, '&'));
    if (!cleanVideoSrc) {
      throw new Error('Unsafe Reddit video URL');
    }
    const baseUrl = cleanVideoSrc.split('/DASH_')[0];
    let audioUrl: string | undefined;

    if (baseUrl && cleanVideoSrc.includes('v.redd.it') && redditVideo?.has_audio !== false) {
      const audioCandidates = [
        `${baseUrl}/DASH_AUDIO_128.mp4`,
        `${baseUrl}/DASH_AUDIO_64.mp4`,
        `${baseUrl}/DASH_audio.mp4`,
        `${baseUrl}/audio`,
      ];
      try {
        audioUrl = await Promise.any(
          audioCandidates.map(async (candidate) => {
            const { response: headRes } = await safeFetch(candidate, {
              method: 'HEAD',
              signal: AbortSignal.timeout(2200),
            });
            await headRes.body?.cancel().catch(() => {});
            if (headRes.ok) return candidate;
            throw new Error('Not found');
          })
        );
      } catch {
        // Optional separate audio track unavailable
      }
    }

    const width = Number(redditVideo?.width) || undefined;
    const height = Number(redditVideo?.height) || 720;
    const resLabel = normalizeResolutionFromDimensions(width, height) || `${height}p`;
    const durationSec = Number(redditVideo?.duration) || 0;
    const thumb = sanitizeHttpUrl(
      targetPost?.thumbnail && targetPost.thumbnail.startsWith('http')
        ? targetPost.thumbnail
        : targetPost?.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') || ''
    );

    const hasRealAudio = Boolean(audioUrl) || !cleanVideoSrc.includes('/DASH_');

    const qualities: QualityOption[] = [
      {
        id: resLabel,
        label: width && height ? `${resLabel} (${width}×${height}) · MP4` : `${resLabel} · MP4`,
        resolution: resLabel,
        format: 'mp4',
        url: cleanVideoSrc,
        audioUrl,
        width,
        height,
        isNative: true,
        hasAudio: hasRealAudio,
      },
    ];

    if (hasRealAudio) {
      qualities.push({
        id: 'audio',
        label: 'MP3 Audio (320 kbps)',
        resolution: 'audio',
        format: 'mp3',
        bitrateKbps: 320,
        url: audioUrl || cleanVideoSrc,
        isNative: true,
        hasAudio: true,
      });
    }

    const metadata: MediaMetadata = {
      id: targetPost?.id || `reddit_${Date.now()}`,
      originalUrl,
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
      sourceType: redditVideo?.is_gif ? 'clip' : 'video',
    };

    return { success: true, data: metadata };
  }

  async extract(url: string, cookies?: string): Promise<AdapterResult> {
    try {
      const safeCheck = await validateSafeUrl(url);
      if (!safeCheck.safe) {
        return { success: false, error: safeCheck.error || 'Invalid URL' };
      }

      let targetUrl = url;
      if (url.includes('v.redd.it') || url.includes('redd.it/') || url.includes('/s/')) {
        try {
          const { response: res, finalUrl } = await safeFetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          });
          await res.body?.cancel().catch(() => {});
          if (finalUrl && finalUrl !== url) {
            targetUrl = finalUrl;
          }
        } catch {
          // Continue with original Reddit URL
        }
      }

      try {
        return await Promise.any([
          this.tryJsonApi(targetUrl, url),
          (async () => {
            const ytRes = await extractWithYtDlp(targetUrl, 'reddit', cookies);
            if (ytRes.success && ytRes.data) return ytRes;
            throw new Error(ytRes.error || 'yt-dlp failed');
          })(),
        ]);
      } catch {
        return {
          success: false,
          error: 'No video stream could be found in this Reddit post or post is private.',
          statusCode: 404,
        };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to extract Reddit video' };
    }
  }
}
