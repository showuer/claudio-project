import { getDb, saveDb } from './db.js';

const DEFAULTS: Record<string, string> = {
  theme: 'dark', accentColor: '#29ffb8', stationName: 'CLAUDIO FM',
  ttsProvider: 'mimo', aiModel: 'deepseek-chat',
};

export const settingsRepo = {
  async get(key: string): Promise<string | null> {
    const db = await getDb();
    const res = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
    if (res.length && res[0].values.length) return res[0].values[0][0] as string;
    return DEFAULTS[key] ?? null;
  },

  async set(key: string, value: string) {
    const db = await getDb();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    saveDb();
  },

  async getAll(): Promise<Record<string, string>> {
    const db = await getDb();
    const res = db.exec('SELECT key, value FROM settings');
    const result: Record<string, string> = { ...DEFAULTS };
    if (res.length) {
      for (const row of res[0].values) {
        result[row[0] as string] = row[1] as string;
      }
    }
    return result;
  },

  async getMaskedApiKeys(): Promise<Record<string, string>> {
    const keys = ['DEEPSEEK_API_KEY', 'NCM_APPID', 'NCM_PRIVATE_KEY', 'MIMO_API_KEY', 'HEFENG_API_KEY'];
    const result: Record<string, string> = {};
    for (const key of keys) {
      const val = await settingsRepo.get(key);
      if (val && val.length > 8) {
        result[key] = val.slice(0, 4) + '****' + val.slice(-4);
      } else {
        result[key] = val ? '****' : '';
      }
    }
    return result;
  },
};
