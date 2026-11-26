import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { validateSafeUrl, validateFfmpegRemoteUrl, getPlatformSecurityCookies, safeFetch } from '../security.js';
import { PlatformType } from '../types.js';

export interface StreamProbeResult {
  probed: boolean;
  width?: number;
  height?: number;
  shortEdge?: number;
  resolution?: string;
  vcodec?: string;
  acodec?: string;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSeconds?: number;
  fileSizeBytes?: number;
}

export interface HlsVariantInfo {
  resolution: string;
  width?: number;
  height?: number;
  bandwidth?: number;
  url: string;
}

function getFfprobePath(): string {
  for (const candidate of ['/usr/bin/ffprobe', '/usr/local/bin/ffprobe']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'ffprobe';
}

function buildProbeHeaders(parsedUrl: URL, platform?: PlatformType): { userAgent: string; headers: string[] } {
  const host = parsedUrl.hostname.toLowerCase();
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const headers: string[] = [];

  if (host.includes('tikcdn.io') || host.includes('ssstik.io')) {
    headers.push('Referer: https://ssstik.io/');
    headers.push(`Cookie: ${getPlatformSecurityCookies('tiktok')}`);
  } else if (
    platform === 'tiktok' ||
    host.includes('tiktok') ||
    host.includes('tikwm.com') ||
    host.includes('muscdn.com') ||
    host.includes('ibytedtos.com') ||
    host.includes('byteoversea.com')
  ) {
    headers.push('Referer: https://www.tiktok.com/');
    headers.push('Origin: https://www.tiktok.com');
    headers.push(`Cookie: ${getPlatformSecurityCookies('tiktok')}`);
  } else if (
    platform === 'instagram' ||
    host.includes('instagram') ||
    host.includes('cdninstagram.com') ||
    host.includes('eeinstagram.com')
  ) {
    headers.push('Referer: https://www.instagram.com/');
    headers.push(`Cookie: ${getPlatformSecurityCookies('instagram')}`);
  } else if (
    platform === 'facebook' ||
    host.includes('fbcdn.net') ||
    host.includes('facebook.com') ||
    host.includes('fbsbx.com')
  ) {
    headers.push('Referer: https://www.facebook.com/');
    headers.push(`Cookie: ${getPlatformSecurityCookies('facebook')}`);
  } else if (host.includes('rapidcdn.app') || host.includes('snapsave.app')) {
    headers.push('Referer: https://snapsave.app/');
    headers.push('Origin: https://snapsave.app');
  } else if (platform === 'twitter' || host.includes('twimg.com') || host.includes('x.com')) {
    headers.push('Referer: https://x.com/');
  } else if (platform === 'reddit' || host.includes('v.redd.it')) {
    headers.push('Referer: https://www.reddit.com/');
  } else if (platform === 'vimeo' || host.includes('vimeo')) {
    headers.push('Referer: https://vimeo.com/');
  }

  return { userAgent, headers };
}

export function normalizeResolutionFromDimensions(width?: number, height?: number): string | undefined {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const shortEdge = w > 0 && h > 0 ? Math.min(w, h) : h || w;
  if (!shortEdge || shortEdge <= 0) return undefined;

  if (shortEdge >= 2100) return '2160p';
  if (shortEdge >= 1400) return '1440p';
  if (shortEdge >= 1040) return '1080p';
  if (shortEdge >= 700) return '720p';
  if (shortEdge >= 530) return '540p';
  if (shortEdge >= 460) return '480p';
  if (shortEdge >= 340) return '360p';
  if (shortEdge >= 220) return '240p';
  return `${shortEdge}p`;
}

export function formatFriendlyCodec(raw?: string): string | undefined {
  if (!raw) return undefined;
  const c = raw.toLowerCase();
  if (c === 'h264' || c.includes('avc')) return 'H.264';
  if (c === 'hevc' || c === 'h265' || c.includes('hev')) return 'HEVC';
  if (c.includes('vp9')) return 'VP9';
  if (c.includes('av1')) return 'AV1';
  if (c === 'aac' || c.includes('mp4a')) return 'AAC';
  if (c === 'mp3' || c.includes('lame')) return 'MP3';
  if (c.includes('opus')) return 'Opus';
  return raw.toUpperCase();
}

const probeCache = new Map<string, { expiresAt: number; result: StreamProbeResult }>();
const PROBE_CACHE_TTL_MS = 120_000;

export async function probeMediaStream(
  streamUrl: string,
  platform?: PlatformType
): Promise<StreamProbeResult> {
  const empty: StreamProbeResult = {
    probed: false,
    hasVideo: true,
    hasAudio: true,
  };

  if (!streamUrl) return empty;

  const cached = probeCache.get(streamUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  try {
    const safe = await validateSafeUrl(streamUrl);
    if (!safe.safe || !validateFfmpegRemoteUrl(streamUrl)) {
      return empty;
    }

    const parsedUrl = new URL(streamUrl);
    const { userAgent, headers } = buildProbeHeaders(parsedUrl, platform);

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      '-rw_timeout', '2200000',
      '-protocol_whitelist', 'http,https,tcp,tls,crypto',
      '-user_agent', userAgent,
    ];
    if (headers.length > 0) {
      args.push('-headers', `${headers.join('\r\n')}\r\n`);
    }
    args.push(streamUrl);

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        getFfprobePath(),
        args,
        { timeout: 2600, maxBuffer: 2 * 1024 * 1024 },
        (err, out) => {
          if (err || !out) return reject(err || new Error('ffprobe empty'));
          resolve(out);
        }
      );
    });

    const data = JSON.parse(stdout);
    const streams: any[] = Array.isArray(data?.streams) ? data.streams : [];
    const videoStream = streams.find((s) => s.codec_type === 'video' && (Number(s.width) > 0 || Number(s.height) > 0));
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const width = videoStream ? Number(videoStream.width) || undefined : undefined;
    const height = videoStream ? Number(videoStream.height) || undefined : undefined;
    const shortEdge = width && height ? Math.min(width, height) : height || width;
    const resolution = normalizeResolutionFromDimensions(width, height);
    const durationRaw = Number(data?.format?.duration);
    const sizeRaw = Number(data?.format?.size);

    const result: StreamProbeResult = {
      probed: streams.length > 0,
      width,
      height,
      shortEdge,
      resolution,
      vcodec: formatFriendlyCodec(videoStream?.codec_name),
      acodec: formatFriendlyCodec(audioStream?.codec_name),
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      durationSeconds: Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : undefined,
      fileSizeBytes: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined,
    };

    if (probeCache.size >= 250) {
      const oldest = probeCache.keys().next().value;
      if (oldest) probeCache.delete(oldest);
    }
    probeCache.set(streamUrl, { expiresAt: Date.now() + PROBE_CACHE_TTL_MS, result });
    return result;
  } catch {
    return empty;
  }
}

export async function parseHlsMasterVariants(m3u8Url: string): Promise<HlsVariantInfo[]> {
  try {
    const safe = await validateSafeUrl(m3u8Url);
    if (!safe.safe) return [];
    const { response, finalUrl } = await safeFetch(m3u8Url, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
      },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return [];
    }
    const text = await response.text();
    if (!text.includes('#EXT-X-STREAM-INF')) return [];

    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const base = finalUrl || m3u8Url;
    const seenRes = new Set<string>();
    const variants: HlsVariantInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

      let uri = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) {
          uri = lines[j];
          break;
        }
      }
      if (!uri) continue;

      let resolvedUri = uri;
      try {
        resolvedUri = new URL(uri, base).toString();
      } catch {
        continue;
      }

      const safeVar = await validateSafeUrl(resolvedUri);
      if (!safeVar.safe) continue;

      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      const width = resMatch ? parseInt(resMatch[1], 10) : undefined;
      const height = resMatch ? parseInt(resMatch[2], 10) : undefined;
      const bw = bwMatch ? parseInt(bwMatch[1], 10) : undefined;
      const resLabel = normalizeResolutionFromDimensions(width, height) || (bw ? `${Math.round(bw / 1000)}kbps` : 'HLS');

      if (!seenRes.has(resLabel)) {
        seenRes.add(resLabel);
        variants.push({
          resolution: resLabel,
          width,
          height,
          bandwidth: bw,
          url: resolvedUri,
        });
      }
    }

    variants.sort((a, b) => (b.height || b.bandwidth || 0) - (a.height || a.bandwidth || 0));
    return variants;
  } catch {
    return [];
  }
}
