import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getMusicAudioElement, usePlayerStore, Song } from '../stores/playerStore';
import type { StationMode } from '../stores/playerStore';
import { useChatStore } from '../stores/chatStore';
import { apiClient } from '../api/client';
import { wsClient } from '../api/ws';
import { DotMatrixClock } from '../components/DotMatrixDisplay';
import { ProfileCard } from '../components/ProfileCard';
import { StationSurface } from '../components/StationSurface';
import { GlobalPlayerBar } from '../components/GlobalPlayerBar';

const AI_AVATAR = '/avatars/codex.png';
const USER_AVATAR = '/avatars/me.png';
type ActiveStationMode = Exclude<StationMode, ''>;
type ModePlaylistMap = Record<ActiveStationMode, Song[]>;
type ModeCursorMap = Record<ActiveStationMode, string>;
type RefreshingModeMap = Record<ActiveStationMode, boolean>;

type AlignmentSegment = { text: string; start: number; end: number; words?: AlignmentSegment[] };
type NarrationMessage = {
  id: string;
  content: string;
  ttsUrl?: string;
  alignment?: { segments: AlignmentSegment[] };
  played?: boolean;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function splitNarrationSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[。！？.!?；;])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length > 1) return sentences;
  const chunks = clean.match(/.{1,34}(?:\s|$)/g)?.map((part) => part.trim()).filter(Boolean) || [];
  return chunks.length ? chunks : [clean];
}

function segmentWeight(text: string): number {
  const chars = text.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g)?.length || text.length;
  return Math.max(chars, 6);
}

function buildSentenceSegments(text: string, targetDuration = 0): AlignmentSegment[] {
  const sentences = splitNarrationSentences(text);
  const totalWeight = sentences.reduce((sum, sentence) => sum + segmentWeight(sentence), 0) || 1;
  const duration = Math.max(targetDuration, totalWeight * 0.18, 1);
  let cursor = 0;
  return sentences.map((sentence, i) => {
    const isLast = i === sentences.length - 1;
    const length = isLast ? duration - cursor : duration * (segmentWeight(sentence) / totalWeight);
    const start = cursor;
    const end = isLast ? duration : cursor + length;
    cursor = end;
    return {
      text: sentence,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
    };
  });
}

/**
 * Split text into word-like tokens.  Each CJK character is its own token;
 * Latin / number runs are kept together; everything else is a token.
 * NEVER use provider alignment text — only split the original say text.
 */
function tokenizeSentence(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/[一-鿿㐀-䶿]/.test(ch)) {
      tokens.push(ch); // each CJK char is its own word-level token
      i++;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[a-zA-Z0-9]/.test(text[j])) j++;
      tokens.push(text.slice(i, j));
      i = j;
    } else {
      tokens.push(ch); // punctuation / whitespace / symbol
      i++;
    }
  }
  return tokens.length ? tokens : [text];
}

/**
 * Distribute a sentence's time range evenly across its tokens.
 * Only the TIMING is estimated; the text is always from tokenizeSentence
 * which splits the ORIGINAL say text — never from provider alignment.
 */
function estimateWords(sentence: AlignmentSegment): AlignmentSegment[] {
  const tokens = tokenizeSentence(sentence.text);
  if (tokens.length <= 1) return [];
  const slot = (sentence.end - sentence.start) / tokens.length;
  return tokens.map((t, i) => ({
    text: t,
    start: Math.round((sentence.start + i * slot) * 1000) / 1000,
    end: Math.round((sentence.start + (i + 1) * slot) * 1000) / 1000,
  }));
}

/**
 * Build the two-layer subtitle structure:
 *
 *   sentences[i] = { text (from say), start, end, words[] (from say) }
 *
 * Provider alignment (Fish Audio) is ONLY used to rescale sentence-level
 * start/end times into the provider's clock range.  It is NEVER used as
 * a source of display text.
 */
function fitSegmentsToDuration(
  aligned: AlignmentSegment[],
  sayText: string,
  audioDurationSec: number,
): AlignmentSegment[] {
  // Layer 1: sentences — always from say text
  const sentences = buildSentenceSegments(sayText, audioDurationSec);

  // Layer 2: if provider alignment exists, use its clock range to rescale
  // sentence boundaries so the clock matches the actual audio playback.
  if (aligned.length > 0) {
    const pStart = aligned[0].start;
    const pEnd = aligned[aligned.length - 1].end;
    const pRange = pEnd - pStart;
    if (pRange > 0) {
      const totalW = sentences.reduce((sum, s) => sum + segmentWeight(s.text), 0) || 1;
      let cursor = 0;
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        const w = segmentWeight(s.text);
        const slot = i === sentences.length - 1 ? pRange - cursor : (w / totalW) * pRange;
        s.start = Math.round((pStart + cursor) * 1000) / 1000;
        s.end = Math.round((pStart + cursor + Math.max(slot, 0.1)) * 1000) / 1000;
        cursor += slot;
      }
    }
  }

  // Layer 3: words — always tokenized from sentence.text (original say).
  // Provider alignment NEVER contributes display text.
  for (const s of sentences) {
    s.words = estimateWords(s);
  }

  return sentences;
}

function buildFallbackSegments(text: string, targetDuration = 0): AlignmentSegment[] {
  return fitSegmentsToDuration([], text, targetDuration);
}

function scrollTranscriptTo(transcript: HTMLDivElement, top: number) {
  const nextTop = Math.max(0, top);
  if (typeof transcript.scrollTo === 'function') {
    transcript.scrollTo({ top: nextTop, behavior: 'smooth' });
    return;
  }
  transcript.scrollTop = nextTop;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function trackPctFromClientX(track: HTMLElement, clientX: number) {
  const rect = track.getBoundingClientRect();
  return clamp01((clientX - rect.left) / Math.max(1, rect.width));
}

function startTrackDrag(e: ReactPointerEvent<HTMLDivElement>, onChange: (pct: number) => void) {
  e.preventDefault();
  const track = e.currentTarget;
  const pointerId = e.pointerId;
  const update = (clientX: number) => onChange(trackPctFromClientX(track, clientX));

  update(e.clientX);
  track.setPointerCapture?.(pointerId);

  const onMove = (event: PointerEvent) => update(event.clientX);
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
    track.releasePointerCapture?.(pointerId);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
}

function emptyModePlaylists(): ModePlaylistMap {
  return {
    aidj: [],
    'random-infinite': [],
    'focus-cafe': [],
    'focus-library': [],
  };
}

function emptyModeCursors(): ModeCursorMap {
  return {
    aidj: '',
    'random-infinite': '',
    'focus-cafe': '',
    'focus-library': '',
  };
}

function emptyRefreshingModes(): RefreshingModeMap {
  return {
    aidj: false,
    'random-infinite': false,
    'focus-cafe': false,
    'focus-library': false,
  };
}

function mapStationSongs(songs: any[]): Song[] {
  return (songs || []).map((s: any) => ({
    song_id: s.id,
    song_name: s.name,
    artist: s.artist,
    coverUrl: s.coverUrl,
    url: s.url,
  }));
}

function SpeakingOverlay({
  open,
  narration,
  song,
  playlistCount,
  musicPlaying,
  musicProgressMs,
  musicDurationMs,
  narrationPlaying,
  narrationTimeMs,
  narrationDurationMs,
  onToggleMusic,
  onSeekMusic,
  onToggleNarration,
  onOpenProfile,
  onClose,
}: {
  open: boolean;
  narration: NarrationMessage | null;
  song: Song | null;
  playlistCount: number;
  musicPlaying: boolean;
  musicProgressMs: number;
  musicDurationMs: number;
  narrationPlaying: boolean;
  narrationTimeMs: number;
  narrationDurationMs: number;
  onToggleMusic: () => void;
  onSeekMusic: (pct: number) => void;
  onToggleNarration: () => void;
  onOpenProfile: () => void;
  onClose: () => void;
}) {
  const heroCanvasRef = useRef<HTMLCanvasElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const musicStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const time = Math.max(0, narrationTimeMs / 1000);
  const duration = Math.max(0, narrationDurationMs / 1000);
  const narrationPct = narrationDurationMs > 0 ? Math.min(100, (narrationTimeMs / narrationDurationMs) * 100) : 0;
  const statusText = narrationPlaying ? 'Speaking...' : musicPlaying ? 'Playing...' : 'Paused';

  const segments = useMemo(() => {
    const aligned = narration?.alignment?.segments || [];
    const fallbackText = narration?.content || 'It is late on a Monday, and here is a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper. You will feel yourself lift off the ground a little.';
    return fitSegmentsToDuration(aligned, fallbackText, duration);
  }, [narration, duration]);
  const sentenceIdx = segments.findIndex((s) => time >= s.start && time < s.end);
  const currentIndex = sentenceIdx >= 0 ? sentenceIdx
    : time <= 0 ? 0
    : segments.length > 0 ? segments.length - 1
    : -1;

  // Current sentence's words
  const currentWords: AlignmentSegment[] = currentIndex >= 0 ? (segments[currentIndex]?.words || []) : [];

  // Clamped word index: never -1, never flickers away
  const currentWordIndex = (() => {
    if (!currentWords.length) return -1;
    // Find last word where time >= word.start
    let idx = -1;
    for (let i = 0; i < currentWords.length; i++) {
      if (time >= currentWords[i].start) idx = i;
    }
    if (idx < 0) return 0;                             // before first word → first
    if (time >= currentWords[currentWords.length - 1].end) return currentWords.length - 1; // past last → last
    return idx;
  })();

  // ── highlight pill ──
  const [pillRect, setPillRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const currentWordKey = currentIndex >= 0 && currentWordIndex >= 0 && currentWords[currentWordIndex]
    ? `${currentIndex}-${currentWordIndex}`
    : '';

  useEffect(() => {
    if (!open || !currentWordKey || currentIndex < 0) { setPillRect(null); return; }
    const lineEl = transcriptRef.current?.querySelector<HTMLElement>('.speaking-line.is-current');
    if (!lineEl) { setPillRect(null); return; }
    const wordEl = lineEl.querySelector<HTMLElement>(`[data-word-key="${currentWordKey}"]`);
    if (!wordEl) { setPillRect(null); return; }
    const lineRect = lineEl.getBoundingClientRect();
    const wordRect = wordEl.getBoundingClientRect();
    setPillRect({
      x: wordRect.left - lineRect.left,
      y: wordRect.top - lineRect.top,
      w: wordRect.width,
      h: wordRect.height,
    });
  }, [open, currentWordKey, currentIndex, narrationTimeMs]);

  const currentWord = currentWordIndex >= 0 ? currentWords[currentWordIndex] : null;

  // debug log
  if (open && currentWord) {
    console.log(
      `[sub] time=${time.toFixed(2)}s sentence=${currentIndex} word=${currentWordIndex} ` +
      `"${currentWord.text}" [${currentWord.start.toFixed(2)}-${currentWord.end.toFixed(2)}]`
    );
  }

  useEffect(() => {
    if (!open) return;

    const disconnectMusicAnalyser = () => {
      try { musicStreamSourceRef.current?.disconnect(); } catch { /* already disconnected */ }
      musicStreamSourceRef.current = null;
      analyserRef.current = null;
    };

    const setupAudio = () => {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!contextRef.current) contextRef.current = new AudioContextCtor();
      const ctx = contextRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const musicAudio = getMusicAudioElement();
      disconnectMusicAnalyser();
      if (musicAudio) {
        try {
          const streamFactory = (musicAudio as HTMLAudioElement & {
            captureStream?: () => MediaStream;
            mozCaptureStream?: () => MediaStream;
          }).captureStream || (musicAudio as HTMLAudioElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
          const stream = streamFactory?.call(musicAudio);
          if (!stream) return;
          analyserRef.current = ctx.createAnalyser();
          analyserRef.current.fftSize = 512;
          analyserRef.current.smoothingTimeConstant = 0.58;
          musicStreamSourceRef.current = ctx.createMediaStreamSource(stream);
          musicStreamSourceRef.current.connect(analyserRef.current);
        } catch {
          musicStreamSourceRef.current = null;
          analyserRef.current = null;
        }
      }
    };
    setupAudio();
    return disconnectMusicAnalyser;
  }, [open, song?.song_id, musicPlaying]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const draw = () => {
      try {
        const analyser = analyserRef.current;
        const data = new Uint8Array(analyser?.frequencyBinCount || 128);
        if (analyser) analyser.getByteFrequencyData(data);

        const paint = (canvas: HTMLCanvasElement | null) => {
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const nextWidth = Math.floor(rect.width * dpr);
          const nextHeight = Math.floor(rect.height * dpr);
          if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
            canvas.width = nextWidth;
            canvas.height = nextHeight;
          }
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, rect.width, rect.height);
          const now = performance.now() / 1000;
          const count = Math.max(72, Math.floor(rect.width / 5.4));
          const groupCount = 28;
          const minBin = Math.min(2, Math.max(0, data.length - 1));
          const maxBin = Math.max(minBin + 1, Math.floor(data.length * 0.72));
          const readEnergy = (startRatio: number, endRatio: number) => {
            const start = Math.floor(minBin + Math.pow(startRatio, 1.72) * (maxBin - minBin));
            const end = Math.max(start + 1, Math.floor(minBin + Math.pow(endRatio, 1.72) * (maxBin - minBin)));
            let sum = 0;
            for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
              sum += data[sampleIndex] || 0;
            }
            const raw = analyser ? sum / Math.max(1, end - start) / 255 : 0;
            return Math.min(1, Math.pow(raw, 0.58) * 1.95);
          };
          const groupEnergies = Array.from({ length: groupCount }, (_, groupIndex) => {
            return readEnergy(groupIndex / groupCount, (groupIndex + 1) / groupCount);
          });
          const bassEnergy = readEnergy(0.02, 0.18);
          const midEnergy = readEnergy(0.18, 0.56);
          const edgeDrive = Math.max(0.26, bassEnergy * 0.62 + midEnergy * 0.38);
          const baseLevel = musicPlaying ? 0.32 : 0.28;
          const gap = rect.width / count;
          const barW = Math.max(2, gap * 0.48);
          for (let i = 0; i < count; i++) {
            const visualPosition = i / Math.max(1, count - 1);
            const musicalPosition = Math.pow(visualPosition, 0.82) * (groupCount - 1);
            const position = Math.min(groupCount - 1, musicalPosition);
            const leftGroup = Math.floor(position);
            const rightGroup = Math.min(groupCount - 1, leftGroup + 1);
            const mix = position - leftGroup;
            const directEnergy = groupEnergies[leftGroup] * (1 - mix) + groupEnergies[rightGroup] * mix;
            const edgeWeight = Math.pow(Math.abs(visualPosition - 0.5) * 2, 1.45);
            const groupedEnergy = directEnergy * (1 - edgeWeight * 0.42) + edgeDrive * edgeWeight * 0.58;
            const phrase = Math.floor(i / 5);
            const baseWave = 0.82 + Math.sin(phrase * 0.55 + now * 2.1) * 0.11;
            const localWave = 0.94 + Math.sin(i * 0.18 + now * 1.35) * 0.055;
            const shape = 0.66 + 0.34 * Math.pow(Math.sin(visualPosition * Math.PI), 0.85);
            const groupedPulse = 0.94 + Math.sin(Math.floor(i / 6) * 0.72 + now * (2.05 + edgeDrive * 1.3)) * (0.055 + edgeDrive * 0.085);
            const energy = Math.max(baseLevel, groupedEnergy) * baseWave * localWave * groupedPulse;
            const h = Math.max(34, energy * rect.height * shape);
            const x = i * gap;
            const y = rect.height - h;
            ctx.fillStyle = '#F9FAFB';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, barW, h, barW / 2);
            } else {
              ctx.rect(x, y, barW, h);
            }
            ctx.fill();
          }
        };

        paint(heroCanvasRef.current);
      } catch (err) {
        console.warn('[SpeakingOverlay] spectrum draw skipped', err);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [open, musicPlaying, time, duration]);

  useEffect(() => {
    if (!open || currentIndex < 0) return;
    const transcript = transcriptRef.current;
    const currentLine = transcript?.querySelector<HTMLElement>('.speaking-line.is-current');
    if (!transcript || !currentLine) return;
    const targetTop = currentLine.offsetTop - (transcript.clientHeight / 2) + (currentLine.clientHeight / 2);
    scrollTranscriptTo(transcript, targetTop);
  }, [open, currentIndex]);

  if (!open) return null;

  const title = song?.song_name || 'mmguo 的\n试播集';
  const artist = song?.artist || '如果 —— 面包';
  const musicSeconds = Math.max(0, musicProgressMs / 1000);
  const musicDurationSeconds = Math.max(0, musicDurationMs / 1000);
  const musicPct = musicDurationMs > 0 ? Math.min(100, (musicProgressMs / musicDurationMs) * 100) : 0;

  const close = () => {
    onClose();
  };

  return (
    <div className="speaking-overlay" role="dialog" aria-modal="true">
      <div className="speaking-shell">
        <section className="speaking-hero">
          <div className="speaking-topline">
            <div className="speaking-identity">
              <button className="speaking-avatar-button" onClick={onOpenProfile} aria-label="Open Claudio profile">
                <img src={AI_AVATAR} alt="" />
              </button>
              <div>
                <div className="speaking-name">Claudio</div>
                <div className="speaking-status"><span />{statusText}</div>
              </div>
            </div>
            <div className="speaking-clock">{formatTime(time)}</div>
            <button className="speaking-close" onClick={close} aria-label="Close">×</button>
          </div>
          <canvas ref={heroCanvasRef} className="speaking-spectrum" />
        </section>

        <section className="speaking-card">
          <div className="speaking-meta">
            <div>
              <h1>{title}</h1>
              <p>{artist}</p>
            </div>
            <span className="speaking-link">QUEUE • {playlistCount} TRACKS</span>
          </div>
          <div className="speaking-progress">
            <button onClick={onToggleMusic}>{musicPlaying ? 'Ⅱ' : '▶'}</button>
            <div
              className="speaking-track"
              onPointerDown={(e) => startTrackDrag(e, onSeekMusic)}
              role="slider"
              aria-label="Music progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(musicPct)}
            >
              <span style={{ width: `${musicPct}%` }} />
            </div>
            <time>{formatTime(musicSeconds)} / {formatTime(musicDurationSeconds || 0)}</time>
          </div>

          <div className="speaking-transcript" ref={transcriptRef}>
            {segments.map((segment, i) => {
              const isCurrentSentence = i === currentIndex;
              const hasWords = !!segment.words?.length;
              return (
                <div key={`${segment.start}-${segment.text}-${i}`} className={`speaking-line ${i < currentIndex ? 'is-read' : isCurrentSentence ? 'is-current' : 'is-future'}`}>
                  <div className="speaking-line-meta">Claudio • {formatTime(segment.start)}</div>
                  {isCurrentSentence && pillRect && (
                    <div
                      className="highlight-pill"
                      style={{
                        transform: `translate3d(${pillRect.x}px, ${pillRect.y}px, 0)`,
                        width: pillRect.w,
                        height: pillRect.h,
                      }}
                    />
                  )}
                  {hasWords ? (
                    <p>
                      {segment.words!.map((w, wi) => {
                        const said = time >= w.end;
                        const current = !said && time >= w.start;
                        const cls = isCurrentSentence
                          ? `word ${said ? 'said' : current ? 'current' : 'future'}`
                          : 'word word-idle';
                        return (
                          <span key={wi} className={cls}>
                            {w.text}
                          </span>
                        );
                      })}
                    </p>
                  ) : (
                    <p>{segment.text}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="speaking-footer">
            <time>{formatTime(time)}</time>
            <div className="speaking-tts-track"><span style={{ width: `${narrationPct}%` }} /></div>
            <button onClick={onToggleNarration}>{narrationPlaying ? 'Ⅱ' : '▶'}</button>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Parse and format a message timestamp for display.
 * ALL stored timestamps are UTC:
 *   - ISO 8601: "2026-05-23T14:30:00.000Z"
 *   - SQLite legacy: "2026-05-22 02:19:56" (UTC but no TZ indicator)
 * Without Z, new Date() parses as local time — off by UTC offset.
 * Never returns "Invalid Date".
 */
function formatMsgTime(raw: string): string {
  if (!raw) return '--:--';
  let iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  // SQLite datetime('now') is UTC — add Z if missing
  if (!iso.endsWith('Z')) iso += 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function HomePage() {
  const p = usePlayerStore((s) => s);
  const c = useChatStore((s) => s);

  const [input, setInput] = useState('');
  const [time, setTime] = useState(new Date());
  const [profileOpen, setProfileOpen] = useState(false);
  const [speakingOpen, setSpeakingOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [listening, setListening] = useState(false);
  const [stationPreviewMode, setStationPreviewMode] = useState<StationMode>('');
  const [stationViewMode, setStationViewMode] = useState<StationMode>(() => usePlayerStore.getState().activeStationMode || '');
  const [stationSurfaceMounted, setStationSurfaceMounted] = useState(() => Boolean(usePlayerStore.getState().activeStationMode));
  const [modePlaylists, setModePlaylists] = useState<ModePlaylistMap>(() => emptyModePlaylists());
  const [modeCursors, setModeCursors] = useState<ModeCursorMap>(() => emptyModeCursors());
  const [refreshingModes, setRefreshingModes] = useState<RefreshingModeMap>(() => emptyRefreshingModes());
  const recognitionRef = useRef<any>(null);
  const speakingSessionRef = useRef({ narrationId: '', sawPlaying: false });
  const stationRefillInFlightRef = useRef(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('claudio-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('claudio-theme', theme);
    document.querySelector('.card')?.setAttribute('data-theme', theme);
  }, [theme]);
  const chatRef = useRef<HTMLDivElement>(null);
  const ttsRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    p.init();
    c.loadHistory();
    wsClient.connect();

    const handleDjMessage = (data: any) => {
      c.addMessage({
        id: data.id || (() => { try { return crypto.randomUUID(); } catch { return Date.now().toString(36)+Math.random().toString(36).slice(2); } })(), role: 'dj', content: data.say,
        ttsUrl: data.ttsUrl, alignment: data.alignment, status: 'done', played: false, timestamp: data.timestamp || new Date().toISOString(),
      });

      if (data.songs?.length) {
        const songs = data.songs.map((s: any) => ({
          song_id: s.id, song_name: s.name, artist: s.artist,
          coverUrl: s.coverUrl,
        }));
        p.queuePlaylist(songs, data.ttsUrl || '');
      }
      else if (data.play?.length) {
        p.queuePlaylist(data.play.map((s: any) => ({
          song_id: s.id, song_name: s.name, artist: s.artist,
          coverUrl: s.coverUrl,
        })), data.ttsUrl || '');
      }
    };
    wsClient.on('dj_message', handleDjMessage);
    return () => {
      wsClient.off('dj_message', handleDjMessage);
      wsClient.disconnect();
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [c.messages]);

  const send = useCallback(() => {
    const t = input.trim(); if (!t || c.isStreaming) return;
    setInput(''); c.sendMessage(t);
  }, [input, c.isStreaming]);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.start();
    setListening(true);
  }, [listening]);

  const song = p.playlist.length && p.currentIndex >= 0 && p.currentIndex < p.playlist.length
    ? p.playlist[p.currentIndex] : null;
  const visibleStationMode = (stationPreviewMode || stationViewMode || p.activeStationMode) as ActiveStationMode | '';
  const stationSurfaceMode = (stationPreviewMode || stationViewMode || p.activeStationMode || 'aidj') as ActiveStationMode;
  const enterRadioSpace = useCallback(() => {
    setStationViewMode(p.activeStationMode || 'aidj');
    setStationPreviewMode('');
  }, [p.activeStationMode]);
  const leaveStationView = useCallback(() => {
    setStationViewMode('');
    setStationPreviewMode('');
  }, []);
  const startStationMode = useCallback(async (mode: Exclude<StationMode, ''>) => {
    const previousViewMode = stationViewMode;
    setStationViewMode(mode);
    if (mode === 'aidj') {
      setStationPreviewMode('');
      if ((p.activeStationMode || !p.playlist.length) && !c.isStreaming) void c.sendAidj('来点音乐');
      return;
    }
    if (mode === p.activeStationMode) {
      setStationPreviewMode('');
      return;
    }
    if (p.activeStationMode) setStationPreviewMode(mode);
    if (modePlaylists[mode].length) {
      p.startStation(mode, modePlaylists[mode], modeCursors[mode], p.stationHealth || 'ok');
      setStationPreviewMode('');
      return;
    }
    try {
      const excludeSongIds = p.playlist.map((item) => item.song_id);
      const data = await apiClient.stationStart(mode, excludeSongIds);
      const stationSongs = mapStationSongs(data.songs || []);
      setModePlaylists((state) => ({ ...state, [mode]: stationSongs }));
      setModeCursors((state) => ({ ...state, [mode]: data.cursor || '' }));
      p.startStation(mode, stationSongs, data.cursor || '', data.health || 'ok');
    } catch {
      setStationViewMode(previousViewMode || '');
      usePlayerStore.setState({ stationHealth: 'error', stationBuffering: false });
    } finally {
      setStationPreviewMode('');
    }
  }, [c.isStreaming, c.sendAidj, modeCursors, modePlaylists, p, p.playlist.length, stationViewMode]);

  const refreshStationMode = useCallback(async (mode: ActiveStationMode) => {
    if (mode === 'aidj') {
      if (!c.isStreaming) void c.sendAidj('来点音乐');
      return;
    }
    if (refreshingModes[mode]) return;
    setRefreshingModes((state) => ({ ...state, [mode]: true }));
    try {
      const excludeSongIds = [
        ...modePlaylists[mode].map((item) => item.song_id),
        ...p.playlist.map((item) => item.song_id),
      ];
      const data = await apiClient.stationStart(mode, excludeSongIds);
      const stationSongs = mapStationSongs(data.songs || []);
      setModePlaylists((state) => ({ ...state, [mode]: stationSongs }));
      setModeCursors((state) => ({ ...state, [mode]: data.cursor || state[mode] || '' }));
    } finally {
      setRefreshingModes((state) => ({ ...state, [mode]: false }));
    }
  }, [c.isStreaming, c.sendAidj, modePlaylists, p.playlist, refreshingModes]);

  useEffect(() => {
    if (stationViewMode || p.activeStationMode) setStationSurfaceMounted(true);
  }, [p.activeStationMode, stationViewMode]);

  useEffect(() => {
    if (
      !p.activeStationMode &&
      stationViewMode &&
      stationViewMode !== 'aidj' &&
      !modePlaylists[stationViewMode]?.length &&
      !p.playlist.length
    ) {
      setStationViewMode('');
    }
  }, [modePlaylists, p.activeStationMode, p.playlist.length, stationViewMode]);

  useEffect(() => {
    const mode = p.activeStationMode as ActiveStationMode;
    if (!mode || !p.playlist.length || modePlaylists[mode].length) return;
    setModePlaylists((state) => ({ ...state, [mode]: p.playlist }));
    setModeCursors((state) => ({ ...state, [mode]: p.stationCursor || state[mode] || '' }));
  }, [modePlaylists, p.activeStationMode, p.playlist, p.stationCursor]);

  useEffect(() => {
    if (!p.activeStationMode || !p.stationCursor || stationRefillInFlightRef.current) return;
    if (p.playlist.length === 0) return;
    const remaining = p.playlist.length - p.currentIndex - 1;
    if (remaining <= 5) {
      stationRefillInFlightRef.current = true;
      usePlayerStore.setState({ stationHealth: 'refilling', stationBuffering: true });
      const excludeSongIds = p.playlist.map((item) => item.song_id);
      apiClient.stationNext(p.activeStationMode, p.stationCursor, excludeSongIds)
        .then((data) => {
          const stationSongs = mapStationSongs(data.songs || []);
          p.appendStationSongs(stationSongs, data.cursor || p.stationCursor, data.health || 'ok');
          const mode = p.activeStationMode as ActiveStationMode;
          setModePlaylists((state) => ({ ...state, [mode]: [...state[mode], ...stationSongs] }));
          setModeCursors((state) => ({ ...state, [mode]: data.cursor || p.stationCursor }));
        })
        .catch(() => {
          usePlayerStore.setState({ stationHealth: 'error', stationBuffering: false });
        })
        .finally(() => {
          stationRefillInFlightRef.current = false;
        });
    }
  }, [p.activeStationMode, p.stationCursor, p.currentIndex, p.playlist.length]);
  const latestNarration = useMemo(() => {
    const msg = [...c.messages].reverse().find((m: any) => m.role === 'dj' && m.ttsUrl && m.status === 'done');
    return (msg || null) as NarrationMessage | null;
  }, [c.messages]);
  const active = p.musicPlaying || p.djNarrating;

  useEffect(() => {
    if (!speakingOpen) {
      speakingSessionRef.current = { narrationId: '', sawPlaying: false };
      return;
    }
    const narrationId = latestNarration?.id || '';
    if (speakingSessionRef.current.narrationId !== narrationId) {
      speakingSessionRef.current = { narrationId, sawPlaying: p.narrationPlaying };
    } else if (p.narrationPlaying) {
      speakingSessionRef.current.sawPlaying = true;
    }
  }, [speakingOpen, latestNarration?.id, p.narrationPlaying]);

  useEffect(() => {
    if (!speakingOpen || !latestNarration?.ttsUrl) return;
    if (latestNarration.played) return;
    if (p.narrationUrl !== latestNarration.ttsUrl) return;
    if (!speakingSessionRef.current.sawPlaying) return;
    if (p.narrationPlaying || p.narrationTimeMs <= 0) return;
    c.markPlayed(latestNarration.id);
  }, [
    speakingOpen,
    latestNarration?.id,
    latestNarration?.played,
    latestNarration?.ttsUrl,
    p.narrationUrl,
    p.narrationPlaying,
    p.narrationTimeMs,
    c.markPlayed,
  ]);

  // Fetch like status when song changes
  useEffect(() => {
    if (song?.song_id) {
      p.fetchLikeStatus(song.song_id);
      p.fetchLyric(song.song_id);
    }
  }, [song?.song_id]);

  useEffect(() => {
    if (stationViewMode === 'aidj' && song?.song_id && !p.lyricLrc) {
      p.fetchLyric(song.song_id);
    }
  }, [stationViewMode]);

  const wd = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  const msgs = c.messages.map((m: any) => {
    if (m.role === 'dj' && m.content?.includes('{') && m.status !== 'done') {
      const m2 = m.content.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return { ...m, content: m2 ? m2[1] : '...' };
    }
    return m;
  });

  return (
    <>
      <audio ref={ttsRef} preload="auto" style={{ display: 'none' }} />

      {stationSurfaceMounted && (
        <div className={`station-view-shell ${stationViewMode ? 'is-active' : ''}`} aria-hidden={!stationViewMode}>
          <StationSurface
          mode={stationSurfaceMode}
          song={song}
          progressMs={p.progressMs}
          durationMs={p.durationMs}
          volume={p.volume}
          playlist={p.playlist}
          currentIndex={p.currentIndex}
          musicPlaying={p.musicPlaying}
          likedTrackIds={p.likedTrackIds}
          lyricLrc={p.lyricLrc}
          refreshing={Boolean(visibleStationMode && (visibleStationMode === 'aidj' ? c.isStreaming : refreshingModes[visibleStationMode]))}
          onSelectMode={startStationMode}
          onRefresh={() => visibleStationMode && refreshStationMode(visibleStationMode)}
          onStop={leaveStationView}
          onPrev={p.prevTrack}
          onToggleMusic={p.toggleMusic}
          onNext={p.nextTrack}
          onSeek={p.seekTo}
          onVolume={p.setVolume}
          onPlayTrack={p.playTrack}
          onToggleTrackLike={p.toggleTrackLike}
        />
        </div>
      )}
      <div className={`home-view-shell ${!stationViewMode ? 'is-active' : ''}`} aria-hidden={Boolean(stationViewMode)}>

      {/* 1. HEADER — CLAUDIO brand + avatar + status */}
      <div className="page-header">
        <ProfileCard open={profileOpen} onToggle={setProfileOpen} />
        <div className="header-right">
          <button className="radio-entry" onClick={enterRadioSpace}>RADIO</button>
          <div className="theme-switch">
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>DARK</button>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>LIGHT</button>
          </div>
          <span className={`header-status ${active ? 'live' : ''}`}>
            <span className={`onair-dot ${active ? '' : 'off'}`} />
            {active ? 'ON AIR' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* 2. HERO CLOCK — giant, centered, ~40% height */}
      <div className="hero">
        <div className="hero-time">
          <DotMatrixClock value={time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })} />
        </div>
        <div className="hero-date">
          {wd[time.getDay()]} {String(time.getDate()).padStart(2,'0')} {mo[time.getMonth()]} {time.getFullYear()}
        </div>
      </div>

      {/* 3. CHAT - CLAUDIO bar + messages + input */}
      <div className="chat-section">
        <GlobalPlayerBar
          song={song}
          playlist={p.playlist}
          currentIndex={p.currentIndex}
          sourceMode={p.activeStationMode || 'aidj'}
          musicPlaying={p.musicPlaying}
          djNarrating={p.djNarrating}
          volume={p.volume}
          likedTrackIds={p.likedTrackIds}
          onPrev={p.prevTrack}
          onToggleMusic={p.toggleMusic}
          onNext={p.nextTrack}
          onVolume={p.setVolume}
          onPlayTrack={p.playTrack}
          onToggleTrackLike={p.toggleTrackLike}
          onOpenStation={enterRadioSpace}
        />
        <div className="chat-bar" role="button" tabIndex={0}
          onClick={() => setSpeakingOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSpeakingOpen(true); }}>
          <div className="chat-bar-left">
            <span className={`chat-bar-dot ${active ? '' : ''}`} style={active ? {} : { background: '#555', boxShadow: 'none', animation: 'none' }} />
            <span>Claudio</span>
          </div>
          <span className={`chat-bar-status ${p.djNarrating ? 'live' : ''}`}>
            {p.djNarrating ? 'SPEAKING' : 'LIVE'}
          </span>
        </div>

        <div className="chat-msgs" ref={chatRef}>
          {msgs.slice(-8).map((m: any) => (
            <div key={m.id} className={`chat-msg ${m.role === 'user' ? 'user' : ''}`}>
              <div className="chat-av"
                onClick={() => { if (m.role === 'dj') setProfileOpen(true); }}
                style={{ cursor: m.role === 'dj' ? 'pointer' : 'default' }}>
                <img src={m.role === 'user' ? USER_AVATAR : AI_AVATAR} alt="" />
              </div>
              <div className="chat-body">
                <div className="chat-name">
                  {m.role === 'user' ? 'YOU' : 'CLAUDIO'}
                </div>
                <div className="chat-bubble">
                  {m.status === 'thinking' ? (
                    <span className="thinking-indicator">[THINKING]</span>
                  ) : m.content || (m.status === 'streaming' ? <span className="thinking-indicator">[...]</span> : '')}
                </div>
                {m.role === 'dj' && m.ttsUrl && m.status === 'done' && (
                  <button className="btn-replay" onClick={() => {
                    p.playNarrationThenMusic(m.ttsUrl!);
                  }}>REPLAY</button>
                )}
                <div className="chat-time">
                  {formatMsgTime(m.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="chat-input-bar">
          <div className="chat-input-row">
            <button className="btn-aidj" onClick={() => { c.sendAidj('来点音乐'); }} disabled={c.isStreaming}>
              AIDJ
            </button>
            <input className="chat-input" placeholder={listening ? 'Listening...' : 'Say something to the DJ...'}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
              disabled={c.isStreaming || listening} />
            <button className={`btn-mic ${listening ? 'btn-mic--active' : ''}`} onClick={toggleVoice} type="button">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </button>
            <button className="btn-send" onClick={send} disabled={c.isStreaming}>&uarr;</button>
          </div>
        </div>
      </div>

      {/* 4. FOOTER */}
      <div className="page-footer">
        <span>CLAUDIO FM</span>
        <span>CONNECTED</span>
      </div>
      </div>

      <SpeakingOverlay
        open={speakingOpen}
        narration={latestNarration}
        song={song || p.playlist[0] || null}
        playlistCount={p.playlist.length}
        musicPlaying={p.musicPlaying}
        musicProgressMs={p.progressMs}
        musicDurationMs={p.durationMs}
        narrationPlaying={p.narrationPlaying}
        narrationTimeMs={p.narrationTimeMs}
        narrationDurationMs={p.narrationDurationMs}
        onToggleMusic={p.toggleMusic}
        onSeekMusic={p.seekTo}
        onToggleNarration={p.toggleNarration}
        onOpenProfile={() => setProfileOpen(true)}
        onClose={() => setSpeakingOpen(false)}
      />

    </>
  );
}
