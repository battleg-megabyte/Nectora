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

function attachGlobalAudioUnlocker(): void {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    void loadSoundBuffer('welcome');
    void loadSoundBuffer('extraction');
  };

  window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  window.addEventListener('touchstart', unlock, { passive: true, capture: true });
  window.addEventListener('keydown', unlock, { passive: true, capture: true });
}

async function loadSoundBuffer(kind: SoundKind): Promise<AudioBuffer | null> {
  if (decodedBuffers[kind]) return decodedBuffers[kind]!;
  if (bufferLoads[kind]) return bufferLoads[kind]!;

  const url = kind === 'welcome' ? WELCOME_SOUND_URL : EXTRACTION_SOUND_URL;
  const ctx = getAudioContext();
  if (!ctx || typeof fetch !== 'function') return null;

  const loader = (async () => {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) return null;
      const arr = await res.arrayBuffer();
      if (arr.byteLength < 64) return null;
      const decoded = await ctx.decodeAudioData(arr);
      decodedBuffers[kind] = decoded;
      return decoded;
    } catch {
      return null;
    }
  })();

  bufferLoads[kind] = loader;
  return loader;
}

function ensureAudio(kind: SoundKind): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (kind === 'welcome') {
    if (!welcomeAudio) {
      welcomeAudio = new Audio(WELCOME_SOUND_URL);
      welcomeAudio.preload = 'auto';
      welcomeAudio.volume = 0.9;
      welcomeAudio.setAttribute('playsinline', 'true');
    }
    return welcomeAudio;
  }
  if (!extractionAudio) {
    extractionAudio = new Audio(EXTRACTION_SOUND_URL);
    extractionAudio.preload = 'auto';
    extractionAudio.volume = 0.9;
    extractionAudio.setAttribute('playsinline', 'true');
  }
  return extractionAudio;
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

function playSynthFallback(ctx: AudioContext, kind: SoundKind): boolean {
  if (ctx.state !== 'running') return false;
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0008, now + (kind === 'welcome' ? 1.1 : 0.45));
    master.connect(ctx.destination);

    const notes = kind === 'welcome' ? [261.63, 329.63, 392.0, 523.25] : [392.0, 523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      osc.connect(master);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + (kind === 'welcome' ? 0.75 : 0.3));
    });
    return true;
  } catch {
    return false;
  }
}

async function playKind(kind: SoundKind): Promise<boolean> {
  if (!soundEnabled) return false;
  attachGlobalAudioUnlocker();

  // Stop the opposite track cleanly
  if (kind === 'welcome') {
    stopExtractionSound();
  } else {
    stopWelcomeSound();
  }

  // Path 1: Web Audio API decoded buffer (rock-solid in iframes & desktop/mobile once unlocked)
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }

    if (ctx.state === 'running') {
      const buffer = decodedBuffers[kind] || (await loadSoundBuffer(kind));
      if (buffer) {
        try {
          stopBufferPlayback();
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = 0.88;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.onended = () => {
            if (activeBufferSource?.node === source) {
              activeBufferSource = null;
            }
          };
          source.start(0);
          activeBufferSource = { kind, node: source };
          return true;
        } catch {}
      }
    }
  }

  // Path 2: HTMLAudioElement playback fallback
  const audio = ensureAudio(kind);
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch {}
  }

  // Path 3: Synthesized chime if AudioContext is running even when file decode isn't ready
  if (ctx && ctx.state === 'running') {
    return playSynthFallback(ctx, kind);
  }

  return false;
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
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }
  listeners.forEach((cb) => cb(soundEnabled));
  return soundEnabled;
}

export async function playWelcomeSound(): Promise<boolean> {
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

export async function playExtractionSound(): Promise<boolean> {
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
