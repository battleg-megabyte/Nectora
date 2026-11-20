export interface SeoSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  codeBlock?: {
    label: string;
    code: string;
  };
}

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface SeoExampleLink {
  label: string;
  url: string;
  formatSummary: string;
}

export interface SeoPageConfig {
  path: string;
  navLabel: string;
  category: 'platform' | 'developer' | 'resource' | 'legal';
  title: string;
  description: string;
  h1: string;
  h2: string;
  intro: string;
  badgeText: string;
  schemaType: 'WebPage' | 'TechArticle' | 'FAQPage' | 'Blog';
  lastmod: string;
  priority: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  examples?: SeoExampleLink[];
  sections: SeoSection[];
  faqs: SeoFaqItem[];
  relatedPaths: string[];
}

export const DEFAULT_PUBLIC_ORIGIN =
  'https://ais-pre-gcwc4scgts426qmkyughvs-721143561104.europe-west2.run.app';

export const HOMEPAGE_SEO = {
  title: 'Download Public Videos & Audio | WuKong Vid',
  description:
    'Download public videos and audio from TikTok, Instagram, Facebook, X, Reddit and Vimeo in MP4, MP3 or M4A. Fast extraction for creators, editors and AI agents.',
  h1: 'Download Public Videos & Audio in MP4, MP3, and M4A',
  h2: 'Fast Media Extraction for Creators, Editors, Developers, and AI Agents',
  notice:
    'Download any public videos or audio streams freely at maximum speed. Users bear sole responsibility for downloaded media; WuKong Vid accepts no liability for external content or usage. YouTube URLs are not supported.',
};

export const SEO_PAGES: SeoPageConfig[] = [
  {
    path: '/tiktok-video-downloader',
    navLabel: 'TikTok Downloader',
    category: 'platform',
    title: 'TikTok Video Downloader in 1080p MP4 & MP3 | WuKong Vid',
    description:
      'Use the WuKong Vid TikTok video downloader to save public TikTok clips in 1080p, 720p, 480p, or 360p MP4 and extract 320kbps MP3 or M4A audio.',
    h1: 'TikTok Video Downloader in HD MP4 and MP3 Audio',
    h2: 'Save Public TikTok Clips in Original Resolution or Compact Mobile Tiers',
    intro:
      'WuKong Vid provides a fast, browser-ready TikTok video downloader built for creators, video editors, researchers, and automated pipelines. Paste any public TikTok share link, mobile URL, or web video link to inspect native streams and download clean MP4 video or MP3 audio.',
    badgeText: 'TikTok Extractor',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.9',
    changefreq: 'weekly',
    examples: [
      {
        label: 'Standard TikTok Video (@scout2015)',
        url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
        formatSummary: 'MP4 1080p / 720p / 480p / 360p + MP3 320k–128k',
      },
      {
        label: 'Official TikTok Feed Clip',
        url: 'https://www.tiktok.com/@tiktok/video/7106594312292453675',
        formatSummary: 'Full HD MP4 + 320kbps Studio MP3',
      },
    ],
    sections: [
      {
        heading: 'Supported TikTok Link Formats & Resolution Tiers',
        paragraphs: [
          'Whether you copy a desktop watch URL, a mobile share URL, or an embedded TikTok link, WuKong Vid resolves the public media container and exposes both native video streams and size-optimized MP4 tiers.',
          'Editors can grab the highest original quality MP4 for timeline cutting, while mobile users can select 480p SD or 360p Data Saver for faster transfers.',
        ],
        bullets: [
          'Supports standard web links (/video/ID), mobile links (m.tiktok.com), short vm.tiktok.com links, and embed URLs',
          'Generates 1080p Full HD, 720p HD, 480p SD, and 360p Mobile Saver MP4 downloads',
          'Extracts accompanying soundtracks in 320kbps, 192kbps, or 128kbps MP3 plus 256kbps M4A AAC',
          'Works directly inside the web extractor, Batch Queue, REST API, and MCP server',
        ],
      },
      {
        heading: 'Extracting TikTok Media Programmatically via REST or MCP',
        paragraphs: [
          'Developers and AI agents can inspect any public TikTok link by calling POST /api/analyze or invoking the extract_media_streams MCP tool at /mcp.',
        ],
        codeBlock: {
          label: 'REST API Request Example',
          code: `curl -X POST "{{ORIGIN}}/api/analyze" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://www.tiktok.com/@scout2015/video/6718335390845095173"}'`,
        },
      },
    ],
    faqs: [
      {
        question: 'Can I extract only the MP3 audio from a TikTok video?',
        answer:
          'Yes. After analyzing any public TikTok link, switch to the Audio tab or pick MP3 320kbps, 192kbps, 128kbps, or M4A 256kbps directly.',
      },
      {
        question: 'Does the TikTok downloader support private accounts?',
        answer:
          'No. WuKong Vid extracts publicly accessible videos; private account streams cannot be resolved without public access.',
      },
    ],
    relatedPaths: ['/mp3-audio-extractor', '/instagram-reel-downloader', '/mcp', '/how-it-works'],
  },
  {
    path: '/instagram-reel-downloader',
    navLabel: 'Instagram Reels',
    category: 'platform',
    title: 'Instagram Reel Downloader for MP4 Video & MP3 Audio | WuKong Vid',
    description:
      'Download public Instagram Reels and video posts in HD MP4 or convert Reel audio into MP3 and M4A tracks with WuKong Vid.',
    h1: 'Instagram Reel Downloader for Public Reels & Video Posts',
    h2: 'Extract Original MP4 Streams and Clean Audio Tracks in Seconds',
    intro:
      'Use the WuKong Vid Instagram Reel downloader to save public Reels, vertical clips, and post videos in standard playable MP4 containers or extract 320kbps MP3 audio for reference archiving and editing.',
    badgeText: 'Instagram Extractor',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.9',
    changefreq: 'weekly',
    examples: [
      {
        label: 'Public Instagram Reel',
        url: 'https://www.instagram.com/reel/DTVTvUDj-b1/',
        formatSummary: '1080p / 720p / 480p / 360p MP4 + MP3 & M4A',
      },
    ],
    sections: [
      {
        heading: 'Built for Creators, Editors, and Social Workflows',
        paragraphs: [
          'Paste a public /reel/ or /p/ URL—even if it includes tracking query parameters like ?igsh=—and WuKong Vid normalizes the link, inspects the stream dimensions, and prepares an instant HTML5 preview alongside downloadable tiers.',
          'Each extraction includes creator attribution, duration details, and direct server-proxied file delivery.',
        ],
        bullets: [
          'Handles /reel/, /reels/, and /p/ public post links automatically',
          'Downloads H.264 MP4 containers compatible with Premiere Pro, DaVinci Resolve, CapCut, iOS, and Android',
          'Supports instant MP3 audio extraction at 320kbps, 192kbps, or 128kbps',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I save multiple Instagram Reels in one session?',
        answer:
          'Yes. Open Batch Queue to paste multiple Reel links one per line, analyze them sequentially, and watch or save each file in one flow.',
      },
      {
        question: 'Can I download Instagram Reels on iPhone or Android?',
        answer:
          'Yes. After saving a Reel, WuKong Vid lets you play it immediately, save the MP4 file to Downloads, or use your device share sheet to export directly to Files or Photos.',
      },
      {
        question: 'Do tracking parameters in Instagram share links break extraction?',
        answer:
          'No. Tracking parameters such as igsh and utm tags are normalized automatically before extraction.',
      },
    ],
    relatedPaths: ['/tiktok-video-downloader', '/facebook-video-downloader', '/mp3-audio-extractor', '/supported-platforms'],
  },
  {
    path: '/facebook-video-downloader',
    navLabel: 'Facebook Video',
    category: 'platform',
    title: 'Facebook Video Downloader in HD MP4 & MP3 | WuKong Vid',
    description:
      'Download public Facebook page videos, Watch clips, and mobile m.facebook.com links in HD MP4 or MP3 audio with WuKong Vid.',
    h1: 'Facebook Video Downloader for Public Page & Watch Videos',
    h2: 'Extract Playable HD MP4 Video and 320kbps MP3 Audio Streams',
    intro:
      'WuKong Vid makes it simple to save public Facebook videos from brand pages, Watch feeds, and mobile share links into clean MP4 files across 1080p, 720p, 480p, and 360p resolutions, or export standalone MP3 and M4A audio.',
    badgeText: 'Facebook Extractor',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.9',
    changefreq: 'weekly',
    examples: [
      {
        label: 'Public Facebook Page Video',
        url: 'https://www.facebook.com/facebook/videos/10153231379946729/',
        formatSummary: 'HD MP4 + Compact 480p/360p + MP3 320k–128k',
      },
      {
        label: 'Facebook Watch Link (?v=)',
        url: 'https://www.facebook.com/watch/?v=10153231379946729',
        formatSummary: 'Full Video & Audio Tier Matrix',
      },
    ],
    sections: [
      {
        heading: 'Supports Page Videos, Watch URLs, and Mobile Links',
        paragraphs: [
          'Facebook serves public videos across multiple URL conventions including standard page paths (/videos/ID), Facebook Watch links (?v=ID), and mobile m.facebook.com URLs. WuKong Vid recognizes all of these patterns and delivers standard MP4 files ready for playback.',
        ],
        bullets: [
          'Works with facebook.com/user/videos/..., /watch/?v=..., fb.watch, and m.facebook.com links',
          'Live-muxes separate DASH audio and video streams when needed so downloads never arrive silent',
          'Includes compact 480p and 360p MP4 presets for fast sharing over mobile connections',
        ],
      },
    ],
    faqs: [
      {
        question: 'Why do some Facebook videos arrive without audio on other tools?',
        answer:
          'Some platforms separate HD video and audio tracks into different streams. WuKong Vid automatically muxes video and audio streams on the server so your MP4 plays with full sound.',
      },
    ],
    relatedPaths: ['/instagram-reel-downloader', '/mp3-audio-extractor', '/supported-platforms', '/how-it-works'],
  },
  {
    path: '/mp3-audio-extractor',
    navLabel: 'MP3 Audio Extractor',
    category: 'platform',
    title: 'MP3 & M4A Audio Extractor (320kbps–128kbps) | WuKong Vid',
    description:
      'Extract clean 320kbps, 192kbps, 128kbps MP3 and 256kbps M4A AAC audio tracks from public TikTok, Instagram, Facebook, X, Reddit, Vimeo, and direct video links.',
    h1: 'MP3 & M4A Audio Extractor for Public Videos & Streams',
    h2: 'Convert Public Video Links into Studio 320kbps MP3 or High-Efficiency M4A',
    intro:
      'Need clean audio from a public video, podcast clip, speech, or social post? The WuKong Vid MP3 audio extractor decodes audio streams on the server and delivers tagged MP3 files (320kbps, 192kbps, 128kbps) or 256kbps M4A AAC audio.',
    badgeText: 'Audio Extractor',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.9',
    changefreq: 'weekly',
    examples: [
      {
        label: 'Direct Video to 320kbps MP3 / 256kbps M4A',
        url: 'https://www.w3schools.com/html/mov_bbb.mp4',
        formatSummary: 'MP3 320k / 192k / 128k + M4A 256k AAC',
      },
      {
        label: 'HLS .m3u8 Stream to MP3 Audio',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        formatSummary: 'Real-time HLS audio transcoding to MP3 & M4A',
      },
    ],
    sections: [
      {
        heading: 'Choose the Exact Audio Bitrate for Your Workflow',
        paragraphs: [
          'Different projects call for different audio profiles. WuKong Vid exposes four validated audio output options on every compatible stream so you never over-download or lose clarity.',
        ],
        bullets: [
          'MP3 320 kbps (Studio) — Maximum MP3 fidelity for music, mastering, and post-production',
          'MP3 192 kbps (Balanced) — Clean speech and dialogue quality with moderate file size',
          'MP3 128 kbps (Compact) — Lightweight voice memos and fast mobile previews',
          'M4A 256 kbps (AAC) — Modern Apple- and hardware-friendly AAC container',
        ],
      },
      {
        heading: 'Direct Audio Download via API or MCP',
        paragraphs: [
          'Call /api/download with format=mp3 and bitrate=320k (or format=m4a&bitrate=256k), or use the build_download_url and verify_download_stream MCP tools to obtain a tested audio download link.',
        ],
        codeBlock: {
          label: 'Audio Download URL Pattern',
          code: `{{ORIGIN}}/api/download?url=<ENCODED_STREAM_URL>&format=mp3&bitrate=320k&filename=audio_320k.mp3`,
        },
      },
    ],
    faqs: [
      {
        question: 'Does MP3 extraction work on HLS (.m3u8) streams too?',
        answer:
          'Yes. HLS playlists are transcoded in real time into standard ID3-tagged MP3 files or fast-start M4A AAC containers.',
      },
      {
        question: 'Can I preview audio before saving the file?',
        answer:
          'Yes. Selecting any MP3 or M4A tier in the stream list loads an inline audio player powered by the media preview proxy.',
      },
    ],
    relatedPaths: ['/tiktok-video-downloader', '/api', '/mcp', '/how-it-works'],
  },
  {
    path: '/mcp',
    navLabel: 'MCP Server',
    category: 'developer',
    title: 'MCP Server for AI Agents & Media Extraction | WuKong Vid',
    description:
      'Connect Claude, Cursor, Windsurf, or custom AI agents to the WuKong Vid Model Context Protocol (MCP) server at /mcp with 5 live media extraction tools.',
    h1: 'MCP Server for AI Agents & Public Media Extraction',
    h2: 'Streamable HTTP Model Context Protocol Endpoint with OpenAPI Discovery',
    intro:
      'WuKong Vid exposes a public, zero-auth Model Context Protocol (MCP) server at /mcp (and /api/mcp) supporting Streamable HTTP, JSON-RPC 2.0, and Server-Sent Events. AI assistants can discover platform capabilities, extract MP4/MP3/M4A stream links, process up to 10 URLs in batch, and verify live download streams.',
    badgeText: 'Model Context Protocol',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.95',
    changefreq: 'weekly',
    sections: [
      {
        heading: 'MCP Endpoint & Client Configuration',
        paragraphs: [
          'Point any MCP-compatible client (such as Claude Desktop, Cursor, Windsurf, or a custom agent runtime) to the Streamable HTTP endpoint below. Protocol versions 2025-03-26 and 2024-11-05 are supported natively, with automatic session ID tracking and HTTP 202 notification acknowledgment.',
        ],
        codeBlock: {
          label: 'mcpServers Client Configuration JSON',
          code: `{
  "mcpServers": {
    "wukong-vid": {
      "url": "{{ORIGIN}}/mcp"
    }
  }
}`,
        },
      },
      {
        heading: 'All 5 Live MCP Tools',
        paragraphs: [
          'Every tool returns structured JSON alongside human-readable text output so reasoning models can pass ready-to-download links straight to users or downstream automation steps.',
        ],
        bullets: [
          'list_capabilities — Lists supported platforms, excluded platforms (YouTube), video/audio presets, and discovery links',
          'extract_media_streams — Resolves metadata, flat quickLinks (mp4_1080p..mp4_360p, mp3_320k..mp3_128k, oneStep), and optional inline verify_ready probe in a single compact JSON call',
          'build_download_url — Constructs validated /api/download and /api/proxy-media URLs for custom format, bitrate, and scale_height parameters',
          'batch_extract_media — Concurrently resolves up to 10 public media URLs in a single tool call',
          'verify_download_stream — Probes an extracted /api/download stream to confirm valid playable media bytes before delivery',
        ],
      },
      {
        heading: 'MCP Resources, Prompts & Machine-Readable Specs',
        paragraphs: [
          'In addition to tools, the MCP server exposes three resources (wukong://guide/agent-quickstart, wukong://capabilities/platforms, wukong://schema/openapi) and two workflow prompts (extract_media_workflow, batch_extract_workflow).',
          'Full OpenAPI 3.1 schema is published at /openapi.json, along with /llms.txt, /llms-full.txt, /.well-known/mcp.json, and /.well-known/agent.json.',
        ],
        codeBlock: {
          label: 'cURL JSON-RPC 2.0 Tool Call Example',
          code: `curl -X POST "{{ORIGIN}}/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "extract_media_streams",
      "arguments": {
        "url": "https://www.w3schools.com/html/mov_bbb.mp4",
        "preferred_quality": "720p"
      }
    }
  }'`,
        },
      },
    ],
    faqs: [
      {
        question: 'Does the WuKong Vid MCP server require an API key?',
        answer:
          'No. The MCP endpoint is open for public rate-limited use with no credentials required.',
      },
      {
        question: 'How does /mcp handle both web browsers and MCP clients?',
        answer:
          'POST /mcp handles all JSON-RPC 2.0 MCP traffic, GET /mcp with Accept: text/event-stream opens an SSE channel, GET /mcp with Accept: application/json returns server capabilities, and GET /mcp from browsers serves this human-readable documentation page.',
      },
    ],
    relatedPaths: ['/api', '/supported-platforms', '/how-it-works', '/blog'],
  },
  {
    path: '/api',
    navLabel: 'API Docs',
    category: 'developer',
    title: 'Media Extraction REST API & OpenAPI Docs | WuKong Vid',
    description:
      'Integrate the WuKong Vid media extraction API with POST /api/analyze, GET /api/download, /openapi.json, and /llms.txt for MP4, MP3, and M4A workflows.',
    h1: 'Media Extraction REST API & OpenAPI 3.1 Documentation',
    h2: 'Programmatic Video & Audio Stream Resolution for Developers and Backends',
    intro:
      'Build video workflows, creator utilities, or agent pipelines using our straightforward JSON and streaming HTTP endpoints. Extract metadata and stream variants with POST /api/analyze, then stream MP4, MP3, or M4A attachments directly via GET /api/download.',
    badgeText: 'REST API Reference',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.95',
    changefreq: 'weekly',
    sections: [
      {
        heading: 'Core REST Endpoints',
        paragraphs: [
          'All REST endpoints return standard JSON error envelopes and honor Content-Disposition attachment headers for clean browser or server downloads.',
        ],
        bullets: [
          'GET /api/health — Returns live service status, supported platforms, quality tiers, and MCP/OpenAPI discovery URLs',
          'GET /api/quick-download — 1-step extract & stream endpoint (?url=...&quality=720p|mp3_320k) requiring only a single HTTP call',
          'POST /api/analyze — Accepts {"url": "https://..."} and returns normalized metadata, direct quickLinks map, and all quality tiers',
          'POST /api/batch-analyze — Concurrently resolves up to 10 public URLs in one request',
          'GET /api/download — Streams MP4 (native or 720p/480p/360p scaled), MP3 (320k/192k/128k), or M4A (256k) attachments',
          'GET /api/proxy-media — Streams inline range-friendly video/audio previews for web players',
          'GET /openapi.json — Complete machine-readable OpenAPI 3.1.0 specification',
        ],
      },
      {
        heading: 'Single-Call Quick Download & Two-Step Extraction',
        paragraphs: [
          'For maximum speed, fetch GET /api/quick-download?url=<PUBLIC_URL>&quality=720p (or mp3_320k) to extract and stream media in one HTTP round-trip, or call POST /api/analyze to inspect the pre-built quickLinks map.',
        ],
        codeBlock: {
          label: 'JavaScript / Fetch API Integration',
          code: `const analyzeRes = await fetch("{{ORIGIN}}/api/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://www.w3schools.com/html/mov_bbb.mp4" })
});
const media = await analyzeRes.json();
const bestMp4 = media.qualities.find((q) => q.format === "mp4");
const downloadUrl = \`{{ORIGIN}}/api/download?url=\${encodeURIComponent(bestMp4.url)}&format=mp4&filename=clip.mp4\`;`,
        },
      },
    ],
    faqs: [
      {
        question: 'Where can automated tools inspect the API schema?',
        answer:
          'Fetch /openapi.json for OpenAPI 3.1, /llms.txt or /llms-full.txt for LLM integration guides, or /.well-known/agent.json for the capability card.',
      },
      {
        question: 'Are YouTube URLs supported by the API?',
        answer:
          'No. YouTube URLs are excluded across both the web interface and all API/MCP endpoints.',
      },
    ],
    relatedPaths: ['/mcp', '/supported-platforms', '/how-it-works', '/about'],
  },
  {
    path: '/supported-platforms',
    navLabel: 'Supported Platforms',
    category: 'resource',
    title: 'Supported Platforms & Output Formats | WuKong Vid',
    description:
      'See every platform and media container supported by WuKong Vid: TikTok, Instagram, Facebook, X/Twitter, Reddit, Vimeo, HLS .m3u8, MP4, MP3, and M4A.',
    h1: 'Supported Platforms & Stream Output Matrix',
    h2: 'Public Social Video Sources, Direct Streams, and Audio Containers',
    intro:
      'WuKong Vid pairs platform-specific extractors with universal HTML5 and HLS stream handling so creators and agents get reliable MP4, MP3, and M4A outputs from a single unified interface.',
    badgeText: 'Platform Matrix',
    schemaType: 'WebPage',
    lastmod: '2026-11-20',
    priority: '0.85',
    changefreq: 'weekly',
    sections: [
      {
        heading: 'Supported Video & Social Sources',
        paragraphs: [
          'Every supported source must be publicly accessible without bypassing paywalls or private account restrictions.',
        ],
        bullets: [
          'TikTok — Public clips, mobile share links, embeds, and soundtracks',
          'Instagram — Public Reels (/reel/, /reels/) and video posts (/p/)',
          'Facebook — Public Page videos, Watch URLs (?v=), and m.facebook.com videos',
          'X (Twitter) — Public video posts across x.com and twitter.com status links',
          'Reddit — Public Reddit hosted videos (v.redd.it and post permalinks)',
          'Vimeo — Public Vimeo video pages and progressive streams',
          'Direct Media & Web — Direct .mp4, .webm, .mov files, HLS .m3u8 playlists, and public HTML5 video pages',
        ],
      },
      {
        heading: 'Supported Download Qualities & Formats',
        paragraphs: [
          'When a source provides high-resolution video, WuKong Vid makes native resolution available alongside fast scaled MP4 and multi-bitrate audio presets.',
        ],
        bullets: [
          'Video MP4: Native up to 4K (2160p) / 1440p / 1080p, plus 720p HD, 480p SD, and 360p Mobile Saver',
          'Audio MP3: 320 kbps Studio, 192 kbps Balanced, and 128 kbps Compact',
          'Audio M4A: 256 kbps High-Efficiency AAC',
        ],
      },
      {
        heading: 'Excluded Platforms Notice',
        paragraphs: [
          'Save any public media you want across supported sources; users take sole responsibility for downloaded files and WuKong Vid assumes no liability. YouTube URLs are not supported and are rejected across the web UI, REST API, and MCP server.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I extract HLS (.m3u8) playlists as regular MP4 files?',
        answer:
          'Yes. WuKong Vid remuxes public .m3u8 streams into standard fragmented MP4 files ready for playback or editing.',
      },
    ],
    relatedPaths: ['/tiktok-video-downloader', '/instagram-reel-downloader', '/facebook-video-downloader', '/mp3-audio-extractor'],
  },
  {
    path: '/how-it-works',
    navLabel: 'How It Works',
    category: 'resource',
    title: 'How WuKong Vid Works — Video, Audio, Batch & MCP | WuKong Vid',
    description:
      'Learn how WuKong Vid extracts public MP4 video tiers, converts 320kbps MP3 audio, runs batch queues, and connects AI agents via MCP and OpenAPI.',
    h1: 'How WuKong Vid Extracts Public Video & Audio Streams',
    h2: 'Four Workflows: Single Link, Batch Queue, Audio Export, and MCP Agents',
    intro:
      'From pasting a single social link to orchestrating automated downloads through an AI assistant, WuKong Vid follows a clear, verifiable pipeline built around standard web media containers.',
    badgeText: 'Architecture & Guide',
    schemaType: 'TechArticle',
    lastmod: '2026-11-20',
    priority: '0.85',
    changefreq: 'weekly',
    sections: [
      {
        heading: '1. Paste Any Public Link & Choose Target Quality',
        paragraphs: [
          'Paste a link from TikTok, Instagram, Facebook, X, Reddit, Vimeo, or a direct .mp4/.m3u8 URL into the homepage extractor. Choose a preferred starting quality (1080p, 720p, 480p, or 360p) and click Extract Stream.',
          'The server inspects available streams, maps native video/audio tracks, and returns a clean matrix of all downloadable options with estimated file sizes.',
        ],
      },
      {
        heading: '2. Live Muxing, Resolution Scaling & Audio Conversion',
        paragraphs: [
          'If a high-definition video separates audio and video streams, WuKong Vid muxes them on the fly into a single MP4 container. Need compact file sizes or audio only? Pick 480p, 360p, MP3 (320k/192k/128k), or M4A (256k) without installing local conversion tools.',
        ],
      },
      {
        heading: '3. Batch Extraction Queue for Multi-Clip Projects',
        paragraphs: [
          'Open Batch Queue from the header or footer to paste multiple public URLs one per line. WuKong Vid analyzes them sequentially, lets you monitor live download speed and progress per row, and stores saved clips in your local browser history.',
        ],
      },
      {
        heading: '4. AI Agent Automation via MCP & REST API',
        paragraphs: [
          'AI assistants connect directly to /mcp using JSON-RPC 2.0 or inspect /llms.txt and /openapi.json. Agents call extract_media_streams or batch_extract_media and can run verify_download_stream before sharing links.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Are files stored permanently on WuKong Vid servers?',
        answer:
          'No. Streams are proxied or transcoded on demand directly to your device, and any temporary fallback files are automatically cleaned up.',
      },
    ],
    relatedPaths: ['/supported-platforms', '/mcp', '/api', '/mp3-audio-extractor'],
  },
  {
    path: '/blog',
    navLabel: 'Blog & Guides',
    category: 'resource',
    title: 'WuKong Vid Blog — Media Extraction & AI Agent Guides | WuKong Vid',
    description:
      'Read practical guides on MP4 resolution selection, 320kbps MP3 vs 256kbps M4A audio, batch workflows, and connecting AI agents to MCP media tools.',
    h1: 'WuKong Vid Engineering Blog & Creator Guides',
    h2: 'Practical Workflows for Creators, Editors, Developers, and AI Agents',
    intro:
      'Explore hands-on tutorials covering video quality selection, audio bitrate trade-offs, HLS-to-MP4 remuxing, and connecting modern AI assistants to live MCP extraction tools.',
    badgeText: 'Guides & Articles',
    schemaType: 'Blog',
    lastmod: '2026-11-20',
    priority: '0.8',
    changefreq: 'weekly',
    sections: [
      {
        heading: 'Guide 1: Choosing Between 1080p Original, 720p HD, 480p SD, and 360p Saver',
        paragraphs: [
          'Creators archiving B-roll or editing interviews should always grab the native 1080p (or 4K when available) MP4 stream to preserve edge sharpness and color fidelity across re-renders.',
          'For quick team review in chat apps or mobile storage efficiency, 480p SD cuts bandwidth significantly while keeping speech and visual framing crisp, and 360p Saver excels on metered connections.',
        ],
      },
      {
        heading: 'Guide 2: MP3 320kbps vs 192kbps vs M4A 256kbps — Which Format Should You Save?',
        paragraphs: [
          'MP3 remains the universal standard across DJ decks, older hardware players, and NLE timelines. Choosing 320kbps preserves high-frequency sparkle for music tracks, while 192kbps and 128kbps work cleanly for spoken word.',
          'If your primary workflow stays inside Apple devices, Final Cut Pro, or modern mobile editors, 256kbps M4A (AAC) typically offers slightly cleaner compression efficiency at a smaller file size.',
        ],
      },
      {
        heading: 'Guide 3: Giving AI Assistants Real Video Extraction Tools with MCP',
        paragraphs: [
          'Instead of asking an AI chat model to guess media URLs, connecting your assistant to the WuKong Vid MCP server (/mcp) lets it run real stream extraction, pick a requested quality preset, and verify playable bytes via verify_download_stream.',
        ],
        codeBlock: {
          label: 'Quick MCP Workflow Prompt',
          code: `Extract https://www.w3schools.com/html/mov_bbb.mp4 via WuKong-Vid MCP, select 320kbps MP3 audio, verify the stream is ready, and return the direct download link.`,
        },
      },
    ],
    faqs: [
      {
        question: 'Where can developers read the complete AI agent integration spec?',
        answer:
          'Visit /mcp for Model Context Protocol documentation, /api for REST integration examples, or fetch /llms-full.txt directly.',
      },
    ],
    relatedPaths: ['/mcp', '/api', '/mp3-audio-extractor', '/how-it-works'],
  },
  {
    path: '/about',
    navLabel: 'About & Contact',
    category: 'legal',
    title: 'About WuKong Vid & Contact Information | WuKong Vid',
    description:
      'Learn about WuKong Vid by Eyad Saber—a public video and audio stream extractor for creators, editors, developers, and AI agents.',
    h1: 'About WuKong Vid',
    h2: 'Built by Eyad Saber for Creators, Editors, Developers, and AI Agents',
    intro:
      'WuKong Vid is a web utility and developer platform created by Eyad Saber to make extracting public MP4 videos and MP3/M4A audio clean, transparent, and automation-friendly.',
    badgeText: 'About & Contact',
    schemaType: 'WebPage',
    lastmod: '2026-11-20',
    priority: '0.6',
    changefreq: 'monthly',
    sections: [
      {
        heading: 'Our Purpose & Positioning',
        paragraphs: [
          'Many web downloaders clutter screens with pop-ups, broken links, or silent video files. WuKong Vid focuses on reliable server-side extraction, multi-bitrate audio conversion, batch processing, and open agent protocols (MCP and OpenAPI 3.1).',
          'Download any public videos or audio streams you want at full speed. Users bear sole responsibility for downloaded media; WuKong Vid assumes no liability for external content or usage. YouTube URLs are not supported.',
        ],
      },
      {
        heading: 'Contact & Responsible Inquiries',
        paragraphs: [
          'For creator inquiries, technical feedback, API/MCP integration questions, or rights-holder takedown/exclusion requests, reach out directly by email.',
        ],
        bullets: [
          'Creator & Developer: Eyad Saber',
          'Contact Email: battlegroundsforfunny@gmail.com',
          'Machine-Readable Docs: /llms.txt and /openapi.json',
        ],
      },
    ],
    faqs: [],
    relatedPaths: ['/privacy-policy', '/terms-of-use', '/supported-platforms', '/mcp'],
  },
  {
    path: '/privacy-policy',
    navLabel: 'Privacy Policy',
    category: 'legal',
    title: 'Privacy Policy | WuKong Vid',
    description:
      'Read the WuKong Vid Privacy Policy explaining how URLs, local browser history, server proxies, and temporary files are handled.',
    h1: 'Privacy Policy',
    h2: 'How WuKong Vid Handles Requests and Browser Storage',
    intro:
      'WuKong Vid is designed with data minimization in mind. This Privacy Policy explains what data is processed when you analyze public links, download media, or connect an AI agent via MCP or REST.',
    badgeText: 'Legal & Trust',
    schemaType: 'WebPage',
    lastmod: '2026-11-20',
    priority: '0.5',
    changefreq: 'monthly',
    sections: [
      {
        heading: 'No User Accounts & Local-Only History',
        paragraphs: [
          'WuKong Vid does not require account registration. Your recent extraction and download history is stored strictly in your own browser localStorage and can be cleared at any time inside the History drawer.',
        ],
      },
      {
        heading: 'Transient Media Processing',
        paragraphs: [
          'Submitted public URLs are inspected on demand to locate media streams. Download streams are piped directly to your client, and any temporary conversion buffers required for fallback audio encoding are deleted immediately once transfer completes.',
          'Optional user-supplied cookie headers are never persisted to disk.',
        ],
      },
      {
        heading: 'Contact for Privacy Questions',
        paragraphs: [
          'If you have questions about this Privacy Policy, contact battlegroundsforfunny@gmail.com.',
        ],
      },
    ],
    faqs: [],
    relatedPaths: ['/terms-of-use', '/about', '/how-it-works'],
  },
  {
    path: '/terms-of-use',
    navLabel: 'Terms of Use',
    category: 'legal',
    title: 'Terms of Use & Zero-Liability Notice | WuKong Vid',
    description:
      'Review the WuKong Vid Terms of Use, user-discretion download disclaimer, zero-liability policy, and YouTube exclusion.',
    h1: 'Terms of Use',
    h2: 'Open Public Extraction, Sole User Responsibility, and Zero Liability',
    intro:
      'WuKong Vid allows you to inspect and save any publicly accessible video or audio stream freely. By using the web app, REST API, or MCP server, you accept sole responsibility for all downloaded files and downstream use.',
    badgeText: 'Terms & Disclaimer',
    schemaType: 'WebPage',
    lastmod: '2026-11-20',
    priority: '0.5',
    changefreq: 'monthly',
    sections: [
      {
        heading: 'Sole User Responsibility & Zero Liability',
        paragraphs: [
          'You may download any public video or audio links you choose at full speed. You bear sole legal and personal responsibility for all files saved and how you store or use them; WuKong Vid and its creator accept zero responsibility or liability for external media, third-party sources, or user actions.',
        ],
      },
      {
        heading: 'Excluded Sources & Fair Rate Limits',
        paragraphs: [
          'YouTube URLs are not supported on WuKong Vid. Automated clients, AI agents, and REST integrations must respect server rate limits (indicated by Retry-After headers on HTTP 429) and must not attempt to access private, local, or restricted network addresses.',
        ],
      },
      {
        heading: 'Service Disclaimer & Contact',
        paragraphs: [
          'WuKong Vid is provided on an "as-is" basis without warranties of continuous third-party CDN availability. For technical feedback or inquiries, email battlegroundsforfunny@gmail.com.',
        ],
      },
    ],
    faqs: [],
    relatedPaths: ['/privacy-policy', '/about', '/supported-platforms'],
  },
];

export function normalizeSeoPath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const cleaned = pathname.replace(/\/+$/, '').toLowerCase();
  return cleaned || '/';
}

export function getSeoPageByPath(pathname: string): SeoPageConfig | undefined {
  const norm = normalizeSeoPath(pathname);
  return SEO_PAGES.find((p) => p.path === norm);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPageJsonLd(page: SeoPageConfig | null, origin: string): string {
  if (!page) {
    return JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'WuKong Vid',
        url: `${origin}/`,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'All',
        description: HOMEPAGE_SEO.description,
        image: `${origin}/moon-backdrop-hd.jpg`,
        author: {
          '@type': 'Person',
          name: 'Eyad Saber',
        },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      null,
      2
    );
  }

  const graph: Array<Record<string, unknown>> = [
    {
      '@type': page.schemaType === 'Blog' ? 'Blog' : page.schemaType === 'TechArticle' ? 'TechArticle' : 'WebPage',
      name: page.title,
      headline: page.h1,
      description: page.description,
      url: `${origin}${page.path}`,
      isPartOf: {
        '@type': 'WebSite',
        name: 'WuKong Vid',
        url: `${origin}/`,
      },
      author: {
        '@type': 'Person',
        name: 'Eyad Saber',
      },
      dateModified: page.lastmod,
    },
  ];

  if (page.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

export function renderSsrBodyHtml(page: SeoPageConfig | null, origin: string): string {
  const navLinks = SEO_PAGES.map(
    (p) => `<a href="${escapeHtml(p.path)}">${escapeHtml(p.navLabel)}</a>`
  ).join(' · ');

  const skeletonShell = `<div class="wk-pre-page" aria-busy="true" aria-label="Loading WuKong Vid">
  <div class="wk-pre-hdr">
    <div class="wk-pre-bar" style="width:136px;height:28px;"></div>
    <div class="wk-pre-bar" style="width:190px;height:32px;"></div>
  </div>
  <div class="wk-pre-main">
    <div class="wk-pre-bar" style="width:68px;height:68px;border-radius:16px;"></div>
    <div class="wk-pre-bar" style="width:min(540px,88%);height:42px;"></div>
    <div class="wk-pre-bar" style="width:min(360px,68%);height:20px;"></div>
    <div class="wk-pre-bar" style="width:min(768px,100%);height:62px;border-radius:16px;margin-top:10px;"></div>
    <div class="wk-pre-grid">
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:46px;height:14px;"></div></div>
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:62px;height:14px;"></div></div>
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:58px;height:14px;"></div></div>
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:18px;height:14px;"></div></div>
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:42px;height:14px;"></div></div>
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:44px;height:14px;"></div></div>
      <div class="wk-pre-plat"><div class="wk-pre-bar" style="width:20px;height:20px;border-radius:9999px;"></div><div class="wk-pre-bar" style="width:64px;height:14px;"></div></div>
    </div>
    <div class="wk-pre-bento">
      <div class="wk-pre-bar" style="height:140px;border-radius:16px;"></div>
      <div class="wk-pre-bar" style="height:140px;border-radius:16px;"></div>
      <div class="wk-pre-bar" style="height:140px;border-radius:16px;"></div>
    </div>
  </div>
</div>`;

  if (!page) {
    return `${skeletonShell}<div class="wk-sr-seo"><main data-ssr="homepage">
  <h1>${escapeHtml(HOMEPAGE_SEO.h1)}</h1>
  <h2>${escapeHtml(HOMEPAGE_SEO.h2)}</h2>
  <p>${escapeHtml(HOMEPAGE_SEO.description)}</p>
  <p>WuKong Vid serves as a TikTok video downloader, Instagram Reel downloader, Facebook video downloader, MP4 video downloader, MP3 audio extractor, M4A audio downloader, batch video downloader, media extraction API, MCP server for AI agents, and public video stream extractor.</p>
  <p>${escapeHtml(HOMEPAGE_SEO.notice)}</p>
  <nav aria-label="Site Directory"><a href="/">Home</a> · ${navLinks}</nav>
</main></div>`;
  }

  const replaceOrigin = (s: string) => s.split('{{ORIGIN}}').join(origin);
  const sectionsHtml = page.sections
    .map((sec) => {
      const paras = sec.paragraphs.map((p) => `<p>${escapeHtml(replaceOrigin(p))}</p>`).join('');
      const bullets = sec.bullets
        ? `<ul>${sec.bullets.map((b) => `<li>${escapeHtml(replaceOrigin(b))}</li>`).join('')}</ul>`
        : '';
      const code = sec.codeBlock
        ? `<pre><code>${escapeHtml(replaceOrigin(sec.codeBlock.code))}</code></pre>`
        : '';
      return `<section><h3>${escapeHtml(sec.heading)}</h3>${paras}${bullets}${code}</section>`;
    })
    .join('');

  const faqsHtml = page.faqs.length
    ? `<section><h3>Frequently Asked Questions</h3>${page.faqs
        .map((f) => `<article><h4>${escapeHtml(f.question)}</h4><p>${escapeHtml(f.answer)}</p></article>`)
        .join('')}</section>`
    : '';

  return `${skeletonShell}<div class="wk-sr-seo"><main data-ssr="seo-page">
  <nav aria-label="Breadcrumb"><a href="/">WuKong Vid Home</a> / <span>${escapeHtml(page.navLabel)}</span></nav>
  <h1>${escapeHtml(page.h1)}</h1>
  <h2>${escapeHtml(page.h2)}</h2>
  <p>${escapeHtml(page.intro)}</p>
  ${sectionsHtml}
  ${faqsHtml}
  <p>${escapeHtml(HOMEPAGE_SEO.notice)}</p>
  <footer><nav aria-label="All Guides"><a href="/">Home</a> · ${navLinks}</nav></footer>
</main></div>`;
}

export function injectSeoIntoHtmlTemplate(
  htmlTemplate: string,
  page: SeoPageConfig | null,
  origin: string
): string {
  const title = page ? page.title : HOMEPAGE_SEO.title;
  const description = page ? page.description : HOMEPAGE_SEO.description;
  const canonicalUrl = page ? `${origin}${page.path}` : `${origin}/`;
  const jsonLd = buildPageJsonLd(page, origin).replace(/<\/script/gi, '<\\/script');
  const ssrBody = renderSsrBodyHtml(page, origin);

  let html = htmlTemplate;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(title)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(description)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${escapeHtml(`${origin}/moon-backdrop-hd.jpg`)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${escapeHtml(`${origin}/moon-backdrop-hd.jpg`)}" />`
  );
  html = html.replace(
    /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">\n${jsonLd}\n    </script>`
  );
  html = html.replace(
    /<div\s+id="root">[\s\S]*?<\/div>\s*(?=<script\s+type="module")/i,
    `<div id="root">${ssrBody}</div>\n    `
  );

  return html;
}
