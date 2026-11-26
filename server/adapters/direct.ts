import { PlatformAdapter, formatBytes } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl, safeFetch } from '../security.js';
import { parseHlsMasterVariants } from './probe.js';
import path from 'path';

export class DirectMediaAdapter implements PlatformAdapter {
  readonly platformName = 'Direct Media';

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();
      const directExtensions = [
        '.mp4',
        '.m4v',
        '.webm',
        '.mov',
        '.m3u8',
        '.ts',
        '.mp3',
        '.ogg',
        '.opus',
        '.wav',
        '.flac',
        '.aac',
        '.m4a',
      ];
      if (directExtensions.some((ext) => pathname.endsWith(ext))) {
        return true;
      }
      if (
        parsed.search.includes('.mp4') ||
        parsed.search.includes('.webm') ||
        parsed.search.includes('.m3u8') ||
        parsed.search.includes('.mp3') ||
        parsed.search.includes('.m4a') ||
        parsed.hostname.includes('storage.googleapis.com') ||
        parsed.hostname.includes('cloudfront.net')
      ) {
        return true;
      }
      return false;
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

      let contentType = '';
      let contentLength: number | undefined;

      const probeHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: '*/*',
      };
      if (cookies) {
        probeHeaders['Cookie'] = cookies;
      }

      try {
        const { response: headRes } = await safeFetch(url, {
          method: 'HEAD',
          headers: probeHeaders,
          signal: AbortSignal.timeout(2500),
        });

        if (headRes.ok) {
          contentType = (headRes.headers.get('content-type') || '').toLowerCase();
          const len = headRes.headers.get('content-length');
          if (len) contentLength = parseInt(len, 10);
          await headRes.body?.cancel().catch(() => {});
        } else if (headRes.status === 403 || headRes.status === 405) {
          await headRes.body?.cancel().catch(() => {});
          const { response: rangeRes } = await safeFetch(url, {
            method: 'GET',
            headers: {
              ...probeHeaders,
              Range: 'bytes=0-1024',
            },
            signal: AbortSignal.timeout(2500),
          });
          if (rangeRes.ok || rangeRes.status === 206) {
            contentType = (rangeRes.headers.get('content-type') || '').toLowerCase();
            const contentRange = rangeRes.headers.get('content-range');
            if (contentRange) {
              const total = contentRange.split('/')[1];
              if (total && total !== '*') contentLength = parseInt(total, 10);
            }
          }
          await rangeRes.body?.cancel().catch(() => {});
        } else {
          await headRes.body?.cancel().catch(() => {});
        }
      } catch {
        // Probe fallback handled cleanly
      }

      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        return {
          success: false,
          error: 'Target URL returned an HTML page rather than a direct media file.',
        };
      }

      const parsed = new URL(url);
      const filename = path.basename(parsed.pathname) || 'Direct Video Stream';
      const cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');
      const lowerPath = parsed.pathname.toLowerCase();

      const isHls =
        lowerPath.endsWith('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('m3u8');

      const isAudio =
        !isHls &&
        (contentType.startsWith('audio/') ||
          lowerPath.endsWith('.mp3') ||
          lowerPath.endsWith('.wav') ||
          lowerPath.endsWith('.aac') ||
          lowerPath.endsWith('.m4a') ||
          lowerPath.endsWith('.ogg') ||
          lowerPath.endsWith('.flac'));

      const qualities: QualityOption[] = [];

      if (isHls) {
        const variants = await parseHlsMasterVariants(url);
        if (variants.length > 0) {
          variants.forEach((v, idx) => {
            qualities.push({
              id: `${v.resolution}_${idx}`,
              label: v.width && v.height ? `${v.resolution} (${v.width}×${v.height}) · HLS` : `${v.resolution} · HLS`,
              resolution: v.resolution,
              format: 'mp4',
              url: v.url,
              width: v.width,
              height: v.height,
              isNative: idx === 0,
              hasAudio: true,
            });
          });
          // Use lowest-bandwidth HLS variant for fastest MP3 audio extraction
          const fastestVariant = variants[variants.length - 1];
          qualities.push({
            id: 'audio',
            label: 'MP3 Audio (320 kbps)',
            resolution: 'audio',
            format: 'mp3',
            bitrateKbps: 320,
            url: fastestVariant.url,
            audioUrl: url,
            isNative: true,
            hasAudio: true,
          });
        } else {
          qualities.push(
            {
              id: 'native_hls',
              label: 'Original HLS Stream (MP4)',
              resolution: 'original',
              format: 'mp4',
              url,
              isNative: true,
              hasAudio: true,
            },
            {
              id: 'audio',
              label: 'MP3 Audio (320 kbps)',
              resolution: 'audio',
              format: 'mp3',
              bitrateKbps: 320,
              url,
              isNative: true,
              hasAudio: true,
            }
          );
        }
      } else if (!isAudio) {
        const format = lowerPath.endsWith('.webm') ? 'webm' : 'mp4';
        qualities.push(
          {
            id: 'native_video',
            label: `Original ${format.toUpperCase()} Stream`,
            resolution: 'original',
            format,
            url,
            isNative: true,
            fileSizeBytes: contentLength,
            fileSizeFormatted: formatBytes(contentLength),
            hasAudio: true,
          },
          {
            id: 'audio',
            label: 'MP3 Audio (320 kbps)',
            resolution: 'audio',
            format: 'mp3',
            bitrateKbps: 320,
            url,
            isNative: true,
            hasAudio: true,
          }
        );
      } else {
        qualities.push({
          id: 'audio',
          label: lowerPath.endsWith('.m4a') ? 'Original M4A Audio' : 'Original MP3 Audio',
          resolution: 'audio',
          format: lowerPath.endsWith('.m4a') ? 'm4a' : 'mp3',
          bitrateKbps: 320,
          url,
          isNative: true,
          fileSizeBytes: contentLength,
          fileSizeFormatted: formatBytes(contentLength),
          hasAudio: true,
        });
      }

      const metadata: MediaMetadata = {
        id: `direct_${Date.now()}`,
        originalUrl: url,
        platform: 'direct',
        title: cleanTitle || 'Direct Public Media Stream',
        description: `Direct media stream from ${parsed.hostname}`,
        author: {
          name: parsed.hostname,
          username: parsed.hostname,
          profileUrl: `${parsed.protocol}//${parsed.hostname}`,
        },
        thumbnailUrl: '',
        qualities,
        extractedAt: new Date().toISOString(),
        sourceType: isAudio ? 'audio' : 'direct_stream',
      };

      return { success: true, data: metadata };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to analyze direct media URL' };
    }
  }
}
