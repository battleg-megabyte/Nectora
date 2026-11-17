import { useState, useEffect } from 'react';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { PlatformChips } from './components/PlatformChips';
import { UrlInputBar } from './components/UrlInputBar';
import { MediaResultCard } from './components/MediaResultCard';
import { AiAnalysisPanel } from './components/AiAnalysisPanel';
import { DownloadHistory } from './components/DownloadHistory';
import { BatchDownloadModal } from './components/BatchDownloadModal';
import { SystemDiagnosticsModal } from './components/SystemDiagnosticsModal';
import { SecurityBadgeModal } from './components/SecurityBadgeModal';
import { Footer } from './components/Footer';
import { MediaMetadata, DownloadHistoryItem, AnalysisStatus } from './types';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Film,
  Loader2,
  Play,
  Radio,
  ShieldCheck,
} from 'lucide-react';

const STORAGE_KEY = 'nectora_download_history_v1';

const EXTRACTION_STAGES = [
  { label: 'Validating URL & resolving redirects', detail: 'SSRF & shortlink check' },
  { label: 'Scanning native video & audio streams', detail: 'Matching 1080p · 720p · 480p' },
  { label: 'Preparing playable MP4 metadata', detail: 'Verifying stream headers' },
];

export default function App() {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [media, setMedia] = useState<MediaMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [downloadedBlobs, setDownloadedBlobs] = useState<Record<string, string>>({});
  const [selectedQualityChip, setSelectedQualityChip] = useState<'480p' | '720p' | '1080p'>('1080p');
  const [extractionStep, setExtractionStep] = useState(0);

  // Modals state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
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

  const handleResetHome = () => {
    setStatus('idle');
    setMedia(null);
    setErrorMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAnalyzeUrl = async (url: string) => {
    setStatus('analyzing');
    setErrorMessage(null);
    setMedia(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ error: 'Media extraction failed' }));
        setStatus('error');
        setErrorMessage(
          errorJson.error || 'Media could not be accessed. Please verify the link is public.'
        );
        return;
      }

      const data: MediaMetadata = await res.json();
      setMedia(data);
      setStatus('found');

      setTimeout(() => {
        const el = document.getElementById('media-result-card');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'A network error occurred while connecting to the server.');
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen studio-canvas text-[#F4F4F5] flex flex-col justify-between overflow-x-hidden">
        {/* Header */}
        <Header
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onOpenBatch={() => setBatchOpen(true)}
          onOpenSecurity={() => setSecurityOpen(true)}
          onResetHome={handleResetHome}
          historyCount={history.length}
        />

        {/* Main Workspace */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 flex flex-col items-center">
          {/* Editorial Hero */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="text-center max-w-2xl mx-auto space-y-3 mb-7 sm:mb-8"
          >
            <h1
              className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Extract clean video streams in{' '}
              <span className="bg-gradient-to-r from-pink-300 via-rose-300 to-pink-200 bg-clip-text text-transparent">
                original resolution
              </span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl mx-auto">
              Paste a public link from TikTok, Instagram, Facebook, X, Reddit, Vimeo, or any direct video URL to inspect streams and save playable MP4 &amp; MP3 files.
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
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                aria-label="Extracting media streams"
                className="w-full max-w-4xl mx-auto mt-8 bg-[#191C26] rounded-2xl border border-pink-400/35 shadow-2xl shadow-pink-950/25 overflow-hidden"
              >
                {/* Live Extraction Header */}
                <div className="px-4 sm:px-6 py-4 border-b border-white/[0.1] flex items-center justify-between gap-3 bg-gradient-to-r from-pink-400/[0.14] via-transparent to-rose-400/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-300 opacity-80" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-400" />
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-white">
                      Extracting media streams
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-pink-200 tabular-nums">
                    Stage {extractionStep + 1} / {EXTRACTION_STAGES.length}
                  </span>
                </div>

                {/* Animated Extraction Stage Workspace */}
                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-7 items-center">
                  {/* Left: Laser Scanner Preview Frame */}
                  <div className="md:col-span-5 relative aspect-[9/16] max-h-[320px] w-full rounded-xl bg-[#11131B] border border-pink-400/30 overflow-hidden flex flex-col items-center justify-center p-6">
                    {/* Animated Vertical Laser Scan Beam */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-pink-500/35 via-pink-400/15 to-transparent border-t-2 border-pink-400/80 animate-scan-y" />

                    {/* Rotating Concentric Radar Rings */}
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 rounded-full border-2 border-dashed border-pink-500/45"
                      />
                      <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-3 rounded-full border border-rose-400/35 border-t-pink-400"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.12, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-12 h-12 rounded-2xl bg-pink-500/15 border border-pink-400/40 flex items-center justify-center text-pink-400 shadow-lg shadow-pink-500/20"
                      >
                        <Radio className="w-5 h-5" />
                      </motion.div>
                    </div>

                    <p className="mt-5 text-xs font-medium text-zinc-200 text-center">
                      Probing video &amp; audio tracks
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-pink-300/80 text-center">
                      No-watermark HD stream lock
                    </p>
                  </div>

                  {/* Right: Sequential Animated Stage Stepper */}
                  <div className="md:col-span-7 space-y-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-lg sm:text-xl font-semibold text-white">
                        Analyzing source container
                      </h2>
                      <p className="text-xs text-zinc-400">
                        Resolving direct CDN stream URLs and verifying playable MP4 segments.
                      </p>
                    </div>

                    {/* Animated Progress Bar */}
                    <div className="w-full h-2 bg-white/[0.09] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-pink-500 via-pink-400 to-rose-300 rounded-full"
                        initial={{ width: '14%' }}
                        animate={{ width: `${((extractionStep + 1) / EXTRACTION_STAGES.length) * 92}%` }}
                        transition={{ duration: 0.55, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Stage Checklist */}
                    <div className="rounded-xl border border-white/[0.12] bg-[#131620] divide-y divide-white/[0.09] overflow-hidden">
                      {EXTRACTION_STAGES.map((stage, idx) => {
                        const isDone = idx < extractionStep;
                        const isActive = idx === extractionStep;
                        return (
                          <motion.div
                            key={stage.label}
                            initial={{ opacity: 0.6 }}
                            animate={{ opacity: isDone || isActive ? 1 : 0.45 }}
                            className={`flex items-center justify-between px-4 py-3.5 gap-3 transition-colors ${
                              isActive ? 'bg-pink-400/[0.1]' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : isActive ? (
                                <Loader2 className="w-4 h-4 text-pink-400 animate-spin shrink-0" />
                              ) : (
                                <Film className="w-4 h-4 text-zinc-600 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p
                                  className={`text-xs font-semibold truncate ${
                                    isActive
                                      ? 'text-white'
                                      : isDone
                                        ? 'text-emerald-300'
                                        : 'text-zinc-400'
                                  }`}
                                >
                                  {stage.label}
                                </p>
                                <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                                  {stage.detail}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-[11px] font-mono shrink-0 ${
                                isDone
                                  ? 'text-emerald-400'
                                  : isActive
                                    ? 'text-pink-400'
                                    : 'text-zinc-600'
                              }`}
                            >
                              {isDone ? 'OK' : isActive ? 'ACTIVE' : 'WAIT'}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                      <span>Ephemeral stream inspection · zero server video retention</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {status === 'error' && errorMessage && (
              <motion.div
                key="error"
                role="alert"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-3xl mx-auto mt-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-200 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <p className="font-semibold text-rose-100">Unable to extract media</p>
                  <p className="mt-0.5 text-rose-200/80">{errorMessage}</p>
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
              transition={{ duration: 0.3, delay: 0.18 }}
              className="w-full max-w-3xl mx-auto mt-10"
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <h2 className="text-xs font-semibold text-zinc-300">Recent downloads</h2>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="flex items-center gap-1 py-1 text-xs font-medium text-pink-300 hover:text-pink-200 transition-colors cursor-pointer"
                >
                  <span>Open History ({history.length})</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="rounded-2xl border border-white/[0.12] divide-y divide-white/[0.09] bg-[#191C26]/95 overflow-hidden">
                {history.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-pink-400/[0.07] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                        <span className="capitalize font-sans text-zinc-300">{item.platform}</span> ·{' '}
                        {item.resolution} · {item.format.toUpperCase()}
                        {item.fileSizeFormatted ? ` · ${item.fileSizeFormatted}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-medium bg-white/[0.08] hover:bg-pink-500/20 hover:border-pink-400/40 text-zinc-100 border border-white/[0.12] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current text-pink-300" />
                      <span>Open</span>
                    </button>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Editorial Capabilities Strip */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.22 }}
            aria-label="Capabilities"
            className="w-full max-w-4xl mx-auto mt-14 sm:mt-16 pt-8 sm:pt-10 border-t border-white/[0.1] grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8"
          >
            <div className="space-y-1.5">
              <h3 className="font-display font-semibold text-sm text-white">
                <span className="text-pink-300 font-mono mr-1.5">01.</span>
                Native Stream Extraction
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Matches original 1080p, 720p, and 480p video streams or extracts clean 320kbps MP3 audio tracks with live transfer animation.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display font-semibold text-sm text-white">
                <span className="text-pink-300 font-mono mr-1.5">02.</span>
                Instant Device Pop-Out
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Watch your saved MP4 or play MP3 audio immediately, open it in a dedicated tab, or share directly to your phone Files app.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display font-semibold text-sm text-white">
                <span className="text-pink-300 font-mono mr-1.5">03.</span>
                Ephemeral SSRF Defense
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Resolves hostnames against private IP ranges, sanitizes filenames, and streams directly without permanent server storage.
              </p>
            </div>
          </motion.section>
        </main>

        {/* Footer */}
        <Footer
          onOpenSecurity={() => setSecurityOpen(true)}
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

        <SecurityBadgeModal
          isOpen={securityOpen}
          onClose={() => setSecurityOpen(false)}
        />
      </div>
    </MotionConfig>
  );
}
