import { useState, useEffect } from 'react';
import {
  History,
  X,
  Trash2,
  Download,
  Search,
  FileDown,
  Instagram,
  Film,
  Video,
  Globe,
  Twitter,
  MessageSquare,
  Play,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DownloadHistoryItem } from '../types';

interface DownloadHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  history: DownloadHistoryItem[];
  downloadedBlobs?: Record<string, string>;
  onClearHistory: () => void;
  onDeleteItem: (id: string) => void;
}

export function DownloadHistory({
  isOpen,
  onClose,
  history,
  downloadedBlobs = {},
  onClearHistory,
  onDeleteItem,
}: DownloadHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [activePlayerItem, setActivePlayerItem] = useState<{
    item: DownloadHistoryItem;
    src: string;
    isLocal: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activePlayerItem) {
          setActivePlayerItem(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, activePlayerItem, onClose]);

  const filtered = history.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.platform.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.qualityLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform =
      platformFilter === 'all' || item.platform.toLowerCase() === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  const exportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `nectora_history_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getPlatformIcon = (p: string) => {
    switch (p) {
      case 'instagram':
        return <Instagram className="w-4 h-4 text-pink-400" />;
      case 'tiktok':
        return <Film className="w-4 h-4 text-cyan-400" />;
      case 'facebook':
        return <Video className="w-4 h-4 text-blue-400" />;
      case 'twitter':
        return <Twitter className="w-4 h-4 text-sky-400" />;
      case 'reddit':
        return <MessageSquare className="w-4 h-4 text-orange-400" />;
      default:
        return <Globe className="w-4 h-4 text-emerald-400" />;
    }
  };

  const handleOpenItemPlayer = (item: DownloadHistoryItem) => {
    const localBlob = downloadedBlobs[item.url];
    const formatParam = item.format?.toLowerCase() === 'mp3' ? '&format=mp3' : '';
    const src = localBlob || `/api/proxy-media?url=${encodeURIComponent(item.url)}${formatParam}`;
    setActivePlayerItem({
      item,
      src,
      isLocal: Boolean(localBlob),
    });
  };

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
            aria-label="Download History"
            className="relative w-full max-w-2xl max-h-[88vh] bg-[#191C26] rounded-t-3xl sm:rounded-2xl border border-white/[0.14] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Mobile Sheet Handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.1]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-400/30 flex items-center justify-center shrink-0">
                  <History className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-white truncate">
                    Download History
                  </h3>
                  <p className="text-xs text-zinc-300 font-mono tabular-nums">
                    {history.length} {history.length === 1 ? 'record' : 'records'} stored locally
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close history"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Integrated Player */}
            <AnimatePresence>
              {activePlayerItem && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 border-b border-white/[0.1] bg-[#0B0D13] space-y-3 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {activePlayerItem.item.title}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-300 tabular-nums">
                        {activePlayerItem.isLocal ? 'Local downloaded file' : 'Stream preview'} ·{' '}
                        {activePlayerItem.item.resolution}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={activePlayerItem.src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 min-h-[36px] rounded-lg bg-white/[0.1] hover:bg-white/[0.16] text-xs text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>New Tab</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setActivePlayerItem(null)}
                        className="px-3 min-h-[36px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs text-zinc-200 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  {activePlayerItem.item.format?.toLowerCase() === 'mp3' ? (
                    <div className="p-4 rounded-xl bg-[#131620] border border-pink-400/25">
                      <audio
                        src={activePlayerItem.src}
                        controls
                        autoPlay
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <video
                      src={activePlayerItem.src}
                      controls
                      autoPlay
                      playsInline
                      className="w-full max-h-[240px] rounded-xl bg-black object-contain"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search & Filters */}
            <div className="p-4 border-b border-white/[0.1] bg-[#131620] space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by title, resolution, or source..."
                    className="w-full min-h-[40px] bg-[#11131B] border border-white/[0.12] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-pink-400/70"
                  />
                </div>

                {history.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={exportJson}
                      className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.09] text-zinc-200 border border-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
                      title="Export JSON"
                    >
                      <FileDown className="w-3.5 h-3.5 text-pink-400" />
                      <span className="hidden sm:inline">Export</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClearHistory}
                      className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 transition-colors whitespace-nowrap cursor-pointer"
                      title="Clear all history"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  </>
                )}
              </div>

              {history.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {['all', 'tiktok', 'instagram', 'facebook', 'direct'].map((plat) => {
                    const active = platformFilter === plat;
                    return (
                      <button
                        key={plat}
                        type="button"
                        onClick={() => setPlatformFilter(plat)}
                        className={`relative px-3 min-h-[34px] rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active ? 'text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="history-filter-pill"
                            transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                            className="absolute inset-0 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500"
                          />
                        )}
                        <span className="relative z-10">{plat}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Records List */}
            <div className="p-4 pb-safe overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 space-y-1.5">
                  <History className="w-8 h-8 mx-auto text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-200">No downloads found</p>
                  <p className="text-xs">
                    {history.length === 0
                      ? 'Extracted and saved videos will appear here.'
                      : 'Try adjusting your search query or filter.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                  {filtered.map((item) => {
                    const hasLocalBlob = Boolean(downloadedBlobs[item.url]);
                    const isMp3 = item.format?.toLowerCase() === 'mp3';
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0">
                            {getPlatformIcon(item.platform)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 font-mono tabular-nums flex-wrap">
                              <span className="text-pink-300 font-semibold">{item.resolution}</span>
                              <span aria-hidden="true">·</span>
                              <span className="uppercase">{item.format}</span>
                              {item.fileSizeFormatted && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{item.fileSizeFormatted}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>{new Date(item.downloadedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0">
                          <button
                            type="button"
                            onClick={() => handleOpenItemPlayer(item)}
                            className={`flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                              hasLocalBlob
                                ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white'
                                : 'bg-white/[0.08] hover:bg-pink-500 text-white border border-white/[0.12]'
                            }`}
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>
                              {isMp3
                                ? hasLocalBlob
                                  ? 'Play MP3'
                                  : 'Listen'
                                : hasLocalBlob
                                  ? 'Watch MP4'
                                  : 'Watch'}
                            </span>
                          </button>

                          <a
                            href={`/api/download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.title)}_${item.resolution}.${item.format}&format=${item.format}`}
                            download
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] transition-colors"
                            title="Download again"
                            aria-label="Download again"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.id)}
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400 border border-white/[0.08] transition-colors cursor-pointer"
                            title="Remove from history"
                            aria-label="Remove from history"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
