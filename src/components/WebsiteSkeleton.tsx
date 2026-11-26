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
        className="w-full max-w-4xl mx-auto space-y-8"
      >
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-24 rounded-full wk-skeleton" />
          <div className="h-3.5 w-4 rounded-full wk-skeleton" />
          <div className="h-3.5 w-36 rounded-full wk-skeleton" />
        </div>

        <div className="pt-2 pb-7 border-b border-rose-300/15 space-y-5">
          <div className="h-8 sm:h-10 w-3/4 rounded-full wk-skeleton-bright" />
          <div className="h-5 w-1/2 rounded-full wk-skeleton" />
          <div className="space-y-2.5 pt-1">
            <div className="h-3.5 w-full rounded-full wk-skeleton" />
            <div className="h-3.5 w-5/6 rounded-full wk-skeleton" />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="h-11 w-44 rounded-full wk-skeleton-bright" />
            <div className="h-11 w-32 rounded-full wk-skeleton" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-rose-300/15">
          {[0, 1].map((idx) => (
            <div key={idx} className="pt-4 md:pt-0 md:px-5 space-y-3">
              <div className="h-5 w-2/3 rounded-full wk-skeleton-bright" />
              <div className="h-3.5 w-full rounded-full wk-skeleton" />
              <div className="h-3.5 w-4/5 rounded-full wk-skeleton" />
              <div className="h-3.5 w-3/5 rounded-full wk-skeleton" />
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
      {/* Open Hero Skeleton */}
      <div className="max-w-3xl w-full mx-auto flex flex-col items-center space-y-3.5 mb-6 sm:mb-7">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-16 h-16 rounded-full wk-skeleton-bright shadow-xl shadow-rose-950/50" />
          <div className="h-4 w-36 rounded-full wk-skeleton" />
        </div>

        <div className="w-full max-w-xl space-y-2.5 flex flex-col items-center pt-1">
          <div className="h-8 sm:h-11 w-[88%] rounded-full wk-skeleton-bright" />
          <div className="h-8 sm:h-11 w-[62%] rounded-full wk-skeleton-bright" />
        </div>

        <div className="h-4 sm:h-5 w-72 sm:w-96 rounded-full wk-skeleton" />
        <div className="w-full max-w-lg space-y-2 flex flex-col items-center pt-0.5">
          <div className="h-3.5 w-[92%] rounded-full wk-skeleton" />
          <div className="h-3.5 w-[72%] rounded-full wk-skeleton" />
        </div>
      </div>

      {/* Lunar Pill Command Bar Skeleton */}
      <div className="w-full max-w-3xl mx-auto">
        <div className="wk-lunar-bar rounded-[30px] sm:rounded-full p-2 sm:p-1.5 sm:pl-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 flex items-center gap-3 px-2 min-h-[44px]">
            <div className="w-5 h-5 rounded-full wk-skeleton shrink-0" />
            <div className="h-4 flex-1 max-w-sm rounded-full wk-skeleton" />
            <div className="h-8 w-16 rounded-full wk-skeleton shrink-0" />
          </div>
          <div className="h-[46px] w-full sm:w-40 rounded-full wk-skeleton-bright shrink-0" />
        </div>

        {/* Borderless Quality Tabs + Samples Skeleton */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3.5 px-2">
          <div className="flex items-center gap-6 border-b border-rose-300/15 pb-1.5">
            <div className="h-4 w-20 rounded-full wk-skeleton-bright" />
            <div className="h-4 w-20 rounded-full wk-skeleton" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-3.5 w-16 rounded-full wk-skeleton" />
            <div className="h-3.5 w-20 rounded-full wk-skeleton" />
            <div className="h-3.5 w-20 rounded-full wk-skeleton" />
          </div>
        </div>
      </div>

      {/* Disclaimer Skeleton */}
      <div className="mt-4 h-3.5 w-64 sm:w-80 rounded-full wk-skeleton" />

      {/* 7 Platform Icons Skeleton */}
      <div className="w-full max-w-3xl mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-7">
        {Array.from({ length: 7 }).map((_, idx) => (
          <div key={idx} className="inline-flex items-center gap-2 py-1.5 px-1">
            <div className="w-5 h-5 rounded-full wk-skeleton-bright shrink-0" />
            <div className="h-3.5 w-14 rounded-full wk-skeleton" />
          </div>
        ))}
      </div>

      {/* Unboxed Hairline Capabilities Skeleton (No Enclosing Rectangles) */}
      <div className="w-full max-w-4xl mx-auto mt-12 pt-8 border-t border-rose-300/15 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-rose-300/15">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="py-6 md:py-2 md:px-6 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full wk-skeleton-bright shrink-0" />
                <div className="h-4 w-40 rounded-full wk-skeleton-bright" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded-full wk-skeleton" />
                <div className="h-3 w-5/6 rounded-full wk-skeleton" />
              </div>
            </div>
            <div className="h-4 w-28 rounded-full wk-skeleton" />
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
      className="w-full max-w-4xl mx-auto mt-10 pt-6 border-t border-rose-300/20 wk-open-stage rounded-t-[36px] px-4 sm:px-8 pb-8"
    >
      {/* Open Extraction Status Bar */}
      <div className="pb-4 border-b border-rose-300/15 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Loader2 className="w-4 h-4 text-rose-400 animate-spin shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-white truncate">
            {currentStage.label}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-mono text-rose-100/65 tabular-nums">
            Stage {stageIndex + 1} / {stages.length}
          </span>
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop extraction"
            className="flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/35 transition-colors cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* Unboxed Body Mirroring Redesigned MediaResultCard */}
      <div className="pt-6 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left: Smooth Organic Preview Orb/Stage */}
        <div className="md:col-span-5 relative aspect-[9/16] max-h-[260px] sm:max-h-[320px] max-w-[240px] md:max-w-none mx-auto w-full rounded-[32px] wk-skeleton overflow-hidden flex flex-col items-center justify-between p-5 border border-rose-300/15">
          <div className="w-full flex items-center justify-between">
            <div className="h-4 w-16 rounded-full wk-skeleton-bright" />
            <div className="h-4 w-10 rounded-full wk-skeleton" />
          </div>

          <div className="w-14 h-14 rounded-full wk-skeleton-bright" />

          <div className="w-full space-y-2">
            <div className="h-1.5 w-full rounded-full wk-skeleton-bright" />
            <div className="flex justify-between">
              <div className="h-2.5 w-10 rounded-full wk-skeleton" />
              <div className="h-2.5 w-10 rounded-full wk-skeleton" />
            </div>
          </div>
        </div>

        {/* Right: Metadata & Hairline Stream Rows Skeleton */}
        <div className="md:col-span-7 space-y-5">
          <div className="space-y-2">
            <div className="h-6 sm:h-7 w-[90%] rounded-full wk-skeleton-bright" />
            <div className="h-4 sm:h-5 w-[60%] rounded-full wk-skeleton" />
          </div>

          <div className="flex items-center gap-5 border-b border-rose-300/15 pb-2">
            <div className="h-4 w-14 rounded-full wk-skeleton-bright" />
            <div className="h-4 w-14 rounded-full wk-skeleton" />
            <div className="h-4 w-14 rounded-full wk-skeleton" />
          </div>

          {/* Unboxed Hairline Quality Row Skeletons */}
          <div className="border-t border-b border-rose-300/15 divide-y divide-rose-300/12">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-4 h-4 rounded-full wk-skeleton-bright shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-36 rounded-full wk-skeleton-bright" />
                    <div className="h-2.5 w-24 rounded-full wk-skeleton" />
                  </div>
                </div>
                <div className="h-9 w-24 rounded-full wk-skeleton-bright shrink-0" />
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
                  ) : active ? (
                    <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-200/25 shrink-0" />
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
