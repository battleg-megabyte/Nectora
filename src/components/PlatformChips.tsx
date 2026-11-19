import { motion } from 'motion/react';
import { PlatformIcon } from './PlatformIcon';

export function PlatformChips() {
  const platforms = [
    {
      id: 'tiktok',
      name: 'TikTok',
      detail: 'Watermark-free HD & MP3',
    },
    {
      id: 'instagram',
      name: 'Instagram',
      detail: 'Reels, posts & audio',
    },
    {
      id: 'facebook',
      name: 'Facebook',
      detail: 'Watch, reels & clips',
    },
    {
      id: 'twitter',
      name: 'X',
      detail: 'High-bitrate MP4',
    },
    {
      id: 'direct',
      name: 'Direct & HLS',
      detail: 'MP4, M3U8, Reddit, Vimeo',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-3xl mx-auto mt-7 wk-box rounded-xl overflow-hidden"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-rose-300/15">
        {platforms.map((p, idx) => {
          const isLastOdd = idx === platforms.length - 1;
          return (
            <div
              key={p.name}
              className={`flex flex-col px-3.5 py-3 hover:bg-rose-400/[0.05] transition-colors ${
                isLastOdd ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <PlatformIcon platform={p.id} className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  {p.name}
                </span>
              </div>
              <span className="text-[11px] text-rose-100/60 mt-0.5 truncate">
                {p.detail}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
