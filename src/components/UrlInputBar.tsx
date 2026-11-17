import { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react';
import {
  Link2,
  Clipboard,
  X,
  Loader2,
  Instagram,
  Film,
  Video,
  Globe,
  ArrowRight,
  Twitter,
  MessageSquare,
} from 'lucide-react';
import { motion } from 'motion/react';
import { PlatformType } from '../types';

interface UrlInputBarProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  initialUrl?: string;
  selectedQuality: '480p' | '720p' | '1080p';
  onSelectQuality: (q: '480p' | '720p' | '1080p') => void;
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
    if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) {
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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        detectPlatform(text);
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
    if (url.trim() && !isLoading) {
      onAnalyze(url.trim());
    }
  };

  const renderPlatformPrefix = () => {
    switch (detectedPlatform) {
      case 'tiktok':
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
            <Film className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">TikTok</span>
          </span>
        );
      case 'instagram':
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-pink-400">
            <Instagram className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Instagram</span>
          </span>
        );
      case 'facebook':
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
            <Video className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Facebook</span>
          </span>
        );
      case 'twitter':
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-sky-400">
            <Twitter className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">X</span>
          </span>
        );
      case 'reddit':
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-orange-400">
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Reddit</span>
          </span>
        );
      case 'direct':
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <Globe className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Direct</span>
          </span>
        );
      default:
        return <Link2 className="w-4 h-4 text-zinc-500 shrink-0" />;
    }
  };

  const sampleLinks = [
    {
      label: 'TikTok Clip',
      url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    },
    {
      label: 'Instagram Reel',
      url: 'https://www.instagram.com/reel/C123456789/',
    },
    {
      label: 'Direct MP4',
      url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    },
    {
      label: 'HD Sample',
      url: 'https://filesamples.com/samples/video/mp4/sample_960x540.mp4',
    },
  ];

  const qualities: { id: '1080p' | '720p' | '480p'; label: string; tag: string }[] = [
    { id: '1080p', label: '1080p', tag: 'Full HD' },
    { id: '720p', label: '720p', tag: 'HD' },
    { id: '480p', label: '480p', tag: 'SD' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-3xl mx-auto"
    >
      {/* Responsive Command Deck: Stacks cleanly on mobile (<640px) so the URL field is never squished */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex flex-col sm:flex-row sm:items-center bg-[#191C26] rounded-2xl border border-white/[0.14] focus-within:border-pink-400/80 focus-within:ring-4 focus-within:ring-pink-400/20 shadow-2xl shadow-black/40 transition-all p-2 gap-2">
          {/* Input Row */}
          <div className="flex items-center flex-1 min-w-0 gap-2">
            <div className="pl-2.5 pr-2 border-r border-white/[0.12] flex items-center shrink-0 min-h-[28px]">
              {renderPlatformPrefix()}
            </div>

            <input
              ref={inputRef}
              id="url-input-field"
              type="url"
              inputMode="url"
              value={url}
              onChange={handleInputChange}
              placeholder="Paste video or reel URL..."
              disabled={isLoading}
              aria-label="Media URL"
              className="w-full min-w-0 min-h-[44px] bg-transparent text-sm sm:text-base text-white placeholder-zinc-400 px-1 py-2 focus:outline-none disabled:opacity-50"
            />

            {url ? (
              <button
                id="btn-clear-input"
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
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
                className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-medium text-zinc-200 hover:text-white bg-white/[0.07] hover:bg-pink-500/20 border border-white/[0.12] hover:border-pink-400/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-pink-300" />
                <span>{pasteFeedback ? 'Pasted' : 'Paste'}</span>
              </button>
            )}
          </div>

          {/* Primary Extract Button: Full width on mobile (>=46px touch target), compact inline on desktop */}
          <button
            id="btn-submit-analyze"
            type="submit"
            disabled={!url.trim() || isLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 min-h-[46px] sm:min-h-[44px] rounded-xl font-semibold text-sm bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-lg shadow-pink-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
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
          </button>
        </div>
      </form>

      {/* Secondary Controls: Animated Sliding Quality Switcher + Quick Sample Links */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3.5 px-1">
        {/* Animated Target Resolution Control */}
        <div
          role="group"
          aria-label="Target download resolution"
          className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 rounded-xl bg-[#191C26] border border-white/[0.12]"
        >
          {qualities.map((q) => {
            const active = selectedQuality === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onSelectQuality(q.id)}
                className={`relative flex items-center justify-center gap-1.5 px-3 min-h-[38px] sm:min-h-[34px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-white' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="target-quality-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 shadow-sm shadow-pink-500/30"
                  />
                )}
                <span className="relative z-10 font-mono font-semibold">{q.label}</span>
                <span
                  className={`relative z-10 text-[10px] ${
                    active ? 'text-pink-50 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  {q.tag}
                </span>
              </button>
            );
          })}
        </div>

        {/* Clean Unboxed Sample Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          <span className="text-zinc-400">Samples:</span>
          {sampleLinks.map((sample, idx) => (
            <span key={sample.label} className="inline-flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setUrl(sample.url);
                  detectPlatform(sample.url);
                  onAnalyze(sample.url);
                }}
                disabled={isLoading}
                className="py-1.5 text-zinc-300 hover:text-pink-300 transition-colors underline decoration-white/20 underline-offset-4 hover:decoration-pink-400/70 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                {sample.label}
              </button>
              {idx < sampleLinks.length - 1 && (
                <span className="text-zinc-600" aria-hidden="true">
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
