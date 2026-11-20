export const WELCOME_SOUND_URL = '/assets/aistudio/welcome1_5786a3bf.wav';
export const EXTRACTION_SOUND_URL = '/assets/aistudio/extraction_18070b61.wav';

const SOUND_PREF_KEY = 'wukong_vid_sound_enabled';

type SoundKind = 'welcome' | 'extraction';
type SoundListener = (enabled: boolean) => void;

let welcomeAudio: HTMLAudioElement | null = null;
let extractionAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
const decodedBuffers: Partial<Record<SoundKind, AudioBuffer>> = {};
const bufferLoads: Partial<Record<SoundKind, Promise<AudioBuffer | null>>> = {};
let activeBufferSource: { kind: SoundKind; node: AudioBufferSourceNode } | null = null;
let soundEnabled = true;
let unlockListenersAttached = false;
const listeners = new Set<SoundListener>();

try {
  const saved = typeof window !== 'undefined' ? window.localStorage.getItem(SOUND_PREF_KEY) : null;
  if (saved === 'false') soundEnabled = false;
} catch {}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx = new Ctx();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function getSoundUrl(kind: SoundKind): string {
  return kind === 'welcome' ? WELCOME_SOUND_URL : EXTRACTION_SOUND_URL;
}

function ensureAudio(kind: SoundKind, forceRecreate = false): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (kind === 'welcome') {
    if (!welcomeAudio || forceRecreate || welcomeAudio.error) {
      welcomeAudio = new Audio(WELCOME_SOUND_URL);
      welcomeAudio.preload = 'auto';
      welcomeAudio.volume = 1.0;
      welcomeAudio.muted = false;
      welcomeAudio.setAttribute('playsinline', 'true');
      welcomeAudio.setAttribute('webkit-playsinline', 'true');
    }
    return welcomeAudio;
  }
  if (!extractionAudio || forceRecreate || extractionAudio.error) {
    extractionAudio = new Audio(EXTRACTION_SOUND_URL);
    extractionAudio.preload = 'auto';
    extractionAudio.volume = 1.0;
    extractionAudio.muted = false;
    extractionAudio.setAttribute('playsinline', 'true');
    extractionAudio.setAttribute('webkit-playsinline', 'true');
  }
  return extractionAudio;
}

async function loadSoundBuffer(kind: SoundKind): Promise<AudioBuffer | null> {
  if (decodedBuffers[kind]) return decodedBuffers[kind]!;
  if (bufferLoads[kind]) return bufferLoads[kind]!;

  const url = getSoundUrl(kind);
  const ctx = getAudioContext();
  if (!ctx || typeof fetch !== 'function') return null;

  const loader = (async () => {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) return null;
      const arr = await res.arrayBuffer();
      if (arr.byteLength < 64) return null;
      const decoded = await ctx.decodeAudioData(arr.slice(0));
      decodedBuffers[kind] = decoded;
      return decoded;
    } catch {
      return null;
    }
  })();

  bufferLoads[kind] = loader;
  return loader;
}

export function unlockAudioEngine(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  ensureAudio('welcome');
  ensureAudio('extraction');
  void loadSoundBuffer('welcome');
  void loadSoundBuffer('extraction');
}

function attachGlobalAudioUnlocker(): void {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    unlockAudioEngine();
  };

  window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  window.addEventListener('touchstart', unlock, { passive: true, capture: true });
  window.addEventListener('keydown', unlock, { passive: true, capture: true });
}

function stopBufferPlayback(kind?: SoundKind): void {
  if (!activeBufferSource) return;
  if (kind && activeBufferSource.kind !== kind) return;
  try {
    activeBufferSource.node.stop();
    activeBufferSource.node.disconnect();
  } catch {}
  activeBufferSource = null;
}

function playKind(kind: SoundKind): Promise<boolean> {
  if (!soundEnabled) return Promise.resolve(false);
  attachGlobalAudioUnlocker();

  // Stop the opposite track cleanly so voices never overlap
  if (kind === 'welcome') {
    stopExtractionSound();
  } else {
    stopWelcomeSound();
  }

  // Trigger background unlock + buffer warm-up without awaiting indefinitely
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  void loadSoundBuffer(kind);

  // Path 1: Zero-latency Web Audio playback when Context is already unlocked AND WAV is decoded
  const readyBuffer = decodedBuffers[kind];
  if (ctx && ctx.state === 'running' && readyBuffer) {
    try {
      stopBufferPlayback();
      const source = ctx.createBufferSource();
      source.buffer = readyBuffer;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        if (activeBufferSource?.node === source) {
          activeBufferSource = null;
        }
      };
      source.start(0);
      activeBufferSource = { kind, node: source };
      return Promise.resolve(true);
    } catch {
      // Fall through cleanly to HTMLAudioElement
    }
  }

  // Path 2: Synchronous HTMLAudioElement.play() to preserve mobile/desktop user-gesture tokens
  const audio = ensureAudio(kind);
  if (!audio) return Promise.resolve(false);

  try {
    if (!audio.paused) {
      audio.pause();
    }
    if (audio.readyState > 0) {
      try {
        audio.currentTime = 0;
      } catch {}
    }
    audio.volume = 1.0;
    audio.muted = false;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      return playPromise
        .then(() => true)
        .catch(() => false);
    }
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

export function preloadSoundEffects(): void {
  attachGlobalAudioUnlocker();
  ensureAudio('welcome');
  ensureAudio('extraction');
  void loadSoundBuffer('welcome');
  void loadSoundBuffer('extraction');
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function subscribeSoundEnabled(cb: SoundListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setSoundEnabled(next: boolean): boolean {
  soundEnabled = next;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, next ? 'true' : 'false');
  } catch {}
  if (!next) {
    stopAllSounds();
  } else {
    unlockAudioEngine();
  }
  listeners.forEach((cb) => cb(soundEnabled));
  return soundEnabled;
}

export function playWelcomeSound(): Promise<boolean> {
  return playKind('welcome');
}

export function stopWelcomeSound(): void {
  stopBufferPlayback('welcome');
  if (welcomeAudio) {
    try {
      welcomeAudio.pause();
      welcomeAudio.currentTime = 0;
    } catch {}
  }
}

export function playExtractionSound(): Promise<boolean> {
  return playKind('extraction');
}

export function stopExtractionSound(): void {
  stopBufferPlayback('extraction');
  if (extractionAudio) {
    try {
      extractionAudio.pause();
      extractionAudio.currentTime = 0;
    } catch {}
  }
}

export function stopAllSounds(): void {
  stopWelcomeSound();
  stopExtractionSound();
}
