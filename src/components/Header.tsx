import { useState, MouseEvent } from 'react';
import { History, Menu, X, Layers, Music, Globe2, Code2 } from 'lucide-react';
import { WukongBrandMark } from './WukongBrandMark';

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenDiagnostics: () => void;
  onOpenBatch: () => void;
  onResetHome?: () => void;
  onNavigate?: (path: string) => void;
  historyCount: number;
}

export function Header({
  onOpenHistory,
  onOpenDiagnostics,
  onOpenBatch,
  onResetHome,
  onNavigate,
  historyCount,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const triggerMobileAction = (fn: () => void) => {
    setMobileMenuOpen(false);
    fn();
  };

  const handleLinkNav = (e: MouseEvent, path: string) => {
    if (onNavigate) {
      e.preventDefault();
      setMobileMenuOpen(false);
      onNavigate(path);
    }
  };

  return (
    <header
      id="app-header"
      className="sticky top-0 z-40 w-full border-b border-rose-300/15 bg-[#07020A]/75 backdrop-blur-xl"
    >
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            if (onResetHome) {
              e.preventDefault();
              onResetHome();
            }
          }}
          className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0 text-left group cursor-pointer min-h-[40px]"
        >
          <WukongBrandMark size="sm" animatedArrow />
          <span className="font-display font-bold text-base sm:text-lg tracking-tight text-white">
            WuKong<span className="text-rose-400">-</span>
            <span className="text-pink-400">Vid</span>
          </span>
        </a>

        {/* Zone 2: Clean Unboxed Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-rose-100/80"
        >
          <a
            href="/supported-platforms"
            onClick={(e) => handleLinkNav(e, '/supported-platforms')}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-rose-400 after:transition-all"
          >
            <Globe2 className="w-4 h-4 text-rose-300" />
            <span>Platforms</span>
          </a>
          <a
            href="/mp3-audio-extractor"
            onClick={(e) => handleLinkNav(e, '/mp3-audio-extractor')}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-pink-400 after:transition-all"
          >
            <Music className="w-4 h-4 text-pink-300" />
            <span>MP3 Audio</span>
          </a>
          <button
            id="btn-batch-modal"
            type="button"
            onClick={onOpenBatch}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-rose-400 after:transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4 text-rose-400" />
            <span>Batch Queue</span>
          </button>
          <a
            href="/mcp"
            onClick={(e) => handleLinkNav(e, '/mcp')}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-pink-400 after:transition-all"
          >
            <Code2 className="w-4 h-4 text-pink-400" />
            <span>Developers</span>
          </a>
        </nav>

        {/* Zone 3: History Action + Mobile Drawer Toggle (Zero sound button, unboxed action) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-history-modal"
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-2.5 min-h-[40px] text-xs sm:text-sm font-medium text-rose-100/85 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <History className="w-4 h-4 text-pink-400 shrink-0" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="font-mono text-xs text-rose-300 tabular-nums">
                {historyCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-rose-100/85 hover:text-white transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Drawer Menu */}
      {mobileMenuOpen && (
        <div className="wk-dropdown-in md:hidden border-t border-rose-300/15 bg-[#09030D]/95 backdrop-blur-xl px-4 py-3 space-y-1">
          <a
            href="/supported-platforms"
            onClick={(e) => handleLinkNav(e, '/supported-platforms')}
            className="w-full flex items-center gap-3 px-2 min-h-[44px] text-sm font-medium text-white hover:text-rose-200 transition-colors text-left"
          >
            <Globe2 className="w-4 h-4 text-rose-300 shrink-0" />
            <span>Supported Platforms</span>
          </a>
          <a
            href="/mp3-audio-extractor"
            onClick={(e) => handleLinkNav(e, '/mp3-audio-extractor')}
            className="w-full flex items-center gap-3 px-2 min-h-[44px] text-sm font-medium text-white hover:text-rose-200 transition-colors text-left"
          >
            <Music className="w-4 h-4 text-pink-300 shrink-0" />
            <span>MP3 Audio Extractor</span>
          </a>
          <button
            type="button"
            onClick={() => triggerMobileAction(onOpenBatch)}
            className="w-full flex items-center gap-3 px-2 min-h-[44px] text-sm font-medium text-white hover:text-rose-200 transition-colors text-left cursor-pointer"
          >
            <Layers className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Batch Queue</span>
          </button>
          <a
            href="/mcp"
            onClick={(e) => handleLinkNav(e, '/mcp')}
            className="w-full flex items-center gap-3 px-2 min-h-[44px] text-sm font-medium text-white hover:text-rose-200 transition-colors text-left"
          >
            <Code2 className="w-4 h-4 text-pink-400 shrink-0" />
            <span>Developers</span>
          </a>
        </div>
      )}
    </header>
  );
}
