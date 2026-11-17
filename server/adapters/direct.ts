import { PlatformAdapter, formatBytes } from './base.js';
import { AdapterResult, MediaMetadata, QualityOption } from '../types.js';
import { validateSafeUrl } from '../security.js';
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
        '.wav',
        '.flac',
        '.aac',
      ];
      if (directExtensions.some((ext) => pathname.endsWith(ext))) {
        return true;
      }
      if (
        parsed.search.includes('.mp4') ||
        parsed.search.includes('.webm') ||
        parsed.search.includes('.m3u8') ||
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
        'Accept': '*/*',
      };
      if (cookies) {
        probeHeaders['Cookie'] = cookies;
      }

      try {
        const headRes = await fetch(url, {
          method: 'HEAD',
          headers: probeHeaders,
          signal: AbortSignal.timeout(8000),
        });

        if (headRes.ok) {
          contentType = (headRes.headers.get('content-type') || '').toLowerCase();
          const len = headRes.headers.get('content-length');
          if (len) contentLength = parseInt(len, 10);
        } else if (headRes.status === 403 || headRes.status === 405) {
          const rangeRes = await fetch(url, {
            method: 'GET',
            headers: {
              ...probeHeaders,
              Range: 'bytes=0-1024',
            },
            signal: AbortSignal.timeout(8000),
          });
          if (rangeRes.ok || rangeRes.status === 206) {
            contentType = (rangeRes.headers.get('content-type') || '').toLowerCase();
            const contentRange = rangeRes.headers.get('content-range');
            if (contentRange) {
              const total = contentRange.split('/')[1];
              if (total && total !== '*') contentLength = parseInt(total, 10);
            }
          }
        }
      } catch (headErr) {
        console.warn('Direct media probe warning:', headErr);
      }

      // If the URL actually serves an HTML webpage, let GenericMediaAdapter extract the embedded video
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        return {
          success: false,
          error: 'Target URL returned an HTML page rather than a direct media file.',
        };
      }

      const parsed = new URL(url);
      const filename = path.basename(parsed.pathname) || 'Direct Video Stream';
      const cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');

      const isHls =
        parsed.pathname.toLowerCase().endsWith('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('m3u8');

      const isAudio =
        !isHls &&
        (contentType.startsWith('audio/') ||
          parsed.pathname.toLowerCase().endsWith('.mp3') ||
          parsed.pathname.toLowerCase().endsWith('.wav') ||
          parsed.pathname.toLowerCase().endsWith('.aac'));

      const qualities: QualityOption[] = [];

      if (!isAudio) {
        qualities.push(
          {
            id: '1080p',
            label: isHls ? '1080p Full HD (HLS to MP4)' : '1080p Full HD (Original Stream)',
            resolution: '1080p',
            format: 'mp4',
            url,
            isNative: true,
            fileSizeBytes: contentLength,
            fileSizeFormatted: formatBytes(contentLength),
            hasAudio: true,
          },
          {
            id: '720p',
            label: '720p HD Stream',
            resolution: '720p',
            format: 'mp4',
            url,
            isNative: false,
            fileSizeBytes: contentLength ? Math.round(contentLength * 0.65) : undefined,
            fileSizeFormatted: contentLength
              ? formatBytes(Math.round(contentLength * 0.65))
              : undefined,
            hasAudio: true,
          },
          {
            id: '480p',
            label: '480p SD Stream',
            resolution: '480p',
            format: 'mp4',
            url,
            isNative: false,
            fileSizeBytes: contentLength ? Math.round(contentLength * 0.35) : undefined,
            fileSizeFormatted: contentLength
              ? formatBytes(Math.round(contentLength * 0.35))
              : undefined,
            hasAudio: true,
          },
          {
            id: 'audio',
            label: 'Audio Stream (MP3)',
            resolution: 'audio',
            format: 'mp3',
            url,
            isNative: true,
            fileSizeBytes: contentLength ? Math.round(contentLength * 0.15) : undefined,
            fileSizeFormatted: contentLength
              ? formatBytes(Math.round(contentLength * 0.15))
              : undefined,
            hasAudio: true,
          }
        );
      } else {
        qualities.push({
          id: 'audio',
          label: 'Direct Audio Stream',
          resolution: 'audio',
          format: 'mp3',
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
        sourceType: 'direct_stream',
      };

      return { success: true, data: metadata };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to analyze direct media URL' };
    }
  }
}
