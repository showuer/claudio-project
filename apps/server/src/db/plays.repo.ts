import { getDb, saveDb } from './db.js';

export interface Play {
  id: number;
  song_id: string;
  song_name: string;
  artist: string | null;
  played_at: string;
  skipped: number;
  source: string | null;
}

export const playsRepo = {
  async insert(play: { song_id: string; song_name: string; artist?: string; source?: string }) {
    const db = await getDb();
    db.run('INSERT INTO plays (song_id, song_name, artist, source) VALUES (?, ?, ?, ?)',
      [play.song_id, play.song_name, play.artist || null, play.source || null]);
    saveDb();
  },

  async getRecent(limit: number = 20): Promise<Play[]> {
    const db = await getDb();
    const res = db.exec('SELECT * FROM plays ORDER BY played_at DESC LIMIT ?', [limit]);
    if (!res.length) return [];
    return res[0].values.map((r: any[]) => ({
      id: r[0], song_id: r[1], song_name: r[2], artist: r[3], played_at: r[4], skipped: r[5], source: r[6],
    }));
  },

  async getStats() {
    const db = await getDb();
    const countRes = db.exec('SELECT COUNT(*) as count FROM plays WHERE skipped = 0');
    const totalPlays = countRes[0]?.values[0]?.[0] as number || 0;

    const topRes = db.exec(
      `SELECT artist, COUNT(*) as count FROM plays WHERE skipped = 0 AND artist IS NOT NULL GROUP BY artist ORDER BY count DESC LIMIT 10`
    );
    const topArtists = topRes[0]?.values.map((r: any[]) => ({ artist: r[0], count: r[1] })) || [];

    return { totalHours: Math.round((totalPlays * 4) / 60), totalPlays, topArtists };
  },
};
