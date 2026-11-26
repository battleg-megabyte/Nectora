export interface SeoNavItem {
  path: string;
  navLabel: string;
  category: 'platform' | 'developer' | 'resource' | 'legal';
  title: string;
  description: string;
}

export const HOMEPAGE_SEO = {
  title: 'Download Public Videos & Audio | WuKong Vid',
  description:
    'Download public videos and audio from TikTok, Instagram, Facebook, X, Reddit and Vimeo in MP4, MP3 or M4A. Fast extraction for creators, editors and AI agents.',
  h1: 'Download Public Videos & Audio in MP4, MP3, and M4A',
  h2: 'Fast Media Extraction for Creators, Editors, Developers, and AI Agents',
  notice:
    'Download any public videos or audio streams freely at maximum speed. Users bear sole responsibility for downloaded media; WuKong Vid accepts no liability for external content or usage. YouTube URLs are not supported.',
};

export const SEO_NAV_ITEMS: SeoNavItem[] = [
  {
    path: '/tiktok-video-downloader',
    navLabel: 'TikTok Downloader',
    category: 'platform',
    title: 'TikTok Video Downloader in 1080p MP4 & MP3 | WuKong Vid',
    description:
      'Use the WuKong Vid TikTok video downloader to save public TikTok clips in 1080p, 720p, 480p, or 360p MP4 and extract 320kbps MP3 or M4A audio.',
  },
  {
    path: '/instagram-reel-downloader',
    navLabel: 'Instagram Reels',
    category: 'platform',
    title: 'Instagram Reel Downloader & MP3 Audio Extractor | WuKong Vid',
    description:
      'Download public Instagram Reels and video posts in HD MP4 or 320kbps MP3 audio using WuKong Vid.',
  },
  {
    path: '/facebook-video-downloader',
    navLabel: 'Facebook Video',
    category: 'platform',
    title: 'Facebook Video Downloader in HD MP4 & MP3 | WuKong Vid',
    description:
      'Download public Facebook Reels, Watch clips, and page videos in HD MP4 or extract crisp MP3 audio with WuKong Vid.',
  },
  {
    path: '/mp3-audio-extractor',
    navLabel: 'MP3 Audio Extractor',
    category: 'platform',
    title: 'MP3 & M4A Audio Extractor from Public Videos | WuKong Vid',
    description:
      'Convert public TikTok, Instagram, Facebook, X, Reddit, Vimeo, and HLS streams to 320kbps MP3 or 256kbps M4A audio.',
  },
  {
    path: '/mcp',
    navLabel: 'MCP Server',
    category: 'developer',
    title: 'Developer MCP Server & AI Agent Video Downloader | WuKong Vid',
    description:
      'Connect autonomous AI agents and desktop clients to the zero-auth WuKong Vid Streamable HTTP MCP server for structured MP4 and MP3 extraction.',
  },
  {
    path: '/api',
    navLabel: 'API Docs',
    category: 'developer',
    title: 'Video Extraction REST API & OpenAPI Docs | WuKong Vid',
    description:
      'Integrate video extraction, batch link resolution, and 1-step MP4/MP3 HTTP download routes via WuKong Vid REST API.',
  },
  {
    path: '/supported-platforms',
    navLabel: 'Supported Platforms',
    category: 'resource',
    title: 'Supported Social Platforms & Video Formats | WuKong Vid',
    description:
      'Complete breakdown of public platforms supported by WuKong Vid including TikTok, Instagram, Facebook, X, Reddit, Vimeo, HLS .m3u8, MP4, MP3, and M4A.',
  },
  {
    path: '/how-it-works',
    navLabel: 'How It Works',
    category: 'resource',
    title: 'How WuKong Vid Extracts & Streams Media | WuKong Vid',
    description:
      'Learn how WuKong Vid resolves public streams, probes native MP4 tiers, converts 320kbps MP3 audio, and enforces SSRF safety.',
  },
  {
    path: '/blog',
    navLabel: 'Blog & Guides',
    category: 'resource',
    title: 'Creator Guides, Formats & Workflow Tips | WuKong Vid',
    description:
      'Practical guides covering MP4 vs HLS streaming, MP3 vs M4A audio quality, batch video workflows, and MCP integration.',
  },
  {
    path: '/about',
    navLabel: 'About & Contact',
    category: 'legal',
    title: 'About WuKong Vid & Creator Information | WuKong Vid',
    description:
      'Built by Eyad Saber for creators, editors, developers, and AI workflows needing fast public media extraction.',
  },
  {
    path: '/privacy-policy',
    navLabel: 'Privacy Policy',
    category: 'legal',
    title: 'Privacy Policy | WuKong Vid',
    description:
      'Privacy and zero-tracking policy explaining how WuKong Vid processes public media URLs and local browser history.',
  },
  {
    path: '/terms-of-use',
    navLabel: 'Terms of Use',
    category: 'legal',
    title: 'Terms of Use & Platform Policy | WuKong Vid',
    description:
      'Terms of usage, user copyright responsibility, and excluded platform policies for WuKong Vid.',
  },
];

export function normalizeSeoPath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const cleaned = pathname.replace(/\/+$/, '').toLowerCase();
  return cleaned || '/';
}

export function getSeoNavByPath(pathname: string): SeoNavItem | undefined {
  const norm = normalizeSeoPath(pathname);
  return SEO_NAV_ITEMS.find((p) => p.path === norm);
}
