import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export class TempFileManager {
  private tempDir: string;
  private maxAgeMs: number = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'nectora_media_cache');
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
      }
    } catch (e) {
      console.error('Failed to create temp directory:', e);
    }

    // Schedule cleanup every 10 minutes
    setInterval(() => this.sweepOldFiles(), 10 * 60 * 1000).unref();
  }

  public getTempFilePath(extension: string = 'mp4'): { id: string; filePath: string } {
    const id = crypto.randomBytes(16).toString('hex');
    const safeExt = extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5) || 'mp4';
    const filePath = path.join(this.tempDir, `tmp_${id}.${safeExt}`);
    return { id, filePath };
  }

  public safeDelete(filePath: string) {
    if (!filePath || !filePath.startsWith(this.tempDir)) {
      return;
    }
    fs.promises.unlink(filePath).catch(() => {});
  }

  private sweepOldFiles() {
    try {
      if (!fs.existsSync(this.tempDir)) return;
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const fullPath = path.join(this.tempDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > this.maxAgeMs) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // Ignore individual file errors during sweep
        }
      }
    } catch (err) {
      console.warn('Temp sweep warning:', err);
    }
  }
}

export const tempManager = new TempFileManager();
