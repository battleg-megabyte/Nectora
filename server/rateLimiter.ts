import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private requests: Map<string, RateLimitRecord> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private readonly maxTrackedIps: number;

  constructor(
    maxRequests = Number(process.env.RATE_LIMIT_REQUESTS) || 180,
    windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    maxTrackedIps = 10000
  ) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxTrackedIps = maxTrackedIps;

    // Cleanup stale entries every 2 minutes
    setInterval(() => this.cleanup(), 2 * 60 * 1000).unref();
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
      const forwarded = req.headers['x-forwarded-for'];
      const rawIp =
        (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '') ||
        req.socket.remoteAddress ||
        'unknown';
      const ip = rawIp.slice(0, 64);
      const now = Date.now();

      let record = this.requests.get(ip);
      if (!record || now > record.resetTime) {
        if (!record && this.requests.size >= this.maxTrackedIps) {
          this.cleanup();
          if (this.requests.size >= this.maxTrackedIps) {
            const oldestKey = this.requests.keys().next().value;
            if (oldestKey) this.requests.delete(oldestKey);
          }
        }
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
        const retryAfterMs = Math.max(1000, record.resetTime - now);
        res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        res.status(429).json({
          error: 'Rate limit exceeded. Please wait a moment before trying again.',
          retryAfterMs,
        });
        return;
      }

      next();
    };
  }
}
