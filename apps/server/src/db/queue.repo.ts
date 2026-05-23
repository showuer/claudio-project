import { getDb, saveDb } from './db.js';

export interface QueueItem {
  position: number; song_id: string; song_name: string;
  artist: string | null; url: string | null; duration_ms: number | null;
}

export const queueRepo = {
  async getAll(): Promise<QueueItem[]> {
    const db = await getDb();
    const res = db.exec('SELECT * FROM queue ORDER BY position');
    if (!res.length) return [];
    return res[0].values.map((r: any[]) => ({
      position: r[0], song_id: r[1], song_name: r[2], artist: r[3], url: r[4], duration_ms: r[5],
    }));
  },

  async add(item: Omit<QueueItem, 'position'>) {
    const db = await getDb();
    db.run('INSERT INTO queue (song_id, song_name, artist, url, duration_ms) VALUES (?, ?, ?, ?, ?)',
      [item.song_id, item.song_name, item.artist, item.url, item.duration_ms]);
    saveDb();
  },

  async clear() {
    const db = await getDb();
    db.run('DELETE FROM queue');
    saveDb();
  },

  async removeFirst(): Promise<QueueItem | undefined> {
    const db = await getDb();
    db.run('BEGIN');
    try {
      const res = db.exec('SELECT * FROM queue ORDER BY position LIMIT 1');
      if (!res.length || !res[0].values.length) {
        db.run('COMMIT');
        return undefined;
      }
      const row = res[0].values[0];
      db.run('DELETE FROM queue WHERE position = ?', [row[0]]);
      db.run('COMMIT');
      saveDb();
      return { position: row[0] as number, song_id: row[1] as string, song_name: row[2] as string, artist: row[3] as string, url: row[4] as string, duration_ms: row[5] as number };
    } catch {
      db.run('ROLLBACK');
      return undefined;
    }
  },

  async size(): Promise<number> {
    const db = await getDb();
    const res = db.exec('SELECT COUNT(*) as count FROM queue');
    return (res[0]?.values[0]?.[0] as number) || 0;
  },
};
