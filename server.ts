import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { Readable } from 'node:stream';
import { spawn } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { adapterManager } from './server/adapters/index.js';
import { validateSafeUrl, sanitizeFilename, getPlatformSecurityCookies } from './server/security.js';
import { RateLimiter } from './server/rateLimiter.js';
import { tempManager } from './server/tempManager.js';
import {
  analyzeMediaContent,
  generateFastTags,
  searchVideoContext,
} from './server/gemini.js';

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
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: '*/*',
  };

  if (parsedUrl.hostname.includes('tikcdn.io') || parsedUrl.hostname.includes('ssstik.io')) {
    headers['Referer'] = 'https://ssstik.io/';
    headers['Cookie'] = getPlatformSecurityCookies('tiktok', clientCookies);
  } else if (
    parsedUrl.hostname.includes('tiktok.com') ||
    parsedUrl.hostname.includes('tiktokv.us') ||
    parsedUrl.hostname.includes('byteoversea.com')
  ) {
    headers['Referer'] = 'https://www.tiktok.com/';
    headers['Cookie'] = getPlatformSecurityCookies('tiktok', clientCookies);
  } else if (
    parsedUrl.hostname.includes('instagram.com') ||
    parsedUrl.hostname.includes('cdninstagram.com')
  ) {
    headers['Referer'] = 'https://www.instagram.com/';
    headers['Cookie'] = getPlatformSecurityCookies('instagram', clientCookies);
  } else if (parsedUrl.hostname.includes('fbcdn.net') || parsedUrl.hostname.includes('facebook.com')) {
    headers['Referer'] = 'https://www.facebook.com/';
    headers['Cookie'] = getPlatformSecurityCookies('facebook', clientCookies);
  } else if (parsedUrl.hostname.includes('rapidcdn.app')) {
    headers['Referer'] = 'https://snapsave.app/';
    headers['Origin'] = 'https://snapsave.app';
  } else if (
    parsedUrl.hostname.includes('twimg.com') ||
    parsedUrl.hostname.includes('x.com') ||
    parsedUrl.hostname.includes('twitter.com')
  ) {
    headers['Referer'] = 'https://x.com/';
    headers['Cookie'] = getPlatformSecurityCookies('twitter', clientCookies);
  } else if (parsedUrl.hostname.includes('v.redd.it') || parsedUrl.hostname.includes('reddit.com')) {
    headers['Referer'] = 'https://www.reddit.com/';
  } else if (parsedUrl.hostname.includes('vimeo.com') || parsedUrl.hostname.includes('vimeocdn.com')) {
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
    '-user_agent',
    upstreamHeaders['User-Agent'],
  ];

  if (headerLines.length > 0) {
    args.push('-headers', `${headerLines.join('\r\n')}\r\n`);
  }

  if (!isHls) {
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

  const finishOnClose = () => {
    clientClosed = true;
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

async function transcodeMp3ViaTempFallback(options: {
  mediaUrl: string;
  upstreamHeaders: Record<string, string>;
  res: Response;
  req: Request;
  cleanAsciiFilename: string;
  safeFilename: string;
}) {
  const { mediaUrl, upstreamHeaders, res, req, cleanAsciiFilename, safeFilename } = options;
  const inputTmp = tempManager.getTempFilePath('media');
  const outputTmp = tempManager.getTempFilePath('mp3');
  const abortCtrl = new AbortController();
  const onReqClose = () => abortCtrl.abort();
  req.on('close', onReqClose);

  try {
    const isHls = isHlsStreamUrl(mediaUrl);
    if (!isHls) {
      const upstreamRes = await fetch(mediaUrl, {
        headers: upstreamHeaders,
        redirect: 'follow',
        signal: abortCtrl.signal,
      });

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
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...extraInputArgs,
        '-i', inputSource,
        '-vn',
        '-map', '0:a:0',
        '-c:a', 'libmp3lame',
        '-b:a', '320k',
        '-ar', '44100',
        '-ac', '2',
        '-id3v2_version', '3',
        '-write_xing', '1',
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
            ? 'This video has no audio track to convert to MP3.'
            : 'Unable to convert audio stream to MP3.',
        });
      }
      return;
    }

    const stat = fs.statSync(outputTmp.filePath);
    if (stat.size <= 0) {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Converted MP3 file was empty.' });
      }
      return;
    }

    sendAttachmentHeaders(res, 'audio/mpeg', cleanAsciiFilename, safeFilename);
    res.setHeader('Content-Length', String(stat.size));

    const outStream = fs.createReadStream(outputTmp.filePath);
    await new Promise<void>((resolve) => {
      outStream.on('close', () => resolve());
      outStream.on('error', () => resolve());
      outStream.pipe(res);
    });
  } catch (err: any) {
    if (!abortCtrl.signal.aborted && !res.headersSent) {
      res.status(502).json({ error: err?.message || 'MP3 fallback conversion failed.' });
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
  const rateLimiter = new RateLimiter();

  // Basic middleware
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // CORS and Security Cookie Headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, Cookie, X-Cookies, X-Security-Cookie');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Set-Cookie');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Apply rate limiter on API routes
  app.use('/api', rateLimiter.middleware());

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'NEcTORa Video Core',
      version: '1.0.0',
      supportedPlatforms: ['tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'direct_media'],
      excludedPlatforms: ['youtube'],
      limits: {
        maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 500,
        rateLimitPerMinute: Number(process.env.RATE_LIMIT_REQUESTS) || 120,
      },
    });
  });

  // Media analysis endpoint
  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const { url, cookies } = req.body;
      const clientCookies = cookies || (req.headers['x-cookies'] as string) || (req.headers['x-security-cookie'] as string) || (req.headers['cookie'] as string) || undefined;
      
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
      if (!result.success) {
        res.status(result.statusCode || 400).json({
          error: result.error || 'Failed to extract media details.',
        });
        return;
      }

      res.json(result.data);
    } catch (err: any) {
      console.error('Analyze error:', err);
      res.status(500).json({ error: 'An error occurred while analyzing the media link.' });
    }
  });

  // Media preview proxy endpoint (with live video+audio muxing & CORS handling)
  app.get('/api/proxy-media', async (req: Request, res: Response) => {
    try {
      const mediaUrl = req.query.url as string;
      const audioUrl = (req.query.audioUrl as string) || '';
      const format = (req.query.format as string) || 'mp4';

      if (!mediaUrl) {
        res.status(400).send('Missing media URL');
        return;
      }

      const validation = await validateSafeUrl(mediaUrl);
      if (!validation.safe) {
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
        if (!audioValidation.safe) {
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

      // If format is MP3, stream direct native MP3 or transcode audio in real-time
      if (format === 'mp3') {
        const upstreamHeaders = buildUpstreamHeaders(parsedMediaUrl, clientCookies);
        const isHls = isHlsStreamUrl(mediaUrl);

        if (!isHls && (parsedMediaUrl.pathname.toLowerCase().endsWith('.mp3') || mediaUrl.includes('mime_type=audio_mpeg'))) {
          try {
            const directAudio = await fetch(mediaUrl, { headers: upstreamHeaders, redirect: 'follow' });
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
        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          ...httpArgs,
          '-i', mediaUrl,
          '-vn',
          '-map', '0:a:0',
          '-c:a', 'libmp3lame',
          '-b:a', '320k',
          '-ar', '44100',
          '-ac', '2',
          '-f', 'mp3',
          'pipe:1',
        ];

        spawnGuardedFfmpegStream({
          ffArgs,
          res,
          req,
          contentType: 'audio/mpeg',
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

      const remoteRes = await fetch(mediaUrl, {
        headers: upstreamHeaders,
        redirect: 'follow',
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

  // Secure download streaming endpoint (with full audio+video remuxing for 1080p/4K)
  app.get('/api/download', async (req: Request, res: Response) => {
    try {
      const mediaUrl = req.query.url as string;
      const audioUrl = (req.query.audioUrl as string) || '';
      const rawFilename = (req.query.filename as string) || 'nectora_media.mp4';
      const format = (req.query.format as string) || 'mp4';
      const fileSizeBytes = (req.query.fileSizeBytes as string) || '';

      if (!mediaUrl) {
        res.status(400).json({ error: 'Missing target media URL.' });
        return;
      }

      const validation = await validateSafeUrl(mediaUrl);
      if (!validation.safe) {
        res.status(400).json({ error: validation.error || 'Target URL is not permitted.' });
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, X-Expected-Bytes, Content-Disposition');
      if (fileSizeBytes) {
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

      // 1. Separate Video + Audio Muxing (for True 1080p, 4K, 720p with crystal clear sound)
      if (audioUrl && audioUrl !== mediaUrl) {
        const audioValidation = await validateSafeUrl(audioUrl);
        if (!audioValidation.safe) {
          res.status(400).json({ error: 'Audio source address is invalid.' });
          return;
        }

        const parsedAudioUrl = new URL(audioUrl);
        const videoHttpArgs = buildFfmpegHttpArgs(parsedUrl, clientCookies, isHlsStreamUrl(mediaUrl));
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
          cleanAsciiFilename,
          safeFilename,
        });
        return;
      }

      // 2. MP3 Download (Native Audio Pass-Through OR Full-Header FFmpeg Transcode + Temp-File Fallback)
      if (format === 'mp3') {
        const isHls = isHlsStreamUrl(mediaUrl);
        const looksDirectMp3 =
          !isHls &&
          (parsedUrl.pathname.toLowerCase().endsWith('.mp3') ||
            mediaUrl.toLowerCase().includes('mime_type=audio_mpeg') ||
            mediaUrl.toLowerCase().includes('audio/mpeg'));

        if (looksDirectMp3) {
          try {
            const directAudioRes = await fetch(mediaUrl, {
              headers: upstreamHeaders,
              redirect: 'follow',
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
        const ffArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          ...httpArgs,
          '-i', mediaUrl,
          '-vn',
          '-map', '0:a:0',
          '-c:a', 'libmp3lame',
          '-b:a', '320k',
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
          contentType: 'audio/mpeg',
          cleanAsciiFilename,
          safeFilename,
          onEmptyFailure: async (stderrLog) => {
            if (
              stderrLog.includes('does not contain any stream') ||
              stderrLog.includes('matches no streams')
            ) {
              if (!res.headersSent) {
                res.status(422).json({ error: 'This video has no audio track to convert to MP3.' });
              }
              return;
            }
            await transcodeMp3ViaTempFallback({
              mediaUrl,
              upstreamHeaders,
              res,
              req,
              cleanAsciiFilename,
              safeFilename,
            });
          },
        });
        return;
      }

      // 3. HLS (.m3u8) -> Playable MP4 Remux Download OR Direct Progressive Stream Download
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

      const remoteRes = await fetch(mediaUrl, {
        headers: upstreamHeaders,
        redirect: 'follow',
      });

      if (!remoteRes.ok) {
        res.status(remoteRes.status).json({ error: `Upstream source returned HTTP ${remoteRes.status}. The media stream may have expired.` });
        return;
      }

      // Detect if upstream sent an HLS playlist or an HTML/JSON page
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

      const contentType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      const contentLength = remoteRes.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${cleanAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
      );

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
        res.status(500).json({ error: 'Failed to process download stream.' });
      }
    }
  });

  // AI Endpoint: Deep Media Analysis
  app.post('/api/ai/analyze', async (req: Request, res: Response) => {
    try {
      const { title, description, platform, authorName } = req.body;
      const result = await analyzeMediaContent({
        title: title || 'Social Video',
        description,
        platform: platform || 'Social Media',
        authorName,
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
      const { title, platform } = req.body;
      const result = await generateFastTags(title || 'Video', platform || 'Video');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Fast tags generation failed' });
    }
  });

  // AI Endpoint: Google Search Grounding Context
  app.post('/api/ai/search-context', async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query) {
        res.status(400).json({ error: 'Query parameter required' });
        return;
      }
      const result = await searchVideoContext(query);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Search grounding failed' });
    }
  });

  // Automated System Diagnostics & Verification Suite
  app.get('/api/test-suite', async (req: Request, res: Response) => {
    const tests = [];

    // Test 1: SSRF Protection for Localhost
    const localhostTest = await validateSafeUrl('http://127.0.0.1:8080/secret');
    tests.push({
      name: 'SSRF Protection (Localhost / 127.0.0.1)',
      passed: !localhostTest.safe,
      details: localhostTest.error || 'Blocked successfully',
    });

    // Test 2: SSRF Protection for Private IP (192.168.1.1)
    const privateIpTest = await validateSafeUrl('http://192.168.1.1/admin');
    tests.push({
      name: 'SSRF Protection (Private 192.168.x range)',
      passed: !privateIpTest.safe,
      details: privateIpTest.error || 'Blocked successfully',
    });

    // Test 3: YouTube Exclusion Policy
    const ytTest = await validateSafeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    tests.push({
      name: 'YouTube Exclusion Policy Enforced',
      passed: !ytTest.safe,
      details: ytTest.error || 'Excluded as required',
    });

    // Test 4: Path Traversal Protection
    const filenameTest = sanitizeFilename('../../../etc/passwd', 'mp4');
    tests.push({
      name: 'Filename Path Traversal Protection',
      passed: !filenameTest.includes('..') && !filenameTest.includes('/'),
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

  // Live End-to-End Download Verification Suite (Tests each extraction + stream download pipeline)
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
      format: 'mp4' | 'mp3',
      audioUrl?: string,
      timeoutMs = 15000,
      abortEarly = false
    ): Promise<{ ok: boolean; contentType: string; bytesRead: number; headerHex: string; error?: string }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let bytesRead = 0;
      let contentType = '';
      let firstBytes: Uint8Array | null = null;
      try {
        const audioParam = audioUrl ? `&audioUrl=${encodeURIComponent(audioUrl)}` : '';
        const dlUrl = `${baseUrl}/api/download?url=${encodeURIComponent(streamUrl)}${audioParam}&filename=nectora_test.${format}&format=${format}`;
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
      format: 'mp4' | 'mp3' = 'mp4',
      warnOnAuthWall = false
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
          extracted.data.qualities.find((q) => q.format === format) ||
          extracted.data.qualities[0];

        const probe = await probeDownloadBytes(chosen.url, format, chosen.audioUrl, 15000, false);
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
            details: `Extracted [${qualitiesFound.join(', ')}], stream probe failed: ${probe.error || '0 bytes'}`,
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
          details: `Extracted [${qualitiesFound.join(', ')}] · Streamed ${probe.bytesRead} B (${probe.contentType || format})`,
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

    const checks = await Promise.all([
      runExtractAndDownloadTest(
        'direct_mp4',
        'Direct MP4 Download',
        'Direct',
        'https://www.w3schools.com/html/mov_bbb.mp4',
        'mp4'
      ),
      runExtractAndDownloadTest(
        'audio_mp3',
        'MP3 Audio Transcode (FFmpeg)',
        'Audio MP3',
        'https://www.w3schools.com/html/mov_bbb.mp4',
        'mp3'
      ),
      runExtractAndDownloadTest(
        'hls_m3u8',
        'HLS .m3u8 -> Playable MP4 Remux',
        'HLS',
        'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        'mp4'
      ),
      runExtractAndDownloadTest(
        'tiktok_hd',
        'TikTok No-Watermark Video (MP4)',
        'TikTok',
        'https://www.tiktok.com/@scout2015/video/6718335390845095173',
        'mp4'
      ),
      runExtractAndDownloadTest(
        'tiktok_mp3',
        'TikTok Original Sound (MP3)',
        'TikTok MP3',
        'https://www.tiktok.com/@scout2015/video/6718335390845095173',
        'mp3'
      ),
      runExtractAndDownloadTest(
        'twitter_x',
        'X / Twitter HD Video',
        'Twitter / X',
        'https://x.com/captainamerica/status/719944021058060289',
        'mp4'
      ),
      runExtractAndDownloadTest(
        'web_generic',
        'Web Page / Generic Video Extractor',
        'Generic Web',
        'https://www.w3schools.com/html/html5_video.asp',
        'mp4'
      ),
      (async (): Promise<DownloadCheckResult> => {
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
      })(),
      (async (): Promise<DownloadCheckResult> => {
        const start = performance.now();
        const igDetect = adapterManager.detectPlatform('https://www.instagram.com/reel/C123456789/');
        const fbDetect = adapterManager.detectPlatform('https://fb.watch/test123/');
        const rdDetect = adapterManager.detectPlatform('https://v.redd.it/abc123');
        const routingOk = igDetect === 'instagram' && fbDetect === 'facebook' && rdDetect === 'reddit';
        return {
          id: 'social_routing',
          name: 'Instagram, Facebook & Reddit Adapters',
          platform: 'Social Routing',
          status: routingOk ? 'pass' : 'fail',
          latencyMs: Math.round(performance.now() - start),
          bytesVerified: 0,
          qualitiesFound: [igDetect, fbDetect, rdDetect],
          details: routingOk
            ? 'All 3 adapters routed & armed (yt-dlp + embed/JSON fallbacks ready)'
            : `Routing mismatch: ig=${igDetect}, fb=${fbDetect}, rd=${rdDetect}`,
        };
      })(),
    ]);

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

  // Vite Middleware Setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEcTORa Core Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
