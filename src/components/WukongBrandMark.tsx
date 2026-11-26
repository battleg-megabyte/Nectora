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
          box: 'w-24 h-24 sm:w-28 sm:h-28 rounded-full',
          badge: 'w-9 h-9 sm:w-10 sm:h-10 right-0 bottom-0 rounded-full border-[3px]',
          arrow: 'w-4 h-4 sm:w-5 sm:h-5',
          crownRing: 'p-[2px]',
        }
      : size === 'lg'
        ? {
            box: 'w-14 h-14 rounded-full',
            badge: 'w-6 h-6 -right-0.5 -bottom-0.5 rounded-full border-2',
            arrow: 'w-3.5 h-3.5',
            crownRing: 'p-[1.5px]',
          }
        : size === 'md'
          ? {
              box: 'w-14 h-14 rounded-full',
              badge: 'w-6 h-6 -right-0.5 -bottom-0.5 rounded-full border-2',
              arrow: 'w-3 h-3',
              crownRing: 'p-[1.5px]',
            }
          : {
              box: 'w-9 h-9 rounded-full',
              badge: 'w-4 h-4 -right-0.5 -bottom-0.5 rounded-full border-2',
              arrow: 'w-2.5 h-2.5',
              crownRing: 'p-[1px]',
            };

  return (
    <div className={`relative ${dims.box} shrink-0 select-none group`}>
      {/* Soft Rose-Pink Moonlit Glow Halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1.5 rounded-full bg-gradient-to-br from-rose-500/35 via-pink-500/20 to-white/15 blur-md opacity-75 group-hover:opacity-100 transition-opacity"
      />

      {/* Circular Celestial Rose-Pink & Pearl-White Metallic Rim */}
      <div
        className={`relative w-full h-full rounded-full bg-gradient-to-br from-rose-300/75 via-pink-400/55 to-white/65 ${dims.crownRing} shadow-lg shadow-rose-950/70 transition-all group-hover:from-white/90 group-hover:via-pink-300 group-hover:to-rose-400`}
      >
        <div className="relative w-full h-full rounded-full bg-[#100612] overflow-hidden flex items-center justify-center">
          <img
            src={size === 'xl' ? '/monkey-king-icon.webp' : '/monkey-king-icon-192.webp'}
            width={size === 'xl' ? 512 : 192}
            height={size === 'xl' ? 512 : 192}
            alt="Sun Wukong emblem"
            draggable={false}
            className="w-full h-full object-cover object-center scale-[1.52] brightness-[1.1] contrast-[1.08]"
          />
          {/* Subtle Top Moonlight Specular Sheen & Rim Vignette */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/15 via-transparent to-[#09030B]/70 shadow-[inset_0_0_12px_rgba(8,3,10,0.85)]"
          />
        </div>
      </div>

      {/* Circular Orbital Download Emblem */}
      {showDownloadBadge && (
        <span
          aria-hidden="true"
          className={`absolute ${dims.badge} bg-gradient-to-br from-rose-500 via-pink-500 to-rose-600 border-[#09030B] flex items-center justify-center text-white shadow-lg shadow-black/70 ring-1 ring-white/45 transition-transform duration-150 ${
            animatedArrow ? 'group-hover:translate-y-0.5 group-hover:scale-105' : ''
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
            <path d="M12 4v11" />
            <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
            <path d="M4.5 19.5h15" />
          </svg>
        </span>
      )}
    </div>
  );
}
