import { useState, useEffect, useRef } from 'react';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { PlatformChips } from './components/PlatformChips';
import { UrlInputBar } from './components/UrlInputBar';
import { MediaResultCard } from './components/MediaResultCard';
import { AiAnalysisPanel } from './components/AiAnalysisPanel';
import { DownloadHistory } from './components/DownloadHistory';
import { BatchDownloadModal } from './components/BatchDownloadModal';
import { SystemDiagnosticsModal } from './components/SystemDiagnosticsModal';
import { AgentMcpModal } from './components/AgentMcpModal';
import { SeoPageView } from './components/SeoPageView';
import { Footer } from './components/Footer';
import { OpeningSplash } from './components/OpeningSplash';
import { WukongBrandMark } from './components/WukongBrandMark';
import { WebsitePageSkeleton, MediaExtractionSkeleton } from './components/WebsiteSkeleton';
import { playExtractionSound, stopExtractionSound, unlockAudioEngine } from './utils/soundEffects';
import { MediaMetadata, DownloadHistoryItem, AnalysisStatus } from './types';
import {
  HOMEPAGE_SEO,
  SEO_PAGES,
  getSeoPageByPath,
  normalizeSeoPath,
} from '../shared/seoPages';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Play,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';

const STORAGE_KEY = 'wukong_vid_download_history_v1';
const LEGACY_STORAGE_KEY = 'nectora_download_history_v1';

const EXTRACTION_STAGES = [
  { label: 'Resolving media link', detail: 'Locating source stream endpoint' },
  { label: 'Scanning video & audio tracks', detail: 'Matching 1080p · 720p · 480p · MP3' },
  { label: 'Preparing playable container', detail: 'Verifying download headers' },
];

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizeSeoPath(window.location.pathname) : '/'
  );
  const [isWebsiteLoading, setIsWebsiteLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const [prefillUrl, setPrefillUrl] = useState('');
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [media, setMedia] = useState<MediaMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [downloadedBlobs, setDownloadedBlobs] = useState<Record<string, string>>({});
  const [selectedQualityChip, setSelectedQualityChip] = useState<'360p' | '480p' | '720p' | '1080p'>('1080p');
  const [extractionStep, setExtractionStep] = useState(0);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const navTimerRef = useRef<number | null>(null);

  // Modals state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpCopiedHero, setMcpCopiedHero] = useState(false);

  const handleCopyMcpOneClick = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard.writeText(
        `Use WuKong-Vid MCP at ${origin}/mcp (no auth needed) or 1-step API at ${origin}/api/quick-download?url=VIDEO_URL&quality=1080p`
      );
      setMcpCopiedHero(true);
      setTimeout(() => setMcpCopiedHero(false), 2000);
    } catch {}
  };

  const activeSeoPage = getSeoPageByPath(currentPath);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(normalizeSeoPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const pageTitle = activeSeoPage ? activeSeoPage.title : HOMEPAGE_SEO.title;
    const pageDesc = activeSeoPage ? activeSeoPage.description : HOMEPAGE_SEO.description;
    const canonicalHref = `${window.location.origin}${activeSeoPage ? activeSeoPage.path : '/'}`;

    document.title = pageTitle;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', pageDesc);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', pageTitle);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', pageDesc);
    const canonEl = document.querySelector('link[rel="canonical"]');
    if (canonEl) canonEl.setAttribute('href', canonicalHref);
  }, [activeSeoPage]);

  useEffect(() => {
    let active = true;
    const minDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 420));
    const maxCap = window.setTimeout(() => {
      if (active) setIsWebsiteLoading(false);
    }, 620);
    const fontsReady =
      typeof document !== 'undefined' && document.fonts?.ready
        ? document.fonts.ready.catch(() => undefined)
        : Promise.resolve();

    Promise.all([minDelay, fontsReady]).then(() => {
      if (active) setIsWebsiteLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(maxCap);
      if (navTimerRef.current) window.clearTimeout(navTimerRef.current);
    };
  }, []);

  const handleNavigate = (path: string, exampleUrl?: string) => {
    const norm = normalizeSeoPath(path);
    const changed = norm !== currentPath;
    if (typeof window !== 'undefined' && normalizeSeoPath(window.location.pathname) !== norm) {
      window.history.pushState({}, '', norm);
    }
    if (changed) {
      if (navTimerRef.current) window.clearTimeout(navTimerRef.current);
      setIsWebsiteLoading(true);
      setCurrentPath(norm);
      navTimerRef.current = window.setTimeout(() => {
        setIsWebsiteLoading(false);
        navTimerRef.current = null;
      }, 200);
    }
    if (exampleUrl) {
      setPrefillUrl(exampleUrl);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
        if (!localStorage.getItem(STORAGE_KEY)) {
          localStorage.setItem(STORAGE_KEY, saved);
        }
      }
    } catch (e) {
      console.warn('Could not load history from storage:', e);
    }
  }, []);

  useEffect(() => {
    if (status !== 'analyzing') {
      setExtractionStep(0);
      return;
    }
    setExtractionStep(0);
    const t1 = setTimeout(() => setExtractionStep(1), 650);
    const t2 = setTimeout(() => setExtractionStep(2), 1850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [status]);

  const handleSaveHistory = (item: DownloadHistoryItem) => {
    setHistory((prev) => {
      const updated = [item, ...prev.filter((i) => i.id !== item.id)].slice(0, 50);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not save history to storage:', e);
      }
      return updated;
    });
  };

  const handleRegisterBlob = (streamUrl: string, blobUrl: string) => {
    setDownloadedBlobs((prev) => ({ ...prev, [streamUrl]: blobUrl }));
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleAbortExtraction = () => {
    stopExtractionSound();
    if (analyzeAbortRef.current) {
      analyzeAbortRef.current.abort();
      analyzeAbortRef.current = null;
    }
    setStatus('idle');
    setErrorMessage(null);
  };

  const handleResetHome = () => {
    handleAbortExtraction();
    setMedia(null);
    handleNavigate('/');
  };

  const handleAnalyzeUrl = async (url: string) => {
    if (analyzeAbortRef.current) {
      analyzeAbortRef.current.abort();
    }
    const controller = new AbortController();
    analyzeAbortRef.current = controller;

    void playExtractionSound();
    setStatus('analyzing');
    setErrorMessage(null);
    setMedia(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ error: 'Media extraction failed' }));
        setStatus('error');
        setErrorMessage(
          errorJson.error || 'Media could not be accessed. Please verify the link is public.'
        );
        return;
      }

      const data: MediaMetadata = await res.json();
      if (controller.signal.aborted) return;
      setMedia(data);
      setStatus('found');

      setTimeout(() => {
        const el = document.getElementById('media-result-card');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        return;
      }
      setStatus('error');
      setErrorMessage(err?.message || 'A network error occurred while connecting to the server.');
    } finally {
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null;
      }
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-[100dvh] studio-canvas text-white flex flex-col justify-between overflow-x-hidden">
        {/* Opening Wukong + Video Download Intro Animation */}
        <OpeningSplash isOpen={showSplash} onComplete={() => setShowSplash(false)} />

        {/* Header */}
        <Header
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenBatch={() => setBatchOpen(true)}
          onResetHome={handleResetHome}
          onNavigate={handleNavigate}
          historyCount={history.length}
        />

        {/* Main Workspace */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-7 sm:py-14 flex flex-col items-center">
          <AnimatePresence mode="wait">
            {isWebsiteLoading ? (
              <div key={`skel-${activeSeoPage ? 'seo' : 'home'}`} className="w-full">
                <WebsitePageSkeleton variant={activeSeoPage ? 'seo' : 'home'} />
              </div>
            ) : activeSeoPage ? (
              <motion.div
                key={`seo-${activeSeoPage.path}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <SeoPageView
                  page={activeSeoPage}
                  onNavigate={handleNavigate}
                  onOpenMcpModal={() => setMcpOpen(true)}
                  onOpenBatchModal={() => setBatchOpen(true)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="home-live-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.22 }}
                className="w-full flex flex-col items-center"
              >
              {/* Editorial Hero — Streamlined Moonlit Lockup with Staggered Spring Choreography */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className="relative text-center max-w-3xl mx-auto flex flex-col items-center space-y-3 sm:space-y-3.5 mb-6 sm:mb-7"
              >
                <div className="flex flex-col items-center gap-2">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.07, rotate: 1.5 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    onClick={() => {
                      unlockAudioEngine();
                      setShowSplash(true);
                    }}
                    title="Replay opening animation"
                    aria-label="WuKong-Vid emblem — replay intro animation"
                    className="group relative p-1.5 rounded-2xl bg-[#140814]/70 backdrop-blur-md border border-rose-300/35 hover:border-white/80 ring-1 ring-inset ring-white/15 transition-colors cursor-pointer shadow-xl shadow-rose-950/60 animate-float-slow"
                  >
                    <WukongBrandMark size="md" animatedArrow />
                  </motion.button>

                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-baseline justify-center gap-1.5"
                  >
                    <span className="text-[11px] font-medium tracking-wide text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
                      Made by
                    </span>
                    <span className="font-signature italic font-bold text-base sm:text-lg text-blue-400 tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                      Eyad Saber
                    </span>
                  </motion.div>
                </div>

                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display text-[1.75rem] min-[390px]:text-3xl sm:text-[3.1rem] font-bold tracking-tight text-white leading-[1.1] drop-shadow-[0_4px_24px_rgba(0,0,0,0.78)]"
                  style={{ textWrap: 'balance' }}
                >
                  Download Public Videos &amp; Audio in{' '}
                  <span className="bg-gradient-to-r from-rose-300 via-pink-300 to-white bg-clip-text text-transparent">
                    MP4, MP3, and M4A
                  </span>
                </motion.h1>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.38, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display text-sm sm:text-lg font-semibold text-rose-100/95 tracking-tight max-w-2xl mx-auto drop-shadow-[0_2px_14px_rgba(0,0,0,0.8)]"
                >
                  {HOMEPAGE_SEO.h2}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.38, delay: 0.2 }}
                  className="text-xs sm:text-sm text-rose-50/80 leading-relaxed max-w-xl mx-auto px-1 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
                >
                  Extract HD MP4 videos and 320kbps MP3/M4A audio from TikTok, Instagram Reels, Facebook, X, Reddit, Vimeo, Batch Queue, REST API &amp; MCP agents.
                </motion.p>
              </motion.div>

              {/* Responsive Command Input & Quality Target */}
              <UrlInputBar
                onAnalyze={handleAnalyzeUrl}
                isLoading={status === 'analyzing'}
                initialUrl={prefillUrl}
                selectedQuality={selectedQualityChip}
                onSelectQuality={setSelectedQualityChip}
              />

              {/* Understated Zero-Liability Disclaimer Line */}
              <p className="mt-3.5 text-[11px] sm:text-xs text-rose-100/70 text-center max-w-2xl px-2 leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
                {HOMEPAGE_SEO.notice}
              </p>

              {/* Interactive Supported Sources Strip */}
              <PlatformChips onNavigate={handleNavigate} />

          {/* Animated Extraction Skeleton & Result States */}
          <AnimatePresence mode="wait">
            {status === 'analyzing' && (
              <MediaExtractionSkeleton
                stageIndex={extractionStep}
                stages={EXTRACTION_STAGES}
                onStop={handleAbortExtraction}
              />
            )}

            {status === 'error' && errorMessage && (
              <motion.div
                key="error"
                role="alert"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-3xl mx-auto mt-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <p className="font-semibold text-red-100">Unable to extract media</p>
                  <p className="mt-0.5 text-red-200/85">{errorMessage}</p>
                </div>
              </motion.div>
            )}

            {status === 'found' && media && (
              <div key={media.id} className="w-full">
                <MediaResultCard
                  media={media}
                  preferredResolution={selectedQualityChip}
                  onSaveHistory={handleSaveHistory}
                  onOpenAiAnalysis={() => setAiPanelOpen(true)}
                  onRegisterBlob={handleRegisterBlob}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Recent Downloads Strip when idle */}
          {status === 'idle' && history.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.12 }}
              className="w-full max-w-3xl mx-auto mt-10"
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <h2 className="text-xs font-semibold text-white">Recent downloads</h2>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="flex items-center gap-1 py-1 text-xs font-medium text-rose-300 hover:text-white transition-colors cursor-pointer"
                >
                  <span>Open History ({history.length})</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="wk-box rounded-xl divide-y divide-rose-300/15 overflow-hidden">
                {history.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-rose-400/[0.04] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-rose-100/60 font-mono tabular-nums mt-0.5 truncate">
                        <span className="capitalize font-sans text-rose-200">{item.platform}</span> ·{' '}
                        {item.resolution} · {item.format.toUpperCase()}
                        {item.fileSizeFormatted ? ` · ${item.fileSizeFormatted}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-lg text-xs font-medium bg-[#0D060C] hover:bg-[#1E0E1C] text-white border border-rose-300/20 hover:border-pink-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current text-rose-400" />
                      <span>Open</span>
                    </button>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Interactive Capabilities Bento Grid */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Capabilities"
            className="w-full max-w-4xl mx-auto mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5"
          >
            <motion.a
              href="/mp3-audio-extractor"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('/mp3-audio-extractor');
              }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="group wk-box rounded-2xl p-5 hover:border-rose-300/65 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-400/35 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="w-4 h-4 text-rose-400" />
                  </div>
                  <h3 className="font-display font-semibold text-sm text-white group-hover:text-rose-200 transition-colors">
                    MP4, MP3 &amp; M4A Extractor
                  </h3>
                </div>
                <p className="text-xs text-rose-100/75 leading-relaxed">
                  Save native 4K–360p MP4 plus 320kbps MP3 and 256kbps M4A audio across social platforms and direct streams.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-300 group-hover:text-white transition-colors">
                <span>Explore MP3 &amp; M4A</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.a>

            <motion.button
              type="button"
              onClick={() => setBatchOpen(true)}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="group wk-box rounded-2xl p-5 hover:border-pink-300/65 flex flex-col justify-between gap-4 text-left cursor-pointer"
            >
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-400/35 flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4 text-pink-400 fill-current ml-0.5" />
                  </div>
                  <h3 className="font-display font-semibold text-sm text-white group-hover:text-pink-200 transition-colors">
                    Batch Queue &amp; Fast Save
                  </h3>
                </div>
                <p className="text-xs text-rose-100/75 leading-relaxed">
                  Queue multiple public URLs in one flow, track live download speed and progress, and export straight to device storage.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pink-300 group-hover:text-white transition-colors">
                <span>Launch Batch Queue</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>

            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="wk-box rounded-2xl p-5 hover:border-emerald-300/55 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-emerald-300" />
                  </div>
                  <h3 className="font-display font-semibold text-sm text-white">
                    1-Click MCP &amp; API
                  </h3>
                </div>
                <p className="text-xs text-rose-100/75 leading-relaxed">
                  Zero-auth MCP endpoint + 1-step quick-download API. Copy once and paste straight into any AI assistant.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyMcpOneClick}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-100 transition-colors cursor-pointer"
                >
                  {mcpCopiedHero ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copy for AI</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMcpOpen(true)}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/20 text-white transition-colors cursor-pointer"
                >
                  <span>Open</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </motion.section>

          {/* Compact Crawler & User Guides Bar */}
          <nav
            aria-label="Dedicated Extractors and Documentation"
            className="w-full max-w-4xl mx-auto mt-5 wk-box rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-200/70">
                Guides:
              </span>
              {SEO_PAGES.filter((p) => p.category !== 'legal').map((p) => (
                <a
                  key={p.path}
                  href={p.path}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate(p.path);
                  }}
                  className="text-rose-100/80 hover:text-white transition-colors underline decoration-rose-400/30 underline-offset-4 hover:decoration-pink-400"
                >
                  {p.navLabel}
                </a>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMcpOpen(true)}
              className="text-[11px] font-mono text-emerald-300 hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>1-Click MCP &amp; API</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <Footer
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenBatch={() => setBatchOpen(true)}
          onOpenMcp={() => setMcpOpen(true)}
          onNavigate={handleNavigate}
        />

        {/* Modals */}
        {media && (
          <AiAnalysisPanel
            media={media}
            isOpen={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
          />
        )}

        <DownloadHistory
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          history={history}
          downloadedBlobs={downloadedBlobs}
          onClearHistory={handleClearHistory}
          onDeleteItem={handleDeleteHistoryItem}
        />

        <BatchDownloadModal
          isOpen={batchOpen}
          onClose={() => setBatchOpen(false)}
          preferredResolution={selectedQualityChip}
          onSaveHistory={handleSaveHistory}
          onRegisterBlob={handleRegisterBlob}
          onSelectMedia={(selected) => {
            setMedia(selected);
            setStatus('found');
          }}
        />

        <SystemDiagnosticsModal
          isOpen={diagnosticsOpen}
          onClose={() => setDiagnosticsOpen(false)}
        />

        <AgentMcpModal
          isOpen={mcpOpen}
          onClose={() => setMcpOpen(false)}
        />
      </div>
    </MotionConfig>
  );
}
