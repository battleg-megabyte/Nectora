import { useState, useEffect } from 'react';
import {
  Activity,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DiagnosticTest {
  name: string;
  passed: boolean;
  details: string;
}

interface TestSuiteResponse {
  timestamp: string;
  allPassed: boolean;
  results: DiagnosticTest[];
}

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
  const [activeTab, setActiveTab] = useState<'downloads' | 'security'>('downloads');
  const [data, setData] = useState<TestSuiteResponse | null>(null);
  const [downloadData, setDownloadData] = useState<DownloadSuiteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDownloads, setLoadingDownloads] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const runSecurityAudit = async () => {
    try {
      setLoading(true);
      const start = performance.now();
      const res = await fetch('/api/test-suite');
      const end = performance.now();
      setLatencyMs(Math.round(end - start));
      const json: TestSuiteResponse = await res.json();
      setData(json);
    } catch (e) {
      console.error('Test suite error:', e);
    } finally {
      setLoading(false);
    }
  };

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
      console.error('Download tests error:', e);
    } finally {
      setLoadingDownloads(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runSecurityAudit();
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

  const isBusy = activeTab === 'downloads' ? loadingDownloads : loading;

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
            aria-label="System Diagnostics and Download Verification"
            className="relative w-full max-w-2xl max-h-[88vh] bg-[#191C26] rounded-t-3xl sm:rounded-2xl border border-white/[0.14] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-600" />
            </div>

            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.1]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-400/30 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-white truncate">
                    Diagnostics &amp; Download Tests
                  </h3>
                  <p className="text-xs text-zinc-300 truncate">
                    Live extraction + MP4/MP3/HLS stream verification for every source
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close diagnostics"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-b border-white/[0.1] bg-[#131620]">
              <div className="px-3 sm:px-4 py-3 text-center">
                <span className="text-[11px] text-zinc-400 block">Download Checks</span>
                <span className="text-xs font-mono font-semibold text-emerald-400 mt-0.5 block tabular-nums">
                  {downloadData
                    ? `${downloadData.summary.passed} / ${downloadData.summary.total} PASS`
                    : loadingDownloads
                      ? 'Testing...'
                      : 'Pending'}
                </span>
              </div>
              <div className="px-3 sm:px-4 py-3 text-center">
                <span className="text-[11px] text-zinc-400 block">Suite Round-Trip</span>
                <span className="text-xs font-mono font-semibold text-pink-300 mt-0.5 block tabular-nums">
                  {latencyMs !== null ? `${latencyMs} ms` : 'Measuring...'}
                </span>
              </div>
              <div className="px-3 sm:px-4 py-3 text-center">
                <span className="text-[11px] text-zinc-400 block">YouTube Policy</span>
                <span className="text-xs font-semibold text-zinc-100 mt-0.5 block">
                  Excluded
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 border-b border-white/[0.1] bg-[#131620]">
              <button
                type="button"
                onClick={() => setActiveTab('downloads')}
                className={`relative flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'downloads' ? 'text-white' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {activeTab === 'downloads' && (
                  <motion.span
                    layoutId="diag-tab-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500"
                  />
                )}
                <Download className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">Download Tests</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`relative flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'security' ? 'text-white' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {activeTab === 'security' && (
                  <motion.span
                    layoutId="diag-tab-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500"
                  />
                )}
                <ShieldCheck className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">Security Audit</span>
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {activeTab === 'downloads' && (
                <>
                  {loadingDownloads && (
                    <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-zinc-400">
                      <RefreshCw className="w-5 h-5 animate-spin text-pink-400" />
                      <span className="text-xs font-medium">
                        Running live extraction &amp; stream tests for each download...
                      </span>
                    </div>
                  )}

                  {!loadingDownloads && downloadData && (
                    <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                      {downloadData.results.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-start justify-between px-4 py-3 gap-4"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            {t.status === 'pass' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                            ) : t.status === 'warn' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-semibold text-white">{t.name}</p>
                                <span className="text-[10px] font-mono text-pink-300">
                                  {t.platform} · {t.latencyMs}ms
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5 font-mono break-words">
                                {t.details}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`text-[11px] font-mono font-semibold shrink-0 uppercase ${
                              t.status === 'pass'
                                ? 'text-emerald-400'
                                : t.status === 'warn'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'security' && (
                <>
                  {loading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-zinc-400">
                      <RefreshCw className="w-5 h-5 animate-spin text-pink-400" />
                      <span className="text-xs font-medium">Running live server checks...</span>
                    </div>
                  )}

                  {!loading && data && (
                    <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                      {data.results.map((t, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between px-4 py-3 gap-4"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            {t.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white">{t.name}</p>
                              <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">{t.details}</p>
                            </div>
                          </div>

                          <span
                            className={`text-[11px] font-mono font-semibold shrink-0 ${
                              t.passed ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {t.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-5 sm:px-6 py-4 pb-safe border-t border-white/[0.1] bg-[#131620] flex items-center justify-between gap-4">
              <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
                {(activeTab === 'downloads' ? downloadData?.timestamp : data?.timestamp)
                  ? `Completed ${new Date(
                      (activeTab === 'downloads' ? downloadData?.timestamp : data?.timestamp)!
                    ).toLocaleTimeString()}`
                  : ''}
              </span>
              <button
                type="button"
                onClick={activeTab === 'downloads' ? runDownloadTests : runSecurityAudit}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white disabled:opacity-40 transition-all shadow-md shadow-pink-500/20 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                <span>
                  {activeTab === 'downloads' ? 'Run Download Tests' : 'Re-run Audit'}
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
