import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { AdapterResult, MediaMetadata, PlatformType, QualityOption } from '../types.js';
import { formatBytes, formatDuration } from './base.js';
import { getPlatformSecurityCookies, sanitizeHttpUrl } from '../security.js';

function getYtDlpPath(): string {
  const localBin = path.join(process.cwd(), 'bin', 'yt-dlp');
  if (fs.existsSync(localBin)) {
    try {
      fs.chmodSync(localBin, 0o755);
    } catch {}
    return localBin;
  }
  if (fs.existsSync('/tmp/yt-dlp')) {
    try {
      fs.chmodSync('/tmp/yt-dlp', 0o755);
    } catch {}
    return '/tmp/yt-dlp';
  }
  return 'yt-dlp';
}

export function extractWithYtDlp(
  url: string,
  platformHint?: PlatformType,
  cookies?: string
): Promise<AdapterResult> {
  return new Promise((resolve) => {
    const ytDlpBin = getYtDlpPath();
    const activeCookies = getPlatformSecurityCookies(platformHint || 'direct', cookies);

    const args = [
      '-j',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--geo-bypass',
      '--socket-timeout',
      '15',
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '--add-header',
      'Accept-Language: en-US,en;q=0.9',
    ];

    if (activeCookies) {
      args.push('--add-header', `Cookie: ${activeCookies}`);
    }

    args.push('--', url);

    execFile(
      ytDlpBin,
      args,
      { timeout: 25000, maxBuffer: 12 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error || !stdout.trim()) {
          const errMsg = stderr || error?.message || 'yt-dlp extraction failed';
          return resolve({
            success: false,
            error: errMsg.includes('No video could be found')
              ? 'No downloadable video found at this link.'
              : errMsg.includes('empty media response') || errMsg.includes('login')
                ? 'Media is private or requires authentication.'
                : 'Could not extract media via core engine.',
          });
        }

        try {
          // yt-dlp may output multiple JSON lines for multi-entry; take the first valid JSON object
          const firstLine = stdout.trim().split('\n')[0];
          const info = JSON.parse(firstLine);
          const id = info.id || `media_${Date.now()}`;
          const title = info.title || info.fulltitle || 'Extracted Video';
          const description = info.description || '';
          const duration = typeof info.duration === 'number' ? info.duration : 0;
          const thumbnail =
            info.thumbnail ||
            (Array.isArray(info.thumbnails) && info.thumbnails[info.thumbnails.length - 1]?.url) ||
            '';

          let platform: PlatformType = platformHint || 'direct';
          const extractorKey = (info.extractor_key || info.extractor || '').toLowerCase();
          if (extractorKey.includes('tiktok')) platform = 'tiktok';
          else if (extractorKey.includes('instagram')) platform = 'instagram';
          else if (extractorKey.includes('facebook')) platform = 'facebook';
          else if (extractorKey.includes('twitter') || extractorKey.includes('x')) platform = 'twitter';
          else if (extractorKey.includes('reddit')) platform = 'reddit';
          else if (extractorKey.includes('pinterest')) platform = 'pinterest';
          else if (extractorKey.includes('vimeo')) platform = 'vimeo';

          const authorName = info.uploader || info.channel || info.creator || 'Creator';
          const authorUsername =
            info.uploader_id || info.channel_id || authorName.toLowerCase().replace(/\s+/g, '_');
          const authorProfileUrl = info.uploader_url || info.channel_url || '';

          const formats = Array.isArray(info.formats) ? info.formats : [];
          const qualities: QualityOption[] = [];

          const getFormatBytes = (f: any): number => {
            if (!f) return 0;
            if (typeof f.filesize === 'number' && f.filesize > 0) return f.filesize;
            if (typeof f.filesize_approx === 'number' && f.filesize_approx > 0)
              return f.filesize_approx;
            const bitrate = f.tbr || f.vbr || f.abr;
            if (bitrate && duration > 0) {
              return Math.round((bitrate * 1000 * duration) / 8);
            }
            return 0;
          };

          // Identify best dedicated audio track (prefer non-HLS m4a/aac)
          const audioFormats = formats.filter(
            (f: any) => f.url && f.vcodec === 'none' && f.acodec !== 'none'
          );
          const directM4a = audioFormats.find(
            (f: any) =>
              (f.ext === 'm4a' || f.acodec?.includes('mp4a')) &&
              !String(f.protocol || '').includes('m3u8')
          );
          const bestAudio =
            directM4a ||
            audioFormats.find((f: any) => f.ext === 'm4a') ||
            audioFormats[audioFormats.length - 1] ||
            null;
          const bestAudioUrl = bestAudio?.url;
          const bestAudioBytes =
            getFormatBytes(bestAudio) ||
            (duration > 0 ? Math.round((128 * 1000 * duration) / 8) : 0);

          // Valid video formats
          const videoFormats = formats.filter(
            (f: any) =>
              f.url &&
              (f.vcodec !== 'none' || f.ext === 'mp4' || f.ext === 'webm') &&
              f.ext !== 'mhtml'
          );

          const findBestVideoForResolution = (minH: number, maxH?: number) => {
            const matching = videoFormats.filter((f: any) => {
              const h = f.height || 0;
              const note = (f.format_note || f.format_id || '').toLowerCase();
              if (maxH !== undefined) {
                return (h >= minH && h <= maxH) || note.includes(`${minH}p`);
              }
              return h >= minH || note.includes(`${minH}p`);
            });

            if (matching.length === 0) return null;

            // 1. Prefer progressive (has both audio + video) direct MP4/H264
            const progressiveMp4 = matching.find(
              (f: any) =>
                f.acodec &&
                f.acodec !== 'none' &&
                f.vcodec !== 'none' &&
                (f.ext === 'mp4' || f.vcodec?.includes('avc') || f.vcodec?.includes('h264')) &&
                !String(f.protocol || '').includes('m3u8')
            );
            if (progressiveMp4) return progressiveMp4;

            // 2. Direct MP4 / AVC / H264 (non-HLS)
            const directAvc = matching.find(
              (f: any) =>
                (f.ext === 'mp4' || f.vcodec?.includes('avc') || f.vcodec?.includes('h264')) &&
                f.vcodec !== 'none' &&
                !String(f.protocol || '').includes('m3u8')
            );
            if (directAvc) return directAvc;

            // 3. Any MP4 / AVC
            const avcMatch = matching.find(
              (f: any) =>
                (f.ext === 'mp4' || f.vcodec?.includes('avc') || f.vcodec?.includes('h264')) &&
                f.vcodec !== 'none'
            );
            if (avcMatch) return avcMatch;

            return matching[matching.length - 1];
          };

          const tiers = [
            { id: '2160p', label: '4K Ultra HD (2160p)', res: '2160p', min: 2160, max: undefined },
            { id: '1440p', label: '2K Quad HD (1440p)', res: '1440p', min: 1440, max: 2159 },
            { id: '1080p', label: '1080p Full HD', res: '1080p', min: 1080, max: 1439 },
            { id: '720p', label: '720p HD', res: '720p', min: 720, max: 1079 },
            { id: '480p', label: '480p SD', res: '480p', min: 480, max: 719 },
            { id: '360p', label: '360p Data Saver', res: '360p', min: 360, max: 479 },
          ];

          for (const tier of tiers) {
            const f = findBestVideoForResolution(tier.min, tier.max);
            if (f && f.url) {
              const needsAudioMux = f.acodec === 'none' && Boolean(bestAudioUrl);
              const vBytes = getFormatBytes(f);
              const totalBytes = vBytes + (needsAudioMux ? bestAudioBytes : 0);
              qualities.push({
                id: tier.id,
                label: tier.label,
                resolution: tier.res,
                format: 'mp4',
                url: f.url,
                audioUrl: needsAudioMux ? bestAudioUrl : undefined,
                isNative: true,
                width: typeof f.width === 'number' ? f.width : undefined,
                height: typeof f.height === 'number' ? f.height : tier.min,
                fileSizeBytes: totalBytes > 0 ? totalBytes : undefined,
                fileSizeFormatted: totalBytes > 0 ? formatBytes(totalBytes) : undefined,
                hasAudio: f.acodec !== 'none' || Boolean(bestAudioUrl),
                fps: f.fps,
              });
            }
          }

          const rootVideoUrl = info.url || (videoFormats[0] && videoFormats[0].url);
          if (qualities.length === 0 && rootVideoUrl) {
            const rootH = typeof info.height === 'number' ? info.height : 720;
            const rootRes = rootH >= 1080 ? '1080p' : rootH >= 720 ? '720p' : rootH >= 480 ? '480p' : '360p';
            qualities.push({
              id: rootRes,
              label: `${rootRes} Video Stream (Direct)`,
              resolution: rootRes,
              format: 'mp4',
              url: rootVideoUrl,
              audioUrl: bestAudioUrl,
              isNative: true,
              height: rootH,
              fileSizeBytes: info.filesize || info.filesize_approx,
              fileSizeFormatted: formatBytes(info.filesize || info.filesize_approx),
              hasAudio: true,
            });
          }

          const progressiveFallbackUrl =
            qualities.find((q) => !q.audioUrl && q.hasAudio !== false)?.url ||
            rootVideoUrl ||
            qualities[0]?.url;

          if (bestAudio && bestAudio.url) {
            qualities.push({
              id: 'audio',
              label: 'Audio Track (MP3 320kbps)',
              resolution: 'audio',
              format: 'mp3',
              url: bestAudio.url,
              audioUrl: progressiveFallbackUrl && progressiveFallbackUrl !== bestAudio.url ? progressiveFallbackUrl : undefined,
              isNative: true,
              fileSizeBytes: bestAudioBytes > 0 ? bestAudioBytes : undefined,
              fileSizeFormatted: bestAudioBytes > 0 ? formatBytes(bestAudioBytes) : undefined,
              hasAudio: true,
            });
          } else if (progressiveFallbackUrl) {
            qualities.push({
              id: 'audio',
              label: 'Audio Track (MP3)',
              resolution: 'audio',
              format: 'mp3',
              url: progressiveFallbackUrl,
              isNative: true,
              hasAudio: true,
            });
          }

          if (qualities.length === 0) {
            return resolve({
              success: false,
              error: 'No downloadable media streams found in response.',
            });
          }

          const metadata: MediaMetadata = {
            id: String(id),
            originalUrl: url,
            platform,
            title,
            description,
            author: {
              name: authorName,
              username: authorUsername,
              profileUrl: sanitizeHttpUrl(authorProfileUrl) || undefined,
            },
            thumbnailUrl: sanitizeHttpUrl(thumbnail),
            durationSeconds: duration,
            durationFormatted: formatDuration(duration),
            qualities: qualities.filter((q) => Boolean(sanitizeHttpUrl(q.url))),
            extractedAt: new Date().toISOString(),
            sourceType: 'video',
          };

          return resolve({ success: true, data: metadata });
        } catch (parseErr: any) {
          return resolve({
            success: false,
            error: `Failed to parse media stream data: ${parseErr.message}`,
          });
        }
      }
    );
  });
}
