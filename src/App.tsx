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
import { Footer } from './components/Footer';
import { OpeningSplash } from './components/OpeningSplash';
import { WukongBrandMark } from './components/WukongBrandMark';
import { playExtractionSound, stopExtractionSound } from './utils/soundEffects';
import { MediaMetadata, DownloadHistoryItem, AnalysisStatus } from './types';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Film,
  Loader2,
  Play,
  Square,
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
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [media, setMedia] = useState<MediaMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [downloadedBlobs, setDownloadedBlobs] = useState<Record<string, string>>({});
  const [selectedQualityChip, setSelectedQualityChip] = useState<'360p' | '480p' | '720p' | '1080p'>('1080p');
  const [extractionStep, setExtractionStep] = useState(0);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  // Modals state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          historyCount={history.length}
        />

        {/* Main Workspace */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-7 sm:py-14 flex flex-col items-center">
          {/* Editorial Hero with Interactive Wukong + Video Download Crest */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="text-center max-w-2xl mx-auto flex flex-col items-center space-y-3.5 sm:space-y-4 mb-6 sm:mb-8"
          >
            <button
              type="button"
              onClick={() => setShowSplash(true)}
              title="Replay opening animation"
              aria-label="WuKong-Vid emblem — replay intro animation"
              className="group relative p-1.5 rounded-2xl bg-[#140A13] border border-rose-300/30 hover:border-white/70 ring-1 ring-inset ring-white/10 transition-all hover:scale-105 cursor-pointer shadow-lg shadow-rose-950/60"
            >
              <WukongBrandMark size="md" animatedArrow />
            </button>

            <div className="flex items-baseline justify-center gap-2">
              <span className="text-xs font-medium tracking-wide text-white">
                Made by
              </span>
              <span className="font-signature italic font-bold text-base sm:text-lg text-blue-400 tracking-wide">
                Eyad Saber
              </span>
            </div>

            <h1
              className="font-display text-[1.75rem] min-[390px]:text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Extract clean video streams in{' '}
              <span className="bg-gradient-to-r from-rose-400 via-pink-400 to-white bg-clip-text text-transparent">
                original resolution
              </span>
            </h1>
            <p className="text-xs sm:text-base text-rose-100/75 leading-relaxed max-w-xl mx-auto px-1">
              Paste a public link from TikTok, Instagram, Facebook, X, Reddit, Vimeo, or any direct video URL to extract 4K/1080p/720p/480p/360p MP4 streams plus 320kbps–128kbps MP3 and M4A audio.
            </p>
          </motion.div>

          {/* Responsive Command Input & Quality Target */}
          <UrlInputBar
            onAnalyze={handleAnalyzeUrl}
            isLoading={status === 'analyzing'}
            selectedQuality={selectedQualityChip}
            onSelectQuality={setSelectedQualityChip}
          />

          {/* Supported Sources */}
          <PlatformChips />

          {/* Animated Extraction States */}
          <AnimatePresence mode="wait">
            {status === 'analyzing' && (
              <motion.div
                key="extraction-pipeline"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                aria-label="Extracting media streams"
                className="w-full max-w-4xl mx-auto mt-8 wk-box rounded-2xl overflow-hidden"
              >
                {/* Live Extraction Header */}
                <div className="px-4 sm:px-6 py-3.5 border-b border-rose-300/15 flex items-center justify-between gap-3 bg-[#0D060C]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Loader2 className="w-4 h-4 text-rose-400 animate-spin shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-white truncate">
                      Extracting media streams
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                    <span className="text-[11px] font-mono text-rose-100/65 tabular-nums">
                      Stage {extractionStep + 1} / {EXTRACTION_STAGES.length}
                    </span>
                    <button
                      type="button"
                      onClick={handleAbortExtraction}
                      aria-label="Stop extraction"
                      className="flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/35 transition-colors cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop</span>
                    </button>
                  </div>
                </div>

                {/* Extraction Stage Workspace */}
                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-7 items-center">
                  {/* Left: Precision Viewfinder Frame */}
                  <div className="md:col-span-5 relative aspect-[9/16] max-h-[240px] sm:max-h-[300px] max-w-[240px] md:max-w-none mx-auto w-full rounded-xl wk-box-well overflow-hidden flex flex-col items-center justify-center p-5 sm:p-6">
                    <span className="pointer-events-none absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-rose-400/75" />
                    <span className="pointer-events-none absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-pink-400/75" />
                    <span className="pointer-events-none absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-pink-400/75" />
                    <span className="pointer-events-none absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-white/70" />

                    {/* Clean Horizontal Scan Sweep */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-rose-500/30 to-transparent border-t border-white/80 animate-scan-y" />

                    <WukongBrandMark size="lg" animatedArrow />

                    <p className="mt-4 sm:mt-5 text-xs font-medium text-white text-center">
                      Probing video &amp; audio tracks
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-rose-100/55 text-center">
                      HD stream verification
                    </p>
                  </div>

                  {/* Right: Sequential Animated Stage Stepper */}
                  <div className="md:col-span-7 space-y-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-lg sm:text-xl font-semibold text-white">
                        Analyzing source container
                      </h2>
                      <p className="text-xs text-rose-100/70">
                        Resolving direct CDN stream URLs and preparing playable MP4 &amp; MP3 formats.
                      </p>
                    </div>

                    {/* Precision Progress Bar */}
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-rose-500 via-pink-400 to-white rounded-full"
                        initial={{ width: '14%' }}
                        animate={{ width: `${((extractionStep + 1) / EXTRACTION_STAGES.length) * 92}%` }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Stage Checklist */}
                    <div className="rounded-xl border border-rose-300/20 bg-[#0D060C] divide-y divide-rose-300/15 overflow-hidden">
                      {EXTRACTION_STAGES.map((stage, idx) => {
                        const isDone = idx < extractionStep;
                        const isActive = idx === extractionStep;
                        return (
                          <div
                            key={stage.label}
                            className={`flex items-center justify-between px-4 py-3 gap-3 transition-colors ${
                              isActive ? 'bg-rose-500/[0.08]' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : isActive ? (
                                <Loader2 className="w-4 h-4 text-rose-400 animate-spin shrink-0" />
                              ) : (
                                <Film className="w-4 h-4 text-rose-100/35 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p
                                  className={`text-xs font-semibold truncate ${
                                    isActive
                                      ? 'text-white'
                                      : isDone
                                        ? 'text-emerald-300'
                                        : 'text-rose-100/50'
                                  }`}
                                >
                                  {stage.label}
                                </p>
                                <p className="text-[11px] font-mono text-rose-100/50 truncate mt-0.5">
                                  {stage.detail}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-[11px] font-mono shrink-0 ${
                                isDone
                                  ? 'text-emerald-400'
                                  : isActive
                                    ? 'text-pink-300'
                                    : 'text-rose-100/35'
                              }`}
                            >
                              {isDone ? 'Done' : isActive ? 'Running' : 'Queued'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-rose-100/60 pt-1">
                      <Zap className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Direct high-speed extraction · instant local saving</span>
                    </div>
                  </div>
                </div>
              </motion.div>
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

          {/* Editorial Capabilities Strip — Clean Framed Boxes */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            aria-label="Capabilities"
            className="w-full max-w-4xl mx-auto mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5"
          >
            <div className="wk-box rounded-xl p-5 hover:border-rose-300/45 transition-colors space-y-2">
              <h3 className="font-display font-semibold text-sm text-white flex items-center gap-2">
                <span className="text-rose-400 font-mono text-xs">01.</span>
                <span>Multi-Tier Stream Matrix</span>
              </h3>
              <p className="text-xs text-rose-100/70 leading-relaxed">
                Extracts native 4K/1080p video, generates 720p/480p/360p compact MP4s, and converts 320kbps–128kbps MP3 or 256kbps M4A audio tracks.
              </p>
            </div>

            <div className="wk-box rounded-xl p-5 hover:border-pink-300/45 transition-colors space-y-2">
              <h3 className="font-display font-semibold text-sm text-white flex items-center gap-2">
                <span className="text-pink-400 font-mono text-xs">02.</span>
                <span>Instant Device Pop-Out</span>
              </h3>
              <p className="text-xs text-rose-100/70 leading-relaxed">
                Watch your saved MP4 or play MP3/M4A audio immediately, open it in a dedicated tab, or share directly to your phone Files app.
              </p>
            </div>

            <div className="wk-box rounded-xl p-5 hover:border-white/35 transition-colors space-y-2">
              <h3 className="font-display font-semibold text-sm text-white flex items-center gap-2">
                <span className="text-white font-mono text-xs">03.</span>
                <span>Batch Queue &amp; Fast Save</span>
              </h3>
              <p className="text-xs text-rose-100/70 leading-relaxed">
                Process multiple public links consecutively in the Batch Queue with live transfer speed tracking and instant local history lookup.
              </p>
            </div>
          </motion.section>
        </main>

        {/* Footer */}
        <Footer
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenBatch={() => setBatchOpen(true)}
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
      </div>
    </MotionConfig>
  );
}
