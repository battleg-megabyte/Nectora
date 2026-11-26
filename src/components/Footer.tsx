import { MouseEvent } from 'react';
import { Layers, CheckCircle2, Cpu } from 'lucide-react';
import { WukongBrandMark } from './WukongBrandMark';
import { HOMEPAGE_SEO, SEO_NAV_ITEMS } from '../../shared/seoNav';

interface FooterProps {
  onOpenDiagnostics: () => void;
  onOpenBatch: () => void;
  onOpenMcp: () => void;
  onNavigate?: (path: string) => void;
}

export function Footer({
  onOpenDiagnostics,
  onOpenBatch,
  onOpenMcp,
  onNavigate,
}: FooterProps) {
  const platformLinks = SEO_NAV_ITEMS.filter((p) => p.category === 'platform');
  const developerLinks = SEO_NAV_ITEMS.filter((p) => p.category === 'developer');
  const resourceLinks = SEO_NAV_ITEMS.filter(
    (p) => p.category === 'resource' || p.category === 'legal'
  );

  const handleNav = (e: MouseEvent, path: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path);
    }
  };

  return (
    <footer className="w-full border-t border-rose-300/15 bg-[#07020A]/82 backdrop-blur-xl mt-14 sm:mt-20 py-9 sm:py-11">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Brand & Compliance Notice */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
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
            <p className="text-xs text-rose-100/75 leading-relaxed max-w-md">
              A public video and audio extractor for creators, editors, developers, and AI agents.
            </p>
            <p className="text-[11px] text-rose-100/55 max-w-md leading-relaxed">
              {HOMEPAGE_SEO.notice}
            </p>
          </div>

          {/* SEO Crawl Directory Columns */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2.5">
              <p className="font-semibold uppercase tracking-wider text-rose-200/85 text-[11px]">
                Downloaders
              </p>
              <ul className="space-y-2 text-rose-100/75">
                <li>
                  <a
                    href="/"
                    onClick={(e) => handleNav(e, '/')}
                    className="hover:text-white transition-colors"
                  >
                    MP4 Video Extractor
                  </a>
                </li>
                {platformLinks.map((p) => (
                  <li key={p.path}>
                    <a
                      href={p.path}
                      onClick={(e) => handleNav(e, p.path)}
                      className="hover:text-white transition-colors"
                    >
                      {p.navLabel}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2.5">
              <p className="font-semibold uppercase tracking-wider text-rose-200/85 text-[11px]">
                Developers &amp; AI
              </p>
              <ul className="space-y-2 text-rose-100/75">
                {developerLinks.map((p) => (
                  <li key={p.path}>
                    <a
                      href={p.path}
                      onClick={(e) => handleNav(e, p.path)}
                      className="hover:text-white transition-colors"
                    >
                      {p.navLabel}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="/openapi.json" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    OpenAPI 3.1 JSON
                  </a>
                </li>
                <li>
                  <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    /llms.txt Spec
                  </a>
                </li>
                <li>
                  <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    XML Sitemap
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5 col-span-2 sm:col-span-1">
              <p className="font-semibold uppercase tracking-wider text-rose-200/85 text-[11px]">
                Resources &amp; Trust
              </p>
              <ul className="space-y-2 text-rose-100/75">
                {resourceLinks.map((p) => (
                  <li key={p.path}>
                    <a
                      href={p.path}
                      onClick={(e) => handleNav(e, p.path)}
                      className="hover:text-white transition-colors"
                    >
                      {p.navLabel}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Unboxed Utility Action Strip */}
        <div className="pt-5 border-t border-rose-300/15 flex flex-wrap items-center justify-between gap-4">
          <span className="text-[11px] text-rose-100/55">
            WuKong Vid · Creator, Developer &amp; MCP Extraction Platform
          </span>
          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-rose-100/80">
            <button
              type="button"
              onClick={onOpenBatch}
              className="flex items-center gap-1.5 py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-rose-400" />
              <span>Batch Queue</span>
            </button>
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="flex items-center gap-1.5 py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-pink-400" />
              <span>Stream Check</span>
            </button>
            <button
              type="button"
              onClick={onOpenMcp}
              className="flex items-center gap-1.5 py-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-emerald-300" />
              <span>MCP / API</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
