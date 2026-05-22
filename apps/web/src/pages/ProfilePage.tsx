import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function ProfilePage() {
  const [stats, setStats] = useState<{ totalHours: number; totalPlays: number; topArtists: { artist: string; count: number }[] } | null>(null);
  const [memory, setMemory] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.getProfile().then(setStats);
    apiClient.getMemory().then((d) => setMemory(d.content));
    apiClient.getMemorySummary().then(setSummary);
  }, []);

  const handleSaveMemory = async () => {
    await apiClient.saveMemory(memory);
    setSummary(await apiClient.getMemorySummary());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div className="section-title">STATS</div>
      {stats ? (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-card-label">Listening</div>
            <div className="stat-card-value">{stats.totalHours}h</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Plays</div>
            <div className="stat-card-value">{stats.totalPlays}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Top Artist</div>
            <div className="stat-card-value" style={{ fontSize: 16 }}>
              {stats.topArtists[0]?.artist || '--'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-secondary)' }}>
          [LOADING...]
        </div>
      )}

      {summary && (
        <>
          <div className="section-title">LEARNED MEMORY</div>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-label">Mood</div>
              <div className="stat-card-value" style={{ fontSize: 16 }}>{summary.mood || '--'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Taste</div>
              <div className="stat-card-value" style={{ fontSize: 14 }}>
                {summary.tags?.slice(0, 2).join(' / ') || '--'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Avoid</div>
              <div className="stat-card-value" style={{ fontSize: 14 }}>{summary.avoid?.[0] || '--'}</div>
            </div>
          </div>
        </>
      )}

      <div className="section-title">MEMORY PROFILE</div>
      <div className="taste-editor">
        <textarea
          value={memory}
          onChange={(e) => { setMemory(e.target.value); setSaved(false); }}
          placeholder="# Claudio Memory Profile&#10;&#10;## Taste&#10;- &#10;&#10;## Mood&#10;- "
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <button
            onClick={handleSaveMemory}
            style={{
              fontFamily: 'var(--font-nav)', fontSize: 11, letterSpacing: '0.1em',
              background: 'var(--text-display)', color: 'var(--bg-stage)',
              border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 20px', cursor: 'pointer',
            }}
          >
            SAVE MEMORY
          </button>
          {saved && <span className="inline-status">[SAVED]</span>}
        </div>
      </div>
    </>
  );
}
