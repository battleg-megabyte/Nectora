import { useState, useRef, useEffect, ChangeEvent } from 'react';
import {
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Check,
  Copy,
  ExternalLink,
  ScanSearch,
  Film,
  CheckCircle2,
  AlertCircle,
  Music,
  X,
  Square,
  ArrowRight,
  Share2,
  FolderOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MediaMetadata, QualityOption, DownloadHistoryItem } from '../types';
import { PlatformIcon } from './PlatformIcon';

interface MediaResultCardProps {
  media: MediaMetadata;
  preferredResolution?: 'best' | 'mp3' | '360p' | '480p' | '720p' | '1080p';
  onSaveHistory: (item: DownloadHistoryItem) => void;
  onOpenAiAnalysis: () => void;
  onRegisterBlob?: (streamUrl: string, blobUrl: string) => void;
}

function safeHttpUrl(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {}
  return undefined;
}

export function MediaResultCard({
  media,
  preferredResolution = 'best',
  onSaveHistory,
  onOpenAiAnalysis,
  onRegisterBlob,
}: MediaResultCardProps) {
  const findPreferredQuality = (m: MediaMetadata, pref: string): QualityOption => {
    if (pref === 'mp3') {
      const mp3Item = m.qualities.find((q) => q.format === 'mp3' || q.format === 'm4a');
      if (mp3Item) return mp3Item;
    } else if (pref !== 'best') {
      const exact = m.qualities.find((q) =>
        q.resolution.toLowerCase().includes(pref.toLowerCase())
      );
      if (exact) return exact;
    }
    return (
      m.qualities.find((q) => q.format !== 'mp3' && q.format !== 'm4a') ||
      m.qualities[0] ||
      m.qualities[1]
    );
  };

  const [selectedQuality, setSelectedQuality] = useState<QualityOption>(() =>
    findPreferredQuality(media, preferredResolution)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    qualityId: string;
    percentage: number;
    receivedBytes: number;
    totalBytes: number;
    formattedReceived: string;
    formattedTotal: string;
    formattedSpeed: string;
  } | null>(null);
  const [downloadSuccessId, setDownloadSuccessId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<'all' | 'video' | 'audio'>('all');
  const [hasVideoError, setHasVideoError] = useState(false);
  const [hasThumbError, setHasThumbError] = useState(false);
  const [hasAvatarError, setHasAvatarError] = useState(false);
  const [audioStatus, setAudioStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [audioRetryNonce, setAudioRetryNonce] = useState(0);
  const [downloadedAudioBlobs, setDownloadedAudioBlobs] = useState<Record<string, string>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [downloadNotification, setDownloadNotification] = useState<{
    open: boolean;
    title: string;
    blobUrl: string;
    downloadEndpoint: string;
    file: File;
    canShareFile: boolean;
    filename: string;
    qualityLabel: string;
    resolution: string;
    sizeFormatted: string;
    platform: string;
    isAudioOnly?: boolean;
  } | null>(null);
  const [previewDownloadedModal, setPreviewDownloadedModal] = useState(false);
  const [toastPaused, setToastPaused] = useState(false);

  const safeThumbUrl = safeHttpUrl(media.thumbnailUrl);
  const safeAvatarUrl = safeHttpUrl(media.author.avatarUrl);
  const safeProfileUrl = safeHttpUrl(media.author.profileUrl);

  useEffect(() => {
    setSelectedQuality(findPreferredQuality(media, preferredResolution));
    setStreamFilter('all');
    setHasVideoError(false);
    setHasThumbError(false);
    setHasAvatarError(false);
    setAudioStatus('loading');
    setAudioRetryNonce(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setDownloadError(null);
    setDownloadSuccessId(null);
  }, [media.id, preferredResolution]);

  useEffect(() => {
    if (!previewDownloadedModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewDownloadedModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [previewDownloadedModal]);

  useEffect(() => {
    if (!downloadNotification?.open || previewDownloadedModal || toastPaused) return;
    const timer = window.setTimeout(() => {
      setDownloadNotification((prev) => (prev ? { ...prev, open: false } : null));
    }, 16000);
    return () => window.clearTimeout(timer);
  }, [downloadNotification?.open, downloadNotification?.filename, previewDownloadedModal, toastPaused]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const formatSpeed = (bytesPerSec: number): string => {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    if (bytesPerSec > 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleQualitySelect = (quality: QualityOption) => {
    setSelectedQuality(quality);
    setHasVideoError(false);
    setAudioStatus('loading');
    setIsPlaying(false);
    setCurrentTime(0);
    setDownloadError(null);
  };

  const handlePlayToggle = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleMuteToggle = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current && isFinite(time)) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleCopyDirectLink = () => {
    if (!selectedQuality?.url) return;
    navigator.clipboard.writeText(selectedQuality.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setDownloadingId(null);
    setDownloadProgress(null);
    setDownloadError('Download stopped.');
    setTimeout(() => {
      setDownloadError((prev) => (prev === 'Download stopped.' ? null : prev));
    }, 3500);
  };

  const handleShareToDevice = async () => {
    if (!downloadNotification?.canShareFile) return;
    try {
      await navigator.share({
        files: [downloadNotification.file],
        title: downloadNotification.title,
        text: `${downloadNotification.title} (${downloadNotification.resolution})`,
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Device share sheet notice:', err);
      }
    }
  };

  const handleDownload = async (quality: QualityOption) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setDownloadingId(quality.id);
      setDownloadSuccessId(null);
      setDownloadError(null);
      setDownloadProgress({
        qualityId: quality.id,
        percentage: 0,
        receivedBytes: 0,
        totalBytes: quality.fileSizeBytes || 0,
        formattedReceived: '0 B',
        formattedTotal: quality.fileSizeFormatted || 'Estimating',
        formattedSpeed: 'Connecting',
      });

      const cleanTitle =
        (media.title || 'media')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 45) || 'wukong_vid_media';

      const normalizedFmt = quality.format.toLowerCase();
      const fileExt: 'mp3' | 'm4a' | 'webm' | 'mp4' =
        normalizedFmt === 'mp3'
          ? 'mp3'
          : normalizedFmt === 'm4a'
            ? 'm4a'
            : normalizedFmt === 'webm'
              ? 'webm'
              : 'mp4';
      const isAudioFormat = fileExt === 'mp3' || fileExt === 'm4a';
      const cleanFilename = `${cleanTitle}_${isAudioFormat && quality.bitrateKbps ? `${quality.bitrateKbps}kbps` : quality.resolution}.${fileExt}`;
      const audioParam = quality.audioUrl ? `&audioUrl=${encodeURIComponent(quality.audioUrl)}` : '';
      const sizeParam = quality.fileSizeBytes ? `&fileSizeBytes=${quality.fileSizeBytes}` : '';
      const bitrateParam =
        isAudioFormat && quality.bitrateKbps ? `&bitrate=${quality.bitrateKbps}k` : '';
      const scaleParam =
        !isAudioFormat && !quality.isNative && quality.targetHeight && quality.targetHeight <= 720
          ? `&scaleHeight=${quality.targetHeight}`
          : '';
      const downloadEndpoint = `/api/download?url=${encodeURIComponent(quality.url)}${audioParam}&filename=${encodeURIComponent(cleanFilename)}&format=${fileExt}&resolution=${quality.resolution}${sizeParam}${bitrateParam}${scaleParam}`;

      const response = await fetch(downloadEndpoint, { signal: controller.signal });
      if (!response.ok) {
        let errMessage = 'Download stream failed or expired.';
        try {
          const errJson = await response.json();
          if (errJson.error) errMessage = errJson.error;
        } catch {}
        throw new Error(errMessage);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(
          'Upstream platform returned a webpage instead of media. Try re-extracting the URL.'
        );
      }

      const headerLength =
        response.headers.get('content-length') || response.headers.get('x-expected-bytes');
      const parsedLength = headerLength ? parseInt(headerLength, 10) : 0;
      const expectedTotal = parsedLength > 0 ? parsedLength : quality.fileSizeBytes || 0;

      if (!response.body) {
        throw new Error('Streaming is not supported by this browser.');
      }

      const reader = response.body.getReader();
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

          if (now - lastUIUpdate > 60) {
            lastUIUpdate = now;
            const elapsed = Math.max(0.1, (now - startTime) / 1000);
            const speed = receivedBytes / elapsed;
            const pct =
              expectedTotal > 0
                ? Math.min(99, Math.round((receivedBytes / expectedTotal) * 100))
                : Math.min(95, Math.round((receivedBytes / (receivedBytes + 2000000)) * 100));

            setDownloadProgress({
              qualityId: quality.id,
              percentage: pct,
              receivedBytes,
              totalBytes: expectedTotal || receivedBytes,
              formattedReceived: formatBytes(receivedBytes),
              formattedTotal:
                expectedTotal > 0 ? formatBytes(expectedTotal) : formatBytes(receivedBytes),
              formattedSpeed: formatSpeed(speed),
            });
          }
        }
      }

      if (controller.signal.aborted) return;

      if (receivedBytes <= 0) {
        throw new Error(
          isAudioFormat
            ? `${fileExt.toUpperCase()} audio stream returned 0 bytes. This clip may have no audio track or the source expired.`
            : 'Video stream returned 0 bytes. Please try re-extracting the URL.'
        );
      }

      setDownloadProgress({
        qualityId: quality.id,
        percentage: 100,
        receivedBytes,
        totalBytes: receivedBytes,
        formattedReceived: formatBytes(receivedBytes),
        formattedTotal: formatBytes(receivedBytes),
        formattedSpeed: 'Saved',
      });

      const mimeType =
        fileExt === 'mp3'
          ? 'audio/mpeg'
          : fileExt === 'm4a'
            ? 'audio/mp4'
            : fileExt === 'webm'
              ? 'video/webm'
              : 'video/mp4';
      const blob = new Blob(chunks, { type: mimeType });
      const blobUrl = window.URL.createObjectURL(blob);
      const file = new File([blob], cleanFilename, { type: mimeType });

      let canShareFile = false;
      try {
        canShareFile =
          typeof navigator !== 'undefined' &&
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] });
      } catch {
        canShareFile = false;
      }

      onRegisterBlob?.(quality.url, blobUrl);
      if (isAudioFormat) {
        setDownloadedAudioBlobs((prev) => ({ ...prev, [quality.id]: blobUrl }));
        setAudioStatus('ready');
      }

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = cleanFilename;
      a.setAttribute('download', cleanFilename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 1500);

      const finalSizeFormatted = formatBytes(receivedBytes) || quality.fileSizeFormatted || '';

      setDownloadNotification({
        open: true,
        title: media.title || (isAudioFormat ? 'Downloaded Audio' : 'Downloaded Video'),
        blobUrl,
        downloadEndpoint,
        file,
        canShareFile,
        filename: cleanFilename,
        qualityLabel: quality.label,
        resolution: quality.resolution,
        sizeFormatted: finalSizeFormatted,
        platform: media.platform,
        isAudioOnly: isAudioFormat,
      });

      setTimeout(() => {
        try {
          window.URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 15 * 60 * 1000);

      onSaveHistory({
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
        fileSizeFormatted: finalSizeFormatted,
      });

      setDownloadSuccessId(quality.id);
      setTimeout(() => {
        setDownloadingId(null);
        setDownloadProgress(null);
      }, 1100);
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        return;
      }
      console.error('Download stream error:', err);
      setDownloadError(err?.message || 'Download failed. Try copying the direct stream URL.');
      setDownloadingId(null);
      setDownloadProgress(null);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const isSelectedAudio =
    selectedQuality?.format === 'mp3' || selectedQuality?.format === 'm4a';

  const localAudioBlob = isSelectedAudio ? downloadedAudioBlobs[selectedQuality.id] : undefined;
  const previewSource = localAudioBlob
    ? localAudioBlob
    : selectedQuality?.url
      ? `/api/proxy-media?url=${encodeURIComponent(selectedQuality.url)}${
          selectedQuality.audioUrl ? `&audioUrl=${encodeURIComponent(selectedQuality.audioUrl)}` : ''
        }${
          isSelectedAudio
            ? `&format=${selectedQuality.format}${selectedQuality.bitrateKbps ? `&bitrate=${selectedQuality.bitrateKbps}k` : ''}${audioRetryNonce > 0 ? `&r=${audioRetryNonce}` : ''}`
            : ''
        }`
      : '';

  const isLandscapeVideo =
    !isSelectedAudio &&
    Boolean(selectedQuality?.width && selectedQuality?.height && selectedQuality.width > selectedQuality.height);

  const isDownloadedCurrent =
    downloadNotification && downloadNotification.qualityLabel === selectedQuality.label;

  const progressRingCircumference = 2 * Math.PI * 16;
  const progressRingOffset =
    progressRingCircumference -
    ((downloadProgress?.percentage || 0) / 100) * progressRingCircumference;

  const audioQuality = media.qualities.find((q) => q.format.toLowerCase() === 'mp3');
  const videoCount = media.qualities.filter(
    (q) => q.format !== 'mp3' && q.format !== 'm4a'
  ).length;
  const audioCount = media.qualities.filter(
    (q) => q.format === 'mp3' || q.format === 'm4a'
  ).length;
  const showFilterTabs = media.qualities.length >= 3 && videoCount > 0 && audioCount > 0;
  const visibleQualities = media.qualities.filter((q) => {
    const isAud = q.format === 'mp3' || q.format === 'm4a';
    if (streamFilter === 'video') return !isAud;
    if (streamFilter === 'audio') return isAud;
    return true;
  });

  return (
    <motion.section
      id="media-result-card"
      aria-label="Extracted media details"
      initial={{ opacity: 0, y: 18, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="w-full max-w-4xl mx-auto mt-10 pt-6 border-t border-rose-300/20 wk-open-stage rounded-t-[36px] px-4 sm:px-8 pb-8"
    >
      {/* Open Hairline Top Metadata Strip (No Box Frame) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-rose-300/15">
        <div className="flex items-center gap-2 text-xs text-rose-100/80 min-w-0">
          <PlatformIcon platform={media.platform} className="h-5 min-w-[24px] shrink-0" />
          <span className="font-semibold text-white capitalize">{media.platform}</span>
          <span className="text-rose-300/35" aria-hidden="true">
            ·
          </span>
          <span className="capitalize truncate">{media.sourceType.replace('_', ' ')}</span>
          {media.durationFormatted && (
            <>
              <span className="text-rose-300/35" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-white tabular-nums shrink-0">
                {media.durationFormatted}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={onOpenAiAnalysis}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-rose-200 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ScanSearch className="w-3.5 h-3.5 text-rose-400" />
            <span>Media Insights</span>
          </button>

          <button
            type="button"
            onClick={handleCopyDirectLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-rose-200 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Copy direct stream URL"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-rose-200" />
            )}
            <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Split Workspace */}
      <div className="pt-6 grid grid-cols-1 md:grid-cols-12 gap-7 sm:gap-9 items-start">
        {/* Left Column: Organic Lunar Video / Circular Disc Audio Stage */}
        <div className="md:col-span-5 flex flex-col">
          <div
            className={`relative mx-auto w-full flex items-center justify-center group ${
              isSelectedAudio
                ? 'min-h-[250px] sm:min-h-[270px] overflow-visible'
                : `rounded-[32px] overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(24,9,23,0.9)_0%,rgba(8,3,10,0.96)_100%)] border border-rose-300/20 shadow-[0_24px_56px_-18px_rgba(0,0,0,0.9)] ${
                    isLandscapeVideo
                      ? 'aspect-video'
                      : 'aspect-[9/16] max-h-[320px] sm:max-h-[420px] max-w-[280px] md:max-w-none'
                  }`
            }`}
          >
            {isSelectedAudio ? (
              <div
                className="relative flex flex-col items-center justify-center text-center gap-4 py-6 px-4 w-full h-full"
                style={{
                  background:
                    'radial-gradient(circle at 50% 40%, rgba(244, 63, 94, 0.18) 0%, rgba(236, 72, 153, 0.07) 44%, transparent 74%)',
                }}
              >
                {/* Circular Vinyl Disc Artwork Emblem (Zero Square / Boxless Halo) */}
                <div className="relative w-24 h-24 rounded-full p-1.5 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(244,63,94,0.35),rgba(17,7,18,0.95),rgba(236,72,153,0.35),rgba(17,7,18,0.95))] border border-rose-300/40 shadow-[0_0_42px_-2px_rgba(244,63,94,0.52)] flex items-center justify-center">
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-[#0D0510] flex items-center justify-center">
                    {safeThumbUrl && !hasThumbError ? (
                      <img
                        src={safeThumbUrl}
                        alt={media.title}
                        onError={() => setHasThumbError(true)}
                        className="w-full h-full object-cover opacity-85"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Music className="w-8 h-8 text-rose-300" />
                    )}
                    <span className="absolute w-3.5 h-3.5 rounded-full bg-[#090409] border border-rose-300/60 shadow-inner" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 border border-white/40 flex items-center justify-center text-white shadow-md">
                    <Music className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-sm font-semibold text-white">
                    {selectedQuality.format.toUpperCase()} Audio Track
                  </p>
                  <p className="text-[11px] font-mono text-rose-200/85 tabular-nums">
                    {selectedQuality.bitrateKbps || 320} kbps
                    {selectedQuality.fileSizeFormatted ? ` · ${selectedQuality.fileSizeFormatted}` : ''}
                  </p>
                  <p className="text-[11px] text-rose-100/65">
                    {audioStatus === 'ready'
                      ? 'Ready to listen'
                      : audioStatus === 'error'
                        ? 'Preview blocked upstream — click Download below or retry'
                        : 'Preparing audio stream...'}
                  </p>
                </div>
                {previewSource && (
                  <audio
                    key={previewSource}
                    src={previewSource}
                    controls
                    preload="metadata"
                    onCanPlay={() => setAudioStatus('ready')}
                    onLoadedMetadata={() => setAudioStatus('ready')}
                    onError={() => setAudioStatus('error')}
                    className="w-full max-w-[300px] rounded-full"
                  />
                )}
                {audioStatus === 'error' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAudioStatus('loading');
                      setAudioRetryNonce((n) => n + 1);
                    }}
                    className="text-xs font-medium text-rose-300 hover:text-white underline underline-offset-4 cursor-pointer"
                  >
                    Retry audio preview
                  </button>
                )}
              </div>
            ) : previewSource && !hasVideoError ? (
              <video
                key={previewSource}
                ref={videoRef}
                src={previewSource}
                poster={safeThumbUrl}
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
                onError={() => {
                  setHasVideoError(true);
                  setIsPlaying(false);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setDuration(videoRef.current.duration);
                }}
              />
            ) : safeThumbUrl && !hasThumbError ? (
              <div className="relative w-full h-full">
                <img
                  src={safeThumbUrl}
                  alt={media.title}
                  onError={() => setHasThumbError(true)}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-5">
                  <p className="text-xs font-medium text-white">
                    {selectedQuality.resolution} · Ready to download
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 gap-2 p-6">
                <Music className="w-10 h-10 text-rose-400/80" />
                <span className="text-xs">Audio Stream</span>
              </div>
            )}

            {/* Circular Center Play Orb when paused */}
            {!isSelectedAudio && !isPlaying && !hasVideoError && (
              <button
                type="button"
                onClick={handlePlayToggle}
                aria-label="Play video preview"
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors cursor-pointer"
              >
                <span className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/45 flex items-center justify-center shadow-[0_0_32px_rgba(244,63,94,0.65)] transition-transform group-hover:scale-105">
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </span>
              </button>
            )}

            {/* Fluid Scrubber & Circular Transport Controls */}
            {!isSelectedAudio && !hasVideoError && (
              <div
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pb-3.5 px-4 transition-opacity ${
                  isPlaying ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                }`}
              >
                {duration > 0 && (
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    aria-label="Seek video"
                    className="w-full h-1.5 mb-2.5 accent-rose-500 cursor-pointer"
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePlayToggle}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-rose-500/55 text-white transition-colors cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>
                    {duration > 0 && (
                      <span className="text-[11px] font-mono text-white tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleMuteToggle}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      aria-label="Fullscreen"
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Creator Attribution (Circular Avatar, Unboxed) */}
          <div className="flex items-center gap-3 mt-4 px-1">
            {safeAvatarUrl && !hasAvatarError ? (
              <img
                src={safeAvatarUrl}
                alt={media.author.name}
                onError={() => setHasAvatarError(true)}
                className="w-9 h-9 rounded-full border border-rose-300/40 object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-300/35 flex items-center justify-center text-xs font-semibold text-rose-200 shrink-0">
                {media.author.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{media.author.name}</p>
              <p className="text-[11px] text-rose-100/55 truncate">@{media.author.username}</p>
            </div>
            {safeProfileUrl && (
              <a
                href={safeProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full text-rose-100/65 hover:text-white hover:bg-white/[0.08] transition-colors"
                title="View original profile"
                aria-label="View original profile"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Right Column: Title, Unboxed Hairline Quality Stream Matrix & Pill Controls */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-5 min-w-0">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-white leading-snug line-clamp-2 break-words">
              {media.title}
            </h2>
            {media.description && (
              <p className="text-xs text-rose-100/65 mt-1.5 line-clamp-2 leading-relaxed break-words">
                {media.description}
              </p>
            )}

            {/* Open Hairline Stream Quality Matrix (Zero Outer Box) */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-medium text-white">
                  Downloadable formats ({media.qualities.length})
                </span>
                {showFilterTabs ? (
                  <div
                    role="tablist"
                    aria-label="Filter stream formats"
                    className="inline-flex items-center gap-4 border-b border-rose-300/15 pb-0.5"
                  >
                    {[
                      { id: 'all' as const, label: `All (${media.qualities.length})` },
                      { id: 'video' as const, label: `Video (${videoCount})` },
                      { id: 'audio' as const, label: `MP3 (${audioCount})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={streamFilter === tab.id}
                        onClick={() => setStreamFilter(tab.id)}
                        className={`py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                          streamFilter === tab.id
                            ? 'text-white font-semibold underline decoration-rose-400 underline-offset-4'
                            : 'text-rose-100/55 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-rose-100/60">
                    {videoCount > 0 && audioCount > 0
                      ? `${videoCount} verified video${videoCount > 1 ? 's' : ''} + MP3 audio`
                      : videoCount > 0
                        ? 'Silent video (no audio track)'
                        : 'Verified audio track'}
                  </span>
                )}
              </div>

              <div className="border-t border-b border-rose-300/15 divide-y divide-rose-300/12 max-h-[340px] overflow-y-auto">
                {visibleQualities.map((quality) => {
                  const isSelected = selectedQuality.id === quality.id;
                  const isDownloading = downloadingId === quality.id;
                  const isCompleted = downloadSuccessId === quality.id;
                  const isAudioRow =
                    quality.format.toLowerCase() === 'mp3' ||
                    quality.format.toLowerCase() === 'm4a';

                  return (
                    <div
                      key={quality.id}
                      onClick={() => handleQualitySelect(quality)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleQualitySelect(quality);
                        }
                      }}
                      className={`flex items-center justify-between px-2 sm:px-3 py-3 cursor-pointer transition-colors gap-2 sm:gap-3 ${
                        isSelected
                          ? 'bg-[radial-gradient(ellipse_at_left,rgba(244,63,94,0.14)_0%,transparent_75%)]'
                          : 'hover:bg-rose-400/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-rose-400' : 'border-rose-200/35'
                          }`}
                        >
                          {isSelected && (
                            <motion.span
                              layoutId="selected-quality-dot"
                              className="w-2 h-2 rounded-full bg-rose-400"
                            />
                          )}
                        </span>

                        <div className="min-w-0">
                          <span className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                            {isAudioRow && <Music className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                            <span className="truncate">{quality.label}</span>
                          </span>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-rose-100/60 mt-0.5 font-mono tabular-nums flex-wrap">
                            <span className={`uppercase ${isAudioRow ? 'text-rose-300 font-semibold' : 'text-pink-200'}`}>
                              {quality.format}
                            </span>
                            {quality.codec && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-rose-100/65">{quality.codec}</span>
                              </>
                            )}
                            {quality.fileSizeFormatted && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{quality.fileSizeFormatted}</span>
                              </>
                            )}
                            {!isAudioRow && quality.hasAudio === false && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-300/85 font-sans">Video only</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {isDownloading ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelDownload();
                          }}
                          className="flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-full text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          title="Stop download"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Stop</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQualitySelect(quality);
                            handleDownload(quality);
                          }}
                          className={`flex items-center gap-1.5 px-4 min-h-[38px] rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isCompleted
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                              : isSelected
                                ? 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 shadow-md shadow-rose-950/50'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border border-rose-300/20'
                          }`}
                        >
                          {isCompleted ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>
                                {isAudioRow
                                  ? `${quality.format.toUpperCase()}${quality.bitrateKbps ? ` ${quality.bitrateKbps}k` : ''}`
                                  : quality.resolution}
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Open Live Transfer Progress Strip (No Heavy Bordered Box) */}
          <AnimatePresence>
            {downloadProgress && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="py-3.5 px-1 border-b border-rose-300/15 text-xs space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Circular SVG Progress Ring */}
                    <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke="rgba(255,255,255,0.1)"
                          strokeWidth="3"
                        />
                        <motion.circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke="#FB7185"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={progressRingCircumference}
                          animate={{ strokeDashoffset: progressRingOffset }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                        />
                      </svg>
                      <span className="absolute text-[10px] font-mono font-bold text-white tabular-nums">
                        {downloadProgress.percentage}%
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">
                        Downloading {selectedQuality.label}
                      </p>
                      <p className="text-[11px] font-mono text-rose-100/65 tabular-nums mt-0.5">
                        {downloadProgress.formattedReceived} / {downloadProgress.formattedTotal}
                        {downloadProgress.formattedSpeed
                          ? ` · ${downloadProgress.formattedSpeed}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    id="btn-stop-download-card"
                    type="button"
                    onClick={handleCancelDownload}
                    className="flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/35 font-sans font-semibold transition-colors shrink-0 cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>

                {/* Crisp Progress Track */}
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-rose-500 via-pink-400 to-white rounded-full"
                    initial={{ width: '4%' }}
                    animate={{ width: `${Math.max(4, downloadProgress.percentage)}%` }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-rose-100/65 font-mono tabular-nums">
                  <span className="truncate pr-2">
                    {isSelectedAudio
                      ? `Preparing ${selectedQuality.bitrateKbps || 320}kbps ${selectedQuality.format.toUpperCase()} audio`
                      : `Transferring ${selectedQuality.resolution} ${selectedQuality.format.toUpperCase()} chunks`}
                  </span>
                  <span className="text-white shrink-0">
                    {downloadProgress.percentage === 100 ? 'Building file...' : 'Transferring'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Ready-to-Open Fluid Capsule */}
          <AnimatePresence>
            {isDownloadedCurrent && !downloadProgress && downloadNotification && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="py-3.5 px-1 border-b border-emerald-400/25 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      Saved {downloadNotification.resolution}{' '}
                      {downloadNotification.isAudioOnly
                        ? downloadNotification.filename.toLowerCase().endsWith('.m4a')
                          ? 'M4A'
                          : 'MP3'
                        : 'MP4'}{' '}
                      to device
                    </p>
                    <p className="text-[11px] font-mono text-rose-100/65 tabular-nums">
                      {downloadNotification.sizeFormatted} ·{' '}
                      {downloadNotification.isAudioOnly ? 'Ready to listen' : 'Ready to watch'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setPreviewDownloadedModal(true)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {downloadNotification.isAudioOnly
                        ? downloadNotification.filename.toLowerCase().endsWith('.m4a')
                          ? 'Play M4A'
                          : 'Play MP3'
                        : 'Watch MP4'}
                    </span>
                  </button>
                  <a
                    href={downloadNotification.blobUrl}
                    download={downloadNotification.filename}
                    className="flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-rose-300/20 text-xs font-medium transition-colors"
                    title="Save file to device"
                  >
                    <Download className="w-3.5 h-3.5 text-rose-400" />
                    <span>Save</span>
                  </a>
                  {downloadNotification.canShareFile && (
                    <button
                      type="button"
                      onClick={handleShareToDevice}
                      className="flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-rose-300/20 text-xs font-medium transition-colors cursor-pointer"
                      title="Open in device Files or Gallery"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-pink-400" />
                      <span>Device</span>
                    </button>
                  )}
                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-rose-300/20 transition-colors"
                    title={downloadNotification.isAudioOnly ? 'Open audio in new tab' : 'Open MP4 in new tab'}
                    aria-label={downloadNotification.isAudioOnly ? 'Open downloaded audio in new tab' : 'Open downloaded MP4 in new tab'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download Error Notice (Open Hairline Strip, No Box) */}
          {downloadError && (
            <div className="py-3 px-1 border-t border-b border-red-400/30 text-red-100 text-xs flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5 flex-1 min-w-[200px]">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Download notice</p>
                  <p className="text-red-200/85 mt-0.5">{downloadError}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/download?url=${encodeURIComponent(selectedQuality.url)}${selectedQuality.audioUrl ? `&audioUrl=${encodeURIComponent(selectedQuality.audioUrl)}` : ''}&filename=${encodeURIComponent(`wukong_vid_${selectedQuality.resolution}.${selectedQuality.format}`)}&format=${selectedQuality.format}${isSelectedAudio && selectedQuality.bitrateKbps ? `&bitrate=${selectedQuality.bitrateKbps}k` : ''}${!isSelectedAudio && !selectedQuality.isNative && selectedQuality.targetHeight && selectedQuality.targetHeight <= 720 ? `&scaleHeight=${selectedQuality.targetHeight}` : ''}`}
                  download
                  className="px-3.5 min-h-[34px] inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 border border-white/25 text-white font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Direct Save</span>
                </a>
                <button
                  type="button"
                  onClick={() => setDownloadError(null)}
                  className="text-red-200/80 hover:text-white px-3 py-1 rounded-full hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Primary Capsule Action Row */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {downloadingId ? (
              <div className="flex-1 flex items-center gap-2">
                <button
                  id="btn-primary-download-active"
                  type="button"
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 px-6 min-h-[46px] rounded-full font-semibold text-sm bg-gradient-to-r from-rose-500 to-pink-500 text-white border border-white/25"
                >
                  <span className="font-mono tabular-nums">
                    Downloading {selectedQuality.resolution} ·{' '}
                    {downloadProgress?.percentage ? `${downloadProgress.percentage}%` : 'Connecting'}
                  </span>
                </button>
                <button
                  id="btn-primary-stop-download"
                  type="button"
                  onClick={handleCancelDownload}
                  className="flex items-center justify-center gap-1.5 px-5 min-h-[46px] rounded-full font-semibold text-sm bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/35 transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col sm:flex-row items-stretch gap-2.5">
                <button
                  id="btn-primary-download"
                  type="button"
                  onClick={() => handleDownload(selectedQuality)}
                  className="flex-1 flex items-center justify-center gap-2 px-6 min-h-[46px] rounded-full font-semibold text-sm bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 transition-colors active:scale-[0.99] cursor-pointer shadow-lg shadow-rose-950/60"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {selectedQuality.label}</span>
                </button>

                {audioQuality && !isSelectedAudio && (
                  <button
                    id="btn-quick-download-mp3"
                    type="button"
                    onClick={() => {
                      handleQualitySelect(audioQuality);
                      handleDownload(audioQuality);
                    }}
                    className="flex items-center justify-center gap-2 px-4 min-h-[46px] rounded-full font-semibold text-xs bg-white/[0.06] hover:bg-white/[0.12] text-white border border-rose-300/20 hover:border-rose-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Music className="w-3.5 h-3.5 text-rose-400" />
                    <span>Save MP3</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleCopyDirectLink}
              className="px-4 min-h-[46px] rounded-full font-medium text-xs bg-white/[0.05] hover:bg-white/[0.10] text-white border border-rose-300/20 hover:border-pink-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? 'Link Copied' : 'Copy Stream Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Organic Curved Device File Pop-Out Notification */}
      <AnimatePresence>
        {downloadNotification && downloadNotification.open && !previewDownloadedModal && (
          <motion.aside
            id="reel-download-message-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setToastPaused(true)}
            onMouseLeave={() => setToastPaused(false)}
            onClick={() => setPreviewDownloadedModal(true)}
            className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 z-50 sm:w-[420px] p-4 rounded-[32px] wk-sheet hover:border-rose-300/60 shadow-[0_24px_60px_-10px_rgba(0,0,0,0.9)] cursor-pointer transition-colors overflow-hidden"
          >
            {/* Quiet 16s Countdown Hairline */}
            {!toastPaused && (
              <motion.span
                key={`${downloadNotification.filename}-timer`}
                aria-hidden="true"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 16, ease: 'linear' }}
                className="origin-left absolute top-0 inset-x-8 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 via-rose-400 to-pink-400 opacity-75 pointer-events-none"
              />
            )}

            <div className="flex items-start gap-3.5">
              {/* Circular Vinyl / Poster Preview Orb */}
              <div className="relative w-12 h-12 rounded-full bg-[#090409] border border-rose-300/35 flex items-center justify-center shrink-0">
                <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                  {safeThumbUrl && !hasThumbError ? (
                    <img
                      src={safeThumbUrl}
                      alt={downloadNotification.title}
                      className="w-full h-full object-cover opacity-85"
                      referrerPolicy="no-referrer"
                    />
                  ) : downloadNotification.isAudioOnly ? (
                    <Music className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Film className="w-5 h-5 text-pink-400" />
                  )}
                  <span className="absolute inset-0 rounded-full bg-black/25 flex items-center justify-center">
                    {downloadNotification.isAudioOnly ? (
                      <Music className="w-4 h-4 text-white drop-shadow" />
                    ) : (
                      <Play className="w-4 h-4 text-white fill-current ml-0.5 drop-shadow" />
                    )}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border border-[#090409] flex items-center justify-center"
                >
                  <Check className="w-2.5 h-2.5 text-[#04140D]" />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      {downloadNotification.isAudioOnly
                        ? downloadNotification.filename.toLowerCase().endsWith('.m4a')
                          ? 'M4A Ready on Device'
                          : 'MP3 Ready on Device'
                        : 'MP4 Ready on Device'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDownloadNotification((prev) => (prev ? { ...prev, open: false } : null));
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-rose-100/65 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer shrink-0"
                    aria-label="Close notification"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h4 className="text-sm font-semibold text-white mt-0.5 line-clamp-1">
                  {downloadNotification.title}
                </h4>
                <p className="text-[11px] text-rose-100/70 mt-0.5 font-mono tabular-nums truncate">
                  {downloadNotification.resolution} · {downloadNotification.sizeFormatted} · Saved
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    id="btn-open-downloaded-mp4"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewDownloadedModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 min-h-[42px] rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-rose-950/60"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {downloadNotification.isAudioOnly
                        ? downloadNotification.filename.toLowerCase().endsWith('.m4a')
                          ? 'Play M4A'
                          : 'Play MP3'
                        : 'Watch MP4'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={downloadNotification.blobUrl}
                    download={downloadNotification.filename}
                    onClick={(e) => e.stopPropagation()}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white border border-rose-300/20 transition-colors shrink-0"
                    title="Download file again"
                    aria-label="Download file again"
                  >
                    <Download className="w-3.5 h-3.5 text-rose-400" />
                  </a>

                  {downloadNotification.canShareFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShareToDevice();
                      }}
                      className="flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white border border-rose-300/20 text-xs font-medium transition-colors cursor-pointer shrink-0"
                      title="Open in phone Files / Gallery"
                    >
                      <Share2 className="w-3.5 h-3.5 text-pink-400" />
                      <span>Device</span>
                    </button>
                  )}

                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white border border-rose-300/20 transition-colors shrink-0"
                    title={downloadNotification.isAudioOnly ? 'Open audio file in new tab' : 'Open MP4 file in new tab'}
                    aria-label={downloadNotification.isAudioOnly ? 'Open audio file in new tab' : 'Open MP4 file in new tab'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Local Downloaded File Pop-Out Player Sheet */}
      <AnimatePresence>
        {previewDownloadedModal && downloadNotification && (
          <motion.div
            id="downloaded-mp4-player-modal"
            role="dialog"
            aria-modal="true"
            aria-label={downloadNotification.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setPreviewDownloadedModal(false)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl wk-sheet rounded-t-[36px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[88dvh]"
            >
              {/* Mobile Sheet Handle */}
              <div className="sm:hidden pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-rose-300/35" />
              </div>

              <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-rose-300/15">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-400/35 flex items-center justify-center text-rose-400 overflow-hidden shrink-0">
                    {safeThumbUrl && !hasThumbError ? (
                      <img
                        src={safeThumbUrl}
                        alt={downloadNotification.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : downloadNotification.isAudioOnly ? (
                      <Music className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Film className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {downloadNotification.title}
                    </h3>
                    <p className="text-xs text-rose-100/65 font-mono tabular-nums truncate">
                      Device file · {downloadNotification.resolution} ·{' '}
                      {downloadNotification.sizeFormatted}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {downloadNotification.canShareFile && (
                    <button
                      type="button"
                      onClick={handleShareToDevice}
                      className="flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium border border-rose-300/20 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-pink-400" />
                      <span className="hidden sm:inline">Open on Device</span>
                    </button>
                  )}
                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium border border-rose-300/20 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {downloadNotification.isAudioOnly
                        ? downloadNotification.filename.toLowerCase().endsWith('.m4a')
                          ? 'Open M4A Tab'
                          : 'Open MP3 Tab'
                        : 'Open MP4 Tab'}
                    </span>
                  </a>
                  <button
                    id="btn-close-downloaded-modal"
                    type="button"
                    onClick={() => setPreviewDownloadedModal(false)}
                    aria-label="Close player"
                    className="w-9 h-9 flex items-center justify-center rounded-full text-rose-100/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 flex items-center justify-center overflow-hidden min-h-[240px] sm:min-h-[320px] max-h-[58dvh]">
                {downloadNotification.isAudioOnly ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center w-full">
                    <div className="relative w-24 h-24 rounded-full p-1.5 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(244,63,94,0.35),rgba(17,7,18,0.95),rgba(236,72,153,0.35),rgba(17,7,18,0.95))] border border-rose-300/40 shadow-[0_0_32px_rgba(244,63,94,0.4)] mb-4 flex items-center justify-center">
                      <div className="relative w-full h-full rounded-full overflow-hidden bg-[#090409] flex items-center justify-center">
                        {safeThumbUrl && !hasThumbError ? (
                          <img
                            src={safeThumbUrl}
                            alt={downloadNotification.title}
                            className="w-full h-full object-cover opacity-85"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Music className="w-8 h-8 text-rose-400" />
                        )}
                        <span className="absolute w-3.5 h-3.5 rounded-full bg-[#090409] border border-rose-300/60" />
                      </div>
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-1">
                      {downloadNotification.filename.toLowerCase().endsWith('.m4a')
                        ? 'Downloaded M4A Audio Track'
                        : 'Downloaded MP3 Audio Track'}
                    </h4>
                    <p className="text-[11px] font-mono text-rose-200/75 tabular-nums mb-4">
                      {downloadNotification.resolution} · {downloadNotification.sizeFormatted}
                    </p>
                    <audio
                      src={downloadNotification.blobUrl}
                      controls
                      autoPlay
                      className="w-full max-w-md rounded-full"
                    />
                  </div>
                ) : (
                  <video
                    src={downloadNotification.blobUrl}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[54dvh] max-w-full rounded-[24px] object-contain bg-black border border-rose-300/20"
                  />
                )}
              </div>

              <div className="px-5 sm:px-6 py-4 pb-safe border-t border-rose-300/15 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-mono text-rose-100/65 truncate max-w-[180px] sm:max-w-xs">
                  {downloadNotification.filename}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <a
                    href={downloadNotification.blobUrl}
                    download={downloadNotification.filename}
                    className="flex items-center gap-1.5 px-4 min-h-[40px] rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save to Device</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewDownloadedModal(false)}
                    className="px-4 min-h-[40px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-rose-300/20 font-medium transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
