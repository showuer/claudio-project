import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

interface Playlist {
  id: string;
  name: string;
  cover_url?: string;
  song_count: number;
  source: string;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getPlaylists().then((data) => {
      setPlaylists(data.playlists || []);
      setLoading(false);
    });
  }, []);

  const handleSync = async () => {
    setLoading(true);
    await apiClient.syncPlaylists();
    const data = await apiClient.getPlaylists();
    setPlaylists(data.playlists || []);
    setLoading(false);
  };

  return (
    <>
      <div className="section-title">MY PLAYLISTS</div>
      {loading ? (
        <div style={{ padding: '0 16px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-secondary)' }}>
          [LOADING...]
        </div>
      ) : playlists.length === 0 ? (
        <div style={{ padding: '0 16px', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
            还没有同步歌单
          </div>
          <button
            onClick={handleSync}
            style={{
              fontFamily: 'var(--font-nav)', fontSize: 11, letterSpacing: '0.1em',
              background: 'var(--bg-surface)', color: 'var(--accent-neon)',
              border: '1px solid rgba(41,255,184,0.3)', borderRadius: 'var(--radius-pill)',
              padding: '8px 20px', cursor: 'pointer'
            }}
          >
            SYNC FROM NETEASE
          </button>
        </div>
      ) : (
        <div className="playlist-grid">
          {playlists.map((p) => (
            <div key={p.id} className="playlist-card">
              <div className="playlist-card-title">{p.name}</div>
              <div className="playlist-card-count">{p.song_count} SONGS</div>
            </div>
          ))}
          <button
            onClick={handleSync}
            style={{
              fontFamily: 'var(--font-nav)', fontSize: 10, letterSpacing: '0.1em',
              color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer',
              position: 'absolute', top: 16, right: 16,
            }}
          >
            [REFRESH]
          </button>
        </div>
      )}
    </>
  );
}
