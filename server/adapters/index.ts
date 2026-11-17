import { PlatformAdapter } from './base.js';
import { InstagramAdapter } from './instagram.js';
import { TikTokAdapter } from './tiktok.js';
import { FacebookAdapter } from './facebook.js';
import { TwitterAdapter } from './twitter.js';
import { RedditAdapter } from './reddit.js';
import { DirectMediaAdapter } from './direct.js';
import { GenericMediaAdapter } from './generic.js';
import { AdapterResult, PlatformType } from '../types.js';

export class AdapterManager {
  private adapters: PlatformAdapter[];

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

    // Check direct extensions
    const directExtensions = ['.mp4', '.m4v', '.webm', '.mov', '.m3u8', '.ts', '.mp3', '.ogg', '.wav'];
    if (directExtensions.some(ext => trimmed.includes(ext))) {
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

    // Find matching adapter
    let matchedAdapterError: AdapterResult | null = null;
    for (const adapter of this.adapters) {
      if (adapter.canHandle(trimmed)) {
        const res = await adapter.extract(trimmed, cookies);
        if (res.success) {
          return res;
        }
        // Only lock in platform-specific errors for dedicated social adapters, not DirectMediaAdapter HTML handoffs
        if (!matchedAdapterError && res.error && adapter.platformName !== 'Direct Media') {
          matchedAdapterError = res;
        }
      }
    }

    if (matchedAdapterError) {
      return matchedAdapterError;
    }

    const genericAdapter = new GenericMediaAdapter();
    return await genericAdapter.extract(trimmed, cookies);
  }
}

export const adapterManager = new AdapterManager();
