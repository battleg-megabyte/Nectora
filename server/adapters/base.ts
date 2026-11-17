import { AdapterResult } from '../types.js';

export interface PlatformAdapter {
  readonly platformName: string;
  canHandle(url: string): boolean;
  extract(url: string, cookies?: string): Promise<AdapterResult>;
}

export function formatBytes(bytes?: number): string | undefined {
  if (!bytes || isNaN(bytes) || bytes <= 0) return undefined;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || isNaN(seconds) || seconds <= 0) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
