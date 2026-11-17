import { Instagram, Film, Video, Twitter, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

export function PlatformChips() {
  const platforms = [
    {
      name: 'TikTok',
      detail: 'No watermark HD',
      icon: Film,
      color: 'text-cyan-400',
    },
    {
      name: 'Instagram',
      detail: 'Reels & audio',
      icon: Instagram,
      color: 'text-pink-400',
    },
    {
      name: 'Facebook',
      detail: 'Reels & clips',
      icon: Video,
      color: 'text-blue-400',
    },
    {
      name: 'X / Twitter',
      detail: 'High bitrate MP4',
      icon: Twitter,
      color: 'text-sky-400',
    },
    {
      name: 'Reddit & Direct',
      detail: 'MP4, WEBM, streams',
      icon: MessageSquare,
      color: 'text-orange-400',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-3xl mx-auto mt-6"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-white/[0.09] rounded-2xl border border-pink-400/25 bg-[#191C26]/90 overflow-hidden shadow-lg shadow-black/25">
        {platforms.map((p, idx) => {
          const Icon = p.icon;
          const isLastOdd = idx === platforms.length - 1;
          return (
            <div
              key={p.name}
              className={`flex flex-col px-3.5 py-3 transition-colors hover:bg-pink-400/[0.08] ${
                isLastOdd ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${p.color}`} />
                <span className="text-xs font-semibold text-zinc-100 truncate">
                  {p.name}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {p.detail}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
