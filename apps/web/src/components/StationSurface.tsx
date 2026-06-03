import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Song, StationMode } from '../stores/playerStore';
import { BackgroundGeometry } from './BackgroundGeometry';
import { MeshGradientBackground } from './MeshGradientBackground';
import { useCoverPalette } from '../hooks/useCoverPalette';
import { useMeshGradient } from '../hooks/useMeshGradient';
import { useResolvedCoverUrl } from '../hooks/useResolvedCoverUrl';

type ActiveStationMode = Exclude<StationMode, ''>;

interface StationSurfaceProps {
  mode: StationMode;
  song: Song | null;
  progressMs: number;
  durationMs: number;
  volume: number;
  playlist: Song[];
  currentIndex: number;
  musicPlaying: boolean;
  likedTrackIds: string[];
  lyricLrc: string;
  refreshing: boolean;
  onSelectMode: (mode: ActiveStationMode) => void;
  onRefresh: () => void;
  onStop: () => void;
  onPrev: () => void;
  onToggleMusic: () => void;
  onNext: () => void;
  onSeek: (pct: number) => void;
  onVolume: (pct: number) => void;
  onPlayTrack: (index: number) => void;
  onToggleTrackLike: (songId: string) => void;
}

const modes: Array<{
  id: ActiveStationMode;
  label: string;
  eyebrow: string;
  title: string;
  copy: string;
}> = [
  {
    id: 'aidj',
    label: 'AIDJ',
    eyebrow: 'Claudio Live',
    title: 'AIDJ Room',
    copy: 'The main Claudio radio desk with chat-born queues, synced lyrics, cover color and mesh.',
  },
  {
    id: 'random-infinite',
    label: 'FLOW',
    eyebrow: 'Signal Flow',
    title: 'Flow Infinite',
    copy: 'Taste-led discovery with a moving cover-color field.',
  },
  {
    id: 'focus-cafe',
    label: 'CAFE',
    eyebrow: 'Focus Space',
    title: 'Cafe Low Light',
    copy: 'Dim, warm, lofi and jazzhop rooms with low vocal pressure.',
  },
  {
    id: 'focus-library',
    label: 'LIBRARY',
    eyebrow: 'Focus Space',
    title: 'Library Warm Desk',
    copy: 'Warm reading-light instrumentals only, quiet enough to think.',
  },
];

const modeTheme = {
  aidj: 'aidj',
  'random-infinite': 'random',
  'focus-cafe': 'cafe',
  'focus-library': 'library',
} as const;

type LyricLine = { timeMs: number; text: string };

function parseLrc(lyricLrc: string): LyricLine[] {
  return lyricLrc
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      const text = line.replace(/\[[^\]]+\]/g, '').trim();
      if (!matches.length || !text) return [];
      return matches.map((match) => {
        const minutes = Number(match[1] || 0);
        const seconds = Number(match[2] || 0);
        const fraction = Number((match[3] || '0').padEnd(3, '0').slice(0, 3));
        return { timeMs: (minutes * 60 + seconds) * 1000 + fraction, text };
      });
    })
    .sort((a, b) => a.timeMs - b.timeMs);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatMs(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function startTrackDrag(e: ReactPointerEvent<HTMLDivElement>, onChange: (pct: number) => void) {
  e.preventDefault();
  const track = e.currentTarget;
  const pointerId = e.pointerId;
  const update = (clientX: number) => {
    const rect = track.getBoundingClientRect();
    onChange(clamp01((clientX - rect.left) / Math.max(1, rect.width)));
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
    track.releasePointerCapture?.(pointerId);
  };
  const onMove = (event: PointerEvent) => update(event.clientX);

  update(e.clientX);
  track.setPointerCapture?.(pointerId);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
}

export function StationSurface({
  mode,
  song,
  progressMs,
  durationMs,
  volume,
  playlist,
  currentIndex,
  musicPlaying,
  likedTrackIds,
  lyricLrc,
  refreshing,
  onSelectMode,
  onRefresh,
  onStop,
  onPrev,
  onToggleMusic,
  onNext,
  onSeek,
  onVolume,
  onPlayTrack,
  onToggleTrackLike,
}: StationSurfaceProps) {
  if (!mode) return null;

  const rootRef = useRef<HTMLElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const current = modes.find((item) => item.id === mode) || modes[0];
  const theme = modeTheme[mode];
  const titleText = song?.song_name || 'Finding signal';
  const compactTitle = Array.from(titleText).length > 8;
  const coverUrl = useResolvedCoverUrl(song?.song_id, song?.coverUrl);
  const lyricLines = useMemo(() => parseLrc(lyricLrc), [lyricLrc]);
  const { palette, loading: paletteLoading } = useCoverPalette(coverUrl, song?.song_id);
  useMeshGradient(rootRef, palette);
  const [queueOpen, setQueueOpen] = useState(false);
  const progressPct = durationMs > 0 ? clamp01(progressMs / durationMs) * 100 : 0;
  const volumePct = clamp01(volume) * 100;
  const liked = Boolean(song && likedTrackIds.includes(song.song_id));
  const activeLyricIndex = lyricLines.reduce((activeIndex, line, index) => (
    progressMs + 180 >= line.timeMs ? index : activeIndex
  ), -1);

  useEffect(() => {
    const container = lyricsRef.current;
    const active = lyricsRef.current?.querySelector<HTMLElement>('.station-lyric-line.active');
    if (!container || !active) return;
    const targetTop = active.offsetTop - (container.clientHeight * 0.38) + (active.clientHeight / 2);
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [activeLyricIndex, song?.song_id]);

  return (
    <section ref={rootRef} className={`station-page station-page--${theme}`}>
      <MeshGradientBackground palette={palette} trackId={song?.song_id} coverUrl={coverUrl} loading={paletteLoading} />
      <BackgroundGeometry />

      <header className="station-page-header">
        <div>
          <div className="station-header-status">{current.eyebrow}</div>
          <div className="station-mode-tabs--page" aria-label="Listening mode">
            {modes.map((item) => (
              <button
                key={item.id}
                className={mode === item.id ? 'active' : ''}
                onClick={() => onSelectMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <button className="station-exit" onClick={onStop} aria-label="Back to Claudio home">X</button>

      <main className="station-page-main">
        <div className="station-cover-art">
          {coverUrl ? <img src={coverUrl} alt="" /> : <span>{titleText.slice(0, 1)}</span>}
        </div>
        <div className="station-track-copy">
          <div className="station-page-kicker">{current.title}</div>
          <h1 className={`station-title ${compactTitle ? 'station-title--compact' : ''}`}>{titleText}</h1>
          <p>{song?.artist || 'Claudio is tuning the room'}</p>
          <span>{current.copy}</span>
        </div>
      </main>

      <section className="station-lyrics" ref={lyricsRef} aria-label="Lyrics">
        {lyricLines.length ? (
          lyricLines.map((line, index) => (
            <div
              key={`${line.timeMs}-${index}`}
              className={`station-lyric-line ${index < activeLyricIndex ? 'read' : index === activeLyricIndex ? 'active' : ''}`}
            >
              {line.text}
            </div>
          ))
        ) : (
          <div className="station-lyric-line active">Lyrics are resting in the room.</div>
        )}
      </section>

      <section className="station-page-player" aria-label="Station player">
        <div className="station-player-row station-player-row--transport">
          <button onClick={onPrev} aria-label="Previous track">&lt;&lt;</button>
          <button className="station-play" onClick={onToggleMusic} aria-label={musicPlaying ? 'Pause' : 'Play'}>
            {musicPlaying ? 'II' : '>'}
          </button>
          <button onClick={onNext} aria-label="Next track">&gt;&gt;</button>
          <div
            className="station-progress"
            onPointerDown={(event) => startTrackDrag(event, onSeek)}
            role="slider"
            aria-label="Music progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPct)}
          >
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <time>{formatMs(progressMs)} / {formatMs(durationMs)}</time>
        </div>
        <div className="station-player-row station-player-row--utility">
          <span className="station-volume-label">VOL</span>
          <div
            className="station-volume"
            onPointerDown={(event) => startTrackDrag(event, onVolume)}
            role="slider"
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volumePct)}
          >
            <span style={{ width: `${volumePct}%` }} />
          </div>
          <button
            className={`station-current-like ${liked ? 'is-liked' : ''}`}
            onClick={() => song && onToggleTrackLike(song.song_id)}
            aria-label={liked ? 'Unlike current track' : 'Like current track'}
            disabled={!song}
          >
            {liked ? '\u2665' : '\u2661'}
          </button>
          <button className="station-refresh station-refresh--player" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '...' : mode === 'aidj' ? 'NEW' : 'REFRESH'}
          </button>
          <button
            className={`station-queue-toggle ${queueOpen ? 'active' : ''}`}
            onClick={() => setQueueOpen((open) => !open)}
            aria-label="Open track list"
            aria-expanded={queueOpen}
          >
            <span className="station-queue-glyph" aria-hidden="true"><i /><i /><i /><i /></span>
          </button>
        </div>
      </section>

      <aside className={`station-page-queue ${queueOpen ? 'is-open' : ''}`} aria-hidden={!queueOpen}>
        <div className="station-page-queue-head">
          <span>QUEUE</span>
          <span>{playlist.length} TRACKS</span>
        </div>
        <div className="station-page-queue-list">
          {playlist.map((item, index) => (
            <div
              key={`${item.song_id}-${index}`}
              className={index === currentIndex ? 'active' : ''}
              onClick={() => onPlayTrack(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onPlayTrack(index);
              }}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.song_name}</strong>
              <em>{item.artist}</em>
              <button
                className={`station-like ${likedTrackIds.includes(item.song_id) ? 'is-liked' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTrackLike(item.song_id);
                }}
                aria-label={likedTrackIds.includes(item.song_id) ? 'Unlike track' : 'Like track'}
              >
                {likedTrackIds.includes(item.song_id) ? '\u2665' : '\u2661'}
              </button>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
