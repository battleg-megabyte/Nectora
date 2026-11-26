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
      : 'http://localhost:3000';

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

  const oneClickAiPrompt = `MCP_ENDPOINT=${origin}/mcp (no auth). Tools: extract_media_streams(url, compact=true, fields=["bestMp4Url","bestMp3Url","oneStepDownloadUrl"]), extract_audio_mp3(url, bitrate="320k"), batch_extract_media(urls). 1-Step HTTP: ${origin}/api/quick-download?url=<URL>&quality=1080p. YouTube URLs excluded.`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-4xl mx-auto space-y-10 pb-10"
    >
      {/* Breadcrumb + Eyebrow */}
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

        <span className="text-[11px] font-mono uppercase tracking-wider text-rose-300/85">
          {page.badgeText}
        </span>
      </div>

      {/* Open Editorial Header (Zero Rectangular Card) */}
      <header className="pb-8 border-b border-rose-300/15 space-y-4">
        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)]">
          {page.h1}
        </h1>
        <h2 className="font-display text-base sm:text-xl font-semibold bg-gradient-to-r from-rose-300 via-pink-200 to-white bg-clip-text text-transparent">
          {page.h2}
        </h2>
        <p className="text-sm sm:text-base text-rose-50/85 leading-relaxed max-w-3xl">
          {page.intro}
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3.5">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/', page.examples?.[0]?.url);
            }}
            className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-full text-xs sm:text-sm font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 transition-all shadow-md shadow-rose-950/50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>
              {page.examples?.[0] ? 'Try Sample in Extractor' : 'Open Media Extractor'}
            </span>
          </a>

          {(page.path === '/mcp' || page.path === '/api') && (
            <>
              <button
                type="button"
                onClick={() => handleCopy('hero-ai-prompt', oneClickAiPrompt)}
                className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-full text-xs sm:text-sm font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 transition-colors cursor-pointer"
              >
                {copiedId === 'hero-ai-prompt' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Copied AI Contract</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-emerald-300" />
                    <span>Copy AI Spec</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    'hero-direct-url',
                    page.path === '/mcp'
                      ? `${origin}/mcp`
                      : `${origin}/api/quick-download?url=VIDEO_URL&quality=1080p`
                  )
                }
                className="inline-flex items-center gap-1.5 py-2 text-xs sm:text-sm font-medium text-rose-200 hover:text-white transition-colors cursor-pointer"
              >
                {copiedId === 'hero-direct-url' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied URL</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-rose-300" />
                    <span>{page.path === '/mcp' ? 'Copy MCP URL' : 'Copy 1-Step API URL'}</span>
                  </>
                )}
              </button>
            </>
          )}

          {page.path === '/mcp' && (
            <button
              type="button"
              onClick={onOpenMcpModal}
              className="inline-flex items-center gap-1.5 py-2 text-xs sm:text-sm font-medium text-rose-200 hover:text-white transition-colors cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-rose-400" />
              <span>MCP Tester</span>
            </button>
          )}

          {(page.path === '/how-it-works' || page.path === '/instagram-reel-downloader') && (
            <button
              type="button"
              onClick={onOpenBatchModal}
              className="inline-flex items-center gap-1.5 py-2 text-xs sm:text-sm font-medium text-rose-200 hover:text-white transition-colors cursor-pointer"
            >
              <span>Open Batch Queue</span>
              <ArrowRight className="w-3.5 h-3.5 text-pink-400" />
            </button>
          )}

          {(page.path === '/mcp' || page.path === '/api') && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-rose-200/80">
              <a
                href="/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-white underline decoration-rose-400/35 underline-offset-4 transition-colors"
              >
                <span>/openapi.json</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-white underline decoration-rose-400/35 underline-offset-4 transition-colors"
              >
                <span>/llms.txt</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Open Hairline Interactive Sample Links */}
      {page.examples && page.examples.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display font-semibold text-base text-white">
            Interactive Sample Links
          </h3>
          <div className="border-t border-b border-rose-300/15 divide-y divide-rose-300/12">
            {page.examples.map((ex) => (
              <div
                key={ex.url}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-white">{ex.label}</p>
                  <p className="text-[11px] font-mono text-rose-200/75 truncate">{ex.url}</p>
                  <p className="text-[11px] text-rose-100/60">{ex.formatSummary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/', ex.url)}
                  className="self-start sm:self-center inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-rose-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-rose-300/20 transition-colors shrink-0 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current text-rose-400" />
                  <span>Extract Link</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open Hairline Editorial & Technical Sections */}
      <div className="divide-y divide-rose-300/15">
        {page.sections.map((section, idx) => (
          <section key={section.heading} className="py-7 first:pt-0 space-y-3.5">
            <h3 className="font-display font-semibold text-lg sm:text-xl text-white">
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
                    <Check className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-1" />
                    <span>{replaceOrigin(bullet)}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.codeBlock && (
              <div className="pt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-rose-200/80">
                    {section.codeBlock.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(`code_${idx}`, section.codeBlock!.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-rose-200/85 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
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
                <pre className="py-4 px-2 border-t border-b border-rose-300/15 bg-[#070208]/60 text-xs font-mono text-rose-100/90 overflow-x-auto leading-relaxed">
                  <code>{replaceOrigin(section.codeBlock.code)}</code>
                </pre>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Open FAQs */}
      {page.faqs.length > 0 && (
        <section className="pt-6 border-t border-rose-300/15 space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-rose-400" />
            <h3 className="font-display font-semibold text-lg text-white">
              Frequently Asked Questions
            </h3>
          </div>
          <div className="divide-y divide-rose-300/15">
            {page.faqs.map((faq) => (
              <div key={faq.question} className="py-4 first:pt-1 last:pb-0 space-y-1.5">
                <h4 className="text-sm font-semibold text-white">{faq.question}</h4>
                <p className="text-xs sm:text-sm text-rose-100/75 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unboxed Notice */}
      <aside className="px-1 pt-5 border-t border-rose-300/15 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-rose-300/75 shrink-0 mt-0.5" />
        <p className="text-xs text-rose-100/65 leading-relaxed">{HOMEPAGE_SEO.notice}</p>
      </aside>

      {/* Open Hairline Related Guides */}
      {relatedPages.length > 0 && (
        <section className="space-y-3 pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-200/80">
            Related Pages &amp; Documentation
          </h3>
          <div className="border-t border-b border-rose-300/15 divide-y divide-rose-300/12">
            {relatedPages.map((rel) => (
              <a
                key={rel.path}
                href={rel.path}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(rel.path);
                }}
                className="py-3.5 px-1 flex items-center justify-between gap-3 group hover:bg-rose-400/[0.04] transition-colors"
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
