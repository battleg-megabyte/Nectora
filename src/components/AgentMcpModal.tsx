import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Copy,
  Check,
  Cpu,
  ExternalLink,
  Play,
  Loader2,
  Server,
  Download,
  Zap,
  Terminal,
} from 'lucide-react';

interface AgentMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface McpTestState {
  running: boolean;
  serverName?: string;
  protocolVersion?: string;
  templateCount?: number;
  tools?: Array<{ name: string; description: string }>;
  error?: string;
}

interface McpExtractTestState {
  running: boolean;
  elapsedMs?: number;
  result?: {
    platform?: string;
    title?: string;
    hasVideo?: boolean;
    hasAudio?: boolean;
    bestMp4Url?: string | null;
    bestMp3Url?: string | null;
  };
  error?: string;
}

type ModalTab = 'mcp' | 'api' | 'test';
type ApiPreset = '1080p' | '720p' | '480p' | '360p' | 'mp3_320k' | 'mp3_128k' | 'm4a_256k';

export function AgentMcpModal({ isOpen, onClose }: AgentMcpModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('mcp');
  const [apiPreset, setApiPreset] = useState<ApiPreset>('1080p');
  const [testState, setTestState] = useState<McpTestState>({ running: false });
  const [testMediaUrl, setTestMediaUrl] = useState('https://www.w3schools.com/html/mov_bbb.mp4');
  const [extractTestState, setExtractTestState] = useState<McpExtractTestState>({ running: false });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';
  const mcpUrl = `${origin}/mcp`;
  const oneStepApiUrl = `${origin}/api/quick-download?url=VIDEO_URL&quality=${apiPreset}`;

  const oneClickAiPrompt = `MCP_ENDPOINT=${mcpUrl} (zero auth, Streamable HTTP 2025-03-26, v1.4.0). Tools: inspect_url_platform(url), extract_media_streams(url, compact=true, fields=["platform","bestMp4Url","bestMp3Url","oneStepDownloadUrl"]), extract_audio_mp3(url, bitrate="320k"), batch_extract_media(urls). Templates: wukong://extract/{url}. 1-Step HTTP: ${origin}/api/quick-download?url=<URL>&quality=1080p. Excluded: youtube.`;

  const clientConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        'wukong-vid': {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  );

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {}
  };

  const handleDownloadJson = () => {
    const blob = new Blob([clientConfigSnippet], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wukong-vid-mcp.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleTestLiveMcp = async () => {
    setTestState({ running: true });
    try {
      const [initRes, listRes, tplRes] = await Promise.all([
        fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: { name: 'wukong-ui-tester', version: '1.4.0' },
            },
          }),
        }),
        fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        }),
        fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'resources/templates/list',
            params: {},
          }),
        }),
      ]);

      const [initJson, listJson, tplJson] = await Promise.all([
        initRes.json(),
        listRes.json(),
        tplRes.json(),
      ]);

      if (!initRes.ok || !listRes.ok || !listJson?.result?.tools) {
        throw new Error('Unexpected MCP server response.');
      }

      setTestState({
        running: false,
        serverName: `${initJson.result?.serverInfo?.name} v${initJson.result?.serverInfo?.version}`,
        protocolVersion: initJson.result?.protocolVersion,
        templateCount: Array.isArray(tplJson?.result?.resourceTemplates)
          ? tplJson.result.resourceTemplates.length
          : 0,
        tools: listJson.result.tools,
      });
    } catch (err: any) {
      setTestState({
        running: false,
        error: err?.message || 'Failed to connect to /mcp endpoint.',
      });
    }
  };

  const handleRunMcpExtractTest = async () => {
    const clean = testMediaUrl.trim();
    if (!clean) return;
    setExtractTestState({ running: true });
    const started = performance.now();
    try {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'extract_media_streams',
            arguments: {
              url: clean,
              compact: true,
              fields: ['platform', 'title', 'hasVideo', 'hasAudio', 'bestMp4Url', 'bestMp3Url'],
            },
          },
        }),
      });
      const json = await res.json();
      const elapsedMs = Math.round(performance.now() - started);
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || 'MCP extraction call failed.');
      }
      if (json?.result?.isError) {
        const errPayload = json.result?.structuredContent;
        throw new Error(errPayload?.error || json.result?.content?.[0]?.text || 'Extraction error.');
      }
      const sc = json?.result?.structuredContent || {};
      setExtractTestState({
        running: false,
        elapsedMs,
        result: {
          platform: sc.platform,
          title: sc.title,
          hasVideo: sc.hasVideo,
          hasAudio: sc.hasAudio,
          bestMp4Url: sc.bestMp4Url,
          bestMp3Url: sc.bestMp3Url,
        },
      });
    } catch (err: any) {
      setExtractTestState({
        running: false,
        error: err?.message || 'MCP extraction test failed.',
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mcp-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-modal-title"
          onClick={onClose}
        >
          <motion.div
            key="mcp-modal-panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xl max-h-[88dvh] overflow-y-auto wk-sheet rounded-t-[36px] sm:rounded-[32px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-rose-300/35" />
            </div>

            {/* Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-rose-300/15 flex items-center justify-between gap-4 bg-[#0D060C]/85 sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <h2 id="mcp-modal-title" className="font-display font-semibold text-base text-white">
                    AI-First MCP &amp; API
                  </h2>
                  <p className="text-[11px] text-rose-100/65">
                    Zero API keys · Streamable HTTP MCP v1.4.0 for autonomous agents
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close MCP modal"
                className="w-9 h-9 rounded-full flex items-center justify-center text-rose-100/65 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Instant Zero-Friction Action Strip */}
              <div className="space-y-3 pb-5 border-b border-rose-300/15">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-rose-300" />
                    <span>MCP Endpoint</span>
                  </span>
                  <span className="text-[11px] font-mono text-emerald-300">Open · Zero Auth</span>
                </div>

                <p className="text-xs font-mono text-rose-100/90 truncate select-all">
                  {mcpUrl}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopy('ai-prompt', oneClickAiPrompt)}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-full text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 shadow-lg shadow-rose-950/60 cursor-pointer"
                  >
                    {copiedKey === 'ai-prompt' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-200" />
                        <span>Copied AI Contract</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Copy Machine Contract for AI</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy('mcp-url', mcpUrl)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-rose-200 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    {copiedKey === 'mcp-url' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied URL</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-rose-300" />
                        <span>Copy MCP URL</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Borderless Underline Tabs */}
              <div className="space-y-3">
                <div
                  role="tablist"
                  aria-label="MCP and API options"
                  className="flex items-center gap-6 border-b border-rose-300/15"
                >
                  {[
                    { id: 'mcp' as const, label: 'MCP JSON' },
                    { id: 'api' as const, label: '1-Step API' },
                    { id: 'test' as const, label: 'Live Test' },
                  ].map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={active}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                          active ? 'text-white' : 'text-rose-100/55 hover:text-white'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {active && (
                          <motion.span
                            layoutId="mcp-modal-underline"
                            transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                            className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-rose-400 to-pink-400 rounded-full"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'mcp' && (
                    <motion.div
                      key="tab-mcp"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                      className="space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-rose-100/75 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-pink-400" />
                          <span>Client MCP Config</span>
                        </span>
                        <div className="flex items-center gap-4 text-[11px] font-medium text-rose-200">
                          <button
                            type="button"
                            onClick={handleDownloadJson}
                            className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                          >
                            <Download className="w-3 h-3 text-rose-300" />
                            <span>Save .json</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy('config', clientConfigSnippet)}
                            className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                          >
                            {copiedKey === 'config' ? (
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
                      </div>
                      <pre className="py-3.5 px-2 border-t border-b border-rose-300/15 bg-[#070208]/60 text-xs font-mono text-rose-100/90 overflow-x-auto leading-relaxed">
                        {clientConfigSnippet}
                      </pre>
                    </motion.div>
                  )}

                  {activeTab === 'api' && (
                    <motion.div
                      key="tab-api"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center gap-4 border-b border-rose-300/15 pb-2">
                        {(
                          [
                            { id: '1080p', label: '1080p' },
                            { id: '720p', label: '720p' },
                            { id: '480p', label: '480p' },
                            { id: '360p', label: '360p' },
                            { id: 'mp3_320k', label: 'MP3 320k' },
                            { id: 'mp3_128k', label: 'MP3 128k' },
                            { id: 'm4a_256k', label: 'M4A 256k' },
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setApiPreset(preset.id)}
                            className={`text-[11px] font-mono cursor-pointer transition-colors ${
                              apiPreset === preset.id
                                ? 'text-white font-semibold underline decoration-rose-400 underline-offset-4'
                                : 'text-rose-100/55 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="py-3.5 px-2 border-t border-b border-rose-300/15 bg-[#070208]/60 space-y-2.5">
                        <p className="text-xs font-mono text-rose-100/90 break-all leading-relaxed">
                          {oneStepApiUrl}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy('quick-api', oneStepApiUrl)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-300 hover:text-white cursor-pointer"
                        >
                          {copiedKey === 'quick-api' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied 1-Step API URL</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy 1-Step API URL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'test' && (
                    <motion.div
                      key="tab-test"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                      className="space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-white">Verify Live /mcp Server</p>
                          <p className="text-[11px] text-rose-100/65">
                            Runs initialize, tools/list, and resources/templates/list RPC calls
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={testState.running}
                          onClick={handleTestLiveMcp}
                          className="flex items-center gap-1.5 px-4 min-h-[38px] rounded-full text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 cursor-pointer disabled:opacity-60"
                        >
                          {testState.running ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>{testState.running ? 'Probing...' : 'Test Now'}</span>
                        </button>
                      </div>

                      {testState.error && (
                        <p className="text-xs text-red-300 border-t border-b border-red-400/30 py-2.5">
                          {testState.error}
                        </p>
                      )}

                      {testState.tools && (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-emerald-300">
                            <span>{testState.serverName} · {testState.protocolVersion}</span>
                            <span>
                              {testState.tools.length} tools · {testState.templateCount || 0} templates
                            </span>
                          </div>
                          <div className="border-t border-rose-300/15 divide-y divide-rose-300/15">
                            {testState.tools.map((tool) => (
                              <div key={tool.name} className="py-2.5">
                                <p className="text-xs font-mono font-semibold text-rose-300">{tool.name}</p>
                                <p className="text-[11px] text-rose-100/70 mt-0.5 leading-snug">
                                  {tool.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live URL Extraction Probe via extract_media_streams */}
                      <div className="pt-4 border-t border-rose-300/15 space-y-2.5">
                        <p className="text-xs font-semibold text-white">
                          Test <span className="font-mono text-rose-300">extract_media_streams</span>
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <input
                            type="url"
                            value={testMediaUrl}
                            onChange={(e) => setTestMediaUrl(e.target.value)}
                            placeholder="https://www.instagram.com/reel/... or TikTok / Facebook URL"
                            aria-label="Test URL for MCP extraction"
                            className="flex-1 min-w-0 bg-transparent border-b border-rose-300/30 focus:border-pink-400 py-2 text-xs font-mono text-white placeholder-rose-100/40 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={extractTestState.running || !testMediaUrl.trim()}
                            onClick={handleRunMcpExtractTest}
                            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[36px] rounded-full text-xs font-semibold text-white bg-white/[0.08] hover:bg-white/[0.15] border border-rose-300/25 cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            {extractTestState.running ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-300" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 text-emerald-300" />
                            )}
                            <span>{extractTestState.running ? 'Extracting...' : 'Extract Test'}</span>
                          </button>
                        </div>

                        {extractTestState.error && (
                          <p className="text-xs text-red-300 border-t border-b border-red-400/30 py-2">
                            {extractTestState.error}
                          </p>
                        )}

                        {extractTestState.result && (
                          <div className="py-2.5 px-1 border-t border-b border-emerald-400/25 text-[11px] font-mono space-y-1">
                            <div className="flex items-center justify-between text-emerald-300">
                              <span className="capitalize">{extractTestState.result.platform} · OK</span>
                              <span>{extractTestState.elapsedMs} ms</span>
                            </div>
                            <p className="text-white truncate">{extractTestState.result.title}</p>
                            <p className="text-rose-200/80">
                              MP4: {extractTestState.result.bestMp4Url ? 'Ready' : 'None'} · MP3:{' '}
                              {extractTestState.result.bestMp3Url ? 'Ready' : 'None'}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quiet Machine Specs Footer */}
              <div className="pt-3 pb-safe border-t border-rose-300/15 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-100/60">
                <span>Machine endpoints:</span>
                <div className="flex items-center gap-4 font-mono">
                  <a href="/openapi.json" target="_blank" rel="noopener noreferrer" className="hover:text-white inline-flex items-center gap-1">
                    <span>/openapi.json</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="hover:text-white inline-flex items-center gap-1">
                    <span>/llms.txt</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <a href="/.well-known/mcp.json" target="_blank" rel="noopener noreferrer" className="hover:text-white inline-flex items-center gap-1">
                    <span>/mcp.json</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
