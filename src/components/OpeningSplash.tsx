import { useEffect, useState, useRef, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, VolumeX } from 'lucide-react';
import { WukongBrandMark } from './WukongBrandMark';
import {
  playWelcomeSound,
  stopWelcomeSound,
  isSoundEnabled,
  setSoundEnabled,
  subscribeSoundEnabled,
  preloadSoundEffects,
} from '../utils/soundEffects';

interface OpeningSplashProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function OpeningSplash({ isOpen, onComplete }: OpeningSplashProps) {
  const [soundMuted, setSoundMuted] = useState(!isSoundEnabled());
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const timerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    preloadSoundEffects();
    return subscribeSoundEnabled((enabled) => {
      setSoundMuted(!enabled);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopWelcomeSound();
      setAutoplayBlocked(false);
      return;
    }

    const mutedNow = !isSoundEnabled();
    setSoundMuted(mutedNow);

    let cancelled = false;
    let unlocked = false;

    const triggerWelcome = async () => {
      if (cancelled || unlocked || !isSoundEnabled()) return;
      const played = await playWelcomeSound();
      if (cancelled) return;
      if (played) {
        unlocked = true;
        setAutoplayBlocked(false);
      } else {
        setAutoplayBlocked(true);
      }
    };

    void triggerWelcome();

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scheduleAutoClose = (delayMs: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        onCompleteRef.current();
      }, delayMs);
    };

    scheduleAutoClose(reducedMotion ? 220 : 3200);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        onCompleteRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener('keydown', onKeyDown);
      stopWelcomeSound();
    };
  }, [isOpen]);

  const handleToggleSound = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (soundMuted) {
      setSoundEnabled(true);
      setSoundMuted(false);
      const ok = await playWelcomeSound();
      setAutoplayBlocked(!ok);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => onCompleteRef.current(), 2800);
      }
      return;
    }

    if (autoplayBlocked) {
      const ok = await playWelcomeSound();
      setAutoplayBlocked(!ok);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => onCompleteRef.current(), 2800);
      }
      return;
    }

    setSoundEnabled(false);
    setSoundMuted(true);
    setAutoplayBlocked(false);
  };

  const handleBackdropClick = async () => {
    // If browser blocked autoplay on first load, first tap unlocks and plays the welcome audio instead of killing it
    if (autoplayBlocked && isSoundEnabled()) {
      const ok = await playWelcomeSound();
      setAutoplayBlocked(!ok);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => onCompleteRef.current(), 2800);
        return;
      }
    }
    stopWelcomeSound();
    onCompleteRef.current();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="wukong-vid-opening-cutscene"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-label="WuKong-Vid cinema slate intro"
          className="fixed inset-0 z-50 h-[100dvh] w-full flex flex-col items-center justify-center studio-canvas px-4 sm:px-6 py-6 select-none cursor-pointer overflow-hidden"
        >
          {/* Architectural Slate Shutter Split Reveal */}
          <motion.div
            aria-hidden="true"
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 0.62, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: '50% 0%' }}
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[#060206] border-b border-rose-400/25 z-10"
          />
          <motion.div
            aria-hidden="true"
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={{ duration: 0.62, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: '50% 100%' }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[#060206] border-t border-rose-400/25 z-10"
          />

          {/* Framed Studio Registration Viewport (fits phones, tablets & wide monitors) */}
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-3 sm:inset-10 max-w-4xl mx-auto my-auto h-[calc(100dvh-2.5rem)] sm:h-[74dvh] max-h-[560px] border border-rose-300/20 rounded-2xl bg-white/[0.012]"
          >
            <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-rose-400 rounded-tl-xl" />
            <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-pink-400 rounded-tr-xl" />
            <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-pink-400 rounded-bl-xl" />
            <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-white/80 rounded-br-xl" />
          </motion.div>

          {/* Top Bar: Sound Control & Skip */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundMuted ? 'Enable intro sound' : 'Mute intro sound'}
            className={`absolute top-5 left-5 sm:top-8 sm:left-8 z-30 flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
              autoplayBlocked && !soundMuted
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-white/35 shadow-lg shadow-rose-950/50 animate-pulse'
                : 'text-white bg-[#140A13]/90 border-rose-300/25 hover:border-pink-400/60'
            }`}
          >
            {soundMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-200/70" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-white" />
            )}
            <span>{soundMuted ? 'Muted' : autoplayBlocked ? 'Tap for Sound' : 'Sound On'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopWelcomeSound();
              onCompleteRef.current();
            }}
            className="absolute top-5 right-5 sm:top-8 sm:right-8 z-30 px-4 min-h-[40px] rounded-lg text-xs font-semibold text-white bg-[#140A13]/90 border border-rose-300/25 hover:border-white/50 transition-colors cursor-pointer"
          >
            Skip
          </button>

          {/* Center Title Lockup */}
          <div className="relative z-20 flex flex-col items-center text-center max-w-md w-full px-3">
            {/* Framed Sun Wukong Emblem + Docking Video Download Reticle */}
            <div className="relative flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.85, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <WukongBrandMark size="xl" showDownloadBadge={false} />

                {/* Clean Diagonal Gloss Sweep */}
                <motion.div
                  aria-hidden="true"
                  initial={{ x: '-130%' }}
                  animate={{ x: '230%' }}
                  transition={{ duration: 0.78, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent overflow-hidden rounded-2xl"
                />
              </motion.div>

              {/* Rose-Pink Video Download Reticle Locking Into Corner */}
              <motion.div
                initial={{ opacity: 0, x: 22, y: -18, scale: 0.65 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={{ duration: 0.45, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-2 -right-2 sm:-bottom-2.5 sm:-right-2.5 w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 border-[3px] border-[#090409] flex items-center justify-center text-white shadow-lg shadow-rose-950/80 ring-1 ring-white/40"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 sm:w-5 sm:h-5"
                >
                  <motion.g
                    initial={{ y: -3, opacity: 0 }}
                    animate={{ y: [0, 2.5, 0], opacity: 1 }}
                    transition={{
                      y: { duration: 0.85, delay: 1.0, repeat: 1, ease: 'easeInOut' },
                      opacity: { duration: 0.25, delay: 0.85 },
                    }}
                  >
                    <path d="M12 4.5v10" />
                    <path d="m7.5 10.2 4.5 4.5 4.5-4.5" />
                  </motion.g>
                  <path d="M5 19.5h14" className="text-white/90" stroke="currentColor" />
                </svg>
              </motion.div>
            </div>

            {/* Wordmark Lockup */}
            <div className="mt-6 sm:mt-7 overflow-hidden">
              <motion.h2
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.78, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white"
              >
                WuKong<span className="text-rose-400">-</span>
                <span className="text-pink-400">Vid</span>
              </motion.h2>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.02 }}
              className="mt-2 text-xs sm:text-sm text-rose-100/75"
            >
              Original-quality MP4, MP3 &amp; M4A stream extractor
            </motion.p>

            {/* Hairline Rule + Blue & White Signature Credit */}
            <motion.div
              aria-hidden="true"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.48, delay: 1.18, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 sm:mt-5 w-28 h-px bg-gradient-to-r from-transparent via-rose-300/45 to-transparent"
            />

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 1.32, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 sm:mt-3.5 flex items-baseline justify-center gap-2"
            >
              <span className="text-xs font-medium tracking-wide text-white">
                Made by
              </span>
              <span className="font-signature italic font-bold text-lg sm:text-xl text-blue-400 tracking-wide">
                Eyad Saber
              </span>
            </motion.div>

            {/* Synced Progress Rail matching welcome1 WAV */}
            <div className="mt-6 sm:mt-7 w-44 sm:w-56 space-y-2">
              <div className="w-full h-[3px] rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 2.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: '0% 50%' }}
                  className="w-full h-full bg-gradient-to-r from-rose-500 via-pink-400 to-white"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-rose-100/55 tabular-nums">
                <span>{autoplayBlocked && !soundMuted ? 'Tap to play sound' : 'Initializing'}</span>
                <span>03.2s</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
