import { MouseEvent } from 'react';
import { PlatformIcon } from './PlatformIcon';

interface PlatformChipsProps {
  onNavigate?: (path: string) => void;
}

const PLATFORMS = [
  {
    id: 'tiktok',
    name: 'TikTok',
    path: '/tiktok-video-downloader',
    textColor: 'text-[#8FFCF8] group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(37,244,238,0.65)]',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    path: '/instagram-reel-downloader',
    textColor: 'text-pink-200 group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(236,72,153,0.7)]',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    path: '/facebook-video-downloader',
    textColor: 'text-blue-200 group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(59,130,246,0.7)]',
  },
  {
    id: 'x',
    name: 'X',
    path: '/supported-platforms',
    textColor: 'text-white/90 group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    path: '/supported-platforms',
    textColor: 'text-orange-200 group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(255,87,0,0.65)]',
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    path: '/supported-platforms',
    textColor: 'text-sky-200 group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(26,183,234,0.65)]',
  },
  {
    id: 'direct',
    name: 'MP3 · HLS',
    path: '/mp3-audio-extractor',
    textColor: 'text-rose-200 group-hover:text-white',
    glowClass: 'group-hover:drop-shadow-[0_0_10px_rgba(244,63,94,0.65)]',
  },
];

export function PlatformChips({ onNavigate }: PlatformChipsProps) {
  const handleLinkClick = (e: MouseEvent, path: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path);
    }
  };

  return (
    <div className="wk-slide-up w-full max-w-3xl mx-auto mt-6">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-7">
        {PLATFORMS.map((p) => (
          <a
            key={p.name}
            href={p.path}
            onClick={(e) => handleLinkClick(e, p.path)}
            className="group inline-flex items-center gap-2 py-1.5 px-1 transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
          >
            <PlatformIcon
              platform={p.id}
              className={`w-5 h-5 shrink-0 transition-all duration-200 group-hover:scale-110 ${p.glowClass}`}
            />
            <span
              className={`font-display text-xs sm:text-[13px] font-semibold tracking-tight whitespace-nowrap transition-colors ${p.textColor}`}
            >
              {p.name}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
