import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { PlatformChips } from './components/PlatformChips';
import { UrlInputBar } from './components/UrlInputBar';
import { Footer } from './components/Footer';
import { WukongBrandMark } from './components/WukongBrandMark';
import { MediaExtractionSkeleton } from './components/WebsiteSkeleton';
import { MediaMetadata, DownloadHistoryItem, AnalysisStatus } from './types';
import leftBirdImg from './assets/images/bird_left_lunar_1795712515711.webp';
import rightBirdImg from './assets/images/bird_right_lunar_1795712515292.webp';
import {
  HOMEPAGE_SEO,
  SEO_NAV_ITEMS,
  getSeoNavByPath,
  normalizeSeoPath,
} from '../shared/seoNav';
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

const MediaResultCard = lazy(() =>
  import('./components/MediaResultCard').then((m) => ({ default: m.MediaResultCard }))
);
const SeoPageView = lazy(() =>
  import('./components/SeoPageView').then((m) => ({ default: m.SeoPageView }))
);
const AiAnalysisPanel = lazy(() =>
  import('./components/AiAnalysisPanel').then((m) => ({ default: m.AiAnalysisPanel }))
);
const DownloadHistory = lazy(() =>
  import('./components/DownloadHistory').then((m) => ({ default: m.DownloadHistory }))
);
const BatchDownloadModal = lazy(() =>
  import('./components/BatchDownloadModal').then((m) => ({ default: m.BatchDownloadModal }))
);
const SystemDiagnosticsModal = lazy(() =>
  import('./components/SystemDiagnosticsModal').then((m) => ({ default: m.SystemDiagnosticsModal }))
);
const AgentMcpModal = lazy(() =>
  import('./components/AgentMcpModal').then((m) => ({ default: m.AgentMcpModal }))
);
const OpeningSplash = lazy(() =>
  import('./components/OpeningSplash').then((m) => ({ default: m.OpeningSplash }))
);

const STORAGE_KEY = 'wukong_vid_download_history_v1';
const LEGACY_STORAGE_KEY = 'nectora_download_history_v1';

const EXTRACTION_STAGES = [
  { label: 'Resolving media link', detail: 'Locating source stream endpoint' },
  { label: 'Probing real streams', detail: 'Detecting exact video resolution & audio' },
  { label: 'Preparing playable container', detail: 'Verifying download headers' },
];

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizeSeoPath(window.location.pathname) : '/'
  );
  const [showSplash, setShowSplash] = useState(false);
  const [prefillUrl, setPrefillUrl] = useState('');
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [media, setMedia] = useState<MediaMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [downloadedBlobs, setDownloadedBlobs] = useState<Record<string, string>>({});
  const [selectedQualityChip, setSelectedQualityChip] = useState<'best' | 'mp3'>('best');
  const [extractionStep, setExtractionStep] = useState(0);
  const analyzeAbortRef = useRef<AbortController | null>(null);

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
        `MCP JSON-RPC: ${origin}/mcp (protocol 2024-11-05, no auth)\nManifest: ${origin}/.well-known/mcp.json\n1-step stream: ${origin}/api/quick-download?url=VIDEO_URL&quality=1080p`
      );
      setMcpCopiedHero(true);
      setTimeout(() => setMcpCopiedHero(false), 2000);
    } catch {}
  };

  const activeSeoPage = getSeoNavByPath(currentPath);

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

  const handleNavigate = (path: string, exampleUrl?: string) => {
    const norm = normalizeSeoPath(path);
    if (typeof window !== 'undefined' && normalizeSeoPath(window.location.pathname) !== norm) {
      window.history.pushState({}, '', norm);
    }
    if (norm !== currentPath) {
      setCurrentPath(norm);
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
      <div className="relative min-h-[100dvh] studio-canvas text-white flex flex-col justify-between overflow-x-hidden">
        {/* Responsive GPU-Accelerated Moonlit Horizon Backdrop + Flanking Celestial Birds */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#07020A]"
        >
          <img
            src="/moon-backdrop-hd.webp"
            alt=""
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover object-[50%_18%] sm:object-[50%_14%] lg:object-[50%_12%] opacity-90 select-none"
          />

          {/* Left Celestial Night Bird (gliding inward toward moonlit center) */}
          <img
            src={leftBirdImg}
            alt=""
            decoding="async"
            className="wk-bird-left absolute -left-8 sm:-left-6 lg:left-4 xl:left-10 top-12 sm:top-16 lg:top-18 w-[155px] sm:w-[240px] md:w-[300px] xl:w-[375px] h-auto object-contain opacity-55 sm:opacity-75 lg:opacity-85 mix-blend-screen select-none brightness-105 contrast-110"
            style={{
              maskImage:
                'radial-gradient(closest-side, #000 54%, rgba(0,0,0,0.82) 72%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(closest-side, #000 54%, rgba(0,0,0,0.82) 72%, transparent 100%)',
            }}
          />

          {/* Right Celestial Night Bird (gliding inward toward moonlit center) */}
          <img
            src={rightBirdImg}
            alt=""
            decoding="async"
            className="wk-bird-right absolute -right-8 sm:-right-6 lg:right-4 xl:right-10 top-14 sm:top-18 lg:top-20 w-[155px] sm:w-[240px] md:w-[300px] xl:w-[375px] h-auto object-contain opacity-55 sm:opacity-75 lg:opacity-85 mix-blend-screen select-none brightness-115 contrast-115"
            style={{
              maskImage:
                'radial-gradient(closest-side, #000 54%, rgba(0,0,0,0.82) 72%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(closest-side, #000 54%, rgba(0,0,0,0.82) 72%, transparent 100%)',
            }}
          />

          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 42% at 50% 16%, rgba(251, 113, 133, 0.14) 0%, transparent 72%), linear-gradient(to bottom, rgba(7, 2, 10, 0.22) 0%, rgba(7, 2, 10, 0.44) 44%, rgba(7, 2, 10, 0.90) 100%)',
            }}
          />
        </div>

        {/* Opening Emblem Intro (lazy-loaded on click only) */}
        {showSplash && (
          <Suspense fallback={null}>
            <OpeningSplash isOpen={showSplash} onComplete={() => setShowSplash(false)} />
          </Suspense>
        )}

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
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-12 flex flex-col items-center">
          <AnimatePresence mode="wait">
            {activeSeoPage ? (
              <motion.div
                key={`seo-${activeSeoPage.path}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
                className="w-full"
              >
                <Suspense
                  fallback={
                    <div className="w-full max-w-4xl mx-auto py-16 text-center text-xs text-rose-200/70">
                      Loading guide...
                    </div>
                  }
                >
                  <SeoPageView
                    pagePath={activeSeoPage.path}
                    onNavigate={handleNavigate}
                    onOpenMcpModal={() => setMcpOpen(true)}
                    onOpenBatchModal={() => setBatchOpen(true)}
                    onOpenDiagnosticsModal={() => setDiagnosticsOpen(true)}
                  />
                </Suspense>
              </motion.div>
            ) : (
              <motion.div
                key="home-live-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
                className="w-full flex flex-col items-center"
              >
                {/* Focused Editorial Hero (Emblem, H1, Paste Box, Chips) */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="relative text-center max-w-3xl mx-auto flex flex-col items-center space-y-3 mb-6 sm:mb-7"
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.07, rotate: 1.5 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      onClick={() => setShowSplash(true)}
                      title="Replay opening animation"
                      aria-label="WuKong-Vid emblem — replay intro animation"
                      className="group relative p-1 rounded-full cursor-pointer drop-shadow-[0_0_26px_rgba(244,63,94,0.45)] animate-float-slow"
                    >
                      <WukongBrandMark size="md" animatedArrow />
                    </motion.button>

                    <div className="flex items-baseline justify-center gap-1.5">
                      <span className="text-[11px] font-medium tracking-wide text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
                        Made by
                      </span>
                      <span className="font-signature italic font-bold text-base sm:text-lg text-blue-400 tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                        Eyad Saber
                      </span>
                    </div>
                  </div>

                  <h1
                    className="font-display text-[1.75rem] min-[390px]:text-3xl sm:text-[3.1rem] font-bold tracking-tight text-white leading-[1.08] drop-shadow-[0_4px_24px_rgba(0,0,0,0.78)]"
                    style={{ textWrap: 'balance' }}
                  >
                    Download Public Videos &amp; Audio in{' '}
                    <span className="bg-gradient-to-r from-rose-300 via-pink-300 to-white bg-clip-text text-transparent">
                      MP4, MP3, and M4A
                    </span>
                  </h1>
                </motion.div>

                {/* Responsive Lunar Pill Command Input */}
                <UrlInputBar
                  onAnalyze={handleAnalyzeUrl}
                  isLoading={status === 'analyzing'}
                  initialUrl={prefillUrl}
                  selectedQuality={selectedQualityChip}
                  onSelectQuality={setSelectedQualityChip}
                />

                {/* Interactive Supported Sources Strip (Single Row) */}
                <PlatformChips onNavigate={handleNavigate} />

                {/* Live Extraction Skeleton & Result States */}
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
                      transition={{ duration: 0.18 }}
                      className="w-full max-w-3xl mx-auto mt-8 px-2 py-3.5 border-t border-b border-red-400/35 text-red-100 flex items-center gap-3"
                    >
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      <div className="text-xs sm:text-sm min-w-0">
                        <span className="font-semibold text-red-100">Unable to extract media — </span>
                        <span className="text-red-200/90">{errorMessage}</span>
                      </div>
                    </motion.div>
                  )}

                  {status === 'found' && media && (
                    <div key={media.id} className="w-full">
                      <Suspense
                        fallback={
                          <MediaExtractionSkeleton
                            stageIndex={2}
                            stages={EXTRACTION_STAGES}
                            onStop={handleAbortExtraction}
                          />
                        }
                      >
                        <MediaResultCard
                          media={media}
                          preferredResolution={selectedQualityChip}
                          onSaveHistory={handleSaveHistory}
                          onOpenAiAnalysis={() => setAiPanelOpen(true)}
                          onRegisterBlob={handleRegisterBlob}
                        />
                      </Suspense>
                    </div>
                  )}
                </AnimatePresence>

                {/* Open Hairline Recent Downloads Strip when idle (No Box Cards) */}
                {status === 'idle' && history.length > 0 && (
                  <section className="w-full max-w-3xl mx-auto mt-11">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-200/80">
                        Recent downloads
                      </h2>
                      <button
                        type="button"
                        onClick={() => setHistoryOpen(true)}
                        className="flex items-center gap-1 py-1 text-xs font-medium text-rose-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <span>Open History ({history.length})</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="border-t border-b border-rose-300/15 divide-y divide-rose-300/12">
                      {history.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-3 px-1.5 gap-4 hover:bg-rose-400/[0.04] transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{item.title}</p>
                            <p className="text-[11px] text-rose-100/65 font-mono tabular-nums mt-0.5 truncate">
                              <span className="capitalize font-sans text-rose-200">{item.platform}</span> ·{' '}
                              {item.resolution} · {item.format.toUpperCase()}
                              {item.fileSizeFormatted ? ` · ${item.fileSizeFormatted}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setHistoryOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-rose-200 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current text-rose-400" />
                            <span>Open</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Open Hairline Capabilities Architecture (Zero Boxes, Zero Squares, Zero Rectangles) */}
                <section
                  aria-label="Capabilities"
                  className="w-full max-w-4xl mx-auto mt-12 sm:mt-16 pt-8 border-t border-rose-300/15 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-rose-300/15"
                >
                  <a
                    href="/mp3-audio-extractor"
                    onClick={(e) => {
                      e.preventDefault();
                      handleNavigate('/mp3-audio-extractor');
                    }}
                    className="wk-spotlight-col group py-6 first:pt-2 md:py-2 md:px-6 md:first:pl-2 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <SlidersHorizontal className="w-4 h-4 text-rose-400 shrink-0" />
                        <h3 className="font-display font-semibold text-sm sm:text-base text-white group-hover:text-rose-200 transition-colors">
                          MP4, MP3 &amp; M4A Extractor
                        </h3>
                      </div>
                      <p className="text-xs sm:text-[13px] text-rose-100/75 leading-relaxed">
                        Save native 4K–360p MP4 plus 320kbps MP3 and 256kbps M4A audio across social platforms and direct streams.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300 group-hover:text-white transition-colors">
                      <span>Explore MP3 &amp; M4A</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setBatchOpen(true)}
                    className="wk-spotlight-col group py-6 md:py-2 md:px-6 flex flex-col justify-between gap-4 text-left cursor-pointer"
                  >
                    <div className="space-y-2.5 w-full">
                      <div className="flex items-center gap-2.5">
                        <Play className="w-4 h-4 text-pink-400 fill-current shrink-0" />
                        <h3 className="font-display font-semibold text-sm sm:text-base text-white group-hover:text-pink-200 transition-colors">
                          Batch Queue &amp; Fast Save
                        </h3>
                      </div>
                      <p className="text-xs sm:text-[13px] text-rose-100/75 leading-relaxed">
                        Queue multiple public URLs in one flow, track live download speed and progress, and export straight to device storage.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-300 group-hover:text-white transition-colors">
                      <span>Launch Batch Queue</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>

                  <div className="wk-spotlight-col py-6 last:pb-2 md:py-2 md:px-6 md:last:pr-2 flex flex-col justify-between gap-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <Zap className="w-4 h-4 text-emerald-300 shrink-0" />
                        <h3 className="font-display font-semibold text-sm sm:text-base text-white">
                          Developers &amp; Automation
                        </h3>
                      </div>
                      <p className="text-xs sm:text-[13px] text-rose-100/75 leading-relaxed">
                        Zero-auth JSON-RPC 2.0 MCP, OpenAPI specs, and 1-step REST download routes for scripts and agents.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyMcpOneClick}
                        className="inline-flex items-center gap-1.5 py-1 text-xs font-semibold text-emerald-300 hover:text-white transition-colors cursor-pointer"
                      >
                        {mcpCopiedHero ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied Spec</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copy API Spec</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMcpOpen(true)}
                        className="inline-flex items-center gap-1 py-1 text-xs font-semibold text-rose-200 hover:text-white transition-colors cursor-pointer"
                      >
                        <span>Developer Tools</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Open Hairline Editorial Guides Directory */}
                <nav
                  aria-label="Dedicated Extractors and Documentation"
                  className="w-full max-w-4xl mx-auto mt-9 pt-5 border-t border-rose-300/15 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-200/65">
                      Guides:
                    </span>
                    {SEO_NAV_ITEMS.filter((p) => p.category !== 'legal').map((p) => (
                      <a
                        key={p.path}
                        href={p.path}
                        onClick={(e) => {
                          e.preventDefault();
                          handleNavigate(p.path);
                        }}
                        className="text-rose-100/80 hover:text-white transition-colors underline decoration-rose-400/25 underline-offset-4 hover:decoration-pink-400"
                      >
                        {p.navLabel}
                      </a>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate('/mcp')}
                    className="text-[11px] font-mono text-emerald-300 hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>Developers</span>
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

        {/* Lazy-Loaded Modals */}
        <Suspense fallback={null}>
          {media && aiPanelOpen && (
            <AiAnalysisPanel
              media={media}
              isOpen={aiPanelOpen}
              onClose={() => setAiPanelOpen(false)}
            />
          )}

          {historyOpen && (
            <DownloadHistory
              isOpen={historyOpen}
              onClose={() => setHistoryOpen(false)}
              history={history}
              downloadedBlobs={downloadedBlobs}
              onClearHistory={handleClearHistory}
              onDeleteItem={handleDeleteHistoryItem}
            />
          )}

          {batchOpen && (
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
          )}

          {diagnosticsOpen && (
            <SystemDiagnosticsModal
              isOpen={diagnosticsOpen}
              onClose={() => setDiagnosticsOpen(false)}
            />
          )}

          {mcpOpen && (
            <AgentMcpModal
              isOpen={mcpOpen}
              onClose={() => setMcpOpen(false)}
            />
          )}
        </Suspense>
      </div>
    </MotionConfig>
  );
}
