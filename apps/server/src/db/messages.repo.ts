import { getDb, saveDb } from './db.js';

export interface Message {
  id: string;
  role: 'user' | 'dj' | 'system';
  content: string;
  tts_url: string | null;
  played: number;
  created_at: string;
}

function rowToMessage(r: any[]): Message {
  return { id: r[0], role: r[1], content: r[2], tts_url: r[3], played: r[4], created_at: r[5] };
}

export const messagesRepo = {
  async insert(msg: Omit<Message, 'created_at'>) {
    const db = await getDb();
    db.run('INSERT INTO messages (id, role, content, tts_url, played) VALUES (?, ?, ?, ?, ?)',
      [msg.id, msg.role, msg.content, msg.tts_url, msg.played]);
    saveDb();
  },

  async getRecent(limit: number = 50): Promise<Message[]> {
    const db = await getDb();
    const res = db.exec('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', [limit]);
    if (!res.length) return [];
    return res[0].values.map(rowToMessage);
  },

  async markPlayed(id: string) {
    const db = await getDb();
    db.run('UPDATE messages SET played = 1 WHERE id = ?', [id]);
    saveDb();
  },

  async updateTtsUrl(id: string, ttsUrl: string) {
    const db = await getDb();
    db.run('UPDATE messages SET tts_url = ? WHERE id = ?', [ttsUrl, id]);
    saveDb();
  },
};
