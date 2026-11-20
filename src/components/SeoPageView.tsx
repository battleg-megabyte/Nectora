import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  Info,
  Play,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  HOMEPAGE_SEO,
  SEO_PAGES,
  SeoPageConfig,
} from '../../shared/seoPages';

interface SeoPageViewProps {
  page: SeoPageConfig;
  onNavigate: (path: string, prefillUrl?: string) => void;
  onOpenMcpModal: () => void;
  onOpenBatchModal: () => void;
}

export function SeoPageView({
  page,
  onNavigate,
  onOpenMcpModal,
  onOpenBatchModal,
}: SeoPageViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-pre-gcwc4scgts426qmkyughvs-721143561104.europe-west2.run.app';

  const replaceOrigin = (text: string) => text.split('{{ORIGIN}}').join(origin);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(replaceOrigin(text));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const relatedPages = page.relatedPaths
    .map((rp) => SEO_PAGES.find((p) => p.path === rp))
    .filter((p): p is SeoPageConfig => Boolean(p));

  const oneClickAiPrompt = `Use WuKong-Vid MCP at ${origin}/mcp (no auth needed). Call extract_media_streams(url, compact=true) to get MP4/MP3/M4A download links, or download in 1 HTTP call via ${origin}/api/quick-download?url=<VIDEO_URL>&quality=1080p. Note: YouTube URLs are not supported.`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-4xl mx-auto space-y-7 pb-8"
    >
      {/* Breadcrumb & Back to Extractor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-rose-100/70">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="inline-flex items-center gap-1.5 text-white hover:text-rose-300 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Extractor</span>
          </a>
          <span className="text-rose-300/35" aria-hidden="true">
            /
          </span>
          <span className="text-rose-200 font-medium">{page.navLabel}</span>
        </nav>

        <span className="px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-400/35 text-[11px] font-mono text-rose-200">
          {page.badgeText}
        </span>
      </div>

      {/* Hero Card */}
      <header className="wk-box rounded-2xl p-6 sm:p-8 space-y-4">
        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
          {page.h1}
        </h1>
        <h2 className="font-display text-base sm:text-xl font-semibold bg-gradient-to-r from-rose-300 via-pink-200 to-white bg-clip-text text-transparent">
          {page.h2}
        </h2>
        <p className="text-sm sm:text-base text-rose-50/85 leading-relaxed">
          {page.intro}
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/', page.examples?.[0]?.url);
            }}
            className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-lg text-xs sm:text-sm font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 transition-all shadow-md shadow-rose-950/50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>
              {page.examples?.[0] ? 'Try Sample in Extractor' : 'Open Media Extractor'}
            </span>
          </a>

          {(page.path === '/mcp' || page.path === '/api') && (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => handleCopy('hero-ai-prompt', oneClickAiPrompt)}
                className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-400/45 transition-colors cursor-pointer"
              >
                {copiedId === 'hero-ai-prompt' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Copied Everything for AI!</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-emerald-300" />
                    <span>1-Click Copy for Any AI</span>
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() =>
                  handleCopy(
                    'hero-direct-url',
                    page.path === '/mcp'
                      ? `${origin}/mcp`
                      : `${origin}/api/quick-download?url=VIDEO_URL&quality=1080p`
                  )
                }
                className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/25 hover:border-pink-400/55 transition-colors cursor-pointer"
              >
                {copiedId === 'hero-direct-url' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied URL!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-rose-300" />
                    <span>{page.path === '/mcp' ? 'Copy MCP URL' : 'Copy 1-Step API URL'}</span>
                  </>
                )}
              </motion.button>
            </>
          )}

          {page.path === '/mcp' && (
            <button
              type="button"
              onClick={onOpenMcpModal}
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/25 hover:border-pink-400/55 transition-colors cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-rose-400" />
              <span>Easy Connect Modal</span>
            </button>
          )}

          {(page.path === '/how-it-works' || page.path === '/instagram-reel-downloader') && (
            <button
              type="button"
              onClick={onOpenBatchModal}
              className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-lg text-xs sm:text-sm font-semibold bg-[#140A13] hover:bg-[#221020] text-white border border-rose-300/25 hover:border-pink-400/55 transition-colors cursor-pointer"
            >
              <span>Open Batch Queue</span>
              <ArrowRight className="w-3.5 h-3.5 text-pink-400" />
            </button>
          )}

          {(page.path === '/mcp' || page.path === '/api') && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 min-h-[42px] rounded-lg text-xs font-mono bg-[#0D060C] hover:bg-[#1E0E1C] text-rose-100 border border-rose-300/20"
              >
                <span>/openapi.json</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 min-h-[42px] rounded-lg text-xs font-mono bg-[#0D060C] hover:bg-[#1E0E1C] text-rose-100 border border-rose-300/20"
              >
                <span>/llms.txt</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Live Examples Strip if present */}
      {page.examples && page.examples.length > 0 && (
        <section className="wk-box rounded-2xl p-5 sm:p-6 space-y-3">
          <h3 className="font-display font-semibold text-base text-white">
            Interactive Sample Links
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {page.examples.map((ex) => (
              <div
                key={ex.url}
                className="p-4 rounded-xl wk-box-well flex flex-col justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-semibold text-white">{ex.label}</p>
                  <p className="text-[11px] font-mono text-rose-200/75 truncate">{ex.url}</p>
                  <p className="text-[11px] text-rose-100/65">{ex.formatSummary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/', ex.url)}
                  className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/35 text-white border border-rose-400/35 transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current text-rose-300" />
                  <span>Extract This Link</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Editorial & Technical Sections */}
      <div className="space-y-5">
        {page.sections.map((section, idx) => (
          <section key={section.heading} className="wk-box rounded-2xl p-5 sm:p-7 space-y-3.5">
            <h3 className="font-display font-semibold text-lg text-white">
              {section.heading}
            </h3>

            <div className="space-y-2.5 text-sm text-rose-50/85 leading-relaxed">
              {section.paragraphs.map((p) => (
                <p key={p}>{replaceOrigin(p)}</p>
              ))}
            </div>

            {section.bullets && section.bullets.length > 0 && (
              <ul className="space-y-2 pt-1 text-xs sm:text-sm text-rose-100/85">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-sm bg-rose-400 shrink-0 mt-2" />
                    <span>{replaceOrigin(bullet)}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.codeBlock && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-rose-200/80">
                    {section.codeBlock.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(`code_${idx}`, section.codeBlock!.code)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#140A13] hover:bg-[#221020] border border-rose-300/25 text-white transition-colors cursor-pointer"
                  >
                    {copiedId === `code_${idx}` ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-[#070208] border border-rose-300/20 text-xs font-mono text-rose-100/90 overflow-x-auto leading-relaxed">
                  <code>{replaceOrigin(section.codeBlock.code)}</code>
                </pre>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* FAQs */}
      {page.faqs.length > 0 && (
        <section className="wk-box rounded-2xl p-5 sm:p-7 space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-rose-400" />
            <h3 className="font-display font-semibold text-lg text-white">
              Frequently Asked Questions
            </h3>
          </div>
          <div className="divide-y divide-rose-300/15">
            {page.faqs.map((faq) => (
              <div key={faq.question} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                <h4 className="text-sm font-semibold text-white">{faq.question}</h4>
                <p className="text-xs sm:text-sm text-rose-100/75 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Neutral Zero-Liability Notice */}
      <aside className="p-4 rounded-xl wk-box-well flex items-start gap-3">
        <Info className="w-4 h-4 text-rose-300/80 shrink-0 mt-0.5" />
        <p className="text-xs text-rose-100/75 leading-relaxed">{HOMEPAGE_SEO.notice}</p>
      </aside>

      {/* Related Guides */}
      {relatedPages.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-200/80">
            Related Pages &amp; Documentation
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedPages.map((rel) => (
              <a
                key={rel.path}
                href={rel.path}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(rel.path);
                }}
                className="p-4 rounded-xl wk-box hover:border-rose-300/55 transition-colors flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white group-hover:text-rose-200 transition-colors">
                    {rel.navLabel}
                  </p>
                  <p className="text-[11px] text-rose-100/65 truncate mt-0.5">{rel.h2}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-rose-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </a>
            ))}
          </div>
        </section>
      )}
    </motion.article>
  );
}
