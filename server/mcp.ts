import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { adapterManager } from './adapters/index.js';
import {
  validateSafeUrl,
  validateFfmpegRemoteUrl,
  sanitizeFilename,
  sanitizeMediaFormat,
  sanitizeAudioBitrate,
  sanitizeVideoHeight,
} from './security.js';
import { QualityOption } from './types.js';
import { buildLlmsTxt, buildOpenApiSpec } from './agentDocs.js';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'] as const;
const SERVER_INFO = {
  name: 'wukong-vid-mcp',
  version: '1.1.0',
};

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_capabilities',
    description:
      'Returns all supported video platforms, excluded platforms, available MP4/MP3/M4A quality tiers, and API/MCP endpoint URLs.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'extract_media_streams',
    description:
      'Extracts video metadata, flat quickLinks (mp4_1080p..360p, mp3_320k..128k, m4a_256k, oneStep), and downloadable stream tiers for a public URL in one fast compact call. Supports optional inline verify_ready probe.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          description:
            'Public URL from TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, or a direct video/.m3u8 file (YouTube is excluded).',
        },
        preferred_quality: {
          type: 'string',
          enum: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
          description: 'Optional target quality preset to highlight as recommended.',
        },
        compact: {
          type: 'boolean',
          default: true,
          description: 'Return lean AI-optimized JSON payload (default true) or full raw stream metadata when false.',
        },
        verify_ready: {
          type: 'boolean',
          default: false,
          description: 'When true, immediately verifies playable bytes on the recommended downloadUrl inline without needing a second MCP call.',
        },
        cookies: {
          type: 'string',
          description: 'Optional Cookie header value if needed for an authorized public/account session.',
        },
      },
    },
  },
  {
    name: 'build_download_url',
    description:
      'Builds a ready-to-download WuKong-Vid attachment URL (/api/download) and inline preview URL (/api/proxy-media) for an extracted stream URL and desired output format.',
    inputSchema: {
      type: 'object',
      required: ['stream_url'],
      properties: {
        stream_url: {
          type: 'string',
          description: 'Upstream media stream URL returned by extract_media_streams or a direct HTTP(S) media file.',
        },
        audio_url: {
          type: 'string',
          description: 'Optional separate audio track URL when muxing DASH video + audio into MP4.',
        },
        format: {
          type: 'string',
          enum: ['mp4', 'mp3', 'm4a', 'webm'],
          default: 'mp4',
          description: 'Desired download file format.',
        },
        bitrate: {
          type: 'string',
          enum: ['320k', '192k', '128k', '256k'],
          description: 'Audio bitrate for MP3 (320k/192k/128k) or M4A (256k).',
        },
        scale_height: {
          type: 'integer',
          enum: [720, 480, 360],
          description: 'Optional MP4 target height for compact transcoding (720, 480, or 360).',
        },
        filename: {
          type: 'string',
          description: 'Optional clean base filename for the downloaded file.',
        },
      },
    },
  },
  {
    name: 'batch_extract_media',
    description:
      'Extracts media metadata and download links for up to 10 public URLs concurrently in a single call.',
    inputSchema: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { type: 'string' },
          description: 'Array of up to 10 public media URLs.',
        },
        preferred_quality: {
          type: 'string',
          enum: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
          description: 'Optional target quality preset.',
        },
      },
    },
  },
  {
    name: 'verify_download_stream',
    description:
      'Performs a lightweight live byte-probe on a WuKong-Vid download URL (or upstream stream) to verify it streams playable bytes before presenting it to the user.',
    inputSchema: {
      type: 'object',
      required: ['stream_url'],
      properties: {
        stream_url: {
          type: 'string',
          description: 'The extracted stream URL to verify via /api/download.',
        },
        audio_url: {
          type: 'string',
          description: 'Optional separate audio track URL.',
        },
        format: {
          type: 'string',
          enum: ['mp4', 'mp3', 'm4a'],
          default: 'mp4',
        },
        bitrate: {
          type: 'string',
          enum: ['320k', '192k', '128k', '256k'],
        },
        scale_height: {
          type: 'integer',
          enum: [720, 480, 360],
        },
      },
    },
  },
];

const MCP_RESOURCES = [
  {
    uri: 'wukong://guide/agent-quickstart',
    name: 'WuKong-Vid Agent Quickstart Guide',
    description: 'Markdown quickstart for using WuKong-Vid MCP tools and REST endpoints.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'wukong://capabilities/platforms',
    name: 'Supported Platforms & Formats Matrix',
    description: 'Machine-readable capabilities, limits, and quality presets.',
    mimeType: 'application/json',
  },
  {
    uri: 'wukong://schema/openapi',
    name: 'WuKong-Vid OpenAPI 3.1 Specification',
    description: 'Complete OpenAPI 3.1 schema describing REST and MCP endpoints.',
    mimeType: 'application/json',
  },
];

const MCP_PROMPTS = [
  {
    name: 'extract_media_workflow',
    description: 'Guide an assistant through extracting a public video URL and returning the best downloadable MP4 or MP3 link.',
    arguments: [
      {
        name: 'url',
        description: 'The public media URL provided by the user.',
        required: true,
      },
      {
        name: 'preferred_quality',
        description: 'Optional quality preference such as 1080p, 720p, 480p, 360p, mp3_320k, or m4a_256k.',
        required: false,
      },
    ],
  },
  {
    name: 'batch_extract_workflow',
    description: 'Guide an assistant through resolving multiple public video URLs at once using batch_extract_media.',
    arguments: [
      {
        name: 'urls',
        description: 'Comma- or newline-separated list of public URLs.',
        required: true,
      },
    ],
  },
];

export function buildQualityDownloadLinks(
  origin: string,
  title: string,
  q: QualityOption
): { downloadUrl: string; previewUrl: string } {
  const safeBase = sanitizeFilename(title || 'wukong_media', q.format);
  const params = new URLSearchParams({
    url: q.url,
    format: q.format,
    filename: safeBase,
  });
  if (q.audioUrl) {
    params.set('audioUrl', q.audioUrl);
  }
  if ((q.format === 'mp3' || q.format === 'm4a') && q.bitrateKbps) {
    params.set('bitrate', `${q.bitrateKbps}k`);
  }
  if (q.format === 'mp4' && q.targetHeight && q.targetHeight <= 720 && !q.isNative) {
    params.set('scaleHeight', String(q.targetHeight));
  }
  if (q.fileSizeBytes) {
    params.set('fileSizeBytes', String(q.fileSizeBytes));
  }

  const previewParams = new URLSearchParams({
    url: q.url,
    format: q.format,
  });
  if (q.audioUrl) previewParams.set('audioUrl', q.audioUrl);
  if ((q.format === 'mp3' || q.format === 'm4a') && q.bitrateKbps) {
    previewParams.set('bitrate', `${q.bitrateKbps}k`);
  }

  return {
    downloadUrl: `${origin}/api/download?${params.toString()}`,
    previewUrl: `${origin}/api/proxy-media?${previewParams.toString()}`,
  };
}

export function selectRecommendedQuality(
  qualities: QualityOption[],
  preferred?: string
): QualityOption | undefined {
  if (!qualities.length) return undefined;
  if (!preferred) {
    return qualities.find((q) => q.format === 'mp4') || qualities[0];
  }
  const p = preferred.toLowerCase();
  if (p === 'mp3' || p.startsWith('mp3_')) {
    const kbps = parseInt(p.replace('mp3_', '').replace('k', ''), 10) || 320;
    return qualities.find((q) => q.format === 'mp3' && q.bitrateKbps === kbps) ||
      qualities.find((q) => q.format === 'mp3');
  }
  if (p === 'm4a' || p.startsWith('m4a_')) {
    return qualities.find((q) => q.format === 'm4a');
  }
  const targetH = parseInt(p.replace('p', ''), 10);
  if (!Number.isNaN(targetH)) {
    return (
      qualities.find((q) => q.format === 'mp4' && (q.targetHeight === targetH || q.resolution.toLowerCase().includes(`${targetH}p`))) ||
      qualities.find((q) => q.format === 'mp4')
    );
  }
  return qualities[0];
}

export function buildQuickLinksMap(
  origin: string,
  originalUrl: string,
  title: string,
  qualities: QualityOption[],
  preferred = '1080p'
): Record<string, string> {
  const links: Record<string, string> = {
    oneStep: `${origin}/api/quick-download?url=${encodeURIComponent(originalUrl)}&quality=${encodeURIComponent(preferred)}`,
  };
  const findLink = (predicate: (q: QualityOption) => boolean) => {
    const match = qualities.find(predicate);
    return match ? buildQualityDownloadLinks(origin, title, match).downloadUrl : undefined;
  };
  const bestMp4 = findLink((q) => q.format === 'mp4');
  if (bestMp4) links.bestMp4 = bestMp4;
  for (const h of [1080, 720, 480, 360]) {
    const l = findLink((q) => q.format === 'mp4' && (q.targetHeight === h || q.resolution.toLowerCase().includes(`${h}p`)));
    if (l) links[`mp4_${h}p`] = l;
  }
  for (const kbps of [320, 192, 128]) {
    const l = findLink((q) => q.format === 'mp3' && q.bitrateKbps === kbps);
    if (l) links[`mp3_${kbps}k`] = l;
  }
  const m4a = findLink((q) => q.format === 'm4a');
  if (m4a) links.m4a_256k = m4a;
  return links;
}

const VERIFIED_PROBE_TTL_MS = 30_000;
const verifiedProbeCache = new Map<string, { expiresAt: number; bytesProbed: number; contentType: string }>();

async function probeLocalDownloadStream(
  localPort: number,
  params: URLSearchParams
): Promise<{ ok: true; bytesProbed: number; contentType: string; cached?: boolean } | { ok: false; error: string; contentType?: string }> {
  const cacheKey = params.toString();
  const cached = verifiedProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, bytesProbed: cached.bytesProbed, contentType: cached.contentType, cached: true };
  }

  const probeUrl = `http://127.0.0.1:${localPort}/api/download?${cacheKey}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 14000);
  let bytesProbed = 0;
  let contentType = '';
  try {
    const probeRes = await fetch(probeUrl, { signal: ctrl.signal });
    contentType = probeRes.headers.get('content-type') || '';
    if (!probeRes.ok || !probeRes.body) {
      return { ok: false, error: `Download probe returned HTTP ${probeRes.status}`, contentType };
    }
    const reader = probeRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        bytesProbed += value.length;
        if (bytesProbed >= 2048) {
          await reader.cancel().catch(() => {});
          ctrl.abort();
          break;
        }
      }
    }
    if (bytesProbed > 0) {
      if (verifiedProbeCache.size >= 200) {
        const oldest = verifiedProbeCache.keys().next().value;
        if (oldest) verifiedProbeCache.delete(oldest);
      }
      verifiedProbeCache.set(cacheKey, {
        expiresAt: Date.now() + VERIFIED_PROBE_TTL_MS,
        bytesProbed,
        contentType,
      });
    }
    return { ok: true, bytesProbed, contentType };
  } catch (err: any) {
    if (bytesProbed > 0 && err?.name === 'AbortError') {
      verifiedProbeCache.set(cacheKey, {
        expiresAt: Date.now() + VERIFIED_PROBE_TTL_MS,
        bytesProbed,
        contentType,
      });
      return { ok: true, bytesProbed, contentType };
    }
    return { ok: false, error: err?.message || 'Failed to verify stream.' };
  } finally {
    clearTimeout(timeout);
  }
}

async function callMcpTool(
  name: string,
  args: Record<string, any>,
  origin: string,
  localPort: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent?: unknown; isError?: boolean }> {
  const ok = (payload: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  });
  const fail = (message: string, details?: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message, ...(details ? { details } : {}) }) }],
    isError: true,
  });

  switch (name) {
    case 'list_capabilities': {
      return ok({
        service: 'WuKong-Vid',
        version: SERVER_INFO.version,
        supportedPlatforms: ['tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'vimeo', 'direct'],
        excludedPlatforms: ['youtube'],
        videoQualities: ['2160p', '1440p', '1080p', '720p', '480p', '360p'],
        audioFormats: ['mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
        endpoints: {
          mcp: `${origin}/mcp`,
          quickDownload: `${origin}/api/quick-download`,
          analyze: `${origin}/api/analyze`,
          batchAnalyze: `${origin}/api/batch-analyze`,
          download: `${origin}/api/download`,
          proxyMedia: `${origin}/api/proxy-media`,
          openApi: `${origin}/openapi.json`,
          llmsTxt: `${origin}/llms.txt`,
        },
      });
    }

    case 'extract_media_streams': {
      const targetUrl = typeof args.url === 'string' ? args.url.trim() : '';
      if (!targetUrl) {
        return fail('Missing required parameter: url');
      }
      const safe = await validateSafeUrl(targetUrl);
      if (!safe.safe) {
        return fail(safe.error || 'URL is invalid or blocked.');
      }

      const preferred = typeof args.preferred_quality === 'string' ? args.preferred_quality : undefined;
      const compact = args.compact !== false;
      const verifyReady = args.verify_ready === true;
      const cookies = typeof args.cookies === 'string' ? args.cookies : undefined;
      const extracted = await adapterManager.extract(targetUrl, cookies);
      if (!extracted.success || !extracted.data) {
        return fail(extracted.error || 'Unable to extract media from the supplied URL.');
      }

      const meta = extracted.data;
      const quickLinks = buildQuickLinksMap(origin, targetUrl, meta.title, meta.qualities, preferred || '1080p');
      const recommended = selectRecommendedQuality(meta.qualities, preferred);
      const recommendedLinks = recommended
        ? {
            id: recommended.id,
            label: recommended.label,
            resolution: recommended.resolution,
            format: recommended.format,
            fileSizeFormatted: recommended.fileSizeFormatted,
            ...buildQualityDownloadLinks(origin, meta.title, recommended),
          }
        : undefined;

      let verifiedStatus: { ready: boolean; bytesProbed?: number; contentType?: string; cached?: boolean } | undefined;
      if (verifyReady && recommended) {
        const probeParams = new URLSearchParams({
          url: recommended.url,
          format: recommended.format,
          filename: sanitizeFilename(meta.title || 'wukong_media', recommended.format),
        });
        if (recommended.audioUrl) probeParams.set('audioUrl', recommended.audioUrl);
        if ((recommended.format === 'mp3' || recommended.format === 'm4a') && recommended.bitrateKbps) {
          probeParams.set('bitrate', `${recommended.bitrateKbps}k`);
        }
        if (recommended.format === 'mp4' && recommended.targetHeight && recommended.targetHeight <= 720 && !recommended.isNative) {
          probeParams.set('scaleHeight', String(recommended.targetHeight));
        }
        const probed = await probeLocalDownloadStream(localPort, probeParams);
        verifiedStatus = probed.ok
          ? { ready: true, bytesProbed: probed.bytesProbed, contentType: probed.contentType, ...(probed.cached ? { cached: true } : {}) }
          : { ready: false };
      }

      const tiers = meta.qualities.map((q) => {
        const links = buildQualityDownloadLinks(origin, meta.title, q);
        if (compact) {
          return {
            id: q.id,
            label: q.label,
            resolution: q.resolution,
            format: q.format,
            ...(q.bitrateKbps ? { bitrateKbps: q.bitrateKbps } : {}),
            ...(q.fileSizeFormatted ? { fileSizeFormatted: q.fileSizeFormatted } : {}),
            ...links,
          };
        }
        return { ...q, ...links };
      });

      return ok({
        id: meta.id,
        platform: meta.platform,
        title: meta.title,
        author: meta.author,
        durationSeconds: meta.durationSeconds,
        durationFormatted: meta.durationFormatted,
        quickLinks,
        recommended: recommendedLinks,
        ...(verifiedStatus ? { streamVerified: verifiedStatus } : {}),
        ...(compact ? {} : { thumbnailUrl: meta.thumbnailUrl, sourceType: meta.sourceType }),
        qualities: tiers,
      });
    }

    case 'build_download_url': {
      const streamUrl = typeof args.stream_url === 'string' ? args.stream_url.trim() : '';
      if (!streamUrl) {
        return fail('Missing required parameter: stream_url');
      }
      const safe = await validateSafeUrl(streamUrl);
      if (!safe.safe || !validateFfmpegRemoteUrl(streamUrl)) {
        return fail(safe.error || 'Invalid stream_url.');
      }

      const audioUrl = typeof args.audio_url === 'string' && args.audio_url.trim() ? args.audio_url.trim() : undefined;
      if (audioUrl) {
        const audioSafe = await validateSafeUrl(audioUrl);
        if (!audioSafe.safe || !validateFfmpegRemoteUrl(audioUrl)) {
          return fail(audioSafe.error || 'Invalid audio_url.');
        }
      }

      const format = sanitizeMediaFormat(typeof args.format === 'string' ? args.format : 'mp4') || 'mp4';
      const bitrate =
        format === 'mp3' || format === 'm4a'
          ? sanitizeAudioBitrate(typeof args.bitrate === 'string' ? args.bitrate : undefined, format === 'm4a' ? '256k' : '320k')
          : undefined;
      const scaleHeight =
        format === 'mp4' && args.scale_height !== undefined
          ? sanitizeVideoHeight(String(args.scale_height))
          : undefined;
      const filename = sanitizeFilename(typeof args.filename === 'string' ? args.filename : 'wukong_media', format);

      const params = new URLSearchParams({
        url: streamUrl,
        format,
        filename,
      });
      if (audioUrl) params.set('audioUrl', audioUrl);
      if (bitrate) params.set('bitrate', bitrate);
      if (scaleHeight) params.set('scaleHeight', String(scaleHeight));

      const previewParams = new URLSearchParams({
        url: streamUrl,
        format,
      });
      if (audioUrl) previewParams.set('audioUrl', audioUrl);
      if (bitrate) previewParams.set('bitrate', bitrate);

      return ok({
        format,
        filename,
        ...(bitrate ? { bitrate } : {}),
        ...(scaleHeight ? { scaleHeight } : {}),
        downloadUrl: `${origin}/api/download?${params.toString()}`,
        previewUrl: `${origin}/api/proxy-media?${previewParams.toString()}`,
      });
    }

    case 'batch_extract_media': {
      const rawUrls = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0) : [];
      if (rawUrls.length === 0) {
        return fail('Provide 1 to 10 public URLs in the urls array.');
      }
      const urls = rawUrls.slice(0, 10);
      const preferred = typeof args.preferred_quality === 'string' ? args.preferred_quality : undefined;

      const results = await Promise.all(
        urls.map(async (u) => {
          const cleanUrl = u.trim();
          const safe = await validateSafeUrl(cleanUrl);
          if (!safe.safe) {
            return { url: cleanUrl, success: false, error: safe.error || 'Blocked URL' };
          }
          const extracted = await adapterManager.extract(cleanUrl);
          if (!extracted.success || !extracted.data) {
            return { url: cleanUrl, success: false, error: extracted.error || 'Extraction failed' };
          }
          const meta = extracted.data;
          const rec = selectRecommendedQuality(meta.qualities, preferred);
          const quickLinks = buildQuickLinksMap(origin, cleanUrl, meta.title, meta.qualities, preferred || '1080p');
          return {
            url: cleanUrl,
            success: true,
            platform: meta.platform,
            title: meta.title,
            durationFormatted: meta.durationFormatted,
            quickLinks,
            recommended: rec ? { id: rec.id, label: rec.label, format: rec.format, ...buildQualityDownloadLinks(origin, meta.title, rec) } : undefined,
            qualitiesCount: meta.qualities.length,
          };
        })
      );

      return ok({
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        results,
      });
    }

    case 'verify_download_stream': {
      const streamUrl = typeof args.stream_url === 'string' ? args.stream_url.trim() : '';
      if (!streamUrl) {
        return fail('Missing required parameter: stream_url');
      }
      const safe = await validateSafeUrl(streamUrl);
      if (!safe.safe || !validateFfmpegRemoteUrl(streamUrl)) {
        return fail(safe.error || 'Forbidden stream URL.');
      }

      const format = sanitizeMediaFormat(typeof args.format === 'string' ? args.format : 'mp4') || 'mp4';
      const params = new URLSearchParams({
        url: streamUrl,
        format,
        filename: `probe.${format}`,
      });
      if (typeof args.audio_url === 'string' && args.audio_url.trim()) {
        params.set('audioUrl', args.audio_url.trim());
      }
      if (typeof args.bitrate === 'string') {
        params.set('bitrate', sanitizeAudioBitrate(args.bitrate, format === 'm4a' ? '256k' : '320k'));
      }
      if (args.scale_height !== undefined) {
        const sh = sanitizeVideoHeight(String(args.scale_height));
        if (sh) params.set('scaleHeight', String(sh));
      }

      const probed = await probeLocalDownloadStream(localPort, params);
      if ('error' in probed) {
        return fail(probed.error, probed.contentType ? { contentType: probed.contentType } : undefined);
      }

      return ok({
        ready: probed.bytesProbed > 0,
        bytesProbed: probed.bytesProbed,
        contentType: probed.contentType,
        ...(probed.cached ? { cached: true } : {}),
        downloadUrl: `${origin}/api/download?${params.toString()}`,
      });
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

async function handleJsonRpcMessage(
  msg: JsonRpcRequest,
  origin: string,
  localPort: number
): Promise<JsonRpcResponse | null> {
  const isNotification = msg.id === undefined;
  const id = msg.id ?? null;

  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request.' },
    };
  }

  // Notifications require no response payload
  if (isNotification || msg.method.startsWith('notifications/')) {
    return null;
  }

  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};

  switch (msg.method) {
    case 'initialize': {
      const requestedVersion = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion as any)
        ? requestedVersion
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
          instructions:
            'WuKong-Vid MCP extracts video and audio streams from public links (TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, and direct video/HLS URLs; YouTube is excluded). Call extract_media_streams with a URL to receive ready-to-download MP4, MP3, and M4A URLs.',
        },
      };
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: MCP_TOOLS },
      };

    case 'tools/call': {
      const toolName = typeof params.name === 'string' ? params.name : '';
      if (!toolName) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Missing required params.name for tools/call.' },
        };
      }
      const toolArgs = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      const toolResult = await callMcpTool(toolName, toolArgs, origin, localPort);
      return {
        jsonrpc: '2.0',
        id,
        result: toolResult,
      };
    }

    case 'resources/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { resources: MCP_RESOURCES },
      };

    case 'resources/read': {
      const uri = typeof params.uri === 'string' ? params.uri : '';
      if (uri === 'wukong://guide/agent-quickstart') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'text/markdown', text: buildLlmsTxt(origin) }],
          },
        };
      }
      if (uri === 'wukong://capabilities/platforms') {
        const capPayload = {
          service: 'WuKong-Vid',
          supportedPlatforms: ['tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'vimeo', 'direct'],
          excludedPlatforms: ['youtube'],
          qualities: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
          mcpEndpoint: `${origin}/mcp`,
        };
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(capPayload, null, 2) }],
          },
        };
      }
      if (uri === 'wukong://schema/openapi') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(buildOpenApiSpec(origin), null, 2) }],
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: `Resource not found: ${uri}` },
      };
    }

    case 'prompts/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { prompts: MCP_PROMPTS },
      };

    case 'prompts/get': {
      const promptName = typeof params.name === 'string' ? params.name : '';
      const pArgs = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      if (promptName === 'extract_media_workflow') {
        const u = typeof pArgs.url === 'string' ? pArgs.url : '<URL>';
        const q = typeof pArgs.preferred_quality === 'string' ? pArgs.preferred_quality : '1080p';
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: 'Extract downloadable video/audio links from a public URL using WuKong-Vid.',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Call the \`extract_media_streams\` tool for url="${u}" with preferred_quality="${q}". Verify the chosen stream if needed using \`verify_download_stream\`, then present the direct \`downloadUrl\` and metadata clearly to the user.`,
                },
              },
            ],
          },
        };
      }
      if (promptName === 'batch_extract_workflow') {
        const urls = typeof pArgs.urls === 'string' ? pArgs.urls : '<URLS>';
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: 'Extract multiple public media URLs concurrently.',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Parse these public links (${urls}) into an array and call \`batch_extract_media\` to return direct downloadable links for each item.`,
                },
              },
            ],
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Prompt not found: ${promptName}` },
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      };
  }
}

export function createMcpHandlers(resolvePublicOrigin: (req: Request) => string, localPort: number) {
  const handlePost = async (req: Request, res: Response) => {
    const origin = resolvePublicOrigin(req);
    const body = req.body;

    if (!body || (typeof body !== 'object' && !Array.isArray(body))) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: expected JSON-RPC 2.0 object or array.' },
      });
      return;
    }

    const sessionId =
      (req.headers['mcp-session-id'] as string) || crypto.randomUUID();
    res.setHeader('Mcp-Session-Id', sessionId);
    res.setHeader('Cache-Control', 'no-cache');

    let responsePayload: JsonRpcResponse | JsonRpcResponse[] | null = null;
    if (Array.isArray(body)) {
      const results = (
        await Promise.all(body.map((item) => handleJsonRpcMessage(item, origin, localPort)))
      ).filter((r): r is JsonRpcResponse => r !== null);
      responsePayload = results.length > 0 ? results : null;
    } else {
      responsePayload = await handleJsonRpcMessage(body as JsonRpcRequest, origin, localPort);
    }

    if (responsePayload === null) {
      res.sendStatus(202);
      return;
    }

    const accept = (req.headers.accept || '').toLowerCase();
    // If client specifically accepts ONLY text/event-stream (without preferring JSON), emit SSE event frame
    const prefersSse = accept.includes('text/event-stream') && !accept.includes('application/json');
    if (prefersSse) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Connection', 'keep-alive');
      res.write(`event: message\ndata: ${JSON.stringify(responsePayload)}\n\n`);
      res.end();
      return;
    }

    res.json(responsePayload);
  };

  const handleGet = (req: Request, res: Response) => {
    const origin = resolvePublicOrigin(req);
    const accept = (req.headers.accept || '').toLowerCase();
    if (accept.includes('text/event-stream')) {
      const sessionId = (req.headers['mcp-session-id'] as string) || crypto.randomUUID();
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Mcp-Session-Id', sessionId);
      // Emit standard legacy SSE endpoint event + keepalive heartbeat
      res.write(`event: endpoint\ndata: ${origin}/mcp?sessionId=${encodeURIComponent(sessionId)}\n\n`);
      const keepalive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 15000);
      req.on('close', () => {
        clearInterval(keepalive);
      });
      return;
    }

    res.json({
      server: SERVER_INFO,
      protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      transport: 'streamable-http',
      endpoint: `${origin}/mcp`,
      manifest: `${origin}/.well-known/mcp.json`,
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
      resources: MCP_RESOURCES.map((r) => ({ uri: r.uri, name: r.name })),
      prompts: MCP_PROMPTS.map((p) => ({ name: p.name, description: p.description })),
    });
  };

  const handleDelete = (_req: Request, res: Response) => {
    res.sendStatus(200);
  };

  return { handlePost, handleGet, handleDelete };
}
