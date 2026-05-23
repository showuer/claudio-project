import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { getDbSync, saveDb } from '../db/db.js';
import { memoryService } from '../services/memory.service.js';

const BASE = 'http://localhost:3000';

function getCookie(): string {
  return config.NCM_COOKIE || '';
}

async function fetchNcm(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const cookie = getCookie();
  if (cookie) url.searchParams.set('cookie', cookie);
  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`NCM ${resp.status}`);
  return resp.json();
}

function isLikedLocally(songId: string): boolean {
  try {
    const db = getDbSync();
    const res = db.exec('SELECT 1 FROM favorites WHERE song_id = ?', [songId]);
    return !!(res.length && res[0].values.length);
  } catch { return false; }
}

function syncLocalLike(songId: string, songName: string, artist: string, like: boolean) {
  try {
    const db = getDbSync();
    if (like) {
      db.run('INSERT OR REPLACE INTO favorites (song_id, song_name, artist) VALUES (?, ?, ?)',
        [songId, songName, artist || '']);
    } else {
      db.run('DELETE FROM favorites WHERE song_id = ?', [songId]);
    }
    saveDb();
  } catch { /* non-critical */ }
}

async function updateMemoryFromLike(songId: string, songName: string, artist: string, like: boolean) {
  if (!songId || !songName || !like) return;
  try {
    await memoryService.recordLikedSongSignal({ id: songId, name: songName, artist });
  } catch { /* non-critical */ }
}

export function registerLyricRoutes(app: FastifyInstance) {
  app.get('/api/lyric/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    try {
      const json = await fetchNcm('/lyric', { id: songId });
      return {
        lrc: json?.lrc?.lyric || '',
        klyric: json?.klyric?.lyric || '',
        tlyric: json?.tlyric?.lyric || '',
      };
    } catch {
      return { lrc: '', klyric: '', tlyric: '' };
    }
  });

  app.get('/api/like/check/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    // Check local DB first (instant, no network)
    if (isLikedLocally(songId)) return { liked: true };

    // Fallback to NCM API
    try {
      const url = new URL(`${BASE}/song/like/check`);
      const cookie = getCookie();
      if (cookie) url.searchParams.set('cookie', cookie);
      const resp = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `trackIds=${songId}`,
        signal: AbortSignal.timeout(8000),
      });
      const json = await resp.json();
      const data = json?.data || {};
      const liked = Object.values(data).includes(true);
      return { liked };
    } catch {
      return { liked: false };
    }
  });

  app.post('/api/like/:songId', async (req, reply) => {
    const { songId } = req.params as { songId: string };
    const body = req.body as { like: boolean; songName?: string; artist?: string };

    // 1. Save locally (always works, no network needed)
    syncLocalLike(songId, body.songName || '', body.artist || '', body.like);

    // 2. Update canonical memory with a weak song/style signal, not a fixed artist preference.
    await updateMemoryFromLike(songId, body.songName || '', body.artist || '', body.like);

    // 3. Sync to NCM (best effort)
    try {
      const url = new URL(`${BASE}/like`);
      const cookie = getCookie();
      if (cookie) url.searchParams.set('cookie', cookie);
      await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id=${songId}&like=${body.like ? 'true' : 'false'}&alg=itembased&time=3`,
        signal: AbortSignal.timeout(8000),
      });
    } catch { /* NCM sync failed — local save already done */ }

    return { ok: true };
  });
}
