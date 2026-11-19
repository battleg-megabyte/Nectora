import { WukongBrandMark } from './WukongBrandMark';

interface FooterProps {
  onOpenDiagnostics: () => void;
  onOpenBatch: () => void;
}

export function Footer({
  onOpenDiagnostics,
  onOpenBatch,
}: FooterProps) {
  return (
    <footer className="w-full border-t border-rose-300/15 bg-[#090409]/90 mt-14 sm:mt-20 py-7 sm:py-9">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <WukongBrandMark size="sm" />
              <span className="font-display font-semibold text-sm text-white tracking-tight">
                WuKong<span className="text-rose-400">-</span>
                <span className="text-pink-400">Vid</span>
              </span>
              <span className="text-rose-200/35" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-white">Made by</span>
                <span className="font-signature italic font-bold text-sm sm:text-base text-blue-400 tracking-wide">
                  Eyad Saber
                </span>
              </span>
            </div>
            <p className="text-xs text-rose-100/55 max-w-md">
              Personal high-speed video and audio extraction utility for public media links. YouTube URLs are excluded.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-xs font-medium text-rose-100/70">
            <button
              type="button"
              onClick={onOpenBatch}
              className="py-2 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Batch Queue
            </button>
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="py-2 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Stream Check
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
