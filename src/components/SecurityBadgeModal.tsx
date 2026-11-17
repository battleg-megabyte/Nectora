import { useEffect } from 'react';
import { ShieldCheck, X, Lock, Trash2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SecurityBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SecurityBadgeModal({ isOpen, onClose }: SecurityBadgeModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const features = [
    {
      title: 'SSRF Network Firewall',
      desc: 'Outbound media requests resolve DNS and block loopback (127.0.0.1, ::1), private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), and cloud metadata endpoints.',
      icon: Lock,
      state: 'Active',
    },
    {
      title: 'Ephemeral Processing',
      desc: 'Media streams are proxied in memory chunks or isolated temporary files that expire and sweep automatically.',
      icon: Trash2,
      state: 'Enforced',
    },
    {
      title: 'Filename & Path Sanitization',
      desc: 'Download headers strip control characters, null bytes, and directory traversal sequences before delivery.',
      icon: ShieldCheck,
      state: 'Verified',
    },
    {
      title: 'Sliding-Window Rate Limiting',
      desc: 'Protects extraction endpoints from automated abuse using in-memory token bucket limits.',
      icon: Zap,
      state: 'Enabled',
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
            aria-label="Security Architecture"
            className="relative w-full max-w-2xl max-h-[88vh] bg-[#191C26] rounded-t-3xl sm:rounded-2xl border border-white/[0.14] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-zinc-600" />
            </div>

            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.1]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-300 border border-pink-400/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-base text-white truncate">
                    Security & Privacy Architecture
                  </h3>
                  <p className="text-xs text-zinc-300 truncate">
                    Network isolation and ephemeral media handling
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close security modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
              <div className="rounded-xl border border-white/[0.12] divide-y divide-white/[0.08] bg-[#131620]">
                {features.map((f, idx) => {
                  const Icon = f.icon;
                  return (
                    <div key={idx} className="p-4 flex items-start gap-3.5">
                      <div className="p-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-pink-300 shrink-0 mt-0.5">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold text-white">{f.title}</h4>
                          <span className="text-[11px] font-mono text-emerald-400">
                            {f.state}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{f.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-zinc-300 leading-relaxed px-1">
                <p className="font-semibold text-zinc-100 mb-1">Authorized Content Policy</p>
                <p>
                  NEcTORa processes only publicly accessible media streams that you own or are
                  authorized to download. Private accounts, DRM-protected content, and YouTube URLs
                  are excluded.
                </p>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 pb-safe border-t border-white/[0.1] bg-[#131620] flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 min-h-[42px] rounded-xl text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white transition-all shadow-md shadow-pink-500/20 cursor-pointer"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
