import { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Zap,
  Globe2,
  Clock,
  Tag,
  TrendingUp,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MediaMetadata, VideoAnalysisResult, FastTagsResult, SearchContextResult } from '../types';

interface AiAnalysisPanelProps {
  media: MediaMetadata;
  isOpen: boolean;
  onClose: () => void;
}

export function AiAnalysisPanel({ media, isOpen, onClose }: AiAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<'deep' | 'fast' | 'search'>('deep');

  const [deepAnalysis, setDeepAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  const [fastTags, setFastTags] = useState<FastTagsResult | null>(null);
  const [loadingFast, setLoadingFast] = useState(false);
  const [fastError, setFastError] = useState<string | null>(null);

  const [searchContext, setSearchContext] = useState<SearchContextResult | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [copiedCaptionIndex, setCopiedCaptionIndex] = useState<number | null>(null);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [copiedSingleTag, setCopiedSingleTag] = useState<string | null>(null);

  useEffect(() => {
    setDeepAnalysis(null);
    setFastTags(null);
    setSearchContext(null);
    setDeepError(null);
    setFastError(null);
    setSearchError(null);
    setActiveTab('deep');
  }, [media.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const runDeepAnalysis = async () => {
    try {
      setLoadingDeep(true);
      setDeepError(null);
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          description: media.description,
          platform: media.platform,
          authorName: media.author.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Analysis failed.');
      }
      const data = await res.json();
      setDeepAnalysis(data);
    } catch (e: any) {
      setDeepError(e?.message || 'Unable to run video intelligence.');
    } finally {
      setLoadingDeep(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'deep' && !deepAnalysis && !loadingDeep && !deepError) {
      runDeepAnalysis();
    }
  }, [isOpen, activeTab]);

  const runFastTags = async () => {
    try {
      setLoadingFast(true);
      setFastError(null);
      const res = await fetch('/api/ai/fast-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: media.title,
          platform: media.platform,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Tag generation failed.');
      }
      const data = await res.json();
      setFastTags(data);
    } catch (e: any) {
      setFastError(e?.message || 'Unable to generate tags.');
    } finally {
      setLoadingFast(false);
    }
  };

  const runSearchContext = async () => {
    try {
      setLoadingSearch(true);
      setSearchError(null);
      const query = `${media.platform} video ${media.title} ${media.author.name}`;
      const res = await fetch('/api/ai/search-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Search grounding failed.');
      }
      const data = await res.json();
      setSearchContext(data);
    } catch (e: any) {
      setSearchError(e?.message || 'Unable to retrieve search context.');
    } finally {
      setLoadingSearch(false);
    }
  };

  const copyCaption = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCaptionIndex(index);
    setTimeout(() => setCopiedCaptionIndex(null), 1800);
  };

  const copyAllHashtags = (tags: string[]) => {
    const formatted = tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    navigator.clipboard.writeText(formatted);
    setCopiedHashtags(true);
    setTimeout(() => setCopiedHashtags(false), 1800);
  };

  const copyTag = (tag: string) => {
    const formatted = tag.startsWith('#') ? tag : `#${tag}`;
    navigator.clipboard.writeText(formatted);
    setCopiedSingleTag(tag);
    setTimeout(() => setCopiedSingleTag(null), 1200);
  };

  const tabs = [
    {
      id: 'deep' as const,
      label: 'Deep Analysis',
      icon: Sparkles,
      onEnter: () => {
        if (!deepAnalysis && !loadingDeep) runDeepAnalysis();
      },
    },
    {
      id: 'fast' as const,
      label: 'Viral Tags',
      icon: Zap,
      onEnter: () => {
        if (!fastTags && !loadingFast) runFastTags();
      },
    },
    {
      id: 'search' as const,
      label: 'Web Context',
      icon: Globe2,
      onEnter: () => {
        if (!searchContext && !loadingSearch) runSearchContext();
      },
    },
  ];

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
            aria-label="Media Intelligence"
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
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-white truncate">
                    AI Media Insights
                  </h3>
                  <p className="text-xs text-zinc-300 truncate">{media.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Animated Tab Switcher */}
            <div className="flex items-center gap-1 px-4 sm:px-6 py-2.5 border-b border-white/[0.1] bg-[#131620] overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      tab.onEnter();
                    }}
                    className={`relative flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active ? 'text-white' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="ai-panel-tab"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500"
                      />
                    )}
                    <Icon className="relative z-10 w-3.5 h-3.5" />
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 pb-safe overflow-y-auto space-y-6 flex-1">
              {activeTab === 'deep' && (
                <div>
                  {loadingDeep && (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-zinc-400">
                      <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
                      <span className="text-xs font-medium">Analyzing video semantics...</span>
                    </div>
                  )}

                  {deepError && !loadingDeep && (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 text-xs text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{deepError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={runDeepAnalysis}
                        className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium shrink-0 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {deepAnalysis && !loadingDeep && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 pb-5 border-b border-white/[0.07]">
                        <div className="sm:col-span-8 space-y-1.5">
                          <span className="text-xs font-medium text-pink-400">Summary</span>
                          <p className="text-sm text-zinc-200 leading-relaxed">
                            {deepAnalysis.summary}
                          </p>
                        </div>
                        <div className="sm:col-span-4 sm:border-l sm:border-white/[0.07] sm:pl-5 flex flex-row sm:flex-col items-center sm:items-start justify-between gap-3">
                          <div>
                            <span className="text-xs font-medium text-zinc-400">
                              Engagement Fit
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5 font-mono tabular-nums">
                              <span className="text-2xl font-bold text-white">
                                {deepAnalysis.viralScore}
                              </span>
                              <span className="text-xs text-zinc-500">/ 100</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{deepAnalysis.category}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                          <Clock className="w-3.5 h-3.5 text-pink-400" />
                          <span>Key Moments</span>
                        </div>
                        <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                          {deepAnalysis.keyMoments.map((moment, idx) => (
                            <div key={idx} className="flex items-start gap-4 px-4 py-3 text-xs">
                              <span className="font-mono font-semibold text-pink-400 tabular-nums shrink-0">
                                {moment.timestamp}
                              </span>
                              <span className="text-zinc-300 leading-relaxed">
                                {moment.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <span className="text-xs font-medium text-zinc-400 block">
                          Repost Captions
                        </span>
                        <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                          {deepAnalysis.suggestedCaptions.map((caption, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-4 px-4 py-3 text-xs text-zinc-200"
                            >
                              <span className="leading-relaxed">{caption}</span>
                              <button
                                type="button"
                                onClick={() => copyCaption(caption, idx)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 transition-colors shrink-0 cursor-pointer"
                                title="Copy caption"
                                aria-label="Copy caption"
                              >
                                {copiedCaptionIndex === idx ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {activeTab === 'fast' && (
                <div>
                  {loadingFast && (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-zinc-400">
                      <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
                      <span className="text-xs font-medium">Generating tags...</span>
                    </div>
                  )}

                  {fastError && !loadingFast && (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 text-xs text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{fastError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={runFastTags}
                        className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium shrink-0 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {fastTags && !loadingFast && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="pb-5 border-b border-white/[0.07]">
                        <span className="text-xs font-medium text-pink-400">Optimized Title</span>
                        <h4 className="text-base font-semibold text-white mt-1">
                          {fastTags.title}
                        </h4>
                        <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                          {fastTags.quickSummary}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-pink-400" />
                            <span>Hashtags ({fastTags.hashtags.length})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => copyAllHashtags(fastTags.hashtags)}
                            className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-pink-300 transition-colors cursor-pointer"
                          >
                            {copiedHashtags ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedHashtags ? 'Copied All' : 'Copy All'}</span>
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {fastTags.hashtags.map((tag, idx) => {
                            const formatted = tag.startsWith('#') ? tag : `#${tag}`;
                            const isCopied = copiedSingleTag === tag;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => copyTag(tag)}
                                className="px-3 min-h-[36px] rounded-xl text-xs font-mono bg-[#131620] hover:bg-pink-500/15 text-zinc-200 hover:text-pink-200 border border-white/[0.08] hover:border-pink-400/30 transition-colors cursor-pointer"
                              >
                                {isCopied ? 'Copied!' : formatted}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {activeTab === 'search' && (
                <div>
                  {loadingSearch && (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-zinc-400">
                      <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
                      <span className="text-xs font-medium">Searching live web context...</span>
                    </div>
                  )}

                  {searchError && !loadingSearch && (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 text-xs text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{searchError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={runSearchContext}
                        className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium shrink-0 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {searchContext && !loadingSearch && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="space-y-2 pb-5 border-b border-white/[0.07]">
                        <span className="text-xs font-medium text-pink-400">Live Web Context</span>
                        <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                          {searchContext.overview}
                        </p>
                      </div>

                      {searchContext.sourceReferences.length > 0 && (
                        <div className="space-y-3">
                          <span className="text-xs font-medium text-zinc-400 block">
                            Citations ({searchContext.sourceReferences.length})
                          </span>
                          <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                            {searchContext.sourceReferences.map((src, idx) => (
                              <a
                                key={idx}
                                href={src.url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between px-4 py-3 text-xs text-pink-300 hover:bg-white/[0.03] transition-colors"
                              >
                                <span className="truncate pr-3">{src.title}</span>
                                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
