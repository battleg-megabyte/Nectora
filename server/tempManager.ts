import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export class TempFileManager {
  private tempDir: string;
  private maxAgeMs: number = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'wukong_vid_cache');
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
    if (!filePath || typeof filePath !== 'string') {
      return;
    }
    const resolvedBase = path.resolve(this.tempDir) + path.sep;
    const resolvedTarget = path.resolve(filePath);
    if (!resolvedTarget.startsWith(resolvedBase)) {
      return;
    }
    fs.promises.unlink(resolvedTarget).catch(() => {});
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
