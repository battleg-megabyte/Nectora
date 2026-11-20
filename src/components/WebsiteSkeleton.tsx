import { motion } from 'motion/react';
import { Loader2, Square, CheckCircle2 } from 'lucide-react';

interface WebsitePageSkeletonProps {
  variant?: 'home' | 'seo';
}

export function WebsitePageSkeleton({ variant = 'home' }: WebsitePageSkeletonProps) {
  if (variant === 'seo') {
    return (
      <motion.div
        key="website-skeleton-seo"
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        role="status"
        aria-busy="true"
        aria-label="Loading page content"
        className="w-full max-w-4xl mx-auto space-y-6"
      >
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-24 rounded-md wk-skeleton" />
          <div className="h-3.5 w-4 rounded-md wk-skeleton" />
          <div className="h-3.5 w-36 rounded-md wk-skeleton" />
        </div>

        <div className="wk-box rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="h-8 sm:h-10 w-3/4 rounded-xl wk-skeleton-bright" />
          <div className="h-5 w-1/2 rounded-lg wk-skeleton" />
          <div className="space-y-2.5 pt-1">
            <div className="h-3.5 w-full rounded-md wk-skeleton" />
            <div className="h-3.5 w-5/6 rounded-md wk-skeleton" />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="h-10 w-40 rounded-xl wk-skeleton-bright" />
            <div className="h-10 w-32 rounded-xl wk-skeleton" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {[0, 1].map((idx) => (
            <div key={idx} className="wk-box rounded-2xl p-5 sm:p-6 space-y-3">
              <div className="h-5 w-2/3 rounded-lg wk-skeleton-bright" />
              <div className="h-3.5 w-full rounded-md wk-skeleton" />
              <div className="h-3.5 w-4/5 rounded-md wk-skeleton" />
              <div className="h-3.5 w-3/5 rounded-md wk-skeleton" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="website-skeleton-home"
      initial={{ opacity: 0.75 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="status"
      aria-busy="true"
      aria-label="Loading WuKong Vid website"
      className="w-full flex flex-col items-center"
    >
      {/* Hero Skeleton */}
      <div className="max-w-3xl w-full mx-auto flex flex-col items-center space-y-3.5 mb-6 sm:mb-7">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl wk-skeleton-bright shadow-xl shadow-rose-950/50" />
          <div className="h-4 w-36 rounded-md wk-skeleton" />
        </div>

        <div className="w-full max-w-xl space-y-2.5 flex flex-col items-center pt-1">
          <div className="h-8 sm:h-11 w-[88%] rounded-xl wk-skeleton-bright" />
          <div className="h-8 sm:h-11 w-[62%] rounded-xl wk-skeleton-bright" />
        </div>

        <div className="h-4 sm:h-5 w-72 sm:w-96 rounded-lg wk-skeleton" />
        <div className="w-full max-w-lg space-y-2 flex flex-col items-center pt-0.5">
          <div className="h-3.5 w-[92%] rounded-md wk-skeleton" />
          <div className="h-3.5 w-[72%] rounded-md wk-skeleton" />
        </div>
      </div>

      {/* Command Deck Skeleton */}
      <div className="w-full max-w-3xl mx-auto">
        <div className="wk-command-deck rounded-2xl p-2 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 flex items-center gap-3 px-2 min-h-[44px]">
            <div className="w-5 h-5 rounded-md wk-skeleton shrink-0" />
            <div className="h-4 flex-1 max-w-sm rounded-md wk-skeleton" />
            <div className="h-9 w-16 rounded-xl wk-skeleton shrink-0" />
          </div>
          <div className="h-[46px] sm:h-[44px] w-full sm:w-40 rounded-xl wk-skeleton-bright shrink-0" />
        </div>

        {/* Quality Selector + Samples Skeleton */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3.5 px-0.5">
          <div className="w-full sm:w-auto grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#140A13] border border-rose-300/20">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-9 w-full sm:w-[70px] rounded-md wk-skeleton" />
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-3.5 w-16 rounded-md wk-skeleton" />
            <div className="h-3.5 w-20 rounded-md wk-skeleton" />
            <div className="h-3.5 w-20 rounded-md wk-skeleton" />
          </div>
        </div>
      </div>

      {/* Disclaimer Skeleton */}
      <div className="mt-4 h-3.5 w-64 sm:w-80 rounded-md wk-skeleton" />

      {/* 7 Platform Icons Skeleton */}
      <div className="w-full max-w-3xl mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-7">
        {Array.from({ length: 7 }).map((_, idx) => (
          <div key={idx} className="inline-flex items-center gap-2 py-1.5 px-1">
            <div className="w-5 h-5 rounded-full wk-skeleton-bright shrink-0" />
            <div className="h-3.5 w-14 rounded-md wk-skeleton" />
          </div>
        ))}
      </div>

      {/* Bento Capabilities Grid Skeleton */}
      <div className="w-full max-w-4xl mx-auto mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="wk-box rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg wk-skeleton-bright shrink-0" />
                <div className="h-4 w-36 rounded-md wk-skeleton-bright" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded-md wk-skeleton" />
                <div className="h-3 w-5/6 rounded-md wk-skeleton" />
              </div>
            </div>
            <div className="h-4 w-28 rounded-md wk-skeleton" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

interface MediaExtractionSkeletonProps {
  stageIndex: number;
  stages: { label: string; detail: string }[];
  onStop: () => void;
}

export function MediaExtractionSkeleton({
  stageIndex,
  stages,
  onStop,
}: MediaExtractionSkeletonProps) {
  const currentStage = stages[stageIndex] || stages[0];

  return (
    <motion.div
      key="extraction-skeleton"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      role="status"
      aria-busy="true"
      aria-label="Extracting media streams"
      className="w-full max-w-4xl mx-auto mt-8 wk-box rounded-2xl overflow-hidden"
    >
      {/* Live Extraction Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-rose-300/15 flex items-center justify-between gap-3 bg-[#0D060C]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Loader2 className="w-4 h-4 text-rose-400 animate-spin shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-white truncate">
            {currentStage.label}
          </span>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <span className="text-[11px] font-mono text-rose-100/65 tabular-nums">
            Stage {stageIndex + 1} / {stages.length}
          </span>
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop extraction"
            className="flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/35 transition-colors cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* Skeleton Body Mirroring MediaResultCard */}
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-7 items-start">
        {/* Left: Video Player Preview Skeleton */}
        <div className="md:col-span-5 relative aspect-[9/16] max-h-[260px] sm:max-h-[320px] max-w-[240px] md:max-w-none mx-auto w-full rounded-xl wk-box-well wk-skeleton overflow-hidden flex flex-col items-center justify-between p-4">
          <span className="pointer-events-none absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-rose-400/75" />
          <span className="pointer-events-none absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-pink-400/75" />
          <span className="pointer-events-none absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-pink-400/75" />
          <span className="pointer-events-none absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-white/70" />

          <div className="w-full flex items-center justify-between">
            <div className="h-5 w-16 rounded-md wk-skeleton-bright" />
            <div className="h-5 w-10 rounded-md wk-skeleton" />
          </div>

          <div className="w-12 h-12 rounded-full wk-skeleton-bright" />

          <div className="w-full space-y-2">
            <div className="h-1.5 w-full rounded-full wk-skeleton-bright" />
            <div className="flex justify-between">
              <div className="h-2.5 w-10 rounded wk-skeleton" />
              <div className="h-2.5 w-10 rounded wk-skeleton" />
            </div>
          </div>
        </div>

        {/* Right: Metadata, Tabs & Quality Rows Skeleton */}
        <div className="md:col-span-7 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full wk-skeleton-bright shrink-0" />
            <div className="h-3.5 w-24 rounded-md wk-skeleton-bright" />
            <div className="h-3.5 w-14 rounded-md wk-skeleton" />
          </div>

          <div className="space-y-2">
            <div className="h-5 sm:h-6 w-[90%] rounded-lg wk-skeleton-bright" />
            <div className="h-5 sm:h-6 w-[60%] rounded-lg wk-skeleton" />
          </div>

          {/* Segmented Quality Tabs Skeleton */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#0D060C] border border-rose-300/15 w-fit">
            <div className="h-7 w-16 rounded-md wk-skeleton-bright" />
            <div className="h-7 w-16 rounded-md wk-skeleton" />
            <div className="h-7 w-16 rounded-md wk-skeleton" />
          </div>

          {/* 4 Quality Format Row Skeletons */}
          <div className="rounded-xl border border-rose-300/15 bg-[#0D060C] divide-y divide-rose-300/10 overflow-hidden">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-6 rounded-md wk-skeleton-bright shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-32 rounded wk-skeleton-bright" />
                    <div className="h-2.5 w-20 rounded wk-skeleton" />
                  </div>
                </div>
                <div className="h-8 w-24 rounded-lg wk-skeleton-bright shrink-0" />
              </div>
            ))}
          </div>

          {/* Compact Live Stage Indicator Strip */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {stages.map((st, idx) => {
              const done = idx < stageIndex;
              const active = idx === stageIndex;
              return (
                <div key={st.label} className="flex items-center gap-1.5 text-[11px] font-mono">
                  {done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        active ? 'bg-rose-400 animate-pulse' : 'bg-rose-200/25'
                      }`}
                    />
                  )}
                  <span
                    className={
                      done ? 'text-emerald-300' : active ? 'text-white' : 'text-rose-100/45'
                    }
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
