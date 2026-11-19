import { useState, useEffect } from 'react';
import {
  Activity,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DownloadCheckResult {
  id: string;
  name: string;
  platform: string;
  status: 'pass' | 'warn' | 'fail';
  latencyMs: number;
  bytesVerified: number;
  qualitiesFound: string[];
  details: string;
}

interface DownloadSuiteResponse {
  timestamp: string;
  allPassed: boolean;
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
  };
  results: DownloadCheckResult[];
}

interface SystemDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemDiagnosticsModal({
  isOpen,
  onClose,
}: SystemDiagnosticsModalProps) {
  const [downloadData, setDownloadData] = useState<DownloadSuiteResponse | null>(null);
  const [loadingDownloads, setLoadingDownloads] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const runDownloadTests = async () => {
    try {
      setLoadingDownloads(true);
      const start = performance.now();
      const res = await fetch('/api/test-downloads');
      const end = performance.now();
      setLatencyMs(Math.round(end - start));
      const json: DownloadSuiteResponse = await res.json();
      setDownloadData(json);
    } catch (e) {
      console.error('Stream check error:', e);
    } finally {
      setLoadingDownloads(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDownloadTests();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Stream Check"
            className="relative w-full max-w-2xl max-h-[90dvh] sm:max-h-[88dvh] wk-box rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-rose-300/35" />
            </div>

            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-rose-300/15 bg-[#0D060C]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-400/35 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-white truncate">
                    Stream &amp; Format Verification
                  </h3>
                  <p className="text-xs text-rose-100/65 truncate">
                    Live extraction &amp; stream verification across MP4, MP3 &amp; M4A formats
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close stream check"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-rose-100/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-3 divide-x divide-rose-300/15 border-b border-rose-300/15 bg-[#0D060C]">
              <div className="px-2 sm:px-4 py-3 text-center">
                <span className="text-[11px] text-rose-100/60 block">Stream Checks</span>
                <span className="text-xs font-mono font-semibold text-emerald-400 mt-0.5 block tabular-nums">
                  {downloadData
                    ? `${downloadData.summary.passed} / ${downloadData.summary.total} PASS`
                    : loadingDownloads
                      ? 'Testing...'
                      : 'Pending'}
                </span>
              </div>
              <div className="px-2 sm:px-4 py-3 text-center">
                <span className="text-[11px] text-rose-100/60 block">Formats Active</span>
                <span className="text-xs font-mono font-semibold text-rose-400 mt-0.5 block tabular-nums">
                  MP4 · MP3 · M4A
                </span>
              </div>
              <div className="px-2 sm:px-4 py-3 text-center">
                <span className="text-[11px] text-rose-100/60 block">Suite Round-Trip</span>
                <span className="text-xs font-mono font-semibold text-pink-300 mt-0.5 block tabular-nums">
                  {latencyMs !== null ? `${latencyMs} ms` : 'Measuring...'}
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {loadingDownloads && (
                <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-rose-100/65">
                  <RefreshCw className="w-5 h-5 animate-spin text-rose-400" />
                  <span className="text-xs font-medium text-center">
                    Running live extraction &amp; stream tests across MP4, MP3 &amp; M4A tiers...
                  </span>
                </div>
              )}

              {!loadingDownloads && downloadData && (
                <div className="rounded-xl border border-rose-300/20 divide-y divide-rose-300/15 bg-[#0D060C]">
                  {downloadData.results.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start justify-between px-4 py-3 gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {t.status === 'pass' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        ) : t.status === 'warn' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-white">{t.name}</p>
                            <span className="text-[10px] font-mono text-pink-300">
                              {t.platform} · {t.latencyMs}ms
                            </span>
                          </div>
                          <p className="text-[11px] text-rose-100/60 mt-0.5 font-mono break-words">
                            {t.details}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-mono font-semibold shrink-0 uppercase ${
                          t.status === 'pass'
                            ? 'text-emerald-400'
                            : t.status === 'warn'
                              ? 'text-rose-400'
                              : 'text-red-400'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 sm:px-6 py-4 pb-safe border-t border-rose-300/15 bg-[#0D060C] flex items-center justify-between gap-4">
              <span className="text-[11px] text-rose-100/60 font-mono tabular-nums">
                {downloadData?.timestamp
                  ? `Completed ${new Date(downloadData.timestamp).toLocaleTimeString()}`
                  : ''}
              </span>
              <button
                type="button"
                onClick={runDownloadTests}
                disabled={loadingDownloads}
                className="flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDownloads ? 'animate-spin' : ''}`} />
                <span>Re-run Stream Check</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
