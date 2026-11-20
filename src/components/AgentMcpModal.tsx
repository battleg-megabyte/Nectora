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
  Sparkles,
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
  tools?: Array<{ name: string; description: string }>;
  error?: string;
}

type ModalTab = 'mcp' | 'api' | 'test';
type ApiPreset = '1080p' | '720p' | 'mp3_320k' | 'm4a_256k';

export function AgentMcpModal({ isOpen, onClose }: AgentMcpModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('mcp');
  const [apiPreset, setApiPreset] = useState<ApiPreset>('1080p');
  const [testState, setTestState] = useState<McpTestState>({ running: false });

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
      : 'https://ais-pre-gcwc4scgts426qmkyughvs-721143561104.europe-west2.run.app';
  const mcpUrl = `${origin}/mcp`;
  const oneStepApiUrl = `${origin}/api/quick-download?url=VIDEO_URL&quality=${apiPreset}`;

  const oneClickAiPrompt = `Use WuKong-Vid MCP at ${mcpUrl} (no auth needed). Call extract_media_streams(url, compact=true) to get fast MP4/MP3/M4A download links, or download in 1 HTTP call via ${origin}/api/quick-download?url=<VIDEO_URL>&quality=1080p (qualities: 1080p, 720p, 480p, 360p, mp3_320k, mp3_192k, mp3_128k, m4a_256k). Note: YouTube URLs are not supported.`;

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
      const initRes = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'wukong-ui-tester', version: '1.0.0' },
          },
        }),
      });
      const initJson = await initRes.json();

      const listRes = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      const listJson = await listRes.json();

      if (!initRes.ok || !listRes.ok || !listJson?.result?.tools) {
        throw new Error('Unexpected MCP server response.');
      }

      setTestState({
        running: false,
        serverName: `${initJson.result?.serverInfo?.name} v${initJson.result?.serverInfo?.version}`,
        protocolVersion: initJson.result?.protocolVersion,
        tools: listJson.result.tools,
      });
    } catch (err: any) {
      setTestState({
        running: false,
        error: err?.message || 'Failed to connect to /mcp endpoint.',
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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-modal-title"
          onClick={onClose}
        >
          <motion.div
            key="mcp-modal-panel"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="w-full max-w-xl max-h-[88dvh] overflow-y-auto wk-box rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-rose-300/20 flex items-center justify-between gap-4 bg-[#0D060C]/90 sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-400/35 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <h2 id="mcp-modal-title" className="font-display font-semibold text-base text-white">
                    1-Click AI &amp; MCP Connect
                  </h2>
                  <p className="text-[11px] text-rose-100/65">
                    Zero API keys · Copy once and paste into any AI assistant
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close MCP modal"
                className="p-2 rounded-lg text-rose-100/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Instant Zero-Friction Action Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/[0.12] via-[#120713] to-pink-500/[0.12] border border-rose-300/35 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-rose-300" />
                    <span>Instant Connect (1 Click)</span>
                  </span>
                  <span className="text-[11px] font-mono text-emerald-300">Open · No Auth</span>
                </div>

                <div className="px-3 py-2 rounded-lg bg-[#070208]/90 border border-rose-300/20 text-xs font-mono text-rose-100/90 truncate select-all">
                  {mcpUrl}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <motion.button
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => handleCopy('ai-prompt', oneClickAiPrompt)}
                    className="flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 shadow-lg shadow-rose-950/60 cursor-pointer"
                  >
                    {copiedKey === 'ai-prompt' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-200" />
                        <span>Copied AI Prompt!</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Copy Everything for Any AI</span>
                      </>
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => handleCopy('mcp-url', mcpUrl)}
                    className="flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl text-xs font-semibold bg-[#160815] hover:bg-[#230E21] text-white border border-rose-300/30 hover:border-pink-400/60 cursor-pointer"
                  >
                    {copiedKey === 'mcp-url' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>MCP URL Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-rose-300" />
                        <span>Copy MCP URL Only</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Clean Segmented Tabs */}
              <div className="space-y-3">
                <div
                  role="tablist"
                  aria-label="MCP and API options"
                  className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0D060C] border border-rose-300/20"
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
                        className={`relative py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          active ? 'text-white' : 'text-rose-100/60 hover:text-white'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="mcp-modal-tab-bg"
                            transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                            className="absolute inset-0 rounded-lg bg-gradient-to-r from-rose-500/85 to-pink-500/85 border border-white/25"
                          />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'mcp' && (
                    <motion.div
                      key="tab-mcp"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-rose-100/75 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-pink-400" />
                          <span>Paste into Claude Desktop, Cursor, or Windsurf</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleDownloadJson}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#140A13] hover:bg-[#221020] border border-rose-300/25 text-white cursor-pointer"
                          >
                            <Download className="w-3 h-3 text-rose-300" />
                            <span>Save .json</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy('config', clientConfigSnippet)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#140A13] hover:bg-[#221020] border border-rose-300/25 text-white cursor-pointer"
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
                      <pre className="p-3.5 rounded-xl bg-[#070208] border border-rose-300/20 text-xs font-mono text-rose-100/90 overflow-x-auto leading-relaxed">
                        {clientConfigSnippet}
                      </pre>
                    </motion.div>
                  )}

                  {activeTab === 'api' && (
                    <motion.div
                      key="tab-api"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-rose-100/75">Pick preset quality:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              { id: '1080p', label: '1080p MP4' },
                              { id: '720p', label: '720p MP4' },
                              { id: 'mp3_320k', label: 'MP3 320k' },
                              { id: 'm4a_256k', label: 'M4A 256k' },
                            ] as const
                          ).map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setApiPreset(preset.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer transition-colors ${
                                apiPreset === preset.id
                                  ? 'bg-rose-500/25 border-rose-300/70 text-white'
                                  : 'bg-[#140A13] border-rose-300/20 text-rose-100/70 hover:text-white'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[#070208] border border-rose-300/20 space-y-2.5">
                        <p className="text-xs font-mono text-rose-100/90 break-all leading-relaxed">
                          {oneStepApiUrl}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy('quick-api', oneStepApiUrl)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/20 hover:bg-rose-500/35 border border-rose-300/35 text-white cursor-pointer"
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
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="p-4 rounded-xl bg-[#0D060C] border border-rose-300/20 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-white">Verify Live /mcp Server</p>
                          <p className="text-[11px] text-rose-100/65">
                            Runs real <code className="text-rose-300">initialize</code> + <code className="text-rose-300">tools/list</code>
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={testState.running}
                          onClick={handleTestLiveMcp}
                          className="flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-lg text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white border border-white/25 cursor-pointer disabled:opacity-60"
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
                        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                          {testState.error}
                        </p>
                      )}

                      {testState.tools && (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-emerald-300">
                            <span>{testState.serverName} · Connected</span>
                            <span>{testState.tools.length} tools ready</span>
                          </div>
                          <div className="divide-y divide-rose-300/15 rounded-lg border border-rose-300/20 bg-[#070208] overflow-hidden">
                            {testState.tools.map((tool) => (
                              <div key={tool.name} className="px-3 py-2">
                                <p className="text-xs font-mono font-semibold text-rose-300">{tool.name}</p>
                                <p className="text-[11px] text-rose-100/70 mt-0.5 leading-snug">
                                  {tool.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quiet Developer Spec Footer */}
              <div className="pt-2 border-t border-rose-300/15 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-100/60">
                <span>Advanced specs:</span>
                <div className="flex items-center gap-3 font-mono">
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
