import { useState } from 'react';
import { History, Menu, X, Layers, ShieldCheck, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import monkeyKingIcon from '../assets/images/monkey_king_icon_1794952225765.jpg';

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenDiagnostics: () => void;
  onOpenBatch: () => void;
  onOpenSecurity: () => void;
  onResetHome?: () => void;
  historyCount: number;
}

export function Header({
  onOpenHistory,
  onOpenDiagnostics,
  onOpenBatch,
  onOpenSecurity,
  onResetHome,
  historyCount,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const triggerMobileAction = (fn: () => void) => {
    setMobileMenuOpen(false);
    fn();
  };

  return (
    <header
      id="app-header"
      className="sticky top-0 z-40 w-full border-b border-white/[0.11] bg-[#11131B]/88 backdrop-blur-xl"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Mark */}
        <button
          type="button"
          onClick={onResetHome}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-left group cursor-pointer min-h-[40px]"
        >
          <img
            src={monkeyKingIcon}
            alt="NEcTORa Monkey King logo"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-xl object-cover border border-pink-400/45 shadow-md shadow-pink-500/25 group-hover:scale-105 group-hover:border-pink-400 transition-all"
          />
          <span className="font-display font-bold text-lg tracking-tight text-white">
            NEcTORa
          </span>
        </button>

        {/* Zone 2: Desktop Single-Line Navigation */}
        <nav
          aria-label="Primary utilities"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-300"
        >
          <button
            id="btn-batch-modal"
            type="button"
            onClick={onOpenBatch}
            className="whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-pink-400 after:transition-all cursor-pointer"
          >
            Batch Queue
          </button>
          <button
            id="btn-security-modal"
            type="button"
            onClick={onOpenSecurity}
            className="whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-pink-400 after:transition-all cursor-pointer"
          >
            Security
          </button>
          <button
            id="btn-diagnostics-modal"
            type="button"
            onClick={onOpenDiagnostics}
            className="whitespace-nowrap shrink-0 py-1.5 hover:text-white transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 hover:after:w-full after:h-px after:bg-pink-400 after:transition-all cursor-pointer"
          >
            Diagnostics
          </button>
        </nav>

        {/* Zone 3: Primary Action + Mobile Drawer Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-history-modal"
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-2 px-3.5 sm:px-4 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium bg-[#191C26] hover:bg-[#222633] text-white border border-white/[0.14] hover:border-pink-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <History className="w-4 h-4 text-pink-300 shrink-0" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="font-mono text-xs text-pink-200 tabular-nums">
                ({historyCount})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#191C26] hover:bg-[#222633] text-zinc-100 border border-white/[0.14] transition-colors cursor-pointer"
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
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden border-t border-white/[0.1] bg-[#161922]/98 backdrop-blur-2xl px-4 py-3 space-y-1"
          >
            <button
              type="button"
              onClick={() => triggerMobileAction(onOpenBatch)}
              className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium text-zinc-200 hover:bg-pink-500/10 transition-colors text-left cursor-pointer"
            >
              <Layers className="w-4 h-4 text-pink-400 shrink-0" />
              <span>Batch Queue</span>
            </button>
            <button
              type="button"
              onClick={() => triggerMobileAction(onOpenSecurity)}
              className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium text-zinc-200 hover:bg-pink-500/10 transition-colors text-left cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-pink-400 shrink-0" />
              <span>Security Architecture</span>
            </button>
            <button
              type="button"
              onClick={() => triggerMobileAction(onOpenDiagnostics)}
              className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-medium text-zinc-200 hover:bg-pink-500/10 transition-colors text-left cursor-pointer"
            >
              <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>System Diagnostics</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
