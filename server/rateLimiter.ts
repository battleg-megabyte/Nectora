import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private requests: Map<string, RateLimitRecord> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 120, windowMs = 60000) {
    this.maxRequests = Number(process.env.RATE_LIMIT_REQUESTS) || maxRequests;
    this.windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || windowMs;

    // Cleanup stale entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const now = Date.now();

      let record = this.requests.get(ip);
      if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + this.windowMs };
        this.requests.set(ip, record);
      } else {
        record.count++;
      }

      const remaining = Math.max(0, this.maxRequests - record.count);
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

      if (record.count > this.maxRequests) {
        res.status(429).json({
          error: 'Rate limit exceeded. Please wait a moment before trying again.',
          retryAfterMs: record.resetTime - now,
        });
        return;
      }

      next();
    };
  }
}
