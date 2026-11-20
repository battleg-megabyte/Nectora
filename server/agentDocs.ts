export function buildLlmsTxt(origin: string): string {
  return `# WuKong-Vid

> High-speed public video and audio stream extractor for AI agents, MCP clients, and web apps.
> Supports TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, and direct MP4/HLS/WebM media URLs.
> Note: YouTube URLs are excluded and return HTTP 400.

## MCP Server (Model Context Protocol)
- Streamable HTTP & JSON-RPC 2.0 Endpoint: ${origin}/mcp
- Alternate API Path: ${origin}/api/mcp
- Discovery Manifest: ${origin}/.well-known/mcp.json
- Transport: Streamable HTTP (JSON-RPC 2.0 over POST, optional SSE response, GET SSE/info)
- Authentication: None required (public rate-limited access)

### Available MCP Tools
1. \`list_capabilities\` — Lists supported platforms, excluded platforms, video/audio quality tiers, and endpoints.
2. \`extract_media_streams\` — Extracts media metadata and all available MP4/MP3/M4A stream tiers for a public URL, returning ready-to-fetch \`downloadUrl\` and \`previewUrl\` links.
3. \`build_download_url\` — Constructs a validated, format-ready \`/api/download\` link for MP4 (original or scaled 720p/480p/360p), MP3 (320k/192k/128k), or M4A (256k AAC).
4. \`batch_extract_media\` — Concurrently extracts up to 10 public media URLs in a single tool call.
5. \`verify_download_stream\` — Probes an extracted \`/api/download\` link and confirms it streams valid playable bytes.

### MCP Client Configuration Example
\`\`\`json
{
  "mcpServers": {
    "wukong-vid": {
      "url": "${origin}/mcp"
    }
  }
}
\`\`\`

## REST API Endpoints (Fast 1-Step & 2-Step Workflows)
- \`GET ${origin}/api/health\` — Service status, supported platforms, and limits.
- \`GET ${origin}/api/quick-download\` — **Fastest 1-Step Download**: Query \`url\`, optional \`quality\` (\`1080p|720p|480p|360p|mp3_320k|mp3_192k|mp3_128k|m4a_256k\`), optional \`filename\`. Extracts and streams the final file in ONE single HTTP call!
- \`POST ${origin}/api/analyze\` — Body: \`{"url": "https://...", "preferred_quality": "720p"}\`. Returns metadata, flat \`quickLinks\` map, \`oneStepDownloadUrl\`, and ready-to-fetch \`downloadUrl\`/\`previewUrl\` on every quality tier.
- \`POST ${origin}/api/batch-analyze\` — Body: \`{"urls": ["https://..."], "preferred_quality": "1080p"}\`. Concurrently extracts up to 10 URLs in a single call.
- \`GET ${origin}/api/download\` — Query: \`url\`, \`format\` (\`mp4|mp3|m4a\`), optional \`bitrate\` (\`320k|192k|128k|256k\`), optional \`scaleHeight\` (\`720|480|360\`), optional \`audioUrl\`, optional \`filename\`. Streams downloadable file attachment.
- \`GET ${origin}/api/proxy-media\` — Inline preview stream proxy.

## Machine-Readable Documentation
- OpenAPI 3.1 Spec: ${origin}/openapi.json
- Extended Agent Guide: ${origin}/llms-full.txt
- Agent Discovery Card: ${origin}/.well-known/agent.json
`;
}

export function buildLlmsFullTxt(origin: string): string {
  return `${buildLlmsTxt(origin)}

## Detailed Agent Workflow

### Step 1: Extract Media Metadata & Stream Tiers
Call \`POST ${origin}/api/analyze\` with JSON body \`{ "url": "<PUBLIC_VIDEO_URL>" }\` (or invoke MCP tool \`extract_media_streams\`).

Example Response Structure:
\`\`\`json
{
  "id": "tiktok_6718335390845095173",
  "platform": "tiktok",
  "title": "Example video title",
  "durationSeconds": 15,
  "qualities": [
    {
      "id": "1080p",
      "label": "1080p Full HD",
      "resolution": "1080p",
      "format": "mp4",
      "url": "https://cdn.example/video.mp4",
      "isNative": true
    },
    {
      "id": "audio_320k",
      "label": "MP3 320kbps",
      "resolution": "audio",
      "format": "mp3",
      "bitrateKbps": 320,
      "url": "https://cdn.example/video.mp4"
    }
  ]
}
\`\`\`

### Step 2: Download Media via Server Proxy/Transcoder
Pass the chosen quality's \`url\` (and \`audioUrl\` if present, \`bitrateKbps\` for audio, or \`targetHeight\` for 720p/480p/360p scaled MP4) to \`GET ${origin}/api/download\`:

\`\`\`text
${origin}/api/download?url=<ENCODED_STREAM_URL>&format=mp4&filename=video.mp4
${origin}/api/download?url=<ENCODED_STREAM_URL>&format=mp3&bitrate=320k&filename=audio.mp3
${origin}/api/download?url=<ENCODED_STREAM_URL>&format=m4a&bitrate=256k&filename=audio.m4a
${origin}/api/download?url=<ENCODED_STREAM_URL>&format=mp4&scaleHeight=480&filename=video_480p.mp4
\`\`\`

### Supported Formats & Qualities
- **MP4 Video**: Native 4K (2160p), 1440p, 1080p, 720p, plus fast transcoded 720p HD, 480p SD, and 360p Mobile Saver.
- **MP3 Audio**: 320kbps Studio, 192kbps Balanced, 128kbps Compact.
- **M4A Audio**: 256kbps High-Efficiency AAC.

### MCP JSON-RPC 2.0 Examples
Initialize:
\`\`\`bash
curl -X POST "${origin}/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"agent","version":"1.0"}}}'
\`\`\`

List Tools:
\`\`\`bash
curl -X POST "${origin}/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
\`\`\`

Call \`extract_media_streams\`:
\`\`\`bash
curl -X POST "${origin}/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"extract_media_streams","arguments":{"url":"https://www.w3schools.com/html/mov_bbb.mp4","preferred_quality":"720p"}}}'
\`\`\`

### HTTP Status Codes
- \`200\`: Success
- \`202\`: Accepted (MCP notification acknowledgment)
- \`400\`: Invalid/missing parameters or excluded/unsupported URL (e.g. YouTube URLs)
- \`403\` / \`422\`: Upstream media is private, removed, or lacks an audio stream for audio-only export
- \`429\`: Rate limit exceeded (respect \`Retry-After\` header)
- \`502\`: Upstream media CDN temporarily unreachable
`;
}

export function buildOpenApiSpec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'WuKong-Vid Media Extraction & MCP API',
      version: '1.1.0',
      description:
        'High-speed public video extraction and MP4/MP3/M4A stream download API for AI agents and applications. Supports TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, and direct video URLs (YouTube excluded).',
    },
    servers: [{ url: origin, description: 'WuKong-Vid Live Endpoint' }],
    paths: {
      '/api/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Get service status, supported platforms, and format capabilities',
          responses: {
            '200': {
              description: 'Service health and capabilities payload',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      service: { type: 'string' },
                      version: { type: 'string' },
                      supportedPlatforms: { type: 'array', items: { type: 'string' } },
                      excludedPlatforms: { type: 'array', items: { type: 'string' } },
                      supportedQualities: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/analyze': {
        post: {
          operationId: 'analyzeMediaUrl',
          summary: 'Extract video metadata and downloadable MP4/MP3/M4A stream tiers from a public URL',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: {
                      type: 'string',
                      format: 'uri',
                      description: 'Public URL from TikTok, Instagram, Facebook, X, Reddit, Vimeo, or direct media.',
                    },
                    cookies: {
                      type: 'string',
                      description: 'Optional session cookie string for authorized access.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Extracted media metadata and stream tiers',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MediaMetadata' },
                },
              },
            },
            '400': { description: 'Invalid URL or unsupported platform' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/api/quick-download': {
        get: {
          operationId: 'quickDownloadMedia',
          summary: '1-step extract and stream download for a public URL at the requested quality preset',
          parameters: [
            { name: 'url', in: 'query', required: true, schema: { type: 'string', format: 'uri' } },
            {
              name: 'quality',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'mp3_320k', 'mp3_192k', 'mp3_128k', 'm4a_256k'],
                default: '1080p',
              },
            },
            { name: 'filename', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Binary media attachment stream (MP4, MP3, or M4A)',
              content: {
                'video/mp4': {},
                'audio/mpeg': {},
                'audio/mp4': {},
              },
            },
            '400': { description: 'Invalid or excluded URL' },
          },
        },
      },
      '/api/batch-analyze': {
        post: {
          operationId: 'batchAnalyzeUrls',
          summary: 'Concurrently extract metadata and quickLinks for up to 10 public URLs in one call',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['urls'],
                  properties: {
                    urls: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', format: 'uri' } },
                    preferred_quality: { type: 'string', default: '1080p' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Batch extraction results with quickLinks and recommended streams' },
            '400': { description: 'Missing or invalid urls array' },
          },
        },
      },
      '/api/download': {
        get: {
          operationId: 'downloadMediaStream',
          summary: 'Download or transcode an extracted stream as MP4, MP3, or M4A',
          parameters: [
            { name: 'url', in: 'query', required: true, schema: { type: 'string', format: 'uri' } },
            {
              name: 'format',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['mp4', 'mp3', 'm4a', 'webm'], default: 'mp4' },
            },
            { name: 'filename', in: 'query', required: false, schema: { type: 'string' } },
            {
              name: 'bitrate',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['320k', '192k', '128k', '256k'] },
            },
            {
              name: 'scaleHeight',
              in: 'query',
              required: false,
              schema: { type: 'integer', enum: [720, 480, 360] },
            },
            { name: 'audioUrl', in: 'query', required: false, schema: { type: 'string', format: 'uri' } },
          ],
          responses: {
            '200': {
              description: 'Binary media file attachment stream',
              content: {
                'video/mp4': {},
                'audio/mpeg': {},
                'audio/mp4': {},
              },
            },
            '400': { description: 'Invalid stream URL or parameters' },
          },
        },
      },
      '/mcp': {
        post: {
          operationId: 'mcpJsonRpc',
          summary: 'Model Context Protocol (MCP) JSON-RPC 2.0 Streamable HTTP Endpoint',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['jsonrpc', 'method'],
                  properties: {
                    jsonrpc: { type: 'string', enum: ['2.0'] },
                    id: { type: ['string', 'integer', 'null'] },
                    method: { type: 'string' },
                    params: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'JSON-RPC 2.0 response or SSE stream' },
            '202': { description: 'Accepted notification' },
          },
        },
      },
    },
    components: {
      schemas: {
        QualityOption: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            resolution: { type: 'string' },
            format: { type: 'string', enum: ['mp4', 'mp3', 'm4a', 'webm'] },
            url: { type: 'string' },
            audioUrl: { type: 'string' },
            isNative: { type: 'boolean' },
            bitrateKbps: { type: 'integer' },
            targetHeight: { type: 'integer' },
            fileSizeFormatted: { type: 'string' },
          },
        },
        MediaMetadata: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            originalUrl: { type: 'string' },
            platform: { type: 'string' },
            title: { type: 'string' },
            durationSeconds: { type: 'number' },
            durationFormatted: { type: 'string' },
            thumbnailUrl: { type: 'string' },
            qualities: {
              type: 'array',
              items: { $ref: '#/components/schemas/QualityOption' },
            },
          },
        },
      },
    },
  };
}

export function buildMcpManifest(origin: string) {
  return {
    schemaVersion: '1.0',
    name: 'wukong-vid-mcp',
    displayName: 'WuKong-Vid MCP Server',
    version: '1.1.0',
    description:
      'Model Context Protocol server for extracting and downloading public MP4 videos (4K/1080p/720p/480p/360p) and MP3/M4A audio across TikTok, Instagram, Facebook, X, Reddit, Vimeo, and direct streams.',
    transport: {
      type: 'streamable-http',
      url: `${origin}/mcp`,
      alternateUrl: `${origin}/api/mcp`,
      supportedProtocolVersions: ['2025-03-26', '2024-11-05'],
    },
    authentication: {
      type: 'none',
    },
    documentation: {
      llmsTxt: `${origin}/llms.txt`,
      llmsFullTxt: `${origin}/llms-full.txt`,
      openApi: `${origin}/openapi.json`,
      homepage: `${origin}/`,
    },
    capabilities: ['tools', 'resources', 'prompts'],
    tools: [
      'list_capabilities',
      'extract_media_streams',
      'build_download_url',
      'batch_extract_media',
      'verify_download_stream',
    ],
  };
}

export function buildAgentCard(origin: string) {
  return {
    name: 'WuKong-Vid',
    description:
      'High-speed media extraction and format conversion service for AI agents. Supports MP4 (4K–360p), MP3 (320k/192k/128k), and M4A (256k AAC).',
    url: `${origin}/`,
    mcp: {
      transport: 'streamable-http',
      endpoint: `${origin}/mcp`,
      manifest: `${origin}/.well-known/mcp.json`,
    },
    api: {
      openapi: `${origin}/openapi.json`,
      llmsTxt: `${origin}/llms.txt`,
      health: `${origin}/api/health`,
      quickDownload: `${origin}/api/quick-download`,
      analyze: `${origin}/api/analyze`,
      batchAnalyze: `${origin}/api/batch-analyze`,
      download: `${origin}/api/download`,
    },
    supportedPlatforms: ['tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'vimeo', 'direct'],
    excludedPlatforms: ['youtube'],
    authenticationRequired: false,
  };
}

export function buildAiPluginManifest(origin: string) {
  return {
    schema_version: 'v1',
    name_for_human: 'WuKong-Vid',
    name_for_model: 'wukong_vid',
    description_for_human: 'Extract and download public MP4 videos and MP3/M4A audio streams.',
    description_for_model:
      'Extracts direct stream URLs and serves downloadable MP4 (4K/1080p/720p/480p/360p), MP3 (320k/192k/128k), and M4A (256k) files from TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, and direct video links. YouTube URLs are excluded.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: `${origin}/openapi.json`,
    },
    logo_url: `${origin}/monkey-king-icon.jpg`,
    legal_info_url: `${origin}/llms.txt`,
  };
}
