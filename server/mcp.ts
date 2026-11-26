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
  stripTrackingParams,
} from './security.js';
import { QualityOption } from './types.js';
import { buildLlmsTxt, buildOpenApiSpec } from './agentDocs.js';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'] as const;
const SERVER_INFO = {
  name: 'wukong-vid-mcp',
  version: '1.4.0',
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

interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface McpToolDefinition {
  name: string;
  description: string;
  annotations?: McpToolAnnotations;
  inputSchema: Record<string, unknown>;
}

function projectFields<T extends Record<string, unknown>>(obj: T, fields?: unknown): Record<string, unknown> {
  if (!Array.isArray(fields) || fields.length === 0) return obj;
  const allow = new Set(fields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0));
  if (allow.size === 0) return obj;
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (key in obj && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}

const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_capabilities',
    description:
      'Return supported platforms, excluded platforms (youtube), video/audio quality presets, and API/MCP endpoints.',
    annotations: {
      title: 'Capabilities',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_url_platform',
    description:
      'Instant pre-flight check: validates URL safety (SSRF & YouTube exclusion), detects platform (tiktok, instagram, facebook, twitter, reddit, vimeo, direct), and returns canonical URL with tracking parameters stripped.',
    annotations: {
      title: 'Inspect URL & Platform',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'URL to validate and classify.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'extract_media_streams',
    description:
      'Resolve a public video/reel/HLS URL into deterministic download links (bestMp4Url, bestMp3Url, bestM4aUrl, oneStepDownloadUrl, curlCommand, qualities). Supports preferred_quality, format_filter, fields projection, and inline verify_ready byte probe.',
    annotations: {
      title: 'Extract Media Streams',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          description: 'Public URL (TikTok, Instagram, Facebook, X, Reddit, Vimeo, direct MP4/HLS; not YouTube).',
        },
        preferred_quality: {
          type: 'string',
          enum: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
        },
        format_filter: {
          type: 'string',
          enum: ['all', 'video', 'audio'],
          default: 'all',
        },
        compact: {
          type: 'boolean',
          default: true,
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional top-level keys to return (e.g. ["title","bestMp4Url","bestMp3Url"]).',
        },
        verify_ready: {
          type: 'boolean',
          default: false,
          description: 'Probe first bytes of recommended stream inline to verify valid media headers.',
        },
        cookies: {
          type: 'string',
          description: 'Optional Cookie header.',
        },
      },
    },
  },
  {
    name: 'extract_audio_mp3',
    description:
      'Fast 1-call MP3/M4A audio resolver. Converts any public video/reel URL into downloadUrl, oneStepDownloadUrl, curlCommand, and audioTiers.',
    annotations: {
      title: 'Extract MP3/M4A Audio',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        bitrate: {
          type: 'string',
          enum: ['320k', '192k', '128k', 'm4a_256k'],
          default: '320k',
        },
        verify_ready: {
          type: 'boolean',
          default: false,
        },
        cookies: { type: 'string' },
      },
    },
  },
  {
    name: 'build_download_url',
    description:
      'Construct validated /api/download attachment URL and /api/proxy-media preview URL from a stream_url.',
    annotations: {
      title: 'Build Download URL',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      required: ['stream_url'],
      properties: {
        stream_url: { type: 'string' },
        audio_url: { type: 'string' },
        format: {
          type: 'string',
          enum: ['mp4', 'mp3', 'm4a', 'webm'],
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
        filename: { type: 'string' },
      },
    },
  },
  {
    name: 'batch_extract_media',
    description:
      'Extract up to 10 public URLs concurrently in one call. Supports preferred_quality, format_filter, and fields projection.',
    annotations: {
      title: 'Batch Extract (<=10 URLs)',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { type: 'string' },
        },
        preferred_quality: {
          type: 'string',
          enum: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
        },
        format_filter: {
          type: 'string',
          enum: ['all', 'video', 'audio'],
          default: 'all',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'verify_download_stream',
    description:
      'Probe first bytes of /api/download to confirm playable payload and valid MP4/MP3/M4A magic headers (cached 30s).',
    annotations: {
      title: 'Verify Stream Headers',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      required: ['stream_url'],
      properties: {
        stream_url: { type: 'string' },
        audio_url: { type: 'string' },
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
    name: 'Agent Quickstart (llms.txt)',
    description: 'Concise machine spec for WuKong-Vid MCP & REST tools.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'wukong://capabilities/platforms',
    name: 'Capabilities Matrix',
    description: 'JSON capability matrix (platforms, exclusions, presets, endpoints).',
    mimeType: 'application/json',
  },
  {
    uri: 'wukong://schema/openapi',
    name: 'OpenAPI 3.1 Spec',
    description: 'OpenAPI 3.1 schema for REST & MCP endpoints.',
    mimeType: 'application/json',
  },
];

const MCP_RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'wukong://extract/{url}',
    name: 'Extract Media by URI',
    description: 'Directly extract compact downloadable MP4/MP3/M4A links for a URL-encoded public media link.',
    mimeType: 'application/json',
  },
];

const MCP_PROMPTS = [
  {
    name: 'extract_media_workflow',
    description: 'Extract downloadable MP4/MP3/M4A links from a public URL.',
    arguments: [
      { name: 'url', description: 'Public media URL.', required: true },
      { name: 'preferred_quality', description: '1080p|720p|480p|360p|mp3_320k|m4a_256k', required: false },
    ],
  },
  {
    name: 'extract_audio_workflow',
    description: 'Extract downloadable MP3/M4A audio via extract_audio_mp3.',
    arguments: [
      { name: 'url', description: 'Public media URL.', required: true },
      { name: 'bitrate', description: '320k|192k|128k|m4a_256k', required: false },
    ],
  },
  {
    name: 'batch_extract_workflow',
    description: 'Extract up to 10 public URLs concurrently.',
    arguments: [{ name: 'urls', description: 'Comma/newline URLs.', required: true }],
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
  const p = preferred.toLowerCase().trim();
  if (p === 'mp3' || p.startsWith('mp3_')) {
    const kbps = parseInt(p.replace('mp3_', '').replace('k', ''), 10) || 320;
    return (
      qualities.find((q) => q.format === 'mp3' && q.bitrateKbps === kbps) ||
      qualities.find((q) => q.format === 'mp3')
    );
  }
  if (p === 'm4a' || p.startsWith('m4a_')) {
    return qualities.find((q) => q.format === 'm4a') || qualities.find((q) => q.format === 'mp3');
  }
  if (p === '4k') {
    return (
      qualities.find((q) => q.format === 'mp4' && (q.resolution.includes('2160') || q.height === 2160)) ||
      qualities.find((q) => q.format === 'mp4')
    );
  }
  const targetH = parseInt(p.replace('p', ''), 10);
  if (!Number.isNaN(targetH)) {
    return (
      qualities.find(
        (q) =>
          q.format === 'mp4' &&
          (q.targetHeight === targetH || q.resolution.toLowerCase().includes(`${targetH}p`))
      ) || qualities.find((q) => q.format === 'mp4')
    );
  }
  return qualities[0];
}

export function buildQuickLinksMap(
  origin: string,
  originalUrl: string,
  title: string,
  qualities: QualityOption[],
  preferred = '1080p',
  formatFilter: 'all' | 'video' | 'audio' = 'all'
): Record<string, string> {
  const links: Record<string, string> = {
    oneStep: `${origin}/api/quick-download?url=${encodeURIComponent(originalUrl)}&quality=${encodeURIComponent(preferred)}`,
  };
  const findLink = (predicate: (q: QualityOption) => boolean) => {
    const match = qualities.find(predicate);
    return match ? buildQualityDownloadLinks(origin, title, match).downloadUrl : undefined;
  };
  if (formatFilter !== 'audio') {
    const bestMp4 = findLink((q) => q.format === 'mp4');
    if (bestMp4) links.bestMp4 = bestMp4;
    for (const h of [2160, 1440, 1080, 720, 480, 360]) {
      const l = findLink(
        (q) => q.format === 'mp4' && (q.targetHeight === h || q.resolution.toLowerCase().includes(`${h}p`))
      );
      if (l) links[`mp4_${h}p`] = l;
    }
  }
  if (formatFilter !== 'video') {
    const verifiedAudio = qualities.find((q) => q.format === 'mp3' || q.format === 'm4a');
    if (verifiedAudio) {
      for (const kbps of [320, 192, 128]) {
        const match = qualities.find((q) => q.format === 'mp3' && q.bitrateKbps === kbps);
        links[`mp3_${kbps}k`] = buildQualityDownloadLinks(
          origin,
          title,
          match || { ...verifiedAudio, format: 'mp3', bitrateKbps: kbps }
        ).downloadUrl;
      }
      const m4aMatch = qualities.find((q) => q.format === 'm4a');
      links.m4a_256k = buildQualityDownloadLinks(
        origin,
        title,
        m4aMatch || { ...verifiedAudio, format: 'm4a', bitrateKbps: 256 }
      ).downloadUrl;
    }
  }
  return links;
}

function inspectMagicHeader(bytes: Uint8Array, format: string): { validHeader: boolean; headerHex: string } {
  const hex = Array.from(bytes.slice(0, 12))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  if (bytes.length < 4) return { validHeader: false, headerHex: hex };

  const f = format.toLowerCase();
  if (f === 'mp3') {
    const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    const isMpegSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    return { validHeader: isId3 || isMpegSync, headerHex: hex };
  }
  if (f === 'mp4' || f === 'm4a') {
    const isFtyp =
      bytes.length >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70;
    return { validHeader: isFtyp, headerHex: hex };
  }
  if (f === 'webm') {
    const isEbml = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    return { validHeader: isEbml, headerHex: hex };
  }
  return { validHeader: bytes.length > 0, headerHex: hex };
}

const VERIFIED_PROBE_TTL_MS = 30_000;
const verifiedProbeCache = new Map<
  string,
  { expiresAt: number; bytesProbed: number; contentType: string; validHeader: boolean; headerHex: string }
>();

async function probeLocalDownloadStream(
  localPort: number,
  params: URLSearchParams
): Promise<
  | { ok: true; bytesProbed: number; contentType: string; validHeader: boolean; headerHex: string; cached?: boolean }
  | { ok: false; error: string; contentType?: string }
> {
  const cacheKey = params.toString();
  const cached = verifiedProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ok: true,
      bytesProbed: cached.bytesProbed,
      contentType: cached.contentType,
      validHeader: cached.validHeader,
      headerHex: cached.headerHex,
      cached: true,
    };
  }

  const format = params.get('format') || 'mp4';
  const probeUrl = `http://127.0.0.1:${localPort}/api/download?${cacheKey}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8500);
  let bytesProbed = 0;
  let contentType = '';
  let headBytes = new Uint8Array(0);
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
        if (headBytes.length < 16) {
          const merged = new Uint8Array(Math.min(16, headBytes.length + value.length));
          merged.set(headBytes, 0);
          merged.set(value.slice(0, merged.length - headBytes.length), headBytes.length);
          headBytes = merged;
        }
        bytesProbed += value.length;
        if (bytesProbed >= 2048) {
          await reader.cancel().catch(() => {});
          ctrl.abort();
          break;
        }
      }
    }
    const { validHeader, headerHex } = inspectMagicHeader(headBytes, format);
    if (bytesProbed > 0) {
      if (verifiedProbeCache.size >= 200) {
        const oldest = verifiedProbeCache.keys().next().value;
        if (oldest) verifiedProbeCache.delete(oldest);
      }
      verifiedProbeCache.set(cacheKey, {
        expiresAt: Date.now() + VERIFIED_PROBE_TTL_MS,
        bytesProbed,
        contentType,
        validHeader,
        headerHex,
      });
    }
    return { ok: true, bytesProbed, contentType, validHeader, headerHex };
  } catch (err: any) {
    if (bytesProbed > 0 && err?.name === 'AbortError') {
      const { validHeader, headerHex } = inspectMagicHeader(headBytes, format);
      if (verifiedProbeCache.size >= 200) {
        const oldest = verifiedProbeCache.keys().next().value;
        if (oldest) verifiedProbeCache.delete(oldest);
      }
      verifiedProbeCache.set(cacheKey, {
        expiresAt: Date.now() + VERIFIED_PROBE_TTL_MS,
        bytesProbed,
        contentType,
        validHeader,
        headerHex,
      });
      return { ok: true, bytesProbed, contentType, validHeader, headerHex };
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

    case 'inspect_url_platform': {
      const targetUrl = typeof args.url === 'string' ? args.url.trim() : '';
      if (!targetUrl) {
        return fail('Missing required parameter: url');
      }
      const platform = adapterManager.detectPlatform(targetUrl);
      const safe = await validateSafeUrl(targetUrl);
      const normalizedUrl = safe.safe ? stripTrackingParams(targetUrl) : undefined;
      return ok({
        url: targetUrl,
        valid: safe.safe,
        allowed: safe.safe && platform !== 'unsupported',
        platform: safe.safe ? platform : 'blocked',
        ...(normalizedUrl ? { normalizedUrl } : {}),
        ...(safe.error ? { reason: safe.error } : {}),
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
      const formatFilter =
        args.format_filter === 'video' || args.format_filter === 'audio' ? args.format_filter : 'all';
      const compact = args.compact !== false;
      const verifyReady = args.verify_ready === true;
      const cookies = typeof args.cookies === 'string' ? args.cookies : undefined;
      const extracted = await adapterManager.extract(targetUrl, cookies);
      if (!extracted.success || !extracted.data) {
        return fail(extracted.error || 'Unable to extract media from the supplied URL.');
      }

      const meta = extracted.data;
      const quickLinks = buildQuickLinksMap(
        origin,
        targetUrl,
        meta.title,
        meta.qualities,
        preferred || (formatFilter === 'audio' ? 'mp3_320k' : '1080p'),
        formatFilter
      );
      const recommended =
        selectRecommendedQuality(
          meta.qualities,
          preferred || (formatFilter === 'audio' ? 'mp3_320k' : undefined)
        ) || meta.qualities[0];
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

      let verifiedStatus:
        | { ready: boolean; bytesProbed?: number; contentType?: string; validHeader?: boolean; cached?: boolean }
        | undefined;
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
          ? {
              ready: true,
              bytesProbed: probed.bytesProbed,
              contentType: probed.contentType,
              validHeader: probed.validHeader,
              ...(probed.cached ? { cached: true } : {}),
            }
          : { ready: false };
      }

      const filteredQualities = meta.qualities.filter((q) => {
        const isAud = q.format === 'mp3' || q.format === 'm4a';
        if (formatFilter === 'video') return !isAud;
        if (formatFilter === 'audio') return isAud;
        return true;
      });

      const tiers = filteredQualities.map((q) => {
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

      const recFile = recommended
        ? sanitizeFilename(meta.title || 'wukong_media', recommended.format)
        : 'wukong_media.mp4';

      const hasVideo = meta.qualities.some((q) => q.format !== 'mp3' && q.format !== 'm4a');
      const hasAudio = meta.qualities.some((q) => q.format === 'mp3' || q.format === 'm4a' || q.hasAudio !== false);

      const fullPayload: Record<string, unknown> = {
        id: meta.id,
        platform: meta.platform,
        normalizedUrl: stripTrackingParams(targetUrl),
        title: meta.title,
        author: meta.author,
        durationSeconds: meta.durationSeconds,
        durationFormatted: meta.durationFormatted,
        hasVideo,
        hasAudio,
        bestMp4Url: quickLinks.bestMp4,
        ...(quickLinks.mp4_720p ? { best720pUrl: quickLinks.mp4_720p } : {}),
        ...(quickLinks.mp4_480p ? { best480pUrl: quickLinks.mp4_480p } : {}),
        ...(quickLinks.mp4_360p ? { best360pUrl: quickLinks.mp4_360p } : {}),
        bestMp3Url: quickLinks.mp3_320k,
        bestM4aUrl: quickLinks.m4a_256k,
        oneStepDownloadUrl: quickLinks.oneStep,
        curlCommand: recommendedLinks
          ? `curl -L "${recommendedLinks.downloadUrl}" -o "${recFile}"`
          : `curl -L "${quickLinks.oneStep}" -o "${recFile}"`,
        quickLinks,
        recommended: recommendedLinks,
        ...(verifiedStatus ? { streamVerified: verifiedStatus } : {}),
        ...(compact ? {} : { thumbnailUrl: meta.thumbnailUrl, sourceType: meta.sourceType }),
        qualities: tiers,
      };

      return ok(projectFields(fullPayload, args.fields));
    }

    case 'extract_audio_mp3': {
      const targetUrl = typeof args.url === 'string' ? args.url.trim() : '';
      if (!targetUrl) {
        return fail('Missing required parameter: url');
      }
      const safe = await validateSafeUrl(targetUrl);
      if (!safe.safe) {
        return fail(safe.error || 'URL is invalid or blocked.');
      }

      const rawBitrate = typeof args.bitrate === 'string' ? args.bitrate.trim().toLowerCase() : '320k';
      const preferredPreset = rawBitrate === 'm4a_256k' ? 'm4a_256k' : `mp3_${rawBitrate.replace('mp3_', '')}`;
      const cookies = typeof args.cookies === 'string' ? args.cookies : undefined;
      const extracted = await adapterManager.extract(targetUrl, cookies);
      if (!extracted.success || !extracted.data) {
        return fail(extracted.error || 'Unable to extract audio stream from URL.');
      }

      const meta = extracted.data;
      const chosen =
        selectRecommendedQuality(meta.qualities, preferredPreset) ||
        meta.qualities.find((q) => q.format === 'mp3' || q.format === 'm4a');
      if (!chosen) {
        return fail('No audio stream could be extracted for this URL.');
      }

      const links = buildQualityDownloadLinks(origin, meta.title, chosen);
      const oneStepUrl = `${origin}/api/quick-download?url=${encodeURIComponent(targetUrl)}&quality=${encodeURIComponent(preferredPreset)}`;
      const safeFile = sanitizeFilename(meta.title || 'wukong_audio', chosen.format);

      let verifiedStatus:
        | { ready: boolean; bytesProbed?: number; contentType?: string; validHeader?: boolean; cached?: boolean }
        | undefined;
      if (args.verify_ready === true) {
        const probeParams = new URLSearchParams({
          url: chosen.url,
          format: chosen.format,
          filename: safeFile,
        });
        if (chosen.audioUrl) probeParams.set('audioUrl', chosen.audioUrl);
        if (chosen.bitrateKbps) probeParams.set('bitrate', `${chosen.bitrateKbps}k`);
        const probed = await probeLocalDownloadStream(localPort, probeParams);
        verifiedStatus = probed.ok
          ? {
              ready: true,
              bytesProbed: probed.bytesProbed,
              contentType: probed.contentType,
              validHeader: probed.validHeader,
              ...(probed.cached ? { cached: true } : {}),
            }
          : { ready: false };
      }

      const audioTiers = meta.qualities
        .filter((q) => q.format === 'mp3' || q.format === 'm4a')
        .map((q) => ({
          id: q.id,
          label: q.label,
          format: q.format,
          bitrateKbps: q.bitrateKbps,
          fileSizeFormatted: q.fileSizeFormatted,
          ...buildQualityDownloadLinks(origin, meta.title, q),
        }));

      return ok({
        id: meta.id,
        platform: meta.platform,
        title: meta.title,
        durationFormatted: meta.durationFormatted,
        format: chosen.format,
        bitrateKbps: chosen.bitrateKbps || 320,
        filename: safeFile,
        downloadUrl: links.downloadUrl,
        previewUrl: links.previewUrl,
        oneStepDownloadUrl: oneStepUrl,
        curlCommand: `curl -L "${links.downloadUrl}" -o "${safeFile}"`,
        ...(verifiedStatus ? { streamVerified: verifiedStatus } : {}),
        audioTiers,
      });
    }

    case 'build_download_url': {
      const streamUrl =
        typeof args.stream_url === 'string' && args.stream_url.trim()
          ? args.stream_url.trim()
          : typeof args.url === 'string'
            ? args.url.trim()
            : '';
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

      const downloadUrl = `${origin}/api/download?${params.toString()}`;
      return ok({
        format,
        filename,
        ...(bitrate ? { bitrate } : {}),
        ...(scaleHeight ? { scaleHeight } : {}),
        downloadUrl,
        previewUrl: `${origin}/api/proxy-media?${previewParams.toString()}`,
        curlCommand: `curl -L "${downloadUrl}" -o "${filename}"`,
      });
    }

    case 'batch_extract_media': {
      const rawUrls = Array.isArray(args.urls)
        ? args.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];
      if (rawUrls.length === 0) {
        return fail('Provide 1 to 10 public URLs in the urls array.');
      }
      const urls = rawUrls.slice(0, 10);
      const preferred = typeof args.preferred_quality === 'string' ? args.preferred_quality : undefined;
      const formatFilter =
        args.format_filter === 'video' || args.format_filter === 'audio' ? args.format_filter : 'all';

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
          const rec = selectRecommendedQuality(
            meta.qualities,
            preferred || (formatFilter === 'audio' ? 'mp3_320k' : undefined)
          );
          const quickLinks = buildQuickLinksMap(
            origin,
            cleanUrl,
            meta.title,
            meta.qualities,
            preferred || (formatFilter === 'audio' ? 'mp3_320k' : '1080p'),
            formatFilter
          );
          const row: Record<string, unknown> = {
            url: cleanUrl,
            success: true,
            platform: meta.platform,
            title: meta.title,
            durationFormatted: meta.durationFormatted,
            bestMp4Url: quickLinks.bestMp4,
            bestMp3Url: quickLinks.mp3_320k,
            bestM4aUrl: quickLinks.m4a_256k,
            oneStepDownloadUrl: quickLinks.oneStep,
            quickLinks,
            recommended: rec ? { id: rec.id, label: rec.label, format: rec.format, ...buildQualityDownloadLinks(origin, meta.title, rec) } : undefined,
            qualitiesCount: meta.qualities.length,
          };
          return projectFields(row, args.fields);
        })
      );

      return ok({
        total: results.length,
        succeeded: results.filter((r) => r.success !== false).length,
        results,
      });
    }

    case 'verify_download_stream': {
      const streamUrl =
        typeof args.stream_url === 'string' && args.stream_url.trim()
          ? args.stream_url.trim()
          : typeof args.url === 'string'
            ? args.url.trim()
            : '';
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
        validContainerHeader: probed.validHeader,
        headerHex: probed.headerHex,
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
            completions: {},
          },
          serverInfo: SERVER_INFO,
          instructions:
            'MACHINE_CONTRACT: WuKong-Vid MCP v1.4.0 extracts deterministic MP4 (2160p-360p) and MP3/M4A download URLs for public TikTok, Instagram, Facebook, X, Reddit, Vimeo, and direct video/HLS links (YouTube excluded -> HTTP 400). Workflow: inspect_url_platform(url) for zero-latency preflight, or call extract_media_streams(url, compact=true), extract_audio_mp3(url), or batch_extract_media(urls). Pass fields=["bestMp4Url","bestMp3Url","title"] for minimal tokens.',
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

    case 'resources/templates/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { resourceTemplates: MCP_RESOURCE_TEMPLATES },
      };

    case 'resources/read': {
      const uri = typeof params.uri === 'string' ? params.uri : '';
      if (uri.startsWith('wukong://extract/')) {
        let encodedUrl = uri.slice('wukong://extract/'.length);
        try {
          encodedUrl = decodeURIComponent(encodedUrl);
        } catch {}
        const extracted = await callMcpTool('extract_media_streams', { url: encodedUrl, compact: true }, origin, localPort);
        if (extracted.isError) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32002, message: extracted.content?.[0]?.text || 'Unable to extract URI resource' },
          };
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: extracted.content[0].text }],
          },
        };
      }
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
          version: SERVER_INFO.version,
          supportedPlatforms: ['tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'vimeo', 'direct'],
          excludedPlatforms: ['youtube'],
          qualities: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
          mcpEndpoint: `${origin}/mcp`,
        };
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(capPayload) }],
          },
        };
      }
      if (uri === 'wukong://schema/openapi') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(buildOpenApiSpec(origin)) }],
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: `Resource not found: ${uri}` },
      };
    }

    case 'completion/complete': {
      const argName = typeof params.argument?.name === 'string' ? params.argument.name : '';
      const argVal = typeof params.argument?.value === 'string' ? params.argument.value.toLowerCase().trim() : '';
      const pool =
        argName === 'bitrate'
          ? ['320k', '192k', '128k', 'm4a_256k']
          : argName === 'preferred_quality'
            ? ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k']
            : [];
      const values = pool.filter((item) => item.toLowerCase().startsWith(argVal));
      return {
        jsonrpc: '2.0',
        id,
        result: {
          completion: {
            values,
            total: values.length,
            hasMore: false,
          },
        },
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
            description: 'Extract downloadable video/audio URLs.',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Call extract_media_streams(url="${u}", preferred_quality="${q}", compact=true) and return downloadUrl + curlCommand.`,
                },
              },
            ],
          },
        };
      }
      if (promptName === 'extract_audio_workflow') {
        const u = typeof pArgs.url === 'string' ? pArgs.url : '<URL>';
        const b = typeof pArgs.bitrate === 'string' ? pArgs.bitrate : '320k';
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: 'Extract MP3/M4A audio.',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Call extract_audio_mp3(url="${u}", bitrate="${b}") and return downloadUrl + oneStepDownloadUrl.`,
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
            description: 'Batch extract public media URLs.',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Call batch_extract_media(urls=[${urls}]) and return quickLinks per URL.`,
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

    const sessionId = (req.headers['mcp-session-id'] as string) || crypto.randomUUID();
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
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, annotations: t.annotations })),
      resources: MCP_RESOURCES.map((r) => ({ uri: r.uri, name: r.name })),
      resourceTemplates: MCP_RESOURCE_TEMPLATES.map((t) => ({ uriTemplate: t.uriTemplate, name: t.name })),
      prompts: MCP_PROMPTS.map((p) => ({ name: p.name, description: p.description })),
    });
  };

  const handleDelete = (_req: Request, res: Response) => {
    res.sendStatus(200);
  };

  return { handlePost, handleGet, handleDelete };
}
