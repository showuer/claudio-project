import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Song, StationMode } from '../stores/playerStore';
import { useResolvedCoverUrl } from '../hooks/useResolvedCoverUrl';

interface GlobalPlayerBarProps {
  song: Song | null;
  playlist: Song[];
  currentIndex: number;
  sourceMode: StationMode;
  musicPlaying: boolean;
  djNarrating: boolean;
  volume: number;
  likedTrackIds: string[];
  onPrev: () => void;
  onToggleMusic: () => void;
  onNext: () => void;
  onVolume: (pct: number) => void;
  onPlayTrack: (index: number) => void;
  onToggleTrackLike: (songId: string) => void;
  onOpenStation: () => void;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function modeLabel(mode: StationMode) {
  if (mode === 'random-infinite') return 'FLOW';
  if (mode === 'focus-cafe') return 'CAFE';
  if (mode === 'focus-library') return 'LIBRARY';
  return 'AIDJ';
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

export function GlobalPlayerBar({
  song,
  playlist,
  currentIndex,
  sourceMode,
  musicPlaying,
  djNarrating,
  volume,
  likedTrackIds,
  onPrev,
  onToggleMusic,
  onNext,
  onVolume,
  onPlayTrack,
  onToggleTrackLike,
  onOpenStation,
}: GlobalPlayerBarProps) {
  const [queueOpen, setQueueOpen] = useState(false);
  const coverUrl = useResolvedCoverUrl(song?.song_id, song?.coverUrl);
  const volumePct = clamp01(volume) * 100;
  const liked = Boolean(song && likedTrackIds.includes(song.song_id));

  return (
    <section className="global-player-shell" aria-label="Persistent player">
      <div className={`global-player-queue ${queueOpen ? 'is-open' : ''}`} aria-hidden={!queueOpen}>
        <div className="global-player-queue-head">
          <span>QUEUE</span>
          <span>{playlist.length} TRACKS</span>
        </div>
        <div className="global-player-queue-list">
          {playlist.length ? playlist.map((item, index) => (
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
                className={`global-player-like ${likedTrackIds.includes(item.song_id) ? 'is-liked' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTrackLike(item.song_id);
                }}
                aria-label={likedTrackIds.includes(item.song_id) ? 'Unlike track' : 'Like track'}
              >
                {likedTrackIds.includes(item.song_id) ? '\u2665' : '\u2661'}
              </button>
            </div>
          )) : (
            <p>ASK CLAUDIO FOR A SET</p>
          )}
        </div>
        <div className="global-player-queue-volume">
          <span>VOL</span>
          <div
            className="global-player-volume"
            onPointerDown={(event) => startTrackDrag(event, onVolume)}
            role="slider"
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volumePct)}
          >
            <span style={{ width: `${volumePct}%` }} />
          </div>
        </div>
      </div>

      <div className="global-player-bar">
        <div className="global-player-track">
          <button className="global-player-cover" onClick={onOpenStation} aria-label="Open radio space">
            {coverUrl ? <img src={coverUrl} alt="" loading="lazy" decoding="async" /> : <span>C</span>}
          </button>
          <span className="global-player-copy">
            <small>{modeLabel(sourceMode)} {djNarrating ? 'INTRO' : musicPlaying ? 'PLAYING' : 'STANDBY'}</small>
            <strong>{song?.song_name || 'Claudio Radio'}</strong>
            <em>{song?.artist || 'Waiting for a signal'}</em>
          </span>
        </div>

        <div className="global-player-center">
          <div className="global-player-transport">
            <button onClick={onPrev} aria-label="Previous track">&lt;&lt;</button>
            <button className="global-player-play" onClick={onToggleMusic} aria-label={musicPlaying ? 'Pause' : 'Play'}>
              {musicPlaying ? 'II' : '>'}
            </button>
            <button onClick={onNext} aria-label="Next track">&gt;&gt;</button>
          </div>
        </div>

        <div className="global-player-actions">
          <button
            className={`global-player-like global-player-like--current ${liked ? 'is-liked' : ''}`}
            onClick={() => song && onToggleTrackLike(song.song_id)}
            aria-label={liked ? 'Unlike current track' : 'Like current track'}
            disabled={!song}
          >
            {liked ? '\u2665' : '\u2661'}
          </button>
          <button
            className={`global-player-queue-toggle ${queueOpen ? 'active' : ''}`}
            onClick={() => setQueueOpen((open) => !open)}
            aria-label="Open track list"
            aria-expanded={queueOpen}
          >
            <span aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
    </section>
  );
}
