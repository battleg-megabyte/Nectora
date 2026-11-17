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
  id: string;
  label: string;
  resolution: string; // '1080p' | '720p' | '480p' | 'audio'
  format: 'mp4' | 'mp3' | 'webm';
  url: string;
  audioUrl?: string;
  isNative: boolean;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  bitrateKbps?: number;
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
  sourceType: 'video' | 'reel' | 'clip' | 'direct_stream';
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  platform: PlatformType;
  thumbnailUrl?: string;
  qualityLabel: string;
  resolution: string;
  format: string;
  url: string;
  downloadedAt: number;
  authorName?: string;
  fileSizeFormatted?: string;
}

export interface VideoAnalysisResult {
  summary: string;
  keyMoments: { timestamp: string; description: string }[];
  topics: string[];
  viralScore: number;
  category: string;
  sentiment: string;
  suggestedCaptions: string[];
}

export interface FastTagsResult {
  title: string;
  hashtags: string[];
  quickSummary: string;
  recommendedCategory: string;
}

export interface SearchContextResult {
  overview: string;
  sourceReferences: { title: string; url?: string }[];
  trendingStatus: string;
}

export type AnalysisStatus =
  | 'idle'
  | 'analyzing'
  | 'found'
  | 'preparing'
  | 'downloading'
  | 'processing'
  | 'complete'
  | 'error';
