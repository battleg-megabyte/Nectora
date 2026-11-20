import { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react';
import { Link2, Clipboard, X, Loader2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlatformType } from '../types';
import { PlatformIcon } from './PlatformIcon';

interface UrlInputBarProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  initialUrl?: string;
  selectedQuality: '360p' | '480p' | '720p' | '1080p';
  onSelectQuality: (q: '360p' | '480p' | '720p' | '1080p') => void;
}

export function UrlInputBar({
  onAnalyze,
  isLoading,
  initialUrl = '',
  selectedQuality,
  onSelectQuality,
}: UrlInputBarProps) {
  const [url, setUrl] = useState(initialUrl);
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType>('unsupported');
  const [pasteFeedback, setPasteFeedback] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      detectPlatform(initialUrl);
    }
  }, [initialUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const detectPlatform = (text: string): PlatformType => {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) {
      setDetectedPlatform('unsupported');
      return 'unsupported';
    }

    if (trimmed.includes('tiktok.com')) {
      setDetectedPlatform('tiktok');
      return 'tiktok';
    }
    if (trimmed.includes('instagram.com') || trimmed.includes('instagr.am')) {
      setDetectedPlatform('instagram');
      return 'instagram';
    }
    if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch') || trimmed.includes('fb.com')) {
      setDetectedPlatform('facebook');
      return 'facebook';
    }
    if (trimmed.includes('twitter.com') || trimmed.includes('x.com')) {
      setDetectedPlatform('twitter');
      return 'twitter';
    }
    if (trimmed.includes('reddit.com') || trimmed.includes('v.redd.it')) {
      setDetectedPlatform('reddit');
      return 'reddit';
    }
    if (trimmed.startsWith('http')) {
      setDetectedPlatform('direct');
      return 'direct';
    }

    setDetectedPlatform('unsupported');
    return 'unsupported';
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrl(val);
    detectPlatform(val);
  };

  const normalizeInputUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const embeddedUrlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    if (embeddedUrlMatch) {
      return embeddedUrlMatch[0].replace(/[),.;!?]+$/, '');
    }
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const normalized = normalizeInputUrl(text);
        setUrl(normalized);
        detectPlatform(normalized);
        setPasteFeedback(true);
        setTimeout(() => setPasteFeedback(false), 1200);
        inputRef.current?.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setUrl('');
    setDetectedPlatform('unsupported');
    inputRef.current?.focus();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeInputUrl(url);
    if (normalized && !isLoading) {
      if (normalized !== url) {
        setUrl(normalized);
        detectPlatform(normalized);
      }
      onAnalyze(normalized);
    }
  };

  const renderPlatformPrefix = () => {
    const labelMap: Record<string, string> = {
      tiktok: 'TikTok',
      instagram: 'Instagram',
      facebook: 'Facebook',
      twitter: 'X',
      reddit: 'Reddit',
      direct: 'Direct',
    };

    return (
      <AnimatePresence mode="popLayout" initial={false}>
        {detectedPlatform === 'unsupported' ? (
          <motion.span
            key="generic-link"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.16 }}
            className="flex items-center"
          >
            <Link2 className="w-4 h-4 text-rose-200/65 shrink-0" />
          </motion.span>
        ) : (
          <motion.span
            key={detectedPlatform}
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-100"
          >
            <PlatformIcon platform={detectedPlatform} className="h-5 min-w-[24px] shrink-0" />
            <span className="hidden sm:inline">{labelMap[detectedPlatform] || 'Stream'}</span>
          </motion.span>
        )}
      </AnimatePresence>
    );
  };

  const sampleLinks = [
    {
      label: 'TikTok Clip',
      url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    },
    {
      label: 'Instagram Reel',
      url: 'https://www.instagram.com/reel/DTVTvUDj-b1/',
    },
    {
      label: 'Facebook Video',
      url: 'https://www.facebook.com/facebook/videos/10153231379946729/',
    },
    {
      label: 'Direct MP4',
      url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    },
  ];

  const qualities: { id: '1080p' | '720p' | '480p' | '360p'; label: string; tag: string }[] = [
    { id: '1080p', label: '1080p', tag: 'FHD' },
    { id: '720p', label: '720p', tag: 'HD' },
    { id: '480p', label: '480p', tag: 'SD' },
    { id: '360p', label: '360p', tag: 'Saver' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-3xl mx-auto"
    >
      {/* Luminous Moonlit Command Deck */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="wk-command-deck flex flex-col sm:flex-row sm:items-center rounded-2xl focus-within:border-rose-300/75 focus-within:ring-2 focus-within:ring-rose-400/30 transition-all p-2 gap-2">
          <div className="flex items-center flex-1 min-w-0 gap-2">
            <div className="pl-2 pr-2 sm:pl-2.5 sm:pr-2.5 border-r border-rose-300/20 flex items-center shrink-0 min-h-[28px]">
              {renderPlatformPrefix()}
            </div>

            <input
              ref={inputRef}
              id="url-input-field"
              type="text"
              inputMode="url"
              value={url}
              onChange={handleInputChange}
              placeholder="Paste any public video, reel, or stream link..."
              disabled={isLoading}
              aria-label="Media URL"
              className="w-full min-w-0 min-h-[44px] bg-transparent text-sm sm:text-base text-white placeholder-rose-100/45 px-1 py-2 focus:outline-none disabled:opacity-50"
            />

            {!url && (
              <kbd
                title="Press / to focus URL input"
                className="hidden lg:inline-flex items-center justify-center px-2 py-0.5 rounded bg-white/[0.07] border border-rose-300/20 text-[11px] font-mono text-rose-100/55 shrink-0 select-none"
              >
                /
              </kbd>
            )}

            {url ? (
              <button
                id="btn-clear-input"
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-rose-100/65 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
                title="Clear URL"
                aria-label="Clear URL"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="btn-paste-clipboard"
                type="button"
                onClick={handlePaste}
                className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-medium text-white bg-[#140713]/90 hover:bg-[#230E20] border border-rose-300/25 hover:border-pink-400/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-rose-400" />
                <span>{pasteFeedback ? 'Pasted' : 'Paste'}</span>
              </button>
            )}
          </div>

          <motion.button
            id="btn-submit-analyze"
            type="submit"
            disabled={!url.trim() || isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="wk-sheen-hover relative overflow-hidden w-full sm:w-auto flex items-center justify-center gap-2 px-5 min-h-[46px] sm:min-h-[44px] rounded-xl font-semibold text-sm bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-rose-950/60 after:content-[''] after:pointer-events-none after:absolute after:inset-y-0 after:w-1/3 after:-translate-x-[150%] after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting...</span>
              </>
            ) : (
              <>
                <span>Extract Stream</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </form>

      {/* Secondary Controls: Crisp Segmented Resolution Selector + Sample Links */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3.5 px-0.5">
        <div
          role="group"
          aria-label="Target download resolution"
          className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 rounded-lg bg-[#140A13] border border-rose-300/20"
        >
          {qualities.map((q) => {
            const active = selectedQuality === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onSelectQuality(q.id)}
                className={`relative flex items-center justify-center gap-1 px-1.5 sm:px-3 min-h-[36px] rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-white' : 'text-rose-100/60 hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="target-quality-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-md bg-gradient-to-r from-rose-500 to-pink-500 border border-white/25"
                  />
                )}
                <span className="relative z-10 font-mono font-semibold">{q.label}</span>
                <span
                  className={`relative z-10 hidden min-[370px]:inline text-[9px] sm:text-[10px] ${
                    active ? 'text-white/90 font-semibold' : 'text-rose-100/45'
                  }`}
                >
                  {q.tag}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-2.5 gap-y-1 text-xs">
          <span className="text-rose-100/50">Try:</span>
          {sampleLinks.map((sample, idx) => (
            <span key={sample.label} className="inline-flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setUrl(sample.url);
                  detectPlatform(sample.url);
                  onAnalyze(sample.url);
                }}
                disabled={isLoading}
                className="py-1.5 text-white/85 hover:text-white transition-colors underline decoration-rose-400/40 underline-offset-4 hover:decoration-pink-400 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                {sample.label}
              </button>
              {idx < sampleLinks.length - 1 && (
                <span className="text-rose-300/25" aria-hidden="true">
                  /
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
