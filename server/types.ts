export type PlatformType =
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'twitter'
  | 'reddit'
  | 'pinterest'
  | 'vimeo'
  | 'threads'
  | 'direct'
  | 'unsupported';

export interface QualityOption {
  id: string; // e.g. '2160p', '1080p', '720p', '480p', '360p', 'audio_320k', 'audio_192k', 'audio_128k', 'audio_m4a'
  label: string; // e.g. '1080p Full HD'
  resolution: string; // '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | 'audio'
  format: 'mp4' | 'mp3' | 'm4a' | 'webm';
  url: string;
  audioUrl?: string;
  isNative: boolean;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  bitrateKbps?: number;
  targetHeight?: number;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
}

export interface MediaMetadata {
  id: string;
  originalUrl: string;
  platform: PlatformType;
  title: string;
  description?: string;
  author: {
    name: string;
    username: string;
    avatarUrl?: string;
    profileUrl?: string;
  };
  thumbnailUrl: string;
  durationSeconds?: number;
  durationFormatted?: string;
  qualities: QualityOption[];
  extractedAt: string;
  sourceType: 'video' | 'reel' | 'clip' | 'direct_stream' | 'audio';
}

export interface AdapterResult {
  success: boolean;
  data?: MediaMetadata;
  error?: string;
  statusCode?: number;
}
