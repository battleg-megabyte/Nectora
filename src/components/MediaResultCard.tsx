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
  preferredResolution?: '360p' | '480p' | '720p' | '1080p';
  onSaveHistory: (item: DownloadHistoryItem) => void;
  onOpenAiAnalysis: () => void;
  onRegisterBlob?: (streamUrl: string, blobUrl: string) => void;
}

export function MediaResultCard({
  media,
  preferredResolution = '1080p',
  onSaveHistory,
  onOpenAiAnalysis,
  onRegisterBlob,
}: MediaResultCardProps) {
  const findPreferredQuality = (m: MediaMetadata, pref: string): QualityOption => {
    const exact = m.qualities.find((q) =>
      q.resolution.toLowerCase().includes(pref.toLowerCase())
    );
    return exact || m.qualities[0] || m.qualities[1];
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

  useEffect(() => {
    setSelectedQuality(findPreferredQuality(media, preferredResolution));
    setStreamFilter('all');
    setHasVideoError(false);
    setHasThumbError(false);
    setHasAvatarError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setDownloadError(null);
    setDownloadSuccessId(null);
  }, [media.id, preferredResolution]);

  useEffect(() => {
    if (!previewDownloadedModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewDownloadedModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewDownloadedModal]);

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
        !isAudioFormat && quality.targetHeight ? `&scaleHeight=${quality.targetHeight}` : '';
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

      const isMobile =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = cleanFilename;
      a.setAttribute('download', cleanFilename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 1500);

      if (isMobile) {
        const hiddenFrame = document.createElement('iframe');
        hiddenFrame.style.display = 'none';
        hiddenFrame.setAttribute('aria-hidden', 'true');
        hiddenFrame.src = downloadEndpoint;
        document.body.appendChild(hiddenFrame);
        setTimeout(() => hiddenFrame.remove(), 60000);
      }

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

  const previewSource = selectedQuality?.url
    ? `/api/proxy-media?url=${encodeURIComponent(selectedQuality.url)}${
        selectedQuality.audioUrl ? `&audioUrl=${encodeURIComponent(selectedQuality.audioUrl)}` : ''
      }${isSelectedAudio ? `&format=${selectedQuality.format}${selectedQuality.bitrateKbps ? `&bitrate=${selectedQuality.bitrateKbps}k` : ''}` : ''}`
    : '';

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
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="w-full max-w-4xl mx-auto mt-8 wk-box rounded-2xl overflow-hidden"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-rose-300/15 bg-[#0D060C]">
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

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenAiAnalysis}
            className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-lg text-xs font-medium bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 hover:border-pink-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ScanSearch className="w-3.5 h-3.5 text-rose-400" />
            <span>Media Insights</span>
          </button>

          <button
            type="button"
            onClick={handleCopyDirectLink}
            className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-lg text-xs font-medium bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 hover:border-pink-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-7 items-start">
        {/* Left Column: Video Preview Stage */}
        <div className="md:col-span-5 flex flex-col">
          <div className="relative aspect-[9/16] max-h-[320px] sm:max-h-[420px] max-w-[280px] md:max-w-none mx-auto w-full rounded-xl overflow-hidden bg-[#090409] border border-rose-300/25 flex items-center justify-center group">
            {isSelectedAudio ? (
              <div className="flex flex-col items-center justify-center text-center gap-4 p-6 w-full h-full bg-[#0D060C]">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-400/35 flex items-center justify-center text-rose-400">
                  <Music className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-sm font-semibold text-white">
                    {selectedQuality.format.toUpperCase()} Audio Preview
                  </p>
                  <p className="text-xs text-rose-100/65 line-clamp-2">{selectedQuality.label}</p>
                </div>
                {previewSource && (
                  <audio
                    src={previewSource}
                    controls
                    preload="metadata"
                    className="w-full max-w-[280px] rounded-lg"
                  />
                )}
              </div>
            ) : previewSource && !hasVideoError ? (
              <video
                ref={videoRef}
                src={previewSource}
                poster={media.thumbnailUrl}
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
            ) : media.thumbnailUrl && !hasThumbError ? (
              <div className="relative w-full h-full">
                <img
                  src={media.thumbnailUrl}
                  alt={media.title}
                  onError={() => setHasThumbError(true)}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-4">
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

            {/* Center Play Button Overlay when paused */}
            {!isSelectedAudio && !isPlaying && !hasVideoError && (
              <button
                type="button"
                onClick={handlePlayToggle}
                aria-label="Play video preview"
                className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors cursor-pointer"
              >
                <span className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/40 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </span>
              </button>
            )}

            {/* Bottom Studio Transport Scrubber */}
            {!isSelectedAudio && !hasVideoError && (
              <div
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pb-3 px-3 transition-opacity ${
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
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-rose-500/45 text-white transition-colors cursor-pointer"
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
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
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
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Creator Info */}
          <div className="flex items-center gap-3 mt-3.5 px-1">
            {media.author.avatarUrl && !hasAvatarError ? (
              <img
                src={media.author.avatarUrl}
                alt={media.author.name}
                onError={() => setHasAvatarError(true)}
                className="w-8 h-8 rounded-full border border-rose-300/40 object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-rose-500/15 border border-rose-300/35 flex items-center justify-center text-xs font-semibold text-rose-200 shrink-0">
                {media.author.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{media.author.name}</p>
              <p className="text-[11px] text-rose-100/50 truncate">@{media.author.username}</p>
            </div>
            {media.author.profileUrl && (
              <a
                href={media.author.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-rose-100/60 hover:text-white hover:bg-white/[0.08] transition-colors"
                title="View original profile"
                aria-label="View original profile"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Right Column: Title, Stream Quality Matrix & Animated Download Controls */}
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

            {/* Stream Quality Matrix */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-medium text-white">
                  Available streams ({media.qualities.length})
                </span>
                <div
                  role="tablist"
                  aria-label="Filter stream formats"
                  className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#0D060C] border border-rose-300/20"
                >
                  {[
                    { id: 'all' as const, label: `All (${media.qualities.length})` },
                    { id: 'video' as const, label: `Video (${videoCount})` },
                    { id: 'audio' as const, label: `Audio (${audioCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={streamFilter === tab.id}
                      onClick={() => setStreamFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                        streamFilter === tab.id
                          ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
                          : 'text-rose-100/60 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-rose-300/20 bg-[#0D060C] divide-y divide-rose-300/15 max-h-[340px] overflow-y-auto">
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
                      className={`flex items-center justify-between px-3 sm:px-4 py-2.5 cursor-pointer transition-colors gap-2 sm:gap-3 ${
                        isSelected ? 'bg-rose-500/[0.10]' : 'hover:bg-rose-400/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
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
                            {quality.isNative && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-pink-300 font-sans">Native</span>
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
                          className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                          className={`flex items-center gap-1.5 px-3 sm:px-3.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isCompleted
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                              : isSelected
                                ? 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25'
                                : 'bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20'
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

          {/* Live Transfer Progress Panel */}
          <AnimatePresence>
            {downloadProgress && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="p-4 rounded-xl bg-[#0D060C] border border-rose-300/25 text-xs space-y-3"
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
                    className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/35 font-sans font-semibold transition-colors shrink-0 cursor-pointer"
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

          {/* Inline Ready-to-Open Bar once downloaded */}
          <AnimatePresence>
            {isDownloadedCurrent && !downloadProgress && downloadNotification && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="p-3.5 rounded-xl bg-[#0D060C] border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shrink-0">
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
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 text-xs font-semibold transition-colors cursor-pointer"
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
                    className="flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 text-xs font-medium transition-colors"
                    title="Save file to device"
                  >
                    <Download className="w-3.5 h-3.5 text-rose-400" />
                    <span>Save</span>
                  </a>
                  {downloadNotification.canShareFile && (
                    <button
                      type="button"
                      onClick={handleShareToDevice}
                      className="flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 text-xs font-medium transition-colors cursor-pointer"
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
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 transition-colors"
                    title={downloadNotification.isAudioOnly ? 'Open audio in new tab' : 'Open MP4 in new tab'}
                    aria-label={downloadNotification.isAudioOnly ? 'Open downloaded audio in new tab' : 'Open downloaded MP4 in new tab'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download Error Banner */}
          {downloadError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-100 text-xs flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5 flex-1 min-w-[200px]">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Download notice</p>
                  <p className="text-red-200/85 mt-0.5">{downloadError}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/download?url=${encodeURIComponent(selectedQuality.url)}${selectedQuality.audioUrl ? `&audioUrl=${encodeURIComponent(selectedQuality.audioUrl)}` : ''}&filename=${encodeURIComponent(`wukong_vid_${selectedQuality.resolution}.${selectedQuality.format}`)}&format=${selectedQuality.format}${isSelectedAudio && selectedQuality.bitrateKbps ? `&bitrate=${selectedQuality.bitrateKbps}k` : ''}${!isSelectedAudio && selectedQuality.targetHeight ? `&scaleHeight=${selectedQuality.targetHeight}` : ''}`}
                  download
                  className="px-3 min-h-[34px] inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 border border-white/25 text-white font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Direct Save</span>
                </a>
                <button
                  type="button"
                  onClick={() => setDownloadError(null)}
                  className="text-red-200/80 hover:text-white px-2.5 py-1 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Footer */}
          <div className="pt-4 border-t border-rose-300/15 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {downloadingId ? (
              <div className="flex-1 flex items-center gap-2">
                <button
                  id="btn-primary-download-active"
                  type="button"
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 px-5 min-h-[46px] rounded-lg font-semibold text-sm bg-gradient-to-r from-rose-500 to-pink-500 text-white border border-white/25"
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
                  className="flex items-center justify-center gap-1.5 px-4 min-h-[46px] rounded-lg font-semibold text-sm bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/35 transition-colors cursor-pointer"
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
                  className="flex-1 flex items-center justify-center gap-2 px-6 min-h-[46px] rounded-lg font-semibold text-sm bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 transition-colors active:scale-[0.99] cursor-pointer shadow-md shadow-rose-950/50"
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
                    className="flex items-center justify-center gap-2 px-4 min-h-[46px] rounded-lg font-semibold text-xs bg-[#0D060C] hover:bg-[#221020] text-white border border-rose-300/20 hover:border-rose-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className="px-4 min-h-[46px] rounded-lg font-medium text-xs bg-[#0D060C] hover:bg-[#221020] text-white border border-rose-300/20 hover:border-pink-400/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? 'Link Copied' : 'Copy Stream Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Animated Device File Pop-Out Card */}
      <AnimatePresence>
        {downloadNotification && downloadNotification.open && !previewDownloadedModal && (
          <motion.aside
            id="reel-download-message-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setPreviewDownloadedModal(true)}
            className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 z-50 sm:w-[400px] p-4 rounded-2xl wk-box backdrop-blur-xl hover:border-rose-300/55 shadow-2xl cursor-pointer transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail or File Badge */}
              <div className="relative w-12 h-14 rounded-lg bg-[#090409] border border-rose-300/25 overflow-hidden flex items-center justify-center shrink-0">
                {downloadNotification.isAudioOnly ? (
                  <Music className="w-5 h-5 text-rose-400" />
                ) : media.thumbnailUrl ? (
                  <img
                    src={media.thumbnailUrl}
                    alt={downloadNotification.title}
                    className="w-full h-full object-cover opacity-85"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Film className="w-5 h-5 text-pink-400" />
                )}
                {!downloadNotification.isAudioOnly && (
                  <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
                    <Play className="w-4 h-4 text-white fill-current" />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {downloadNotification.isAudioOnly
                        ? downloadNotification.filename.toLowerCase().endsWith('.m4a')
                          ? 'M4A Saved to Device'
                          : 'MP3 Saved to Device'
                        : 'MP4 Saved to Device'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDownloadNotification((prev) => (prev ? { ...prev, open: false } : null));
                    }}
                    className="p-1.5 -mr-1 rounded-lg text-rose-100/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                    aria-label="Close notification"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h4 className="text-sm font-semibold text-white mt-0.5 truncate">
                  {downloadNotification.title}
                </h4>
                <p className="text-xs text-rose-100/65 mt-0.5 font-mono tabular-nums truncate">
                  {downloadNotification.filename} · {downloadNotification.sizeFormatted}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    id="btn-open-downloaded-mp4"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewDownloadedModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 text-xs font-semibold transition-colors cursor-pointer"
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
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#0D060C] hover:bg-[#221020] text-white border border-rose-300/20 transition-colors"
                    title="Save file to device"
                    aria-label="Save file to device"
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
                      className="flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-[#0D060C] hover:bg-[#221020] text-white border border-rose-300/20 text-xs font-medium transition-colors cursor-pointer"
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
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#0D060C] hover:bg-[#221020] text-white border border-rose-300/20 transition-colors"
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

      {/* Local Downloaded File Pop-Out Player Modal */}
      <AnimatePresence>
        {previewDownloadedModal && downloadNotification && (
          <motion.div
            id="downloaded-mp4-player-modal"
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
              className="relative w-full max-w-2xl wk-box rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[88dvh]"
            >
              {/* Mobile Sheet Handle */}
              <div className="sm:hidden pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-rose-300/35" />
              </div>

              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-rose-300/15 bg-[#0D060C]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-400/35 flex items-center justify-center text-rose-400 shrink-0">
                    {downloadNotification.isAudioOnly ? (
                      <Music className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Film className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {downloadNotification.title}
                    </h3>
                    <p className="text-xs text-rose-100/65 font-mono tabular-nums">
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
                      className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-[#140A13] hover:bg-[#221020] text-white text-xs font-medium border border-rose-300/20 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-pink-400" />
                      <span className="hidden sm:inline">Open on Device</span>
                    </button>
                  )}
                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-[#140A13] hover:bg-[#221020] text-white text-xs font-medium border border-rose-300/20 transition-colors"
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
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-rose-100/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-[#090409] flex items-center justify-center overflow-hidden min-h-[240px] sm:min-h-[320px] max-h-[58dvh]">
                {downloadNotification.isAudioOnly ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center w-full">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-400/35 flex items-center justify-center text-rose-400 mb-4">
                      <Music className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-3">
                      {downloadNotification.filename.toLowerCase().endsWith('.m4a')
                        ? 'Downloaded M4A Audio Track'
                        : 'Downloaded MP3 Audio Track'}
                    </h4>
                    <audio
                      src={downloadNotification.blobUrl}
                      controls
                      autoPlay
                      className="w-full max-w-md"
                    />
                  </div>
                ) : (
                  <video
                    src={downloadNotification.blobUrl}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[54dvh] max-w-full rounded-xl object-contain bg-black border border-rose-300/20"
                  />
                )}
              </div>

              <div className="px-4 sm:px-5 py-3.5 pb-safe border-t border-rose-300/15 bg-[#0D060C] flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-mono text-rose-100/65 truncate max-w-[180px] sm:max-w-xs">
                  {downloadNotification.filename}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <a
                    href={downloadNotification.blobUrl}
                    download={downloadNotification.filename}
                    className="flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save to Device</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewDownloadedModal(false)}
                    className="px-4 min-h-[40px] rounded-lg bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/20 font-medium transition-colors cursor-pointer"
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
