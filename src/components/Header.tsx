import { useState, useEffect } from 'react';
import { History, Menu, X, Layers, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WukongBrandMark } from './WukongBrandMark';
import {
  isSoundEnabled,
  setSoundEnabled,
  subscribeSoundEnabled,
} from '../utils/soundEffects';

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenDiagnostics: () => void;
  onOpenBatch: () => void;
  onResetHome?: () => void;
  historyCount: number;
}

export function Header({
  onOpenHistory,
  onOpenDiagnostics,
  onOpenBatch,
  onResetHome,
  historyCount,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  useEffect(() => {
    return subscribeSoundEnabled((enabled) => {
      setSoundOn(enabled);
    });
  }, []);

  const triggerMobileAction = (fn: () => void) => {
    setMobileMenuOpen(false);
    fn();
  };

  const handleToggleSound = () => {
    const next = setSoundEnabled(!soundOn);
    setSoundOn(next);
  };

  return (
    <header
      id="app-header"
      className="sticky top-0 z-40 w-full border-b border-rose-300/15 bg-[#090409]/85 backdrop-blur-md"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={onResetHome}
          className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0 text-left group cursor-pointer min-h-[40px]"
        >
          <WukongBrandMark size="sm" animatedArrow />
          <span className="font-display font-bold text-base sm:text-lg tracking-tight text-white">
            WuKong<span className="text-rose-400">-</span>
            <span className="text-pink-400">Vid</span>
          </span>
        </button>

        {/* Zone 2: Clean Text Navigation Links */}
        <nav
          aria-label="Primary utilities"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-rose-100/75"
        >
          <button
            id="btn-batch-modal"
            type="button"
            onClick={onOpenBatch}
            className="whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-rose-400 after:transition-all cursor-pointer"
          >
            Batch Queue
          </button>
          <button
            id="btn-diagnostics-modal"
            type="button"
            onClick={onOpenDiagnostics}
            className="whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-rose-400 after:transition-all cursor-pointer"
          >
            Stream Check
          </button>
        </nav>

        {/* Zone 3: Sound Control + History Action + Mobile Drawer Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            id="btn-sound-toggle"
            type="button"
            onClick={handleToggleSound}
            title={soundOn ? 'Mute cutscene & extraction sound' : 'Unmute sound effects'}
            aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 hover:border-pink-400/55 transition-colors cursor-pointer"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-rose-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-rose-100/45" />
            )}
          </button>

          <button
            id="btn-history-modal"
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 hover:border-pink-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <History className="w-4 h-4 text-pink-400 shrink-0" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="font-mono text-xs text-rose-200 tabular-nums">
                ({historyCount})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden border-t border-rose-300/15 bg-[#0D060C] px-4 py-3 space-y-1"
          >
            <button
              type="button"
              onClick={() => triggerMobileAction(onOpenBatch)}
              className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium text-white hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
            >
              <Layers className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Batch Queue</span>
            </button>
            <button
              type="button"
              onClick={() => triggerMobileAction(onOpenDiagnostics)}
              className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium text-white hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-pink-400 shrink-0" />
              <span>Stream Check</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
