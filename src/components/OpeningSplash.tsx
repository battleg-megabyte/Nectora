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
  unlockAudioEngine,
} from '../utils/soundEffects';

export const CUTSCENE_BG_URL = '/moon-cutscene-hd.jpg';

interface OpeningSplashProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function OpeningSplash({ isOpen, onComplete }: OpeningSplashProps) {
  const [soundMuted, setSoundMuted] = useState(!isSoundEnabled());
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hasPlayedVoiceRef = useRef(false);
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
      hasPlayedVoiceRef.current = false;
      setAutoplayBlocked(false);
      return;
    }

    const mutedNow = !isSoundEnabled();
    setSoundMuted(mutedNow);
    hasPlayedVoiceRef.current = false;

    let cancelled = false;

    const triggerWelcome = async () => {
      if (cancelled || hasPlayedVoiceRef.current || !isSoundEnabled()) return;
      const played = await playWelcomeSound();
      if (cancelled) return;
      if (played) {
        hasPlayedVoiceRef.current = true;
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

    // Synced to the 3.04s "Welcome to WuKong." WAV track so voice completes cleanly
    scheduleAutoClose(reducedMotion ? 320 : 3700);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopWelcomeSound();
        onCompleteRef.current();
        return;
      }
      if (!hasPlayedVoiceRef.current && isSoundEnabled()) {
        unlockAudioEngine();
        void playWelcomeSound().then((ok) => {
          if (ok && !cancelled) {
            hasPlayedVoiceRef.current = true;
            setAutoplayBlocked(false);
            scheduleAutoClose(3400);
          }
        });
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        stopWelcomeSound();
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
    };
  }, [isOpen]);

  const handleToggleSound = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    unlockAudioEngine();

    if (soundMuted) {
      setSoundEnabled(true);
      setSoundMuted(false);
      const ok = await playWelcomeSound();
      hasPlayedVoiceRef.current = ok;
      setAutoplayBlocked(!ok);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => onCompleteRef.current(), 3400);
      }
      return;
    }

    if (autoplayBlocked || !hasPlayedVoiceRef.current) {
      const ok = await playWelcomeSound();
      hasPlayedVoiceRef.current = ok;
      setAutoplayBlocked(!ok);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => onCompleteRef.current(), 3400);
      }
      return;
    }

    setSoundEnabled(false);
    setSoundMuted(true);
    setAutoplayBlocked(false);
  };

  const handleBackdropClick = async () => {
    unlockAudioEngine();
    if ((autoplayBlocked || !hasPlayedVoiceRef.current) && isSoundEnabled()) {
      const ok = await playWelcomeSound();
      hasPlayedVoiceRef.current = ok;
      setAutoplayBlocked(!ok);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => onCompleteRef.current(), 3400);
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
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-label="WuKong-Vid pink moon opening cutscene"
          className="fixed inset-0 z-50 h-[100dvh] w-full flex flex-col items-center justify-center cutscene-canvas px-4 sm:px-6 py-6 select-none cursor-pointer overflow-hidden"
        >
          {/* Expanding Lunar Iris Reveal around HD Pink Moon & Clouds */}
          <motion.div
            aria-hidden="true"
            initial={{ clipPath: 'circle(10% at 52% 44%)' }}
            animate={{ clipPath: 'circle(145% at 52% 44%)' }}
            transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-0"
          >
            <motion.img
              src={CUTSCENE_BG_URL}
              alt=""
              initial={{ scale: 1.16, opacity: 0.72 }}
              animate={{ scale: 1.02, opacity: 1 }}
              transition={{ duration: 3.6, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full object-cover object-[54%_45%] sm:object-center"
            />
          </motion.div>

          {/* Subtle Atmospheric Pink Moon Corona & Cloud Horizon Contrast Scrim */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,rgba(244,63,94,0.12)_0%,rgba(12,4,14,0.50)_48%,rgba(5,2,7,0.88)_100%)]"
          />

          {/* Slow Drifting Rose Mist Across Bottom Cloud Sea */}
          <motion.div
            aria-hidden="true"
            initial={{ x: '-4%', opacity: 0 }}
            animate={{ x: '4%', opacity: [0.18, 0.36, 0.24] }}
            transition={{ duration: 3.5, ease: 'easeInOut' }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-44 sm:h-56 bg-gradient-to-t from-[#08020A] via-rose-500/12 to-transparent"
          />

          {/* Astronomical Eclipse Rings Framing the Moon behind the Emblem */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
          >
            <motion.div
              initial={{ scale: 0.72, opacity: 0, rotate: -18 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 1.05, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-72 h-72 sm:w-[360px] sm:h-[360px] rounded-full border border-rose-300/25 shadow-[0_0_90px_-10px_rgba(244,63,94,0.42)]"
            >
              {/* Inner dashed lunar hairline ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-4 rounded-full border border-dashed border-pink-300/25"
              />
              {/* 4 Cardinal Eclipse Ticks */}
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-px h-2.5 bg-white/65" />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-px h-2.5 bg-pink-300/65" />
              <span className="absolute top-1/2 -left-1 -translate-y-1/2 w-2.5 h-px bg-rose-300/65" />
              <span className="absolute top-1/2 -right-1 -translate-y-1/2 w-2.5 h-px bg-rose-300/65" />
            </motion.div>
          </div>

          {/* Crisp Starlight Glints in Upper Night Sky */}
          {[
            { top: '14%', left: '16%', delay: 0.3 },
            { top: '18%', right: '18%', delay: 0.55 },
            { top: '28%', left: '24%', delay: 0.8 },
            { top: '25%', right: '26%', delay: 0.45 },
          ].map((star, idx) => (
            <motion.span
              key={idx}
              aria-hidden="true"
              style={{ top: star.top, left: star.left, right: star.right }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.25, 0.85, 1.1], opacity: [0, 0.95, 0.5, 0.9] }}
              transition={{ duration: 2.2, delay: star.delay, repeat: Infinity, repeatType: 'mirror' }}
              className="pointer-events-none hidden sm:block absolute w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_12px_2px_rgba(255,215,232,0.85)] z-10"
            />
          ))}

          {/* Top Bar: Fluid Rounded-Full Sound & Skip Controls */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundMuted ? 'Enable intro sound' : 'Mute intro sound'}
            className={`absolute top-5 left-5 sm:top-8 sm:left-8 z-30 flex items-center gap-1.5 px-4 min-h-[40px] rounded-full text-xs font-semibold transition-all cursor-pointer border backdrop-blur-md ${
              autoplayBlocked && !soundMuted
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-white/50 ring-2 ring-white/40 shadow-lg shadow-rose-950/70'
                : 'text-white bg-[#140A14]/70 border-rose-300/25 hover:border-pink-400/70'
            }`}
          >
            {soundMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-200/75" />
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
            className="absolute top-5 right-5 sm:top-8 sm:right-8 z-30 px-4 min-h-[40px] rounded-full text-xs font-semibold text-white bg-[#140A14]/70 backdrop-blur-md border border-rose-300/25 hover:border-white/60 transition-colors cursor-pointer"
          >
            Skip
          </button>

          {/* Center Circular Lunar Crest & Typography — Pure Open Radial Aura (Zero Rectangle Box) */}
          <div className="relative z-20 flex flex-col items-center text-center max-w-md w-full px-6 py-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(8,3,11,0.72)_0%,rgba(8,3,11,0.34)_56%,transparent_80%)]"
            />

            {/* Soft Pink Lunar Corona Behind Crest */}
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: [0.4, 0.78, 0.55], scale: [0.95, 1.08, 1] }}
              transition={{ duration: 2.6, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
              className="pointer-events-none absolute top-4 w-40 h-40 rounded-full bg-rose-500/25 blur-2xl"
            />

            {/* Circular Sun Wukong Medallion + Docking Circular Download Orb */}
            <div className="relative flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.78, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative overflow-hidden rounded-full"
              >
                <WukongBrandMark size="xl" showDownloadBadge={false} />

                {/* Circular Diagonal Moonbeam Gloss Sweep */}
                <motion.div
                  aria-hidden="true"
                  initial={{ x: '-130%' }}
                  animate={{ x: '230%' }}
                  transition={{ duration: 0.85, delay: 0.78, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                />
              </motion.div>

              {/* Circular Orbital Rose-Pink Download Crest Locking Into Corner */}
              <motion.div
                initial={{ opacity: 0, x: 22, y: -18, scale: 0.65 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={{ duration: 0.45, delay: 0.58, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-1 -right-1 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-rose-500 via-pink-500 to-rose-600 border-[3px] border-[#09030B] flex items-center justify-center text-white shadow-lg shadow-rose-950/90 ring-1 ring-white/50"
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
                  <path d="M5 19.5h14" className="text-white/95" stroke="currentColor" />
                </svg>
              </motion.div>
            </div>

            {/* Wordmark Lockup */}
            <div className="relative mt-6 sm:mt-7 overflow-hidden">
              <motion.h2
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.72, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]"
              >
                WuKong<span className="text-rose-400">-</span>
                <span className="text-pink-400">Vid</span>
              </motion.h2>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.96 }}
              className="relative mt-2 text-xs sm:text-sm text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]"
            >
              Original-quality MP4, MP3 &amp; M4A stream extractor
            </motion.p>

            {/* Hairline Rule + Blue & White Signature Credit */}
            <motion.div
              aria-hidden="true"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.48, delay: 1.12, ease: [0.16, 1, 0.3, 1] }}
              className="relative mt-4 sm:mt-5 w-32 h-px bg-gradient-to-r from-transparent via-rose-300/65 to-transparent"
            />

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 1.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative mt-3 sm:mt-3.5 flex items-baseline justify-center gap-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
            >
              <span className="text-xs font-medium tracking-wide text-white">
                Made by
              </span>
              <span className="font-signature italic font-bold text-lg sm:text-xl text-blue-400 tracking-wide">
                Eyad Saber
              </span>
            </motion.div>

            {/* Synced Progress Rail matching 3.04s welcome1 WAV */}
            <div className="relative mt-6 sm:mt-7 w-48 sm:w-56 space-y-2">
              <div className="w-full h-[3px] rounded-full bg-white/15 overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 3.1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: '0% 50%' }}
                  className="w-full h-full bg-gradient-to-r from-rose-500 via-pink-400 to-white"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/80 tabular-nums drop-shadow">
                <span>{autoplayBlocked && !soundMuted ? 'Tap anywhere for sound' : 'Welcome voice'}</span>
                <span>03.1s</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
