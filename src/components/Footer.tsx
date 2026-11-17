import monkeyKingIcon from '../assets/images/monkey_king_icon_1794952225765.jpg';

interface FooterProps {
  onOpenSecurity: () => void;
  onOpenDiagnostics: () => void;
  onOpenBatch: () => void;
}

export function Footer({
  onOpenSecurity,
  onOpenDiagnostics,
  onOpenBatch,
}: FooterProps) {
  return (
    <footer className="w-full border-t border-white/[0.1] bg-[#11131B] mt-16 sm:mt-24 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1.5">
            <div className="flex items-center gap-2">
              <img
                src={monkeyKingIcon}
                alt="NEcTORa Monkey King icon"
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-lg object-cover border border-pink-400/50"
              />
              <span className="font-display font-semibold text-sm text-white tracking-tight">
                NEcTORa
              </span>
            </div>
            <p className="text-xs text-zinc-400 max-w-md">
              Authorized personal media extraction utility. Ephemeral processing with strict SSRF protection. YouTube URLs are excluded.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-xs font-medium text-zinc-300">
            <button
              type="button"
              onClick={onOpenBatch}
              className="py-2 hover:text-pink-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Batch Queue
            </button>
            <button
              type="button"
              onClick={onOpenSecurity}
              className="py-2 hover:text-pink-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Security Architecture
            </button>
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="py-2 hover:text-pink-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              System Diagnostics
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
