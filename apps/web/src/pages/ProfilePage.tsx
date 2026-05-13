import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function ProfilePage() {
  const [stats, setStats] = useState<{ totalHours: number; totalPlays: number; topArtists: { artist: string; count: number }[] } | null>(null);
  const [taste, setTaste] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.getProfile().then(setStats);
    apiClient.getTaste().then((d) => setTaste(d.content));
  }, []);

  const handleSaveTaste = async () => {
    await apiClient.saveTaste(taste);
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

      <div className="section-title">TASTE PROFILE</div>
      <div className="taste-editor">
        <textarea
          value={taste}
          onChange={(e) => { setTaste(e.target.value); setSaved(false); }}
          placeholder="# 我的音乐品味&#10;&#10;## 喜欢的风格&#10;- &#10;&#10;## 不喜欢的&#10;- &#10;"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <button
            onClick={handleSaveTaste}
            style={{
              fontFamily: 'var(--font-nav)', fontSize: 11, letterSpacing: '0.1em',
              background: 'var(--text-display)', color: 'var(--bg-stage)',
              border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 20px', cursor: 'pointer',
            }}
          >
            SAVE
          </button>
          {saved && <span className="inline-status">[SAVED]</span>}
        </div>
      </div>
    </>
  );
}
