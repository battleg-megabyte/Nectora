interface WukongBrandMarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animatedArrow?: boolean;
  showDownloadBadge?: boolean;
}

export function WukongBrandMark({
  size = 'sm',
  animatedArrow = false,
  showDownloadBadge = true,
}: WukongBrandMarkProps) {
  const dims =
    size === 'xl'
      ? {
          box: 'w-20 h-20 sm:w-28 sm:h-28 rounded-2xl',
          badge: 'w-9 h-9 sm:w-10 sm:h-10 -right-2 -bottom-2 sm:-right-2.5 sm:-bottom-2.5 rounded-xl border-[3px]',
          arrow: 'w-4 h-4 sm:w-5 sm:h-5',
        }
      : size === 'lg'
        ? {
            box: 'w-14 h-14 rounded-xl',
            badge: 'w-6 h-6 -right-1.5 -bottom-1.5 rounded-md border-2',
            arrow: 'w-3.5 h-3.5',
          }
        : size === 'md'
          ? {
              box: 'w-12 h-12 rounded-xl',
              badge: 'w-5 h-5 -right-1 -bottom-1 rounded-md border-2',
              arrow: 'w-3 h-3',
            }
          : {
              box: 'w-9 h-9 rounded-lg',
              badge: 'w-4 h-4 -right-1 -bottom-1 rounded-[5px] border-2',
              arrow: 'w-2.5 h-2.5',
            };

  return (
    <div className={`relative ${dims.box} shrink-0 select-none group`}>
      {/* Sculpted Beveled Rose-Pink & Pearl-White Frame featuring the Monkey King Emblem */}
      <div className="relative w-full h-full rounded-[inherit] bg-[#120711] border border-rose-300/45 ring-1 ring-inset ring-white/20 group-hover:border-white/75 transition-all overflow-hidden flex items-center justify-center shadow-lg shadow-rose-950/60">
        <img
          src="/monkey-king-icon.jpg"
          alt="Sun Wukong emblem"
          draggable={false}
          className="w-full h-full object-cover object-center scale-[1.54] brightness-[1.07] contrast-[1.06]"
        />
        {/* Luminous subtle pearl inner edge blend */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_14px_rgba(9,4,9,0.75)] ring-1 ring-inset ring-white/15"
        />
      </div>

      {/* Precision Docked Rose-Pink Video Download Badge */}
      {showDownloadBadge && (
        <span
          aria-hidden="true"
          className={`absolute ${dims.badge} bg-gradient-to-br from-rose-500 to-pink-500 border-[#090409] flex items-center justify-center text-white shadow-md shadow-black/60 ring-1 ring-white/35 transition-transform duration-150 ${
            animatedArrow ? 'group-hover:translate-y-0.5' : ''
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={dims.arrow}
          >
            <path d="M12 4.5v10.5" />
            <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
            <path d="M5 19.5h14" />
          </svg>
        </span>
      )}
    </div>
  );
}
