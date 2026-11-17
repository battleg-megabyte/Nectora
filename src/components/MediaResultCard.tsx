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
  Sparkles,
  Instagram,
  Film,
  Video,
  Globe,
  Twitter,
  MessageSquare,
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

interface MediaResultCardProps {
  media: MediaMetadata;
  preferredResolution?: '480p' | '720p' | '1080p';
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
  const [hasVideoError, setHasVideoError] = useState(false);
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
    setHasVideoError(false);
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

  const renderPlatformIcon = () => {
    switch (media.platform) {
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
        return <Globe className="w-4 h-4 text-pink-400" />;
    }
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
          .slice(0, 45) || 'nectora_media';

      const fileExt = quality.format.toLowerCase() === 'mp3' ? 'mp3' : 'mp4';
      const cleanFilename = `${cleanTitle}_${quality.resolution}.${fileExt}`;
      const audioParam = quality.audioUrl ? `&audioUrl=${encodeURIComponent(quality.audioUrl)}` : '';
      const sizeParam = quality.fileSizeBytes ? `&fileSizeBytes=${quality.fileSizeBytes}` : '';
      const downloadEndpoint = `/api/download?url=${encodeURIComponent(quality.url)}${audioParam}&filename=${encodeURIComponent(cleanFilename)}&format=${fileExt}&resolution=${quality.resolution}${sizeParam}`;

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
          fileExt === 'mp3'
            ? 'MP3 audio stream returned 0 bytes. This clip may have no audio track or the source expired.'
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

      const mimeType = fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4';
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

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = cleanFilename;
      a.setAttribute('download', cleanFilename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);

      const finalSizeFormatted = quality.fileSizeFormatted || formatBytes(receivedBytes);

      setDownloadNotification({
        open: true,
        title: media.title || (fileExt === 'mp3' ? 'Downloaded Audio' : 'Downloaded Video'),
        blobUrl,
        downloadEndpoint,
        file,
        canShareFile,
        filename: cleanFilename,
        qualityLabel: quality.label,
        resolution: quality.resolution,
        sizeFormatted: finalSizeFormatted,
        platform: media.platform,
        isAudioOnly: fileExt === 'mp3',
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

  const previewSource = selectedQuality?.url
    ? `/api/proxy-media?url=${encodeURIComponent(selectedQuality.url)}${
        selectedQuality.audioUrl ? `&audioUrl=${encodeURIComponent(selectedQuality.audioUrl)}` : ''
      }${selectedQuality.format === 'mp3' ? '&format=mp3' : ''}`
    : '';

  const isDownloadedCurrent =
    downloadNotification && downloadNotification.resolution === selectedQuality.resolution;

  const progressRingCircumference = 2 * Math.PI * 16;
  const progressRingOffset =
    progressRingCircumference -
    ((downloadProgress?.percentage || 0) / 100) * progressRingCircumference;

  const audioQuality = media.qualities.find((q) => q.format.toLowerCase() === 'mp3');

  return (
    <motion.section
      id="media-result-card"
      aria-label="Extracted media details"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="w-full max-w-4xl mx-auto mt-8 bg-[#191C26] rounded-2xl border border-pink-400/30 shadow-2xl shadow-black/45 overflow-hidden"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-white/[0.1]">
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          {renderPlatformIcon()}
          <span className="font-semibold text-white capitalize">{media.platform}</span>
          <span className="text-zinc-500" aria-hidden="true">
            ·
          </span>
          <span className="capitalize">{media.sourceType.replace('_', ' ')}</span>
          {media.durationFormatted && (
            <>
              <span className="text-zinc-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-pink-200 tabular-nums">
                {media.durationFormatted}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAiAnalysis}
            className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-medium bg-pink-400/20 hover:bg-pink-400/30 text-pink-200 border border-pink-400/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Insights</span>
          </button>

          <button
            type="button"
            onClick={handleCopyDirectLink}
            className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl text-xs font-medium bg-white/[0.07] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.12] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Copy direct stream URL"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-300" />
            )}
            <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Split Workspace */}
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-7 items-start">
        {/* Left Column: Video Preview Stage */}
        <div className="md:col-span-5 flex flex-col">
          <div className="relative aspect-[9/16] max-h-[380px] sm:max-h-[440px] w-full rounded-xl overflow-hidden bg-[#0E1017] border border-white/[0.12] flex items-center justify-center group">
            {selectedQuality.format === 'mp3' ? (
              <div className="flex flex-col items-center justify-center text-center gap-4 p-6 w-full h-full bg-gradient-to-b from-pink-500/15 via-[#161923] to-[#11131B]">
                <div className="w-16 h-16 rounded-2xl bg-pink-400/20 border border-pink-400/40 flex items-center justify-center text-pink-300 shadow-lg shadow-pink-500/20">
                  <Music className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-sm font-semibold text-white">MP3 Audio Preview</p>
                  <p className="text-xs text-zinc-300 line-clamp-2">{selectedQuality.label}</p>
                </div>
                {previewSource && (
                  <audio
                    src={previewSource}
                    controls
                    preload="metadata"
                    className="w-full max-w-[280px] rounded-xl"
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
            ) : media.thumbnailUrl ? (
              <div className="relative w-full h-full">
                <img
                  src={media.thumbnailUrl}
                  alt={media.title}
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
              <div className="flex flex-col items-center justify-center text-zinc-400 gap-2 p-6">
                <Music className="w-10 h-10 text-pink-300/80" />
                <span className="text-xs">Audio Stream</span>
              </div>
            )}

            {/* Center Play Button Overlay when paused */}
            {selectedQuality.format !== 'mp3' && !isPlaying && !hasVideoError && (
              <button
                type="button"
                onClick={handlePlayToggle}
                aria-label="Play video preview"
                className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors cursor-pointer"
              >
                <span className="w-14 h-14 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center shadow-2xl shadow-pink-950/60 transition-transform group-hover:scale-105">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </span>
              </button>
            )}

            {/* Bottom Studio Transport Scrubber */}
            {selectedQuality.format !== 'mp3' && !hasVideoError && (
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
                    className="w-full h-1.5 mb-2.5 accent-pink-500 cursor-pointer"
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePlayToggle}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-pink-500/35 text-white transition-colors cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>
                    {duration > 0 && (
                      <span className="text-[11px] font-mono text-zinc-200 tabular-nums">
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
            {media.author.avatarUrl ? (
              <img
                src={media.author.avatarUrl}
                alt={media.author.name}
                className="w-8 h-8 rounded-full border border-pink-500/25 object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pink-500/15 border border-pink-400/25 flex items-center justify-center text-xs font-semibold text-pink-300 shrink-0">
                {media.author.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-100 truncate">{media.author.name}</p>
              <p className="text-[11px] text-zinc-500 truncate">@{media.author.username}</p>
            </div>
            {media.author.profileUrl && (
              <a
                href={media.author.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-pink-300 hover:bg-white/[0.06] transition-colors"
                title="View original profile"
                aria-label="View original profile"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Right Column: Title, Stream Quality Matrix & Animated Download Controls */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-5">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-white leading-snug line-clamp-2">
              {media.title}
            </h2>
            {media.description && (
              <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                {media.description}
              </p>
            )}

            {/* Stream Quality Matrix */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-300">
                  Available streams ({media.qualities.length})
                </span>
                <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
                  Tap row to preview
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.12] bg-[#131620] divide-y divide-white/[0.09] overflow-hidden">
                {media.qualities.map((quality) => {
                  const isSelected = selectedQuality.id === quality.id;
                  const isDownloading = downloadingId === quality.id;
                  const isCompleted = downloadSuccessId === quality.id;
                  const isMp3 = quality.format.toLowerCase() === 'mp3';

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
                      className={`flex items-center justify-between px-3.5 sm:px-4 py-3 cursor-pointer transition-colors gap-3 ${
                        isSelected ? 'bg-pink-400/[0.14]' : 'hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-pink-300' : 'border-zinc-500'
                          }`}
                        >
                          {isSelected && (
                            <motion.span
                              layoutId="selected-quality-dot"
                              className="w-2 h-2 rounded-full bg-pink-300"
                            />
                          )}
                        </span>

                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                            {isMp3 && <Music className="w-3.5 h-3.5 text-pink-300 shrink-0" />}
                            <span className="truncate">{quality.label}</span>
                          </span>
                          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5 font-mono tabular-nums">
                            <span className={`uppercase ${isMp3 ? 'text-pink-200 font-semibold' : 'text-zinc-300'}`}>
                              {quality.format}
                            </span>
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
                          className="flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                          className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isCompleted
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                              : isSelected
                                ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-sm shadow-pink-500/25'
                                : 'bg-white/[0.08] hover:bg-pink-500/20 hover:border-pink-400/40 text-zinc-100 border border-white/[0.12]'
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
                              <span>{isMp3 ? 'MP3' : quality.resolution}</span>
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

          {/* Animated Live Transfer Progress Ring + Transfer Wave */}
          <AnimatePresence>
            {downloadProgress && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                className="p-4 rounded-xl bg-[#131620] border border-pink-400/45 shadow-lg shadow-pink-950/25 text-xs space-y-3"
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
                          stroke="rgba(255,255,255,0.12)"
                          strokeWidth="3"
                        />
                        <motion.circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke="#F472B6"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={progressRingCircumference}
                          animate={{ strokeDashoffset: progressRingOffset }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                        />
                      </svg>
                      <span className="absolute text-[10px] font-mono font-bold text-pink-200 tabular-nums">
                        {downloadProgress.percentage}%
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-300 opacity-80" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-400" />
                        </span>
                        <span className="font-semibold text-white truncate">
                          Downloading {selectedQuality.label}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-zinc-300 tabular-nums mt-0.5">
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
                    className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 font-sans font-semibold transition-colors shrink-0 cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>

                {/* Animated Pink Gradient Progress Wave */}
                <div className="w-full h-2 bg-white/[0.1] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink-500 via-pink-300 to-rose-300 rounded-full animate-shimmer"
                    initial={{ width: '4%' }}
                    animate={{ width: `${Math.max(4, downloadProgress.percentage)}%` }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono tabular-nums">
                  <span>
                    {selectedQuality.format === 'mp3'
                      ? 'Preparing 320kbps MP3 audio'
                      : 'Transferring MP4 chunks'}
                  </span>
                  <span className="text-pink-200">
                    {downloadProgress.percentage === 100 ? 'Building file...' : 'Live stream'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Ready-to-Open Bar once downloaded */}
          <AnimatePresence>
            {isDownloadedCurrent && !downloadProgress && downloadNotification && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                className="p-3.5 rounded-xl bg-pink-400/15 border border-pink-400/40 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <motion.div
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 20 }}
                    className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  </motion.div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      Saved {downloadNotification.resolution}{' '}
                      {downloadNotification.isAudioOnly ? 'MP3' : 'MP4'} to device
                    </p>
                    <p className="text-[11px] font-mono text-pink-100/90 tabular-nums">
                      {downloadNotification.sizeFormatted} ·{' '}
                      {downloadNotification.isAudioOnly ? 'Ready to listen' : 'Ready to watch'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setPreviewDownloadedModal(true)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{downloadNotification.isAudioOnly ? 'Play MP3' : 'Watch MP4'}</span>
                  </button>
                  <a
                    href={downloadNotification.downloadEndpoint}
                    download={downloadNotification.filename}
                    className="flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.14] text-xs font-medium transition-colors"
                    title="Save file directly"
                  >
                    <Download className="w-3.5 h-3.5 text-pink-300" />
                    <span>Save</span>
                  </a>
                  {downloadNotification.canShareFile && (
                    <button
                      type="button"
                      onClick={handleShareToDevice}
                      className="flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 border border-white/[0.14] text-xs font-medium transition-colors cursor-pointer"
                      title="Open in device Files or Gallery"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-pink-300" />
                      <span>Device</span>
                    </button>
                  )}
                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 border border-white/[0.14] transition-colors"
                    title={downloadNotification.isAudioOnly ? 'Open MP3 in new tab' : 'Open MP4 in new tab'}
                    aria-label={downloadNotification.isAudioOnly ? 'Open downloaded MP3 in new tab' : 'Open downloaded MP4 in new tab'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download Error Banner */}
          {downloadError && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-400/35 text-rose-100 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Download notice</p>
                <p className="text-rose-100/85 mt-0.5">{downloadError}</p>
              </div>
              <button
                type="button"
                onClick={() => setDownloadError(null)}
                className="text-rose-200/80 hover:text-white px-2.5 py-1 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Primary Action Footer */}
          <div className="pt-4 border-t border-white/[0.1] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {downloadingId ? (
              <div className="flex-1 flex items-center gap-2">
                <button
                  id="btn-primary-download-active"
                  type="button"
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 px-5 min-h-[46px] rounded-xl font-semibold text-sm bg-gradient-to-r from-pink-500 to-rose-500 text-white"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span className="font-mono tabular-nums">
                    {selectedQuality.resolution} ·{' '}
                    {downloadProgress?.percentage ? `${downloadProgress.percentage}%` : 'Connecting'}
                  </span>
                </button>
                <button
                  id="btn-primary-stop-download"
                  type="button"
                  onClick={handleCancelDownload}
                  className="flex items-center justify-center gap-1.5 px-4 min-h-[46px] rounded-xl font-semibold text-sm bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 transition-colors cursor-pointer"
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
                  className="flex-1 flex items-center justify-center gap-2 px-6 min-h-[46px] rounded-xl font-semibold text-sm bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-lg shadow-pink-500/25 transition-all active:scale-[0.99] cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {selectedQuality.label}</span>
                </button>

                {audioQuality && selectedQuality.format !== 'mp3' && (
                  <button
                    id="btn-quick-download-mp3"
                    type="button"
                    onClick={() => {
                      handleQualitySelect(audioQuality);
                      handleDownload(audioQuality);
                    }}
                    className="flex items-center justify-center gap-2 px-4 min-h-[46px] rounded-xl font-semibold text-xs bg-pink-400/15 hover:bg-pink-400/25 text-pink-200 border border-pink-400/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Music className="w-3.5 h-3.5" />
                    <span>Save MP3</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleCopyDirectLink}
              className="px-4 min-h-[44px] rounded-xl font-medium text-xs bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 border border-white/[0.12] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            onClick={() => setPreviewDownloadedModal(true)}
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 sm:bottom-5 z-50 sm:w-[400px] p-4 rounded-2xl bg-[#1D202C]/96 backdrop-blur-2xl border border-pink-400/50 shadow-2xl shadow-pink-950/50 cursor-pointer hover:border-pink-300/80 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail or Animated File Badge */}
              <div className="relative w-12 h-14 rounded-xl bg-[#11131B] border border-pink-400/40 overflow-hidden flex items-center justify-center shrink-0">
                {downloadNotification.isAudioOnly ? (
                  <Music className="w-5 h-5 text-pink-300" />
                ) : media.thumbnailUrl ? (
                  <img
                    src={media.thumbnailUrl}
                    alt={downloadNotification.title}
                    className="w-full h-full object-cover opacity-85"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Film className="w-5 h-5 text-pink-300" />
                )}
                {!downloadNotification.isAudioOnly && (
                  <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
                    <Play className="w-4 h-4 text-white fill-current" />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                    <span>
                      {downloadNotification.isAudioOnly ? 'MP3 Saved to Device' : 'MP4 Saved to Device'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDownloadNotification((prev) => (prev ? { ...prev, open: false } : null));
                    }}
                    className="p-1.5 -mr-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
                    aria-label="Close notification"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h4 className="text-sm font-semibold text-white mt-0.5 truncate">
                  {downloadNotification.title}
                </h4>
                <p className="text-xs text-zinc-300 mt-0.5 font-mono tabular-nums truncate">
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
                    className="flex-1 flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{downloadNotification.isAudioOnly ? 'Play MP3' : 'Watch MP4'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={downloadNotification.downloadEndpoint}
                    download={downloadNotification.filename}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 border border-white/[0.14] transition-colors"
                    title="Save directly to device"
                    aria-label="Save directly to device"
                  >
                    <Download className="w-3.5 h-3.5 text-pink-300" />
                  </a>

                  {downloadNotification.canShareFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShareToDevice();
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 border border-white/[0.14] text-xs font-medium transition-colors cursor-pointer"
                      title="Open in phone Files / Gallery"
                    >
                      <Share2 className="w-3.5 h-3.5 text-pink-300" />
                      <span>Device</span>
                    </button>
                  )}

                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 border border-white/[0.14] transition-colors"
                    title={downloadNotification.isAudioOnly ? 'Open MP3 file in new tab' : 'Open MP4 file in new tab'}
                    aria-label={downloadNotification.isAudioOnly ? 'Open MP3 file in new tab' : 'Open MP4 file in new tab'}
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 36, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-[#191C26] rounded-t-3xl sm:rounded-2xl border border-pink-400/40 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Mobile Sheet Handle */}
              <div className="sm:hidden pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-zinc-600" />
              </div>

              <div className="flex items-center justify-between px-5 py-3.5 sm:py-4 border-b border-white/[0.1]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-pink-400/20 border border-pink-400/40 flex items-center justify-center text-pink-300 shrink-0">
                    {downloadNotification.isAudioOnly ? (
                      <Music className="w-4 h-4" />
                    ) : (
                      <Film className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {downloadNotification.title}
                    </h3>
                    <p className="text-xs text-zinc-300 font-mono tabular-nums">
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
                      className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-pink-400/20 hover:bg-pink-400/30 text-pink-100 text-xs font-medium border border-pink-400/40 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Open on Device</span>
                    </button>
                  )}
                  <a
                    href={downloadNotification.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 text-xs font-medium border border-white/[0.12] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {downloadNotification.isAudioOnly ? 'Open MP3 Tab' : 'Open MP4 Tab'}
                    </span>
                  </a>
                  <button
                    id="btn-close-downloaded-modal"
                    type="button"
                    onClick={() => setPreviewDownloadedModal(false)}
                    aria-label="Close player"
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-[#0E1017] flex items-center justify-center overflow-hidden min-h-[260px] sm:min-h-[320px] max-h-[60vh]">
                {downloadNotification.isAudioOnly ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center w-full">
                    <div className="w-16 h-16 rounded-2xl bg-pink-400/20 border border-pink-400/40 flex items-center justify-center text-pink-300 mb-4 shadow-lg shadow-pink-500/20">
                      <Music className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-3">
                      Downloaded MP3 Audio Track
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
                    className="max-h-[56vh] max-w-full rounded-xl object-contain bg-black"
                  />
                )}
              </div>

              <div className="px-5 py-3.5 pb-safe border-t border-white/[0.1] flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-mono text-zinc-400 truncate max-w-[200px] sm:max-w-xs">
                  {downloadNotification.filename}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <a
                    href={downloadNotification.blobUrl}
                    download={downloadNotification.filename}
                    className="flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save Again</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewDownloadedModal(false)}
                    className="px-4 min-h-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100 font-medium transition-colors cursor-pointer"
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
