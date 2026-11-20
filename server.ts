import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import dotenv from 'dotenv';
import { Readable } from 'node:stream';
import { spawn } from 'child_process';
import { createServer as createViteServer } from 'vite';

dns.setDefaultResultOrder('ipv4first');
import { adapterManager } from './server/adapters/index.js';
import {
  validateSafeUrl,
  safeFetch,
  validateFfmpegRemoteUrl,
  sanitizeFilename,
  sanitizeCookieHeader,
  sanitizeMediaFormat,
  sanitizeAudioBitrate,
  sanitizeVideoHeight,
  getPlatformSecurityCookies,
} from './server/security.js';
import { RateLimiter } from './server/rateLimiter.js';
import { tempManager } from './server/tempManager.js';
import {
  analyzeMediaContent,
  generateFastTags,
  searchVideoContext,
} from './server/gemini.js';
import {
  createMcpHandlers,
  buildQualityDownloadLinks,
  buildQuickLinksMap,
  selectRecommendedQuality,
} from './server/mcp.js';
import {
  buildLlmsTxt,
  buildLlmsFullTxt,
  buildOpenApiSpec,
  buildMcpManifest,
  buildAgentCard,
  buildAiPluginManifest,
} from './server/agentDocs.js';
import {
  SEO_PAGES,
  getSeoPageByPath,
  injectSeoIntoHtmlTemplate,
  normalizeSeoPath,
} from './shared/seoPages.js';

dotenv.config();

const PORT = 3000;

function getFfmpegPath(): string {
  const candidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'ffmpeg';
}

function isHlsStreamUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.pathname.toLowerCase().includes('.m3u8');
  } catch {
    return targetUrl.toLowerCase().includes('.m3u8');
  }
}

function buildUpstreamHeaders(parsedUrl: URL, clientCookies?: string): Record<string, string> {
  const host = parsedUrl.hostname.toLowerCase();
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: '*/*',
  };

  if (host.includes('tikcdn.io') || host.includes('ssstik.io')) {
    headers['Referer'] = 'https://ssstik.io/';
    headers['Cookie'] = getPlatformSecurityCookies('tiktok', clientCookies);
  } else if (
    host.includes('tiktok') ||
    host.includes('tikwm.com') ||
    host.includes('muscdn.com') ||
    host.includes('ibytedtos.com') ||
    host.includes('byteoversea.com') ||
    host.includes('musical.ly')
  ) {
    headers['Referer'] = 'https://www.tiktok.com/';
    headers['Origin'] = 'https://www.tiktok.com';
    headers['Cookie'] = getPlatformSecurityCookies('tiktok', clientCookies);
  } else if (
    host.includes('instagram') ||
    host.includes('cdninstagram.com') ||
    host.includes('eeinstagram.com')
  ) {
    headers['Referer'] = 'https://www.instagram.com/';
    headers['Cookie'] = getPlatformSecurityCookies('instagram', clientCookies);
  } else if (
    host.includes('fbcdn.net') ||
    host.includes('facebook.com') ||
    host.includes('fbsbx.com')
  ) {
    headers['Referer'] = 'https://www.facebook.com/';
    headers['Cookie'] = getPlatformSecurityCookies('facebook', clientCookies);
  } else if (host.includes('rapidcdn.app') || host.includes('snapsave.app')) {
    headers['Referer'] = 'https://snapsave.app/';
    headers['Origin'] = 'https://snapsave.app';
  } else if (
    host.includes('twimg.com') ||
    host.includes('x.com') ||
    host.includes('twitter.com')
  ) {
    headers['Referer'] = 'https://x.com/';
    headers['Cookie'] = getPlatformSecurityCookies('twitter', clientCookies);
  } else if (host.includes('v.redd.it') || host.includes('reddit.com')) {
    headers['Referer'] = 'https://www.reddit.com/';
  } else if (host.includes('vimeo.com') || host.includes('vimeocdn.com')) {
    headers['Referer'] = 'https://vimeo.com/';
  }

  return headers;
}

function buildFfmpegHttpArgs(parsedUrl: URL, clientCookies?: string, isHls = false): string[] {
  const upstreamHeaders = buildUpstreamHeaders(parsedUrl, clientCookies);
  const headerLines: string[] = [];
  if (upstreamHeaders['Referer']) {
    headerLines.push(`Referer: ${upstreamHeaders['Referer']}`);
  }
  if (upstreamHeaders['Origin']) {
    headerLines.push(`Origin: ${upstreamHeaders['Origin']}`);
  }
  if (upstreamHeaders['Cookie']) {
    headerLines.push(`Cookie: ${upstreamHeaders['Cookie']}`);
  }

  const args: string[] = [
    '-nostdin',
    '-protocol_whitelist',
    'http,https,tcp,tls,crypto',
    '-user_agent',
    upstreamHeaders['User-Agent'],
  ];

  if (headerLines.length > 0) {
    args.push('-headers', `${headerLines.join('\r\n')}\r\n`);
  }

  if (isHls) {
    args.push('-http_persistent', '1', '-fflags', '+genpts+discardcorrupt');
  } else {
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  }

  return args;
}

function sendAttachmentHeaders(
  res: Response,
  contentType: string,
  cleanAsciiFilename: string,
  safeFilename: string
) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${cleanAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
  );
}

function spawnGuardedFfmpegStream(options: {
  ffArgs: string[];
  res: Response;
  req: Request;
  contentType: string;
  cleanAsciiFilename?: string;
  safeFilename?: string;
  onEmptyFailure?: (stderrLog: string) => Promise<void>;
}) {
  const { ffArgs, res, req, contentType, cleanAsciiFilename, safeFilename, onEmptyFailure } = options;
  const ff = spawn(getFfmpegPath(), ffArgs);
  let sentFirstByte = false;
  let clientClosed = false;
  let stderrLog = '';

  const watchdog = setTimeout(() => {
    if (!clientClosed) {
      clientClosed = true;
      ff.kill('SIGKILL');
    }
  }, 120000);

  const finishOnClose = () => {
    clientClosed = true;
    clearTimeout(watchdog);
    ff.kill('SIGKILL');
  };
  req.on('close', finishOnClose);

  ff.stdout.on('data', (chunk: Buffer) => {
    if (clientClosed) return;
    if (!sentFirstByte) {
      sentFirstByte = true;
      if (!res.headersSent) {
        if (cleanAsciiFilename && safeFilename) {
          sendAttachmentHeaders(res, contentType, cleanAsciiFilename, safeFilename);
        } else {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Content-Type-Options', 'nosniff');
        }
      }
    }
    if (!res.writableEnded) {
      const ok = res.write(chunk);
      if (!ok) {
        ff.stdout.pause();
        res.once('drain', () => ff.stdout.resume());
      }
    }
  });

  ff.stderr.on('data', (d) => {
    const log = d.toString();
    stderrLog += log;
    if (!log.includes('Broken pipe')) {
      console.warn('FFmpeg notice:', log);
    }
  });

  ff.on('error', async (err) => {
    clearTimeout(watchdog);
    req.off('close', finishOnClose);
    if (clientClosed) return;
    if (!sentFirstByte && onEmptyFailure) {
      await onEmptyFailure(err.message);
      return;
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Media processing engine failed to launch.' });
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  ff.on('close', async (code) => {
    clearTimeout(watchdog);
    req.off('close', finishOnClose);
    if (clientClosed) return;
    if (sentFirstByte) {
      if (!res.writableEnded) res.end();
      return;
    }

    if (onEmptyFailure) {
      await onEmptyFailure(stderrLog);
      return;
    }

    if (!res.headersSent) {
      const noAudio =
        stderrLog.includes('does not contain any stream') ||
        stderrLog.includes('matches no streams');
      res.status(noAudio ? 422 : 502).json({
        error: noAudio
          ? 'This video does not contain an audio track.'
          : `Stream conversion produced no data (exit ${code ?? 'unknown'}).`,
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  });
}

async function transcodeAudioViaTempFallback(options: {
  mediaUrl: string;
  upstreamHeaders: Record<string, string>;
  res: Response;
  req: Request;
  cleanAsciiFilename: string;
  safeFilename: string;
  format: 'mp3' | 'm4a';
  bitrate: string;
}) {
  const { mediaUrl, upstreamHeaders, res, req, cleanAsciiFilename, safeFilename, format, bitrate } = options;
  const inputTmp = tempManager.getTempFilePath('media');
  const outputTmp = tempManager.getTempFilePath(format);
  const abortCtrl = new AbortController();
  const onReqClose = () => abortCtrl.abort();
  req.on('close', onReqClose);

  try {
    const isHls = isHlsStreamUrl(mediaUrl);
    if (!isHls) {
      let { response: upstreamRes } = await safeFetch(mediaUrl, {
        headers: upstreamHeaders,
        signal: abortCtrl.signal,
      });

      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        await upstreamRes.body?.cancel().catch(() => {});
        const retryFetch = await safeFetch(mediaUrl, {
          headers: {
            'User-Agent': upstreamHeaders['User-Agent'] || 'Mozilla/5.0',
            Accept: '*/*',
          },
          signal: abortCtrl.signal,
        });
        upstreamRes = retryFetch.response;
      }

      if (!upstreamRes.ok || !upstreamRes.body) {
        if (!res.headersSent) {
          res.status(upstreamRes.status || 502).json({
            error: `Upstream audio source returned HTTP ${upstreamRes.status}. Please re-extract the URL.`,
          });
        }
        return;
      }

      const fileWriteStream = fs.createWriteStream(inputTmp.filePath);
      const readable = Readable.fromWeb(upstreamRes.body as any);
      await new Promise<void>((resolve, reject) => {
        readable.on('error', reject);
        fileWriteStream.on('error', reject);
        fileWriteStream.on('finish', resolve);
        readable.pipe(fileWriteStream);
      });
    }

    const inputSource = isHls ? mediaUrl : inputTmp.filePath;
    const extraInputArgs = isHls
      ? buildFfmpegHttpArgs(new URL(mediaUrl), upstreamHeaders['Cookie'], true)
      : [];

    const ffConvert = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const codecArgs =
        format === 'm4a'
          ? ['-c:a', 'aac', '-b:a', bitrate, '-ar', '44100', '-ac', '2', '-movflags', '+faststart']
          : ['-c:a', 'libmp3lame', '-b:a', bitrate, '-ar', '44100', '-ac', '2', '-id3v2_version', '3', '-write_xing', '1'];

      const args = [
        '-nostdin',
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...extraInputArgs,
        '-i', inputSource,
        '-vn',
        '-map', '0:a:0',
        ...codecArgs,
        outputTmp.filePath,
      ];
      const proc = spawn(getFfmpegPath(), args);
      let errOut = '';
      proc.stderr.on('data', (d) => {
        errOut += d.toString();
      });
      proc.on('close', (code) => resolve({ code, stderr: errOut }));
      proc.on('error', (e) => resolve({ code: 1, stderr: e.message }));
    });

    if (abortCtrl.signal.aborted || req.destroyed) return;

    if (ffConvert.code !== 0 || !fs.existsSync(outputTmp.filePath)) {
      const noAudio =
        ffConvert.stderr.includes('does not contain any stream') ||
        ffConvert.stderr.includes('matches no streams');
      if (!res.headersSent) {
        res.status(noAudio ? 422 : 502).json({
          error: noAudio
            ? `This video has no audio track to convert to ${format.toUpperCase()}.`
            : `Unable to convert audio stream to ${format.toUpperCase()}.`,
        });
      }
      return;
    }

    const stat = fs.statSync(outputTmp.filePath);
    if (stat.size <= 0) {
      if (!res.headersSent) {
        res.status(502).json({ error: `Converted ${format.toUpperCase()} file was empty.` });
      }
      return;
    }

    sendAttachmentHeaders(
      res,
      format === 'm4a' ? 'audio/mp4' : 'audio/mpeg',
      cleanAsciiFilename,
      safeFilename
    );
    res.setHeader('Content-Length', String(stat.size));

    const outStream = fs.createReadStream(outputTmp.filePath);
    await new Promise<void>((resolve) => {
      outStream.on('close', () => resolve());
      outStream.on('error', () => resolve());
      outStream.pipe(res);
    });
  } catch (err: any) {
    if (!abortCtrl.signal.aborted && !res.headersSent) {
      res.status(502).json({ error: err?.message || 'Audio fallback conversion failed.' });
    }
  } finally {
    req.off('close', onReqClose);
    tempManager.safeDelete(inputTmp.filePath);
    tempManager.safeDelete(outputTmp.filePath);
  }
}

function spawnHlsToMp4Remux(
  mediaUrl: string,
  res: Response,
  req: Request,
  parsedUrl: URL,
  clientCookies?: string,
  cleanAsciiFilename?: string,
  safeFilename?: string
) {
  const httpArgs = buildFfmpegHttpArgs(parsedUrl, clientCookies, true);
  const ffArgs = [
    '-hide_banner',
    '-loglevel', 'error',
    ...httpArgs,
    '-i', mediaUrl,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ];

  spawnGuardedFfmpegStream({
    ffArgs,
    res,
    req,
    contentType: 'video/mp4',
    cleanAsciiFilename,
    safeFilename,
  });
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const rateLimiter = new RateLimiter();

  // Basic middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global Security & Frame Protection Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.googleusercontent.com; base-uri 'self'; object-src 'none'; form-action 'self'"
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Authorization, Range, Cookie, X-Cookies, X-Security-Cookie, Mcp-Session-Id, MCP-Protocol-Version'
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Expected-Bytes, Retry-After, Mcp-Session-Id'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // SEO & Google Search Console Support Routes
  const resolvePublicOrigin = (req: Request): string => {
    const rawHost =
      (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
      (req.get('host') || '').trim();
    if (rawHost) {
      const isLoopback = /^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/i.test(rawHost);
      const rawProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
      const proto = isLoopback ? 'http' : rawProto;
      return `${proto}://${rawHost}`;
    }
    const envUrl = (process.env.SHARED_APP_URL || process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
    return 'https://ais-pre-gcwc4scgts426qmkyughvs-721143561104.europe-west2.run.app';
  };

  app.get('/robots.txt', (req: Request, res: Response) => {
    const origin = resolvePublicOrigin(req);
    res
      .type('text/plain')
      .send(
        `User-agent: *\nAllow: /\nAllow: /api$\nAllow: /llms.txt\nAllow: /llms-full.txt\nAllow: /openapi.json\nAllow: /.well-known/\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`
      );
  });

  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const origin = resolvePublicOrigin(req);
    const urls = [
      { loc: `${origin}/`, lastmod: '2026-11-20', changefreq: 'weekly', priority: '1.0' },
      ...SEO_PAGES.map((p) => ({
        loc: `${origin}${p.path}`,
        lastmod: p.lastmod,
        changefreq: p.changefreq,
        priority: p.priority,
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n')}\n</urlset>\n`;
    res.type('application/xml').send(xml);
  });

  // Google Search Console HTML file verification (direct token + optional env override)
  app.get('/google7e9d578fe3b1d175.html', (_req: Request, res: Response) => {
    res.type('text/html').send('google-site-verification: google7e9d578fe3b1d175.html');
  });

  app.get(/^\/google([a-zA-Z0-9_-]{8,64})\.html$/, (req: Request, res: Response, next) => {
    const configured = (process.env.GOOGLE_SITE_VERIFICATION || '').trim().replace(/^google/, '').replace(/\.html$/, '');
    const requestedToken = req.params[0];
    if (configured && requestedToken === configured) {
      res.type('text/html').send(`google-site-verification: google${configured}.html`);
      return;
    }
    next();
  });

  // AI Agent Discovery & Machine-Readable Specifications
  app.get('/llms.txt', (req: Request, res: Response) => {
    res.type('text/plain; charset=utf-8').send(buildLlmsTxt(resolvePublicOrigin(req)));
  });

  app.get('/llms-full.txt', (req: Request, res: Response) => {
    res.type('text/plain; charset=utf-8').send(buildLlmsFullTxt(resolvePublicOrigin(req)));
  });

  app.get('/openapi.json', (req: Request, res: Response) => {
    res.json(buildOpenApiSpec(resolvePublicOrigin(req)));
  });

  app.get('/.well-known/mcp.json', (req: Request, res: Response) => {
    res.json(buildMcpManifest(resolvePublicOrigin(req)));
  });

  app.get('/.well-known/agent.json', (req: Request, res: Response) => {
    res.json(buildAgentCard(resolvePublicOrigin(req)));
  });

  app.get('/.well-known/ai-plugin.json', (req: Request, res: Response) => {
    res.json(buildAiPluginManifest(resolvePublicOrigin(req)));
  });

  // Model Context Protocol (MCP) Streamable HTTP + JSON-RPC 2.0 + SSE Server
  // Note: GET /mcp negotiates HTML documentation for browsers/crawlers vs SSE/JSON for MCP clients.
  const mcpHandlers = createMcpHandlers(resolvePublicOrigin, PORT);
  app.get('/mcp', (req: Request, res: Response, next) => {
    const accept = (req.headers.accept || '').toLowerCase();
    const wantsSse = accept.includes('text/event-stream');
    const wantsHtml = accept.includes('text/html');
    if (wantsHtml && !wantsSse) {
      next();
      return;
    }
    mcpHandlers.handleGet(req, res);
  });
  app.post('/mcp', rateLimiter.middleware(), mcpHandlers.handlePost);
  app.delete('/mcp', mcpHandlers.handleDelete);

  // Apply rate limiter on API routes
  app.use('/api', rateLimiter.middleware());

  app.get('/api/mcp', mcpHandlers.handleGet);
  app.post('/api/mcp', mcpHandlers.handlePost);
  app.delete('/api/mcp', mcpHandlers.handleDelete);

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    const origin = resolvePublicOrigin(req);
    res.json({
      status: 'ok',
      service: 'WuKong-Vid Core',
      version: '1.2.0',
      supportedPlatforms: ['tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'vimeo', 'direct_media'],
      excludedPlatforms: ['youtube'],
      supportedQualities: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
      mcpEndpoint: `${origin}/mcp`,
      agentDocs: {
        llmsTxt: `${origin}/llms.txt`,
        llmsFullTxt: `${origin}/llms-full.txt`,
        openApi: `${origin}/openapi.json`,
        mcpManifest: `${origin}/.well-known/mcp.json`,
        agentCard: `${origin}/.well-known/agent.json`,
        quickDownload: `${origin}/api/quick-download`,
        batchAnalyze: `${origin}/api/batch-analyze`,
      },
      limits: {
        maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 500,
        rateLimitPerMinute: Number(process.env.RATE_LIMIT_REQUESTS) || 180,
      },
    });
  });

  // Media analysis endpoint (includes direct downloadUrl, previewUrl, and quickLinks map for AI agents)
  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const { url, cookies, preferred_quality } = req.body || {};
      const clientCookies =
        cookies ||
        (req.headers['x-cookies'] as string) ||
        (req.headers['x-security-cookie'] as string) ||
        (req.headers['cookie'] as string) ||
        undefined;

      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'URL parameter is required.' });
        return;
      }

      // Security SSRF check
      const validation = await validateSafeUrl(url);
      if (!validation.safe) {
        res.status(400).json({ error: validation.error || 'Invalid or forbidden URL.' });
        return;
      }

      const result = await adapterManager.extract(url, clientCookies);
      if (!result.success || !result.data) {
        res.status(result.statusCode || 400).json({
          error: result.error || 'Failed to extract media details.',
        });
        return;
      }

      const origin = resolvePublicOrigin(req);
      const preferred = typeof preferred_quality === 'string' ? preferred_quality : '1080p';
      const meta = result.data;
      const quickLinks = buildQuickLinksMap(origin, url, meta.title, meta.qualities, preferred);
      const enrichedQualities = meta.qualities.map((q) => ({
        ...q,
        ...buildQualityDownloadLinks(origin, meta.title, q),
      }));
      const recommended = selectRecommendedQuality(meta.qualities, preferred);

      res.json({
        ...meta,
        quickLinks,
        oneStepDownloadUrl: quickLinks.oneStep,
        recommended: recommended
          ? {
              ...recommended,
              ...buildQualityDownloadLinks(origin, meta.title, recommended),
            }
          : undefined,
        qualities: enrichedQualities,
      });
    } catch (err: any) {
      console.error('Analyze error:', err);
      res.status(500).json({ error: 'An error occurred while analyzing the media link.' });
    }
  });

  // Fast concurrent batch analysis endpoint (up to 10 public URLs in one request)
  app.post('/api/batch-analyze', async (req: Request, res: Response) => {
    try {
      const rawUrls = Array.isArray(req.body?.urls)
        ? req.body.urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];
      if (rawUrls.length === 0) {
        res.status(400).json({ error: 'Provide 1 to 10 public URLs in urls array.' });
        return;
      }

      const origin = resolvePublicOrigin(req);
      const preferred = typeof req.body?.preferred_quality === 'string' ? req.body.preferred_quality : '1080p';
      const cookies =
        (typeof req.body?.cookies === 'string' ? req.body.cookies : undefined) ||
        (req.headers['x-cookies'] as string) ||
        undefined;
      const urls = rawUrls.slice(0, 10);

      const results = await Promise.all(
        urls.map(async (rawUrl: string) => {
          const cleanUrl = rawUrl.trim();
          const validation = await validateSafeUrl(cleanUrl);
          if (!validation.safe) {
            return { url: cleanUrl, success: false, error: validation.error || 'Forbidden URL' };
          }
          const extracted = await adapterManager.extract(cleanUrl, cookies);
          if (!extracted.success || !extracted.data) {
            return { url: cleanUrl, success: false, error: extracted.error || 'Extraction failed' };
          }
          const meta = extracted.data;
          const quickLinks = buildQuickLinksMap(origin, cleanUrl, meta.title, meta.qualities, preferred);
          const rec = selectRecommendedQuality(meta.qualities, preferred);
          return {
            url: cleanUrl,
            success: true,
            platform: meta.platform,
            title: meta.title,
            durationFormatted: meta.durationFormatted,
            quickLinks,
            recommended: rec
              ? { id: rec.id, label: rec.label, format: rec.format, ...buildQualityDownloadLinks(origin, meta.title, rec) }
              : undefined,
            qualitiesCount: meta.qualities.length,
          };
        })
      );

      res.json({
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        results,
      });
    } catch (err: any) {
      console.error('Batch analyze error:', err);
      res.status(500).json({ error: 'An error occurred while batch analyzing links.' });
    }
  });

  // Media preview proxy endpoint (with live video+audio muxing & CORS handling)
  app.get('/api/proxy-media', async (req: Request, res: Response) => {
    try {
      const mediaUrl = req.query.url as string;
      const audioUrl = (req.query.audioUrl as string) || '';
      const rawFormat = (req.query.format as string) || 'mp4';
      const format = sanitizeMediaFormat(rawFormat);

      if (!mediaUrl || !format) {
        res.status(400).send('Invalid media URL or format');
        return;
      }

      const validation = await validateSafeUrl(mediaUrl);
      if (!validation.safe || !validateFfmpegRemoteUrl(mediaUrl)) {
        res.status(400).send('Forbidden media address');
        return;
      }

      const clientCookies =
        (req.headers['x-cookies'] as string) ||
        (req.headers['x-security-cookie'] as string) ||
        (req.headers['cookie'] as string) ||
        undefined;
      const parsedMediaUrl = new URL(mediaUrl);

      // If separate audioUrl is provided, mux audio and video in real-time with FFmpeg
      if (audioUrl && audioUrl !== mediaUrl) {
        const audioValidation = await validateSafeUrl(audioUrl);
        if (!audioValidation.safe || !validateFfmpegRemoteUrl(audioUrl)) {
          res.status(400).send('Forbidden audio address');
          return;
        }

        const parsedAudioUrl = new URL(audioUrl);
        const videoHttpArgs = buildFfmpegHttpArgs(parsedMediaUrl, clientCookies, isHlsStreamUrl(mediaUrl));
        const audioHttpArgs = buildFfmpegHttpArgs(parsedAudioUrl, clientCookies, isHlsStreamUrl(audioUrl));

        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          ...videoHttpArgs,
          '-i', mediaUrl,
          ...audioHttpArgs,
          '-i', audioUrl,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          'pipe:1',
        ];

        spawnGuardedFfmpegStream({
          ffArgs,
          res,
          req,
          contentType: 'video/mp4',
        });
        return;
      }

      // If format is MP3 or M4A, stream direct native MP3 or transcode audio in real-time
      if (format === 'mp3' || format === 'm4a') {
        const previewBitrate = sanitizeAudioBitrate(
          req.query.bitrate as string | undefined,
          format === 'm4a' ? '256k' : '320k'
        );
        const upstreamHeaders = buildUpstreamHeaders(parsedMediaUrl, clientCookies);
        const isHls = isHlsStreamUrl(mediaUrl);

        if (format === 'mp3' && previewBitrate === '320k' && !isHls && (parsedMediaUrl.pathname.toLowerCase().endsWith('.mp3') || mediaUrl.includes('mime_type=audio_mpeg'))) {
          try {
            const { response: directAudio } = await safeFetch(mediaUrl, { headers: upstreamHeaders });
            const ct = (directAudio.headers.get('content-type') || '').toLowerCase();
            if (directAudio.ok && directAudio.body && ct.includes('audio/')) {
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('X-Content-Type-Options', 'nosniff');
              const len = directAudio.headers.get('content-length');
              if (len) res.setHeader('Content-Length', len);
              const stream = Readable.fromWeb(directAudio.body as any);
              req.on('close', () => stream.destroy());
              stream.pipe(res);
              return;
            }
          } catch {}
        }

        const httpArgs = buildFfmpegHttpArgs(parsedMediaUrl, clientCookies, isHls);
        const ffArgs =
          format === 'm4a'
            ? [
                '-hide_banner',
                '-loglevel', 'error',
                ...httpArgs,
                '-i', mediaUrl,
                '-vn',
                '-map', '0:a:0',
                '-c:a', 'aac',
                '-b:a', previewBitrate,
                '-ar', '44100',
                '-ac', '2',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                '-f', 'mp4',
                'pipe:1',
              ]
            : [
                '-hide_banner',
                '-loglevel', 'error',
                ...httpArgs,
                '-i', mediaUrl,
                '-vn',
                '-map', '0:a:0',
                '-c:a', 'libmp3lame',
                '-b:a', previewBitrate,
                '-ar', '44100',
                '-ac', '2',
                '-f', 'mp3',
                'pipe:1',
              ];

        spawnGuardedFfmpegStream({
          ffArgs,
          res,
          req,
          contentType: format === 'm4a' ? 'audio/mp4' : 'audio/mpeg',
        });
        return;
      }

      // HLS (.m3u8) live remux to fragmented MP4 for HTML5 <video> compatibility
      const upstreamHeaders = buildUpstreamHeaders(parsedMediaUrl, clientCookies);
      upstreamHeaders['Accept-Encoding'] = 'identity';

      if (isHlsStreamUrl(mediaUrl)) {
        spawnHlsToMp4Remux(mediaUrl, res, req, parsedMediaUrl, clientCookies);
        return;
      }

      // Direct single stream streaming
      const isAudio = parsedMediaUrl.pathname.endsWith('.mp3');
      const isWebm = parsedMediaUrl.pathname.endsWith('.webm');

      if (req.headers.range) {
        upstreamHeaders['Range'] = req.headers.range;
      }

      const { response: remoteRes } = await safeFetch(mediaUrl, {
        headers: upstreamHeaders,
      });

      if (!remoteRes.ok && remoteRes.status !== 206) {
        res.status(remoteRes.status).send('Upstream media stream unavailable');
        return;
      }

      const rawType = (remoteRes.headers.get('content-type') || '').toLowerCase();
      if (rawType.includes('mpegurl') || rawType.includes('m3u8')) {
        spawnHlsToMp4Remux(mediaUrl, res, req, parsedMediaUrl, clientCookies);
        return;
      }

      res.status(remoteRes.status);

      let finalContentType = rawType;
      if (
        !finalContentType ||
        finalContentType === 'application/octet-stream' ||
        finalContentType.includes('text/html') ||
        finalContentType.includes('text/plain')
      ) {
        finalContentType = isAudio ? 'audio/mpeg' : isWebm ? 'video/webm' : 'video/mp4';
      }

      res.setHeader('Content-Type', finalContentType);
      res.setHeader('Access-Control-Allow-Origin', '*');

      const contentLength = remoteRes.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const acceptRanges = remoteRes.headers.get('accept-ranges') || 'bytes';
      res.setHeader('Accept-Ranges', acceptRanges);

      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (req.method === 'HEAD' || !remoteRes.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(remoteRes.body as any);
      nodeStream.on('error', () => {
        res.end();
      });
      res.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err: any) {
      console.warn('Proxy media error:', err?.message);
      if (!res.headersSent) {
        res.status(500).send('Proxy error');
      }
    }
  });

  // Shared secure download streamer (used by both /api/download and 1-step /api/quick-download)
  const streamMediaDownload = async (options: {
    req: Request;
    res: Response;
    mediaUrl: string;
    audioUrl?: string;
    rawFilename?: string;
    rawFormat?: string;
    rawBitrate?: string;
    rawScaleHeight?: string;
    fileSizeBytes?: string;
  }) => {
    const {
      req,
      res,
      mediaUrl,
      audioUrl = '',
      rawFilename = 'wukong_vid_media.mp4',
      rawFormat = 'mp4',
      rawBitrate,
      rawScaleHeight,
      fileSizeBytes = '',
    } = options;
    try {
      const format = sanitizeMediaFormat(rawFormat);
      const bitrate = sanitizeAudioBitrate(
        rawBitrate,
        format === 'm4a' ? '256k' : '320k'
      );
      const scaleHeight = sanitizeVideoHeight(rawScaleHeight);

      if (!mediaUrl) {
        res.status(400).json({ error: 'Missing target media URL.' });
        return;
      }

      if (!format) {
        res.status(400).json({ error: 'Unsupported or forbidden container format.' });
        return;
      }

      const validation = await validateSafeUrl(mediaUrl);
      if (!validation.safe || !validateFfmpegRemoteUrl(mediaUrl)) {
        res.status(400).json({ error: validation.error || 'Target URL is not permitted.' });
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, X-Expected-Bytes, Content-Disposition');
      if (fileSizeBytes && /^\d+$/.test(fileSizeBytes)) {
        res.setHeader('X-Expected-Bytes', fileSizeBytes);
      }

      const safeFilename = sanitizeFilename(rawFilename, format);
      const cleanAsciiFilename = safeFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const parsedUrl = new URL(mediaUrl);
      const clientCookies =
        (req.headers['x-cookies'] as string) ||
        (req.headers['x-security-cookie'] as string) ||
        (req.headers['cookie'] as string) ||
        undefined;
      const upstreamHeaders = buildUpstreamHeaders(parsedUrl, clientCookies);
      upstreamHeaders['Accept-Encoding'] = 'identity';

      // 1. Audio Download: MP3 (320k/192k/128k) OR M4A AAC (256k)
      if (format === 'mp3' || format === 'm4a') {
        const isHls = isHlsStreamUrl(mediaUrl);
        const looksDirectMp3 =
          format === 'mp3' &&
          bitrate === '320k' &&
          !isHls &&
          (parsedUrl.pathname.toLowerCase().endsWith('.mp3') ||
            mediaUrl.toLowerCase().includes('mime_type=audio_mpeg') ||
            mediaUrl.toLowerCase().includes('audio/mpeg'));

        if (looksDirectMp3) {
          try {
            const { response: directAudioRes } = await safeFetch(mediaUrl, {
              headers: upstreamHeaders,
            });
            const directType = (directAudioRes.headers.get('content-type') || '').toLowerCase();
            if (
              directAudioRes.ok &&
              directAudioRes.body &&
              (directType.includes('audio/') || directType === 'application/octet-stream')
            ) {
              sendAttachmentHeaders(res, 'audio/mpeg', cleanAsciiFilename, safeFilename);
              const contentLength = directAudioRes.headers.get('content-length');
              if (contentLength) {
                res.setHeader('Content-Length', contentLength);
              }
              const audioStream = Readable.fromWeb(directAudioRes.body as any);
              audioStream.on('error', () => {
                if (!res.headersSent) res.status(502).json({ error: 'Audio stream interrupted.' });
                else res.end();
              });
              req.on('close', () => audioStream.destroy());
              audioStream.pipe(res);
              return;
            }
          } catch (directMp3Err) {
            console.warn('Direct MP3 pass-through fallback notice:', directMp3Err);
          }
        }

        const httpArgs = buildFfmpegHttpArgs(parsedUrl, clientCookies, isHls);
        const ffArgs =
          format === 'm4a'
            ? [
                '-hide_banner',
                '-loglevel', 'error',
                '-threads', '0',
                ...httpArgs,
                '-i', mediaUrl,
                '-vn', '-sn', '-dn',
                '-map', '0:a:0',
                '-c:a', 'aac',
                '-b:a', bitrate,
                '-ar', '44100',
                '-ac', '2',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                '-f', 'mp4',
                'pipe:1',
              ]
            : [
                '-hide_banner',
                '-loglevel', 'error',
                '-threads', '0',
                ...httpArgs,
                '-i', mediaUrl,
                '-vn', '-sn', '-dn',
                '-map', '0:a:0',
                '-c:a', 'libmp3lame',
                '-b:a', bitrate,
                '-ar', '44100',
                '-ac', '2',
                '-id3v2_version', '3',
                '-write_xing', '1',
                '-f', 'mp3',
                'pipe:1',
              ];

        spawnGuardedFfmpegStream({
          ffArgs,
          res,
          req,
          contentType: format === 'm4a' ? 'audio/mp4' : 'audio/mpeg',
          cleanAsciiFilename,
          safeFilename,
          onEmptyFailure: async (stderrLog) => {
            if (
              stderrLog.includes('does not contain any stream') ||
              stderrLog.includes('matches no streams')
            ) {
              if (!res.headersSent) {
                res.status(422).json({ error: `This video has no audio track to convert to ${format.toUpperCase()}.` });
              }
              return;
            }
            await transcodeAudioViaTempFallback({
              mediaUrl,
              upstreamHeaders,
              res,
              req,
              cleanAsciiFilename,
              safeFilename,
              format,
              bitrate,
            });
          },
        });
        return;
      }

      // 2. Separate Video + Audio Muxing (for 4K, 1440p, 1080p, 720p, or scaled compact MP4)
      if (audioUrl && audioUrl !== mediaUrl) {
        const audioValidation = await validateSafeUrl(audioUrl);
        if (!audioValidation.safe || !validateFfmpegRemoteUrl(audioUrl)) {
          res.status(400).json({ error: 'Audio source address is invalid.' });
          return;
        }

        const parsedAudioUrl = new URL(audioUrl);
        const videoHttpArgs = buildFfmpegHttpArgs(parsedUrl, clientCookies, isHlsStreamUrl(mediaUrl));
        const audioHttpArgs = buildFfmpegHttpArgs(parsedAudioUrl, clientCookies, isHlsStreamUrl(audioUrl));

        const scaleArgs =
          scaleHeight && scaleHeight < 1080
            ? [
                '-vf',
                `scale=w='if(gt(iw,ih),-2,trunc(min(iw,${scaleHeight})/2)*2)':h='if(gt(iw,ih),trunc(min(ih,${scaleHeight})/2)*2,-2)'`,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'veryfast',
                '-crf', scaleHeight <= 360 ? '30' : '28',
                '-maxrate', scaleHeight <= 360 ? '360k' : '620k',
                '-bufsize', scaleHeight <= 360 ? '720k' : '1240k',
                '-threads', '0',
              ]
            : ['-c:v', 'copy'];

        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          ...videoHttpArgs,
          '-i', mediaUrl,
          ...audioHttpArgs,
          '-i', audioUrl,
          ...scaleArgs,
          '-c:a', 'aac',
          '-b:a', scaleHeight && scaleHeight <= 360 ? '96k' : scaleHeight && scaleHeight <= 480 ? '128k' : '192k',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          'pipe:1',
        ];

        spawnGuardedFfmpegStream({
          ffArgs,
          res,
          req,
          contentType: 'video/mp4',
          cleanAsciiFilename,
          safeFilename,
        });
        return;
      }

      // 3. Scaled Compact MP4 Transcoding (480p SD / 360p Mobile Saver / 720p when requested on single-stream sources)
      if (scaleHeight && scaleHeight <= 720) {
        const httpArgs = buildFfmpegHttpArgs(parsedUrl, clientCookies, isHlsStreamUrl(mediaUrl));
        const maxRate = scaleHeight <= 360 ? '360k' : scaleHeight <= 480 ? '620k' : '1300k';
        const bufSize = scaleHeight <= 360 ? '720k' : scaleHeight <= 480 ? '1240k' : '2600k';
        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          '-threads', '0',
          ...httpArgs,
          '-i', mediaUrl,
          '-vf',
          `scale=w='if(gt(iw,ih),-2,trunc(min(iw,${scaleHeight})/2)*2)':h='if(gt(iw,ih),trunc(min(ih,${scaleHeight})/2)*2,-2)'`,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'veryfast',
          '-crf', scaleHeight <= 360 ? '30' : scaleHeight <= 480 ? '28' : '26',
          '-maxrate', maxRate,
          '-bufsize', bufSize,
          '-c:a', 'aac',
          '-b:a', scaleHeight <= 360 ? '96k' : scaleHeight <= 480 ? '128k' : '160k',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          'pipe:1',
        ];

        spawnGuardedFfmpegStream({
          ffArgs,
          res,
          req,
          contentType: 'video/mp4',
          cleanAsciiFilename,
          safeFilename,
        });
        return;
      }

      // 4. HLS (.m3u8) -> Playable MP4 Remux Download
      if (isHlsStreamUrl(mediaUrl)) {
        spawnHlsToMp4Remux(
          mediaUrl,
          res,
          req,
          parsedUrl,
          clientCookies,
          cleanAsciiFilename,
          safeFilename
        );
        return;
      }

      // 5. Direct Progressive Video Stream Pass-Through (with hop-by-hop safeFetch SSRF validation)
      let remoteRes!: globalThis.Response;
      let lastFetchErr: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await safeFetch(mediaUrl, {
            headers: upstreamHeaders,
            signal: AbortSignal.timeout(attempt === 0 ? 8500 : 12000),
          });
          remoteRes = result.response;
          lastFetchErr = null;
          break;
        } catch (fetchErr: any) {
          lastFetchErr = fetchErr;
          if (req.destroyed || req.socket?.destroyed) break;
        }
      }
      if (lastFetchErr) {
        throw lastFetchErr;
      }

      if (remoteRes.status === 401 || remoteRes.status === 403) {
        await remoteRes.body?.cancel().catch(() => {});
        const retryResult = await safeFetch(mediaUrl, {
          headers: {
            'User-Agent': upstreamHeaders['User-Agent'],
            Accept: '*/*',
          },
          signal: AbortSignal.timeout(12000),
        });
        remoteRes = retryResult.response;
      }

      if (!remoteRes.ok) {
        res.status(remoteRes.status).json({ error: `Upstream source returned HTTP ${remoteRes.status}. The media stream may have expired.` });
        return;
      }

      const upstreamContentType = (remoteRes.headers.get('content-type') || '').toLowerCase();
      if (upstreamContentType.includes('mpegurl') || upstreamContentType.includes('m3u8')) {
        spawnHlsToMp4Remux(
          mediaUrl,
          res,
          req,
          parsedUrl,
          clientCookies,
          cleanAsciiFilename,
          safeFilename
        );
        return;
      }

      if (upstreamContentType.includes('text/html') || upstreamContentType.includes('text/plain') || upstreamContentType.includes('application/json')) {
        res.status(403).json({ error: 'Upstream platform returned an HTML web page instead of media stream. Please verify the video is public or re-analyze.' });
        return;
      }

      const contentType = format === 'webm' ? 'video/webm' : 'video/mp4';
      const contentLength = remoteRes.headers.get('content-length');

      sendAttachmentHeaders(res, contentType, cleanAsciiFilename, safeFilename);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      if (!remoteRes.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(remoteRes.body as any);
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream interrupted during download.' });
        } else {
          res.end();
        }
      });
      res.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err: any) {
      console.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Failed to process download stream.' });
      }
    }
  };

  // Secure download streaming endpoint (multi-resolution MP4 + multi-bitrate MP3/M4A + safeFetch SSRF redirect guard)
  app.get('/api/download', async (req: Request, res: Response) => {
    await streamMediaDownload({
      req,
      res,
      mediaUrl: req.query.url as string,
      audioUrl: (req.query.audioUrl as string) || '',
      rawFilename: (req.query.filename as string) || 'wukong_vid_media.mp4',
      rawFormat: (req.query.format as string) || 'mp4',
      rawBitrate: req.query.bitrate as string | undefined,
      rawScaleHeight: req.query.scaleHeight as string | undefined,
      fileSizeBytes: (req.query.fileSizeBytes as string) || '',
    });
  });

  // 1-Step Extract & Stream endpoint for AI agents and direct downloads (zero round-trips)
  app.get('/api/quick-download', async (req: Request, res: Response) => {
    try {
      const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      const quality = typeof req.query.quality === 'string' ? req.query.quality.trim() : '1080p';
      const customFilename = typeof req.query.filename === 'string' ? req.query.filename.trim() : '';

      if (!targetUrl) {
        res.status(400).json({ error: 'Missing required url query parameter.' });
        return;
      }

      const validation = await validateSafeUrl(targetUrl);
      if (!validation.safe) {
        res.status(400).json({ error: validation.error || 'Target URL is not permitted.' });
        return;
      }

      const clientCookies =
        (req.headers['x-cookies'] as string) ||
        (req.headers['x-security-cookie'] as string) ||
        (req.headers['cookie'] as string) ||
        undefined;

      const extracted = await adapterManager.extract(targetUrl, clientCookies);
      if (!extracted.success || !extracted.data || extracted.data.qualities.length === 0) {
        res.status(extracted.statusCode || 400).json({
          error: extracted.error || 'Could not extract media stream from URL.',
        });
        return;
      }

      const meta = extracted.data;
      const chosen = selectRecommendedQuality(meta.qualities, quality) || meta.qualities[0];
      const baseFilename = customFilename || meta.title || 'wukong_vid_media';

      await streamMediaDownload({
        req,
        res,
        mediaUrl: chosen.url,
        audioUrl: chosen.audioUrl,
        rawFilename: baseFilename,
        rawFormat: chosen.format,
        rawBitrate: chosen.bitrateKbps ? `${chosen.bitrateKbps}k` : undefined,
        rawScaleHeight:
          chosen.format === 'mp4' && chosen.targetHeight && chosen.targetHeight <= 720 && !chosen.isNative
            ? String(chosen.targetHeight)
            : undefined,
        fileSizeBytes: chosen.fileSizeBytes ? String(chosen.fileSizeBytes) : '',
      });
    } catch (err: any) {
      console.error('Quick download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Quick download failed.' });
      }
    }
  });

  // AI Endpoint: Deep Media Analysis
  app.post('/api/ai/analyze', async (req: Request, res: Response) => {
    try {
      const { title, description, platform, authorName } = req.body || {};
      if (title && (typeof title !== 'string' || title.length > 500)) {
        res.status(400).json({ error: 'Invalid title parameter.' });
        return;
      }
      const result = await analyzeMediaContent({
        title: (typeof title === 'string' ? title.slice(0, 300) : '') || 'Social Video',
        description: typeof description === 'string' ? description.slice(0, 2000) : undefined,
        platform: (typeof platform === 'string' ? platform.slice(0, 50) : '') || 'Social Media',
        authorName: typeof authorName === 'string' ? authorName.slice(0, 120) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      console.error('AI analyze endpoint error:', err);
      res.status(500).json({ error: 'AI analysis failed' });
    }
  });

  // AI Endpoint: Fast Viral Hashtags & SEO
  app.post('/api/ai/fast-tags', async (req: Request, res: Response) => {
    try {
      const { title, platform } = req.body || {};
      if (title !== undefined && (typeof title !== 'string' || title.length > 500)) {
        res.status(400).json({ error: 'Invalid title parameter.' });
        return;
      }
      if (platform !== undefined && (typeof platform !== 'string' || platform.length > 100)) {
        res.status(400).json({ error: 'Invalid platform parameter.' });
        return;
      }
      const result = await generateFastTags(
        (typeof title === 'string' ? title.slice(0, 300) : '') || 'Video',
        (typeof platform === 'string' ? platform.slice(0, 50) : '') || 'Video'
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Fast tags generation failed' });
    }
  });

  // AI Endpoint: Google Search Grounding Context
  app.post('/api/ai/search-context', async (req: Request, res: Response) => {
    try {
      const { query } = req.body || {};
      if (!query || typeof query !== 'string' || query.length > 300) {
        res.status(400).json({ error: 'Valid query parameter required (max 300 chars).' });
        return;
      }
      const result = await searchVideoContext(query.trim());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Search grounding failed' });
    }
  });

  // Live Security Penetration & Policy Verification Suite (14 real checks)
  app.get('/api/test-security', async (req: Request, res: Response) => {
    const baseUrl = `http://127.0.0.1:${PORT}`;
    const checks: Array<{
      id: string;
      name: string;
      category: string;
      passed: boolean;
      details: string;
    }> = [];

    // 1. SSRF IPv4 Loopback & Unspecified
    const v4Loop = await Promise.all([
      validateSafeUrl('http://127.0.0.1:8080/secret'),
      validateSafeUrl('http://0.0.0.0:3000/'),
      validateSafeUrl('http://localhost/admin'),
    ]);
    checks.push({
      id: 'sec_ssrf_v4_loop',
      name: 'SSRF Block: IPv4 Loopback & Localhost',
      category: 'SSRF Firewall',
      passed: v4Loop.every((r) => !r.safe),
      details: 'Blocked 127.0.0.1, 0.0.0.0, localhost',
    });

    // 2. SSRF IPv6 Loopback [::1], IPv4-mapped, ULA (AWS IPv6 IMDS)
    const v6Loop = await Promise.all([
      validateSafeUrl('http://[::1]:3000/api/health'),
      validateSafeUrl('http://[::ffff:127.0.0.1]/'),
      validateSafeUrl('http://[::ffff:7f00:1]/'),
      validateSafeUrl('http://[fd00:ec2::254]/latest/meta-data/'),
    ]);
    checks.push({
      id: 'sec_ssrf_v6',
      name: 'SSRF Block: IPv6 [::1], Mapped Hex & ULA IMDS',
      category: 'SSRF Firewall',
      passed: v6Loop.every((r) => !r.safe),
      details: 'Blocked [::1], [::ffff:127.0.0.1], [::ffff:7f00:1], [fd00:ec2::254]',
    });

    // 3. SSRF Private Subnets & CGNAT
    const rfc1918 = await Promise.all([
      validateSafeUrl('http://10.0.0.1/internal'),
      validateSafeUrl('http://172.16.0.1/router'),
      validateSafeUrl('http://192.168.1.1/admin'),
      validateSafeUrl('http://100.64.1.1/cgnat'),
    ]);
    checks.push({
      id: 'sec_ssrf_rfc1918',
      name: 'SSRF Block: RFC1918 Private Ranges & CGNAT',
      category: 'SSRF Firewall',
      passed: rfc1918.every((r) => !r.safe),
      details: 'Blocked 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10',
    });

    // 4. SSRF Cloud Instance Metadata Endpoints
    const metadata = await Promise.all([
      validateSafeUrl('http://169.254.169.254/latest/meta-data/'),
      validateSafeUrl('http://metadata.google.internal/computeMetadata/v1/'),
    ]);
    checks.push({
      id: 'sec_ssrf_metadata',
      name: 'SSRF Block: AWS/GCP/Azure Cloud Metadata',
      category: 'SSRF Firewall',
      passed: metadata.every((r) => !r.safe),
      details: 'Blocked 169.254.169.254 & metadata.google.internal',
    });

    // 5. Non-HTTP Schemes (file://, gopher://, ftp://)
    const schemes = await Promise.all([
      validateSafeUrl('file:///etc/passwd'),
      validateSafeUrl('gopher://127.0.0.1:6379/_INFO'),
      validateSafeUrl('ftp://example.com/file.mp4'),
    ]);
    checks.push({
      id: 'sec_schemes',
      name: 'Scheme Allowlist: HTTP/HTTPS Only',
      category: 'Protocol Guard',
      passed: schemes.every((r) => !r.safe),
      details: 'Rejected file://, gopher://, ftp://',
    });

    // 6. Embedded URL Credentials & Control Characters
    const credsAndCtrl = await Promise.all([
      validateSafeUrl('https://admin:password@example.com/video.mp4'),
      validateSafeUrl('https://example.com/video.mp4\r\nX-Evil: 1'),
    ]);
    checks.push({
      id: 'sec_userinfo_ctrl',
      name: 'URL Hygiene: Embedded Credentials & Control Chars',
      category: 'Input Validation',
      passed: credsAndCtrl.every((r) => !r.safe),
      details: 'Blocked user:pass@host and CRLF/control bytes',
    });

    // 7. YouTube Exclusion Policy
    const ytChecks = await Promise.all([
      validateSafeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      validateSafeUrl('https://youtu.be/dQw4w9WgXcQ'),
      validateSafeUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    ]);
    checks.push({
      id: 'sec_yt_policy',
      name: 'Platform Policy: YouTube Exclusion Enforced',
      category: 'Policy',
      passed: ytChecks.every((r) => !r.safe),
      details: 'Blocked youtube.com, youtu.be, youtube-nocookie.com',
    });

    // 8. Filename Path Traversal, CRLF & Safe Extension Enforcement
    const badName = sanitizeFilename('../../etc/passwd\r\nSet-Cookie: pwn=1.html', 'mp4');
    const badNamePass =
      !badName.includes('..') &&
      !badName.includes('/') &&
      !badName.includes('\r') &&
      !badName.includes('\n') &&
      badName.endsWith('.mp4');
    checks.push({
      id: 'sec_filename',
      name: 'Filename Sanitization: Traversal, CRLF & Extension',
      category: 'Header Safety',
      passed: badNamePass,
      details: `Sanitized output: ${badName}`,
    });

    // 9. Strict Allowlists for Format, Bitrate & ScaleHeight
    const allowlistOk =
      sanitizeMediaFormat('exe') === null &&
      sanitizeMediaFormat('html') === null &&
      sanitizeMediaFormat('mp3') === 'mp3' &&
      sanitizeMediaFormat('m4a') === 'm4a' &&
      sanitizeAudioBitrate('9999k') === '320k' &&
      sanitizeAudioBitrate('128k') === '128k' &&
      sanitizeVideoHeight('9999') === undefined &&
      sanitizeVideoHeight('480') === 480;
    checks.push({
      id: 'sec_allowlists',
      name: 'Parameter Allowlists: Container, Bitrate & Resolution',
      category: 'Input Validation',
      passed: allowlistOk,
      details: 'Rejected exe/html containers, 9999k bitrate, 9999px height',
    });

    // 10. FFmpeg Argument & Protocol Injection Guard
    const ffmpegGuardOk =
      !validateFfmpegRemoteUrl('-i /etc/passwd') &&
      !validateFfmpegRemoteUrl('https://example.com/a.mp4\n-f rawvideo') &&
      !validateFfmpegRemoteUrl('file:///etc/passwd') &&
      validateFfmpegRemoteUrl('https://cdn.example.com/video.mp4');
    checks.push({
      id: 'sec_ffmpeg',
      name: 'FFmpeg Hardening: Arg Injection & Protocol Whitelist',
      category: 'Media Engine',
      passed: ffmpegGuardOk,
      details: 'Blocked leading-dash flags, newlines, non-HTTP schemes; -nostdin & whitelist active',
    });

    // 11. Cookie CRLF Header Injection Protection
    const cleanCookie = sanitizeCookieHeader('session=ok\r\nX-Injected: evil\0; token=123');
    checks.push({
      id: 'sec_cookie_crlf',
      name: 'Cookie Sanitization: CRLF & Null Byte Stripping',
      category: 'Header Safety',
      passed: !/[\r\n\0]/.test(cleanCookie) && cleanCookie.includes('session=ok'),
      details: `Stripped control bytes: "${cleanCookie}"`,
    });

    // 12. Live HTTP Redirect-SSRF Defense (302 -> http://127.0.0.1)
    let redirectBlocked = false;
    let redirectDetail = '';
    const trapServer = http.createServer((_req, trapRes) => {
      trapRes.writeHead(302, { Location: `http://127.0.0.1:${PORT}/api/health` });
      trapRes.end();
    });
    try {
      await new Promise<void>((resolve) => trapServer.listen(0, '127.0.0.1', resolve));
      const addr = trapServer.address();
      const trapPort = typeof addr === 'object' && addr ? addr.port : 0;
      try {
        await safeFetch(`http://127.0.0.1:${trapPort}/bounce`);
        redirectDetail = 'safeFetch unexpectedly allowed loopback redirect';
      } catch (err: any) {
        redirectBlocked = true;
        redirectDetail = `Blocked redirect trap: ${err?.message || 'SSRF rejected'}`;
      }
    } finally {
      trapServer.close();
    }
    checks.push({
      id: 'sec_redirect_ssrf',
      name: 'Live Redirect-SSRF Guard (safeFetch Hop Check)',
      category: 'SSRF Firewall',
      passed: redirectBlocked,
      details: redirectDetail,
    });

    // 13. Live HTTP Endpoint Exploitation Probes & Security Headers Audit
    let endpointGuardsOk = false;
    let headerAuditDetails = '';
    try {
      const [badFmtRes, badArgRes, badSsrfRes, healthRes] = await Promise.all([
        fetch(`${baseUrl}/api/download?url=${encodeURIComponent('https://www.w3schools.com/html/mov_bbb.mp4')}&format=exe`),
        fetch(`${baseUrl}/api/download?url=${encodeURIComponent('-i /etc/passwd')}&format=mp4`),
        fetch(`${baseUrl}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'http://[::1]:3000/' }),
        }),
        fetch(`${baseUrl}/api/health`),
      ]);

      const csp = healthRes.headers.get('content-security-policy') || '';
      const nosniff = healthRes.headers.get('x-content-type-options') === 'nosniff';
      const refPol = healthRes.headers.get('referrer-policy') === 'no-referrer';
      const noPoweredBy = !healthRes.headers.get('x-powered-by');
      const cspOk = csp.includes('frame-ancestors') && csp.includes("object-src 'none'");

      endpointGuardsOk =
        badFmtRes.status === 400 &&
        badArgRes.status === 400 &&
        badSsrfRes.status === 400 &&
        healthRes.status === 200 &&
        nosniff &&
        refPol &&
        noPoweredBy &&
        cspOk;

      headerAuditDetails = `HTTP statuses: format=exe->${badFmtRes.status}, flag->${badArgRes.status}, ipv6->${badSsrfRes.status}; headers: nosniff=${nosniff}, referrer=${refPol}, csp=${cspOk}, noXPB=${noPoweredBy}`;
    } catch (err: any) {
      headerAuditDetails = err?.message || 'HTTP probe error';
    }
    checks.push({
      id: 'sec_http_probes',
      name: 'Live HTTP Penetration Probes & Security Headers',
      category: 'HTTP Defense',
      passed: endpointGuardsOk,
      details: headerAuditDetails,
    });

    // 14. Bounded Rate Limiter Stress Check
    const testLimiter = new RateLimiter(2, 60000, 5);
    const fakeReq = (ip: string) =>
      ({
        ip,
        headers: {},
        socket: { remoteAddress: ip },
      }) as unknown as Request;
    const dummyRes = () =>
      ({
        headers: {} as Record<string, string>,
        statusCode: 200,
        setHeader(k: string, v: string) {
          this.headers[k] = v;
        },
        status(c: number) {
          this.statusCode = c;
          return this;
        },
        json() {
          return this;
        },
      }) as any;

    const mw = testLimiter.middleware();
    let passedCount = 0;
    const r1 = dummyRes();
    mw(fakeReq('1.1.1.1'), r1, () => { passedCount++; });
    mw(fakeReq('1.1.1.1'), r1, () => { passedCount++; });
    const r3 = dummyRes();
    mw(fakeReq('1.1.1.1'), r3, () => { passedCount++; });
    // Populate past maxTrackedIps (5) to ensure eviction bounds map size
    for (let i = 0; i < 10; i++) {
      mw(fakeReq(`2.2.2.${i}`), dummyRes(), () => {});
    }
    const rateLimiterOk = passedCount === 2 && r3.statusCode === 429 && Boolean(r3.headers['Retry-After']);
    checks.push({
      id: 'sec_rate_limiter',
      name: 'Rate Limiter: 429 Quota, Retry-After & Bounded Eviction',
      category: 'Abuse Control',
      passed: rateLimiterOk,
      details: `Allowed 2/2, blocked 3rd with HTTP ${r3.statusCode} (Retry-After: ${r3.headers['Retry-After']}s)`,
    });

    const passedTotal = checks.filter((c) => c.passed).length;
    res.json({
      timestamp: new Date().toISOString(),
      allPassed: passedTotal === checks.length,
      summary: {
        total: checks.length,
        passed: passedTotal,
        failed: checks.length - passedTotal,
      },
      results: checks,
    });
  });

  // Automated System Diagnostics & Verification Suite
  app.get('/api/test-suite', async (req: Request, res: Response) => {
    const tests = [];

    // Test 1: SSRF Protection for Localhost & IPv6 [::1]
    const [localhostTest, ipv6Test] = await Promise.all([
      validateSafeUrl('http://127.0.0.1:8080/secret'),
      validateSafeUrl('http://[::1]:3000/api/health'),
    ]);
    tests.push({
      name: 'SSRF Protection (127.0.0.1 & IPv6 [::1])',
      passed: !localhostTest.safe && !ipv6Test.safe,
      details: 'Both IPv4 & bracketed IPv6 loopback blocked',
    });

    // Test 2: SSRF Protection for Private IP & Cloud Metadata
    const [privateIpTest, metadataTest] = await Promise.all([
      validateSafeUrl('http://192.168.1.1/admin'),
      validateSafeUrl('http://169.254.169.254/latest/meta-data/'),
    ]);
    tests.push({
      name: 'SSRF Protection (RFC1918 & Cloud Metadata)',
      passed: !privateIpTest.safe && !metadataTest.safe,
      details: 'Blocked 192.168.x and 169.254.169.254 metadata',
    });

    // Test 3: YouTube Exclusion Policy
    const ytTest = await validateSafeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    tests.push({
      name: 'YouTube Exclusion Policy Enforced',
      passed: !ytTest.safe,
      details: ytTest.error || 'Excluded as required',
    });

    // Test 4: Path Traversal, CRLF & Format Allowlist Protection
    const filenameTest = sanitizeFilename('../../../etc/passwd\r\nEvil: 1', 'mp4');
    tests.push({
      name: 'Filename Path Traversal, CRLF & Format Allowlist',
      passed:
        !filenameTest.includes('..') &&
        !filenameTest.includes('/') &&
        sanitizeMediaFormat('exe') === null,
      details: `Sanitized to: ${filenameTest}`,
    });

    // Test 5: Direct Media Adapter URL Detection
    const sampleDirect = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    const directDetect = adapterManager.detectPlatform(sampleDirect);
    tests.push({
      name: 'Direct Media URL Recognition',
      passed: directDetect === 'direct',
      details: `Detected platform: ${directDetect}`,
    });

    // Test 6: Temp Storage Directory Health
    const tempTest = tempManager.getTempFilePath('mp4');
    tests.push({
      name: 'Temporary Cache Directory Active',
      passed: Boolean(tempTest.filePath),
      details: `Isolated path: ${path.basename(tempTest.filePath)}`,
    });

    const allPassed = tests.every((t) => t.passed);
    res.json({
      timestamp: new Date().toISOString(),
      allPassed,
      results: tests,
    });
  });

  // Live End-to-End Multi-Quality Download Verification Suite (30 real checks)
  app.get('/api/test-downloads', async (req: Request, res: Response) => {
    const baseUrl = `http://127.0.0.1:${PORT}`;

    type DownloadCheckResult = {
      id: string;
      name: string;
      platform: string;
      status: 'pass' | 'warn' | 'fail';
      latencyMs: number;
      bytesVerified: number;
      qualitiesFound: string[];
      details: string;
    };

    const probeDownloadBytes = async (
      streamUrl: string,
      format: 'mp4' | 'mp3' | 'm4a',
      audioUrl?: string,
      timeoutMs = 25000,
      abortEarly = false,
      bitrate?: string,
      scaleHeight?: number
    ): Promise<{ ok: boolean; contentType: string; bytesRead: number; headerHex: string; error?: string }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let bytesRead = 0;
      let contentType = '';
      let firstBytes: Uint8Array | null = null;
      try {
        const audioParam = audioUrl ? `&audioUrl=${encodeURIComponent(audioUrl)}` : '';
        const bitrateParam = bitrate ? `&bitrate=${encodeURIComponent(bitrate)}` : '';
        const scaleParam = scaleHeight ? `&scaleHeight=${scaleHeight}` : '';
        const dlUrl = `${baseUrl}/api/download?url=${encodeURIComponent(streamUrl)}${audioParam}&filename=wukong_vid_test.${format}&format=${format}${bitrateParam}${scaleParam}`;
        const dlRes = await fetch(dlUrl, { signal: controller.signal });
        if (!dlRes.ok || !dlRes.body) {
          return {
            ok: false,
            contentType: dlRes.headers.get('content-type') || '',
            bytesRead: 0,
            headerHex: '',
            error: `HTTP ${dlRes.status}`,
          };
        }

        contentType = (dlRes.headers.get('content-type') || '').toLowerCase();
        const reader = dlRes.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            if (!firstBytes) firstBytes = value.slice(0, 16);
            bytesRead += value.length;
            if (abortEarly || bytesRead >= 4096) {
              await reader.cancel().catch(() => {});
              controller.abort();
              break;
            }
          }
        }

        const headerHex = firstBytes
          ? Array.from(firstBytes)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ')
          : '';

        return {
          ok: bytesRead > 0,
          contentType,
          bytesRead,
          headerHex,
        };
      } catch (err: any) {
        if (bytesRead > 0 && err?.name === 'AbortError') {
          return { ok: true, contentType, bytesRead, headerHex: '' };
        }
        return {
          ok: false,
          contentType,
          bytesRead,
          headerHex: '',
          error: err?.message || 'Stream error',
        };
      } finally {
        clearTimeout(timer);
      }
    };

    const runExtractAndDownloadTest = async (
      id: string,
      name: string,
      platform: string,
      targetUrl: string,
      format: 'mp4' | 'mp3' | 'm4a' = 'mp4',
      warnOnAuthWall = false,
      bitrate?: string,
      scaleHeight?: number
    ): Promise<DownloadCheckResult> => {
      const start = performance.now();
      try {
        const extracted = await adapterManager.extract(targetUrl);
        if (!extracted.success || !extracted.data || extracted.data.qualities.length === 0) {
          const errMsg = extracted.error || 'Extraction returned no qualities';
          const isAuthWall =
            warnOnAuthWall &&
            /private|login|cookie|blocked|403|unavailable|region|could not be accessed|could not locate/i.test(
              errMsg
            );
          return {
            id,
            name,
            platform,
            status: isAuthWall ? 'warn' : 'fail',
            latencyMs: Math.round(performance.now() - start),
            bytesVerified: 0,
            qualitiesFound: [],
            details: isAuthWall
              ? `Adapter ready; upstream blocked cloud IP / requires user session (${errMsg})`
              : errMsg,
          };
        }

        const qualitiesFound = extracted.data.qualities.map((q) => q.resolution);
        const chosen =
          (scaleHeight
            ? extracted.data.qualities.find((q) => q.targetHeight === scaleHeight)
            : undefined) ||
          (bitrate
            ? extracted.data.qualities.find(
                (q) => q.format === format && `${q.bitrateKbps}k` === bitrate
              )
            : undefined) ||
          extracted.data.qualities.find((q) => q.format === format) ||
          extracted.data.qualities[0];

        const probe = await probeDownloadBytes(
          chosen.url,
          format,
          chosen.audioUrl,
          25000,
          false,
          bitrate || (chosen.bitrateKbps ? `${chosen.bitrateKbps}k` : undefined),
          scaleHeight
        );
        const latencyMs = Math.round(performance.now() - start);

        if (!probe.ok) {
          return {
            id,
            name,
            platform,
            status: warnOnAuthWall ? 'warn' : 'fail',
            latencyMs,
            bytesVerified: probe.bytesRead,
            qualitiesFound,
            details: `Extracted ${qualitiesFound.length} tiers, stream probe failed: ${probe.error || '0 bytes'}`,
          };
        }

        return {
          id,
          name,
          platform,
          status: 'pass',
          latencyMs,
          bytesVerified: probe.bytesRead,
          qualitiesFound,
          details: `${qualitiesFound.length} tiers ready · Streamed ${probe.bytesRead} B (${probe.contentType || format}${bitrate ? ` @ ${bitrate}` : scaleHeight ? ` @ ${scaleHeight}p` : ''})`,
        };
      } catch (err: any) {
        return {
          id,
          name,
          platform,
          status: 'fail',
          latencyMs: Math.round(performance.now() - start),
          bytesVerified: 0,
          qualitiesFound: [],
          details: err?.message || 'Unexpected error',
        };
      }
    };

    const specs: Array<() => Promise<DownloadCheckResult>> = [
      // 17 MP4 Checks (Full Native + Compact 480p + Saver 360p)
      () => runExtractAndDownloadTest('mp4_01', 'MP4 #1 · TikTok Standard (@scout2015)', 'TikTok MP4', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'mp4'),
      () => runExtractAndDownloadTest('mp4_02', 'MP4 #2 · TikTok Official (@tiktok #1)', 'TikTok MP4', 'https://www.tiktok.com/@tiktok/video/7106594312292453675', 'mp4'),
      () => runExtractAndDownloadTest('mp4_03', 'MP4 #3 · TikTok Official (@tiktok #2)', 'TikTok MP4', 'https://www.tiktok.com/@tiktok/video/7093219391759764782', 'mp4'),
      () => runExtractAndDownloadTest('mp4_04', 'MP4 #4 · TikTok Mobile (/v/ID.html)', 'TikTok MP4', 'https://m.tiktok.com/v/6718335390845095173.html', 'mp4'),
      () => runExtractAndDownloadTest('mp4_05', 'MP4 #5 · TikTok Embed (/embed/v2/ID)', 'TikTok MP4', 'https://www.tiktok.com/embed/v2/6718335390845095173', 'mp4'),
      () => runExtractAndDownloadTest('mp4_06', 'MP4 #6 · Instagram Reel (/reel/)', 'Instagram MP4', 'https://www.instagram.com/reel/DTVTvUDj-b1/', 'mp4'),
      () => runExtractAndDownloadTest('mp4_07', 'MP4 #7 · Instagram Post (/p/)', 'Instagram MP4', 'https://www.instagram.com/p/DTVTvUDj-b1/', 'mp4'),
      () => runExtractAndDownloadTest('mp4_08', 'MP4 #8 · Instagram Share (?igsh=)', 'Instagram MP4', 'https://www.instagram.com/reel/DTVTvUDj-b1/?igsh=MzRlODBiNWFlZA==', 'mp4'),
      () => runExtractAndDownloadTest('mp4_09', 'MP4 #9 · Facebook Page Video', 'Facebook MP4', 'https://www.facebook.com/facebook/videos/10153231379946729/', 'mp4'),
      () => runExtractAndDownloadTest('mp4_10', 'MP4 #10 · Facebook Watch (?v=)', 'Facebook MP4', 'https://www.facebook.com/watch/?v=10153231379946729', 'mp4'),
      () => runExtractAndDownloadTest('mp4_11', 'MP4 #11 · Facebook Mobile (m.fb)', 'Facebook MP4', 'https://m.facebook.com/facebook/videos/10153231379946729/', 'mp4'),
      () => runExtractAndDownloadTest('mp4_12', 'MP4 #12 · X / Twitter Status Video', 'Twitter MP4', 'https://x.com/captainamerica/status/719944021058060289', 'mp4'),
      () => runExtractAndDownloadTest('mp4_13', 'MP4 #13 · HLS .m3u8 -> MP4 Remux', 'HLS MP4', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'mp4'),
      () => runExtractAndDownloadTest('mp4_14', 'MP4 #14 · Generic Web Video Extractor', 'Web MP4', 'https://www.w3schools.com/html/html5_video.asp', 'mp4'),
      () => runExtractAndDownloadTest('mp4_15', 'MP4 #15 · Direct MP4 Master Stream', 'Direct MP4', 'https://www.w3schools.com/html/mov_bbb.mp4', 'mp4'),
      () => runExtractAndDownloadTest('mp4_16', 'MP4 #16 · Compact 480p Scaled Transcode', '480p SD MP4', 'https://www.w3schools.com/html/mov_bbb.mp4', 'mp4', false, undefined, 480),
      () => runExtractAndDownloadTest('mp4_17', 'MP4 #17 · Data Saver 360p Scaled MP4', '360p Mobile', 'https://www.w3schools.com/html/mov_bbb.mp4', 'mp4', false, undefined, 360),

      // 12 Audio Checks (10 MP3 320k + 1 MP3 128k Compact + 1 M4A 256k AAC)
      () => runExtractAndDownloadTest('mp3_01', 'MP3 #1 · TikTok Sound 320k (@scout2015)', 'TikTok MP3', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'mp3'),
      () => runExtractAndDownloadTest('mp3_02', 'MP3 #2 · TikTok Sound 320k (@tiktok #1)', 'TikTok MP3', 'https://www.tiktok.com/@tiktok/video/7106594312292453675', 'mp3'),
      () => runExtractAndDownloadTest('mp3_03', 'MP3 #3 · TikTok Mobile Sound 320k', 'TikTok MP3', 'https://m.tiktok.com/v/6718335390845095173.html', 'mp3'),
      () => runExtractAndDownloadTest('mp3_04', 'MP3 #4 · Instagram Reel Audio 320k', 'Instagram MP3', 'https://www.instagram.com/reel/DTVTvUDj-b1/', 'mp3'),
      () => runExtractAndDownloadTest('mp3_05', 'MP3 #5 · Instagram Post Audio 320k', 'Instagram MP3', 'https://www.instagram.com/p/DTVTvUDj-b1/', 'mp3'),
      () => runExtractAndDownloadTest('mp3_06', 'MP3 #6 · Facebook Page Audio 320k', 'Facebook MP3', 'https://www.facebook.com/facebook/videos/10153231379946729/', 'mp3'),
      () => runExtractAndDownloadTest('mp3_07', 'MP3 #7 · Facebook Watch Audio 320k', 'Facebook MP3', 'https://www.facebook.com/watch/?v=10153231379946729', 'mp3'),
      () => runExtractAndDownloadTest('mp3_08', 'MP3 #8 · X / Twitter Audio Track', 'Twitter MP3', 'https://x.com/captainamerica/status/719944021058060289', 'mp3'),
      () => runExtractAndDownloadTest('mp3_09', 'MP3 #9 · HLS .m3u8 -> MP3 320k', 'HLS MP3', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'mp3'),
      () => runExtractAndDownloadTest('mp3_10', 'MP3 #10 · Direct MP4 -> MP3 320k', 'Direct MP3', 'https://www.w3schools.com/html/mov_bbb.mp4', 'mp3'),
      () => runExtractAndDownloadTest('mp3_11', 'MP3 #11 · Balanced 192kbps MP3 Audio', 'MP3 192k', 'https://www.w3schools.com/html/mov_bbb.mp4', 'mp3', false, '192k'),
      () => runExtractAndDownloadTest('mp3_12', 'MP3 #12 · Compact 128kbps MP3 Audio', 'MP3 128k', 'https://www.w3schools.com/html/mov_bbb.mp4', 'mp3', false, '128k'),
      () => runExtractAndDownloadTest('m4a_13', 'M4A #13 · High-Efficiency 256kbps AAC', 'M4A 256k', 'https://www.w3schools.com/html/mov_bbb.mp4', 'm4a', false, '256k'),

      // Stream Cancellation Control Check
      async (): Promise<DownloadCheckResult> => {
        const start = performance.now();
        const probe = await probeDownloadBytes(
          'https://www.w3schools.com/html/mov_bbb.mp4',
          'mp4',
          undefined,
          8000,
          true
        );
        return {
          id: 'abort_stop',
          name: 'Stop / Abort Stream Cancellation',
          platform: 'Stream Control',
          status: probe.ok ? 'pass' : 'fail',
          latencyMs: Math.round(performance.now() - start),
          bytesVerified: probe.bytesRead,
          qualitiesFound: ['AbortController'],
          details: probe.ok
            ? `Stream aborted cleanly after ${probe.bytesRead} B without hanging`
            : probe.error || 'Abort verification failed',
        };
      },
    ];

    const checks: DownloadCheckResult[] = [];
    const batchSize = 4;
    for (let i = 0; i < specs.length; i += batchSize) {
      const batchResults = await Promise.all(specs.slice(i, i + batchSize).map((fn) => fn()));
      checks.push(...batchResults);
    }

    const passedCount = checks.filter((c) => c.status === 'pass').length;
    const failedCount = checks.filter((c) => c.status === 'fail').length;

    res.json({
      timestamp: new Date().toISOString(),
      allPassed: failedCount === 0,
      summary: {
        total: checks.length,
        passed: passedCount,
        warned: checks.filter((c) => c.status === 'warn').length,
        failed: failedCount,
      },
      results: checks,
    });
  });

  // Crawl-ready SSR HTML Injection + Vite / Production SPA Fallback
  const seoRoutePaths = ['/', ...SEO_PAGES.map((p) => p.path)];

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.get(seoRoutePaths, async (req: Request, res: Response, next) => {
      try {
        const origin = resolvePublicOrigin(req);
        const normPath = normalizeSeoPath(req.path);
        const seoPage = getSeoPageByPath(normPath) ?? null;
        const rawTemplate = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
        const injected = injectSeoIntoHtmlTemplate(rawTemplate, seoPage, origin);
        const transformed = await vite.transformIndexHtml(req.originalUrl, injected);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req: Request, res: Response) => {
      const origin = resolvePublicOrigin(req);
      const normPath = normalizeSeoPath(req.path);
      const seoPage = getSeoPageByPath(normPath) ?? null;
      const distTemplate = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
      const injected = injectSeoIntoHtmlTemplate(distTemplate, seoPage, origin);
      res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(injected);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WuKong-Vid Core Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
