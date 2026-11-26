import { PlatformAdapter, formatBytes, formatDuration } from './base.js';
import { InstagramAdapter } from './instagram.js';
import { TikTokAdapter } from './tiktok.js';
import { FacebookAdapter } from './facebook.js';
import { TwitterAdapter } from './twitter.js';
import { RedditAdapter } from './reddit.js';
import { DirectMediaAdapter } from './direct.js';
import { GenericMediaAdapter } from './generic.js';
import { probeMediaStream } from './probe.js';
import { AdapterResult, MediaMetadata, PlatformType, QualityOption } from '../types.js';

const TRACKING_PARAMS = new Set([
  'igsh',
  'igshid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'is_from_webapp',
  'sender_device',
  '_r',
  '_t',
  's',
  't',
]);

function normalizeCacheKey(rawUrl: string, cookies?: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    const cookieTag = cookies ? `:${cookies.length}` : '';
    return `${parsed.toString()}${cookieTag}`;
  } catch {
    return rawUrl.trim();
  }
}

function parseResHeight(res: string, targetHeight?: number): number {
  if (targetHeight && targetHeight > 0) return targetHeight;
  const m = String(res || '').match(/(\d{3,4})p/i);
  return m ? parseInt(m[1], 10) : 0;
}

function formatQualityLabel(res: string, width?: number, height?: number, fallbackLabel?: string): string {
  const dims = width && height ? ` (${width}×${height})` : '';
  if (res === '2160p') return `4K Ultra HD 2160p${dims}`;
  if (res === '1440p') return `2K Quad HD 1440p${dims}`;
  if (res === '1080p') return `1080p Full HD${dims}`;
  if (res === '720p') return `720p HD${dims}`;
  if (res && res !== 'original') return `${res} Video${dims}`;
  return fallbackLabel || 'Original MP4';
}

async function enrichRealQualities(meta: MediaMetadata): Promise<MediaMetadata> {
  const existing = Array.isArray(meta.qualities) ? meta.qualities : [];
  if (existing.length === 0) return meta;

  const rawVideos = existing.filter((q) => q.format !== 'mp3' && q.format !== 'm4a');
  const rawAudios = existing.filter((q) => q.format === 'mp3' || q.format === 'm4a');

  // Deduplicate identical video stream URLs so we never list the same file twice under fake resolutions
  const seenVideoUrls = new Set<string>();
  const uniqueVideos: QualityOption[] = [];
  for (const v of rawVideos) {
    if (!v.url || seenVideoUrls.has(v.url)) continue;
    seenVideoUrls.add(v.url);
    uniqueVideos.push(v);
  }

  // Probe only streams missing real dimensions or audio verification to keep extraction fast & deterministic
  const needsProbe = uniqueVideos
    .slice(0, 4)
    .filter((v) => {
      const isHls = v.url.toLowerCase().includes('.m3u8');
      const hasKnownDims = Boolean(v.width && v.height && v.resolution && v.resolution !== 'original');
      if (isHls && hasKnownDims) return false;
      const missingDims = !v.width || !v.height || !v.resolution || v.resolution === 'original';
      const missingCodec = !v.codec;
      return missingDims || (missingCodec && !hasKnownDims);
    })
    .slice(0, 2);

  const probeMap = new Map<string, Awaited<ReturnType<typeof probeMediaStream>>>();
  if (needsProbe.length > 0) {
    const results = await Promise.all(needsProbe.map((v) => probeMediaStream(v.url, meta.platform)));
    needsProbe.forEach((v, idx) => {
      probeMap.set(v.url, results[idx]);
    });
  }

  let detectedDuration = meta.durationSeconds || 0;
  const enrichedVideos: QualityOption[] = [];
  const audioCapableVideoUrls: Array<{ url: string; resHeight: number }> = [];

  for (let i = 0; i < uniqueVideos.length; i++) {
    const v = uniqueVideos[i];
    const probe = probeMap.get(v.url);

    if (probe?.probed && probe.durationSeconds && !detectedDuration) {
      detectedDuration = probe.durationSeconds;
    }

    // If ffprobe confirmed this stream is audio-only with no video tracks, treat it as audio source rather than fake video
    if (probe?.probed && !probe.hasVideo && probe.hasAudio) {
      rawAudios.unshift({
        id: 'audio',
        label: 'Original Audio (MP3)',
        resolution: 'audio',
        format: 'mp3',
        bitrateKbps: 320,
        url: v.url,
        isNative: true,
        fileSizeBytes: probe.fileSizeBytes || v.fileSizeBytes,
        fileSizeFormatted: formatBytes(probe.fileSizeBytes || v.fileSizeBytes),
        hasAudio: true,
      });
      continue;
    }

    const width = probe?.width || v.width;
    const height = probe?.height || v.height;
    const realResolution =
      probe?.resolution ||
      (v.resolution && v.resolution.toLowerCase() !== 'original' ? v.resolution : undefined) ||
      'original';

    const bytes = probe?.fileSizeBytes || v.fileSizeBytes;
    const hasAudio =
      Boolean(v.audioUrl) ||
      (probe?.probed ? probe.hasAudio : v.hasAudio !== false);

    if (hasAudio) {
      audioCapableVideoUrls.push({
        url: v.audioUrl || v.url,
        resHeight: parseResHeight(realResolution, probe?.shortEdge || height),
      });
    }

    const label = formatQualityLabel(realResolution, width, height, v.label);

    enrichedVideos.push({
      ...v,
      id: `${realResolution}_${i}`,
      resolution: realResolution,
      label,
      width,
      height,
      isNative: true,
      targetHeight: undefined,
      codec: probe?.vcodec || v.codec || (v.format === 'webm' ? 'VP9' : 'H.264'),
      fileSizeBytes: bytes,
      fileSizeFormatted: bytes ? formatBytes(bytes) : v.fileSizeFormatted,
      hasAudio,
    });
  }

  // Sort real video qualities from highest resolution to lowest cleanly
  enrichedVideos.sort((a, b) => {
    const ha = parseResHeight(a.resolution, a.width && a.height ? Math.min(a.width, a.height) : a.height);
    const hb = parseResHeight(b.resolution, b.width && b.height ? Math.min(b.width, b.height) : b.height);
    return hb - ha;
  });

  // Deduplicate identical resolution labels if two distinct URLs mapped to the same tier, keeping highest bitrate / first
  const seenResLabels = new Set<string>();
  const finalVideos = enrichedVideos.filter((v) => {
    const key = `${v.format}:${v.resolution.toLowerCase()}`;
    if (v.resolution !== 'original' && seenResLabels.has(key)) {
      return false;
    }
    seenResLabels.add(key);
    return true;
  });

  // Build ONE clean verified MP3 option ONLY if the media actually has an audio track (or is already audio)
  const finalAudios: QualityOption[] = [];
  const primaryRawAudio = rawAudios[0];

  // Pick fastest verified audio-bearing URL: prefer explicit separate audioUrl, then smallest audio-capable video stream (fastest to extract!), then native audio URL
  const smallestAudioVideo = [...audioCapableVideoUrls].sort((a, b) => a.resHeight - b.resHeight)[0];

  let chosenAudioUrl = '';
  let backupAudioUrl: string | undefined;

  if (finalVideos.length === 0 && primaryRawAudio?.url) {
    // Source itself is an audio file (.mp3, .m4a, .wav, etc.)
    chosenAudioUrl = primaryRawAudio.url;
  } else if (audioCapableVideoUrls.length > 0) {
    const progressiveVideoUrl = finalVideos.find((v) => !v.audioUrl && v.hasAudio)?.url;
    const explicitAudioTrack = finalVideos.find((v) => v.audioUrl)?.audioUrl;
    chosenAudioUrl = explicitAudioTrack || smallestAudioVideo?.url || primaryRawAudio?.url || '';
    const candidateBackup =
      progressiveVideoUrl && progressiveVideoUrl !== chosenAudioUrl
        ? progressiveVideoUrl
        : primaryRawAudio?.url && primaryRawAudio.url !== chosenAudioUrl
          ? primaryRawAudio.url
          : finalVideos.find((v) => v.url !== chosenAudioUrl && v.hasAudio)?.url;
    backupAudioUrl = candidateBackup;
  } else if (primaryRawAudio?.url && meta.sourceType === 'audio') {
    chosenAudioUrl = primaryRawAudio.url;
  }

  if (chosenAudioUrl) {
    const estMp3Bytes =
      finalVideos.length === 0 && primaryRawAudio?.fileSizeBytes
        ? primaryRawAudio.fileSizeBytes
        : detectedDuration > 0
          ? Math.round((320 * 1000 * detectedDuration) / 8)
          : undefined;

    finalAudios.push({
      id: 'audio',
      label:
        finalVideos.length === 0 && primaryRawAudio?.format === 'm4a'
          ? 'Original Audio (M4A)'
          : 'MP3 Audio (320 kbps)',
      resolution: 'audio',
      format: finalVideos.length === 0 && primaryRawAudio?.format === 'm4a' ? 'm4a' : 'mp3',
      url: chosenAudioUrl,
      audioUrl: backupAudioUrl,
      isNative: true,
      bitrateKbps: 320,
      codec: finalVideos.length === 0 && primaryRawAudio?.format === 'm4a' ? 'AAC' : 'MP3 320k',
      fileSizeBytes: estMp3Bytes,
      fileSizeFormatted: estMp3Bytes ? formatBytes(estMp3Bytes) : undefined,
      hasAudio: true,
    });
  }

  return {
    ...meta,
    durationSeconds: detectedDuration || meta.durationSeconds,
    durationFormatted:
      meta.durationFormatted || (detectedDuration > 0 ? formatDuration(detectedDuration) : undefined),
    qualities: [...finalVideos, ...finalAudios],
  };
}

export class AdapterManager {
  private adapters: PlatformAdapter[];
  private cache = new Map<string, { expiresAt: number; result: AdapterResult }>();
  private inFlight = new Map<string, Promise<AdapterResult>>();
  private readonly maxCacheEntries = 200;
  private readonly cacheTtlMs = 180000;

  constructor() {
    this.adapters = [
      new TikTokAdapter(),
      new InstagramAdapter(),
      new FacebookAdapter(),
      new TwitterAdapter(),
      new RedditAdapter(),
      new DirectMediaAdapter(),
      new GenericMediaAdapter(),
    ];
  }

  public detectPlatform(url: string): PlatformType {
    if (!url || typeof url !== 'string') return 'unsupported';
    const trimmed = url.trim().toLowerCase();

    if (trimmed.includes('tiktok.com')) return 'tiktok';
    if (trimmed.includes('instagram.com') || trimmed.includes('instagr.am')) return 'instagram';
    if (
      trimmed.includes('facebook.com') ||
      trimmed.includes('fb.watch') ||
      trimmed.includes('fb.me') ||
      trimmed.includes('fb.com')
    ) {
      return 'facebook';
    }
    if (
      trimmed.includes('twitter.com') ||
      trimmed.includes('x.com') ||
      trimmed.includes('fxtwitter.com') ||
      trimmed.includes('vxtwitter.com')
    ) {
      return 'twitter';
    }
    if (trimmed.includes('reddit.com') || trimmed.includes('v.redd.it') || trimmed.includes('redd.it')) {
      return 'reddit';
    }
    if (trimmed.includes('pinterest.com') || trimmed.includes('pin.it')) return 'pinterest';
    if (trimmed.includes('vimeo.com')) return 'vimeo';
    if (trimmed.includes('threads.net') || trimmed.includes('threads.com')) return 'threads';

    const directExtensions = ['.mp4', '.m4v', '.webm', '.mov', '.m3u8', '.ts', '.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac'];
    if (directExtensions.some((ext) => trimmed.includes(ext))) return 'direct';
    if (trimmed.startsWith('http')) return 'direct';
    return 'unsupported';
  }

  public async extract(url: string, cookies?: string): Promise<AdapterResult> {
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Empty or missing URL parameter.' };
    }

    const trimmed = url.trim();
    const cacheKey = normalizeCacheKey(trimmed, cookies);
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now && cached.result.success && cached.result.data) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return {
        success: true,
        data: {
          ...cached.result.data,
          originalUrl: trimmed,
        },
      };
    }

    const activeFlight = this.inFlight.get(cacheKey);
    if (activeFlight) {
      const shared = await activeFlight;
      if (shared.success && shared.data) {
        return {
          success: true,
          data: {
            ...shared.data,
            originalUrl: trimmed,
          },
        };
      }
      return shared;
    }

    const execution = this.extractUncached(trimmed, cookies);
    this.inFlight.set(cacheKey, execution);

    try {
      const result = await execution;
      if (result.success && result.data) {
        if (this.cache.size >= this.maxCacheEntries) {
          const oldestKey = this.cache.keys().next().value;
          if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(cacheKey, {
          expiresAt: Date.now() + this.cacheTtlMs,
          result,
        });
      }
      return result;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async extractUncached(trimmed: string, cookies?: string): Promise<AdapterResult> {
    let matchedAdapterError: AdapterResult | null = null;
    for (const adapter of this.adapters) {
      if (adapter.canHandle(trimmed)) {
        const res = await adapter.extract(trimmed, cookies);
        if (res.success && res.data) {
          return {
            success: true,
            data: await enrichRealQualities(res.data),
          };
        }
        if (!matchedAdapterError && res.error && adapter.platformName !== 'Direct Media') {
          matchedAdapterError = res;
        }
      }
    }

    if (matchedAdapterError) {
      return matchedAdapterError;
    }

    return {
      success: false,
      error: 'Unable to detect a streamable video from this URL. Verify the link is public and contains a video.',
      statusCode: 404,
    };
  }
}

export const adapterManager = new AdapterManager();
