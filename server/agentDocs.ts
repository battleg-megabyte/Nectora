export function buildLlmsTxt(origin: string): string {
  return `# WuKong-Vid (AI Agent & MCP Spec v1.4.0)

> Zero-auth Streamable HTTP MCP + REST media extractor for automated agents.
> Platforms: tiktok, instagram, facebook, twitter, reddit, vimeo, direct (mp4/webm/m3u8/mp3).
> Excluded: youtube (returns HTTP 400).

## MCP Transport
- Endpoint: ${origin}/mcp (alias: ${origin}/api/mcp)
- Manifest: ${origin}/.well-known/mcp.json
- Agent Card: ${origin}/.well-known/agent.json
- OpenAPI 3.1: ${origin}/openapi.json
- Protocol: JSON-RPC 2.0 over HTTP POST (Streamable HTTP 2025-03-26 / 2024-11-05), auth=none.
- Resource Templates: \`wukong://extract/{url}\`

## MCP Config
\`\`\`json
{"mcpServers":{"wukong-vid":{"url":"${origin}/mcp"}}}
\`\`\`

## Tools
- \`inspect_url_platform(url)\` -> zero-latency SSRF/policy validation + detected platform + normalized URL.
- \`extract_media_streams(url, preferred_quality?, format_filter?, compact?, fields?, verify_ready?)\` -> returns \`bestMp4Url\`, \`best720pUrl\`, \`best480pUrl\`, \`best360pUrl\`, \`bestMp3Url\`, \`bestM4aUrl\`, \`oneStepDownloadUrl\`, \`curlCommand\`, \`quickLinks\`, \`qualities\`. Pass \`fields:["bestMp4Url","bestMp3Url","title"]\` for minimal output tokens.
- \`extract_audio_mp3(url, bitrate?, verify_ready?)\` -> \`bitrate\` in \`320k|192k|128k|m4a_256k\`. Returns ready \`downloadUrl\`, \`oneStepDownloadUrl\`, \`curlCommand\`.
- \`batch_extract_media(urls, preferred_quality?, format_filter?, fields?)\` -> concurrent extraction for up to 10 URLs.
- \`build_download_url(stream_url, format?, bitrate?, scale_height?, audio_url?, filename?)\` -> constructs \`/api/download\` attachment URL.
- \`verify_download_stream(stream_url, format?, bitrate?, scale_height?, audio_url?)\` -> fast cached header & byte check.
- \`list_capabilities()\` -> supported platforms, presets, endpoints.

## Fast REST Calls
- 1-Step Direct Binary Stream: \`GET ${origin}/api/quick-download?url=<ENCODED_URL>&quality=1080p\` (\`quality\`: \`2160p|1440p|1080p|720p|480p|360p|mp3_320k|mp3_192k|mp3_128k|m4a_256k\`)
- Metadata + Links JSON: \`POST ${origin}/api/analyze\` body \`{"url":"...","preferred_quality":"1080p"}\`
- Batch JSON (<=10): \`POST ${origin}/api/batch-analyze\` body \`{"urls":["..."],"preferred_quality":"1080p","format_filter":"all"}\`
- Transcode/Attachment Proxy: \`GET ${origin}/api/download?url=<STREAM_URL>&format=mp4|mp3|m4a&bitrate=320k&scaleHeight=720\`
`;
}

export function buildLlmsFullTxt(origin: string): string {
  return `${buildLlmsTxt(origin)}

## JSON-RPC 2.0 Call Examples
\`\`\`bash
curl -s -X POST "${origin}/mcp" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"extract_media_streams","arguments":{"url":"https://www.w3schools.com/html/mov_bbb.mp4","fields":["platform","title","bestMp4Url","bestMp3Url","oneStepDownloadUrl"]}}}'
\`\`\`

\`\`\`bash
curl -s -X POST "${origin}/mcp" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"extract_audio_mp3","arguments":{"url":"https://www.w3schools.com/html/mov_bbb.mp4","bitrate":"320k"}}}'
\`\`\`

## HTTP Status Semantics
- 200: JSON result or binary media stream
- 202: MCP notification accepted
- 400: Invalid/blocked/excluded URL (e.g. YouTube)
- 403/422: Private/removed upstream or missing audio stream
- 429: Rate limit hit (check Retry-After)
- 502: Upstream CDN unavailable
`;
}

export function buildOpenApiSpec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'WuKong-Vid Media Extraction & MCP API',
      version: '1.4.0',
      description:
        'Machine-first public video & audio stream extractor. Supports TikTok, Instagram, Facebook, X, Reddit, Vimeo, and direct video/HLS URLs (YouTube excluded).',
    },
    servers: [{ url: origin, description: 'WuKong-Vid Live Endpoint' }],
    paths: {
      '/api/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Service health, supported platforms, and capabilities',
          responses: {
            '200': {
              description: 'Capabilities payload',
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
          summary: 'Extract stream tiers, quickLinks, and oneStepDownloadUrl',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    preferred_quality: { type: 'string', default: '1080p' },
                    cookies: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Media metadata and download tiers',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MediaMetadata' },
                },
              },
            },
            '400': { description: 'Invalid or excluded URL' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/api/quick-download': {
        get: {
          operationId: 'quickDownloadMedia',
          summary: '1-step extract and stream attachment binary',
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
              description: 'Binary media stream',
              content: { 'video/mp4': {}, 'audio/mpeg': {}, 'audio/mp4': {} },
            },
            '400': { description: 'Invalid or excluded URL' },
          },
        },
      },
      '/api/batch-analyze': {
        post: {
          operationId: 'batchAnalyzeUrls',
          summary: 'Concurrently extract up to 10 public URLs',
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
                    format_filter: { type: 'string', enum: ['all', 'video', 'audio'], default: 'all' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Batch results with quickLinks' },
            '400': { description: 'Invalid urls payload' },
          },
        },
      },
      '/api/download': {
        get: {
          operationId: 'downloadMediaStream',
          summary: 'Stream or transcode extracted media URL to MP4/MP3/M4A',
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
              description: 'Binary media attachment stream',
              content: { 'video/mp4': {}, 'audio/mpeg': {}, 'audio/mp4': {} },
            },
            '400': { description: 'Invalid parameters' },
          },
        },
      },
      '/mcp': {
        post: {
          operationId: 'mcpJsonRpc',
          summary: 'MCP JSON-RPC 2.0 Streamable HTTP Endpoint',
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
            '200': { description: 'JSON-RPC 2.0 response or SSE' },
            '202': { description: 'Notification accepted' },
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
    version: '1.4.0',
    description:
      'Zero-auth MCP server resolving public social/video/HLS URLs into deterministic MP4 (2160p-360p) and MP3/M4A download streams.',
    transport: {
      type: 'streamable-http',
      url: `${origin}/mcp`,
      alternateUrl: `${origin}/api/mcp`,
      supportedProtocolVersions: ['2025-03-26', '2024-11-05'],
    },
    authentication: { type: 'none' },
    documentation: {
      llmsTxt: `${origin}/llms.txt`,
      llmsFullTxt: `${origin}/llms-full.txt`,
      openApi: `${origin}/openapi.json`,
      homepage: `${origin}/`,
    },
    capabilities: ['tools', 'resources', 'resourceTemplates', 'prompts', 'completions'],
    tools: [
      'inspect_url_platform',
      'list_capabilities',
      'extract_media_streams',
      'extract_audio_mp3',
      'build_download_url',
      'batch_extract_media',
      'verify_download_stream',
    ],
  };
}

export function buildAgentCard(origin: string) {
  return {
    name: 'WuKong-Vid',
    version: '1.4.0',
    description:
      'Machine-first media extraction & MP4/MP3/M4A stream service for AI agents.',
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
      'Resolves public TikTok, Instagram, Facebook, X, Reddit, Vimeo, and direct video/HLS URLs into deterministic MP4 (2160p-360p), MP3 (320k/192k/128k), and M4A (256k) downloads. YouTube URLs excluded.',
    auth: { type: 'none' },
    api: { type: 'openapi', url: `${origin}/openapi.json` },
    logo_url: `${origin}/monkey-king-icon.jpg`,
    legal_info_url: `${origin}/llms.txt`,
  };
}
