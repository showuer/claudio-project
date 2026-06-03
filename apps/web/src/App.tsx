import type { CSSProperties } from 'react';
import Stage from './components/Stage';
import Card from './components/Card';
import HomePage from './pages/HomePage';
import DebugPanel from './components/DebugPanel';
import { CoverAmbientBackground } from './components/CoverAmbientBackground';
import { usePlayerStore } from './stores/playerStore';
import { useCoverPalette } from './hooks/useCoverPalette';
import { useResolvedCoverUrl } from './hooks/useResolvedCoverUrl';

export default function App() {
  const activeStationMode = usePlayerStore((s) => s.activeStationMode);
  const playlist = usePlayerStore((s) => s.playlist);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const currentSong = playlist[currentIndex] || null;
  const activeCoverUrl = useResolvedCoverUrl(
    currentSong?.song_id,
    currentSong?.coverUrl,
  );
  const { palette } = useCoverPalette(activeCoverUrl, currentSong?.song_id);
  const stageStyle = {
    '--ambient-primary': palette.primary,
    '--ambient-secondary': palette.secondary,
    '--ambient-accent': palette.accent,
    '--ambient-dark': palette.dark,
    '--ambient-muted': palette.muted,
  } as CSSProperties;

  return (
    <Stage style={stageStyle}>
      <CoverAmbientBackground
        active={true}
        songId={currentSong?.song_id}
        coverUrl={activeCoverUrl}
        mode={activeStationMode || 'aidj'}
      />
      <Card>
        <HomePage />
      </Card>
      <DebugPanel />
    </Stage>
  );
}
