import { getDb, saveDb } from './db.js';

export interface Playlist {
  id: string; name: string; cover_url: string | null; song_count: number; source: string; synced_at: string | null;
}

export interface PlaylistSong {
  playlist_id: string; song_id: string; song_name: string; artist: string | null;
  album: string | null; duration_ms: number | null; position: number;
}

export const playlistRepo = {
  async getAll(): Promise<Playlist[]> {
    const db = await getDb();
    const res = db.exec('SELECT * FROM playlists ORDER BY synced_at DESC');
    if (!res.length) return [];
    return res[0].values.map((r: any[]) => ({
      id: r[0], name: r[1], cover_url: r[2], song_count: r[3], source: r[4], synced_at: r[5],
    }));
  },

  async upsert(p: Playlist) {
    const db = await getDb();
    db.run('INSERT OR REPLACE INTO playlists (id, name, cover_url, song_count, source, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.cover_url, p.song_count, p.source, p.synced_at]);
    saveDb();
  },

  async addFavorite(songId: string, songName: string, artist: string | null) {
    const db = await getDb();
    db.run('INSERT OR REPLACE INTO favorites (song_id, song_name, artist) VALUES (?, ?, ?)',
      [songId, songName, artist]);
    saveDb();
  },
};
