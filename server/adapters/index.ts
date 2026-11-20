import { PlatformAdapter, formatBytes } from './base.js';
import { InstagramAdapter } from './instagram.js';
import { TikTokAdapter } from './tiktok.js';
import { FacebookAdapter } from './facebook.js';
import { TwitterAdapter } from './twitter.js';
import { RedditAdapter } from './reddit.js';
import { DirectMediaAdapter } from './direct.js';
import { GenericMediaAdapter } from './generic.js';
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

function enrichQualities(meta: MediaMetadata): MediaMetadata {
  const existing = Array.isArray(meta.qualities) ? meta.qualities : [];
  if (existing.length === 0) return meta;

  const videoOptions = existing.filter((q) => q.format !== 'mp3' && q.format !== 'm4a');
  const audioBase =
    existing.find((q) => q.format === 'mp3') ||
    existing.find((q) => q.audioUrl) ||
    existing.find((q) => q.hasAudio !== false) ||
    videoOptions[0];
  const resolvedAudioSourceUrl =
    audioBase?.format === 'mp3'
      ? audioBase.url
      : audioBase?.audioUrl || audioBase?.url;

  const primaryVideo =
    videoOptions.find((q) => q.isNative) ||
    videoOptions[0];

  const enrichedVideos: QualityOption[] = [...videoOptions.map((v) => {
    const resLower = v.resolution.toLowerCase();
    const sameAsPrimary = primaryVideo && v.url === primaryVideo.url && !v.isNative;
    const inferredTargetHeight =
      v.targetHeight ||
      (sameAsPrimary && resLower === '720p'
        ? 720
        : !v.isNative && resLower === '480p'
          ? 480
          : !v.isNative && resLower === '360p'
            ? 360
            : undefined);
    return {
      ...v,
      targetHeight: inferredTargetHeight,
      codec: v.codec || (v.format === 'webm' ? 'VP9' : 'H.264'),
    };
  })];

  if (primaryVideo && videoOptions.length > 0) {
    const hasRes = (res: string) =>
      enrichedVideos.some((v) => v.resolution.toLowerCase() === res.toLowerCase());

    if (!hasRes('1080p')) {
      enrichedVideos.unshift({
        id: '1080p',
        label: '1080p Full HD (Master)',
        resolution: '1080p',
        format: primaryVideo.format,
        url: primaryVideo.url,
        audioUrl: primaryVideo.audioUrl,
        isNative: false,
        fileSizeBytes: primaryVideo.fileSizeBytes,
        fileSizeFormatted: primaryVideo.fileSizeFormatted,
        codec: primaryVideo.codec || 'H.264',
        hasAudio: true,
      });
    }

    if (!hasRes('720p')) {
      const est720 = primaryVideo.fileSizeBytes
        ? Math.round(primaryVideo.fileSizeBytes * 0.65)
        : undefined;
      enrichedVideos.push({
        id: '720p',
        label: '720p HD Stream',
        resolution: '720p',
        format: 'mp4',
        url: primaryVideo.url,
        audioUrl: primaryVideo.audioUrl,
        isNative: false,
        targetHeight: 720,
        fileSizeBytes: est720,
        fileSizeFormatted: est720 ? formatBytes(est720) : undefined,
        codec: 'H.264',
        hasAudio: true,
      });
    }

    if (!hasRes('480p')) {
      const est480 = primaryVideo.fileSizeBytes
        ? Math.round(primaryVideo.fileSizeBytes * 0.42)
        : undefined;
      enrichedVideos.push({
        id: '480p',
        label: '480p SD (Compact MP4)',
        resolution: '480p',
        format: 'mp4',
        url: primaryVideo.url,
        audioUrl: primaryVideo.audioUrl,
        isNative: false,
        targetHeight: 480,
        fileSizeBytes: est480,
        fileSizeFormatted: est480 ? formatBytes(est480) : undefined,
        codec: 'H.264',
        hasAudio: true,
      });
    }

    if (!hasRes('360p')) {
      const est360 = primaryVideo.fileSizeBytes
        ? Math.round(primaryVideo.fileSizeBytes * 0.28)
        : undefined;
      enrichedVideos.push({
        id: '360p',
        label: '360p Data Saver (Mobile)',
        resolution: '360p',
        format: 'mp4',
        url: primaryVideo.url,
        audioUrl: primaryVideo.audioUrl,
        isNative: false,
        targetHeight: 360,
        fileSizeBytes: est360,
        fileSizeFormatted: est360 ? formatBytes(est360) : undefined,
        codec: 'H.264',
        hasAudio: true,
      });
    }
  }

  const enrichedAudios: QualityOption[] = [];
  if (resolvedAudioSourceUrl) {
    const dur = meta.durationSeconds || 0;
    const estBytes = (kbps: number) =>
      dur > 0 ? Math.round((kbps * 1000 * dur) / 8) : undefined;

    const existing320 = existing.find((q) => q.format === 'mp3');
    enrichedAudios.push({
      id: existing320?.id || 'audio',
      label: 'MP3 Audio · 320 kbps (Studio)',
      resolution: 'audio',
      format: 'mp3',
      url: resolvedAudioSourceUrl,
      isNative: true,
      bitrateKbps: 320,
      codec: 'MP3 320k',
      fileSizeBytes: existing320?.fileSizeBytes || estBytes(320),
      fileSizeFormatted:
        existing320?.fileSizeFormatted || (estBytes(320) ? formatBytes(estBytes(320)) : undefined),
      hasAudio: true,
    });

    enrichedAudios.push({
      id: 'audio_192k',
      label: 'MP3 Audio · 192 kbps (Balanced)',
      resolution: 'audio',
      format: 'mp3',
      url: resolvedAudioSourceUrl,
      isNative: false,
      bitrateKbps: 192,
      codec: 'MP3 192k',
      fileSizeBytes: estBytes(192),
      fileSizeFormatted: estBytes(192) ? formatBytes(estBytes(192)) : undefined,
      hasAudio: true,
    });

    enrichedAudios.push({
      id: 'audio_128k',
      label: 'MP3 Audio · 128 kbps (Compact)',
      resolution: 'audio',
      format: 'mp3',
      url: resolvedAudioSourceUrl,
      isNative: false,
      bitrateKbps: 128,
      codec: 'MP3 128k',
      fileSizeBytes: estBytes(128),
      fileSizeFormatted: estBytes(128) ? formatBytes(estBytes(128)) : undefined,
      hasAudio: true,
    });

    enrichedAudios.push({
      id: 'audio_m4a',
      label: 'M4A Audio · 256 kbps (AAC)',
      resolution: 'audio',
      format: 'm4a',
      url: resolvedAudioSourceUrl,
      isNative: false,
      bitrateKbps: 256,
      codec: 'AAC 256k',
      fileSizeBytes: estBytes(256),
      fileSizeFormatted: estBytes(256) ? formatBytes(estBytes(256)) : undefined,
      hasAudio: true,
    });
  }

  return {
    ...meta,
    qualities: [...enrichedVideos, ...enrichedAudios],
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

    if (trimmed.includes('tiktok.com')) {
      return 'tiktok';
    }
    if (trimmed.includes('instagram.com') || trimmed.includes('instagr.am')) {
      return 'instagram';
    }
    if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
      return 'facebook';
    }
    if (trimmed.includes('twitter.com') || trimmed.includes('x.com')) {
      return 'twitter';
    }
    if (trimmed.includes('reddit.com') || trimmed.includes('v.redd.it')) {
      return 'reddit';
    }
    if (trimmed.includes('pinterest.com') || trimmed.includes('pin.it')) {
      return 'pinterest';
    }
    if (trimmed.includes('vimeo.com')) {
      return 'vimeo';
    }
    if (trimmed.includes('threads.net')) {
      return 'threads';
    }

    const directExtensions = ['.mp4', '.m4v', '.webm', '.mov', '.m3u8', '.ts', '.mp3', '.ogg', '.wav'];
    if (directExtensions.some((ext) => trimmed.includes(ext))) {
      return 'direct';
    }

    if (trimmed.startsWith('http')) {
      return 'direct';
    }

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
      // Refresh LRU ordering
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
            data: enrichQualities(res.data),
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

    const genericAdapter = new GenericMediaAdapter();
    const genericRes = await genericAdapter.extract(trimmed, cookies);
    if (genericRes.success && genericRes.data) {
      return {
        success: true,
        data: enrichQualities(genericRes.data),
      };
    }
    return genericRes;
  }
}

export const adapterManager = new AdapterManager();
