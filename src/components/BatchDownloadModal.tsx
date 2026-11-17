import { useState, useRef, useEffect } from 'react';
import {
  Layers,
  X,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  Square,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MediaMetadata, DownloadHistoryItem } from '../types';

interface BatchItem {
  id: string;
  url: string;
  status: 'pending' | 'analyzing' | 'ready' | 'error';
  media?: MediaMetadata;
  error?: string;
  downloadState?: 'idle' | 'downloading' | 'completed' | 'error';
  downloadProgress?: number;
  downloadSpeed?: string;
  completedBlobUrl?: string;
  completedTitle?: string;
  completedResolution?: string;
  completedFormat?: 'mp3' | 'mp4';
}

interface BatchDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (media: MediaMetadata) => void;
  preferredResolution?: '480p' | '720p' | '1080p';
  onSaveHistory?: (item: DownloadHistoryItem) => void;
  onRegisterBlob?: (streamUrl: string, blobUrl: string) => void;
}

export function BatchDownloadModal({
  isOpen,
  onClose,
  onSelectMedia,
  preferredResolution = '1080p',
  onSaveHistory,
  onRegisterBlob,
}: BatchDownloadModalProps) {
  const [rawText, setRawText] = useState('');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeWatchItem, setActiveWatchItem] = useState<{
    title: string;
    blobUrl: string;
    resolution: string;
    format: 'mp3' | 'mp4';
  } | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeWatchItem) {
          setActiveWatchItem(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, activeWatchItem, onClose]);

  const parsedUrlCount = rawText
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http')).length;

  const handleParseUrls = () => {
    const urls: string[] = Array.from(
      new Set<string>(
        rawText
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u.length > 0 && u.startsWith('http'))
      )
    );

    if (urls.length === 0) return;

    const newItems: BatchItem[] = urls.map((url, idx) => ({
      id: `batch_${Date.now()}_${idx}`,
      url,
      status: 'pending',
    }));

    setItems(newItems);
  };

  const handleStartBatchAnalysis = async () => {
    if (items.length === 0 || isProcessing) return;
    setIsProcessing(true);

    const updated = [...items];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'ready') continue;
      updated[i].status = 'analyzing';
      setItems([...updated]);

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: updated[i].url }),
        });

        if (res.ok) {
          const data: MediaMetadata = await res.json();
          updated[i].status = 'ready';
          updated[i].media = data;
        } else {
          const errJson = await res.json().catch(() => ({}));
          updated[i].status = 'error';
          updated[i].error = errJson.error || 'Failed to extract media';
        }
      } catch (err: any) {
        updated[i].status = 'error';
        updated[i].error = err?.message || 'Network error';
      }

      setItems([...updated]);
    }

    setIsProcessing(false);
  };

  const handleCancelBatchItem = (itemId: string) => {
    const controller = abortControllersRef.current.get(itemId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(itemId);
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, downloadState: 'idle', downloadProgress: 0, downloadSpeed: undefined }
          : it
      )
    );
  };

  const handleDownloadItem = async (itemId: string, media: MediaMetadata) => {
    const quality =
      media.qualities.find((q) =>
        q.resolution.toLowerCase().includes(preferredResolution.toLowerCase())
      ) ||
      media.qualities[0] ||
      media.qualities[1];
    if (!quality) return;

    const existing = abortControllersRef.current.get(itemId);
    if (existing) existing.abort();

    const controller = new AbortController();
    abortControllersRef.current.set(itemId, controller);

    const cleanTitle =
      (media.title || 'media')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'batch_video';
    const fileExt = quality.format.toLowerCase() === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${cleanTitle}_${quality.resolution}.${fileExt}`;
    const audioParam = quality.audioUrl ? `&audioUrl=${encodeURIComponent(quality.audioUrl)}` : '';
    const sizeParam = quality.fileSizeBytes ? `&fileSizeBytes=${quality.fileSizeBytes}` : '';
    const endpoint = `/api/download?url=${encodeURIComponent(quality.url)}${audioParam}&filename=${encodeURIComponent(filename)}&format=${fileExt}&resolution=${quality.resolution}${sizeParam}`;

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, downloadState: 'downloading', downloadProgress: 0, downloadSpeed: 'Connecting' }
          : it
      )
    );

    try {
      const res = await fetch(endpoint, { signal: controller.signal });
      if (!res.ok) throw new Error('Download stream failed');

      const headerLength = res.headers.get('content-length') || res.headers.get('x-expected-bytes');
      const expectedTotal = headerLength ? parseInt(headerLength, 10) : quality.fileSizeBytes || 0;

      if (!res.body) throw new Error('ReadableStream not supported');

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;
      const startTime = performance.now();
      let lastUIUpdate = performance.now();

      while (true) {
        if (controller.signal.aborted) {
          await reader.cancel();
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          const now = performance.now();

          if (now - lastUIUpdate > 80) {
            lastUIUpdate = now;
            const elapsed = Math.max(0.1, (now - startTime) / 1000);
            const speed = receivedBytes / (1024 * 1024) / elapsed;
            const pct =
              expectedTotal > 0
                ? Math.min(99, Math.round((receivedBytes / expectedTotal) * 100))
                : Math.min(95, Math.round((receivedBytes / (receivedBytes + 2000000)) * 100));

            setItems((prev) =>
              prev.map((it) =>
                it.id === itemId
                  ? {
                      ...it,
                      downloadProgress: pct,
                      downloadSpeed: `${speed.toFixed(1)} MB/s`,
                    }
                  : it
              )
            );
          }
        }
      }

      if (controller.signal.aborted) return;

      if (receivedBytes <= 0) {
        throw new Error('Received empty stream from server');
      }

      const mimeType = fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      const blob = new Blob(chunks, { type: mimeType });
      const blobUrl = window.URL.createObjectURL(blob);

      onRegisterBlob?.(quality.url, blobUrl);

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                downloadState: 'completed',
                downloadProgress: 100,
                downloadSpeed: 'Saved',
                completedBlobUrl: blobUrl,
                completedTitle: media.title,
                completedResolution: quality.resolution,
                completedFormat: fileExt,
              }
            : it
        )
      );

      onSaveHistory?.({
        id: `${media.id}_${Date.now()}`,
        title: media.title,
        platform: media.platform,
        thumbnailUrl: media.thumbnailUrl,
        qualityLabel: quality.label,
        resolution: quality.resolution,
        format: quality.format,
        url: quality.url,
        downloadedAt: Date.now(),
        authorName: media.author.name,
        fileSizeFormatted: quality.fileSizeFormatted,
      });

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) return;
      console.error('Batch item download failed:', err);
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, downloadState: 'error', error: 'Download failed' } : it
        )
      );
    } finally {
      abortControllersRef.current.delete(itemId);
    }
  };

  const handleDownloadAllReady = () => {
    items
      .filter((it) => it.status === 'ready' && it.media && it.downloadState !== 'completed')
      .forEach((it, index) => {
        setTimeout(() => {
          if (it.media) handleDownloadItem(it.id, it.media);
        }, index * 600);
      });
  };

  const loadSampleBatch = () => {
    setRawText(
      [
        'https://www.w3schools.com/html/mov_bbb.mp4',
        'https://filesamples.com/samples/video/mp4/sample_960x540.mp4',
      ].join('\n')
    );
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
            aria-label="Batch URL Queue"
            className="relative w-full max-w-3xl max-h-[88vh] bg-[#191C26] rounded-t-3xl sm:rounded-2xl border border-white/[0.14] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Mobile Sheet Handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.1]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-400/30 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-white truncate">
                    Batch Extraction Queue
                  </h3>
                  <p className="text-xs text-zinc-300 truncate">
                    Paste multiple links (one per line) to extract in sequence
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close batch queue"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inline Media Player */}
            <AnimatePresence>
              {activeWatchItem && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 border-b border-white/[0.1] bg-[#0B0D13] space-y-3 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {activeWatchItem.title}
                      </p>
                      <p className="text-[11px] font-mono text-emerald-400">
                        Local {activeWatchItem.format.toUpperCase()} · {activeWatchItem.resolution}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={activeWatchItem.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 min-h-[36px] rounded-lg bg-white/[0.1] hover:bg-white/[0.16] text-xs text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>New Tab</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveWatchItem(null)}
                        className="px-3 min-h-[36px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs text-zinc-200 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  {activeWatchItem.format === 'mp3' ? (
                    <div className="p-4 rounded-xl bg-[#131620] border border-pink-400/25">
                      <audio
                        src={activeWatchItem.blobUrl}
                        controls
                        autoPlay
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <video
                      src={activeWatchItem.blobUrl}
                      controls
                      autoPlay
                      playsInline
                      className="w-full max-h-[240px] rounded-xl bg-black object-contain"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="p-4 sm:p-5 border-b border-white/[0.1] bg-[#131620] space-y-3">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="https://www.tiktok.com/@user/video/...&#10;https://www.instagram.com/reel/...&#10;https://example.com/video.mp4"
                rows={3}
                className="w-full bg-[#11131B] border border-white/[0.12] rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pink-400/70 font-mono"
              />

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleParseUrls}
                    disabled={parsedUrlCount === 0 || isProcessing}
                    className="px-4 min-h-[40px] rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.08] disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Load Queue ({parsedUrlCount})
                  </button>

                  {!rawText.trim() && (
                    <button
                      type="button"
                      onClick={loadSampleBatch}
                      className="py-2 text-xs text-zinc-400 hover:text-pink-400 underline underline-offset-4 decoration-white/15 cursor-pointer"
                    >
                      Insert samples
                    </button>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setItems([]);
                        setRawText('');
                        setActiveWatchItem(null);
                      }}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-white/[0.08] transition-colors cursor-pointer"
                      title="Clear queue"
                      aria-label="Clear queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={handleStartBatchAnalysis}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white disabled:opacity-40 transition-all shadow-md shadow-pink-500/20 whitespace-nowrap cursor-pointer"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>{isProcessing ? 'Analyzing...' : 'Analyze All'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Queue Items */}
            <div className="p-4 sm:p-5 pb-safe overflow-y-auto flex-1">
              {items.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-xs space-y-1">
                  <p className="text-sm font-medium text-zinc-200">Queue is empty</p>
                  <p>Paste one or more video URLs above and click Load Queue.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xs font-mono text-zinc-500 tabular-nums w-5 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">
                            {item.media ? item.media.title : item.url}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] mt-0.5 font-mono tabular-nums flex-wrap">
                            {item.status === 'pending' && (
                              <span className="text-zinc-500 font-sans">Queued</span>
                            )}
                            {item.status === 'analyzing' && (
                              <span className="flex items-center gap-1 text-pink-400 font-sans">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Extracting...</span>
                              </span>
                            )}
                            {item.status === 'ready' && (
                              <span className="flex items-center gap-1.5 text-emerald-400 font-sans">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Ready ({item.media?.qualities.length} streams)</span>
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="flex items-center gap-1 text-rose-400 font-sans">
                                <AlertCircle className="w-3 h-3" />
                                <span className="truncate">{item.error}</span>
                              </span>
                            )}

                            {item.downloadState === 'downloading' && (
                              <span className="text-pink-300">
                                · {item.downloadProgress ?? 0}%{' '}
                                {item.downloadSpeed ? `(${item.downloadSpeed})` : ''}
                              </span>
                            )}
                            {item.downloadState === 'completed' && (
                              <span className="text-emerald-300">· Saved</span>
                            )}
                          </div>

                          {item.downloadState === 'downloading' && (
                            <div className="w-full max-w-xs h-1.5 bg-white/[0.08] rounded-full overflow-hidden mt-2">
                              <div
                                className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all duration-150 animate-shimmer"
                                style={{ width: `${Math.max(4, item.downloadProgress || 0)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {item.status === 'ready' && item.media && (
                        <div className="flex items-center gap-2 shrink-0 pl-8 sm:pl-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.media) {
                                onSelectMedia(item.media);
                                onClose();
                              }
                            }}
                            className="px-3 min-h-[38px] rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08] transition-colors cursor-pointer"
                          >
                            Inspect
                          </button>

                          {item.downloadState === 'downloading' ? (
                            <button
                              type="button"
                              onClick={() => handleCancelBatchItem(item.id)}
                              className="flex items-center gap-1 px-3 min-h-[38px] rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              <span>Stop</span>
                            </button>
                          ) : item.downloadState === 'completed' && item.completedBlobUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveWatchItem({
                                  title:
                                    item.completedTitle ||
                                    item.media?.title ||
                                    'Downloaded Media',
                                  blobUrl: item.completedBlobUrl!,
                                  resolution: item.completedResolution || 'MP4',
                                  format: item.completedFormat || 'mp4',
                                })
                              }
                              className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>
                                {item.completedFormat === 'mp3' ? 'Play MP3' : 'Watch MP4'}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (item.media) handleDownloadItem(item.id, item.media);
                              }}
                              className="flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white transition-all shadow-md shadow-pink-500/20 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.some((it) => it.status === 'ready') && (
              <div className="px-5 sm:px-6 py-4 pb-safe border-t border-white/[0.1] bg-[#131620] flex items-center justify-between gap-4">
                <span className="text-xs text-zinc-300 font-mono tabular-nums">
                  {items.filter((it) => it.status === 'ready').length} ready
                </span>
                <button
                  type="button"
                  onClick={handleDownloadAllReady}
                  className="flex items-center gap-2 px-5 min-h-[42px] rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white transition-all shadow-md shadow-pink-500/20 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download All Ready</span>
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
