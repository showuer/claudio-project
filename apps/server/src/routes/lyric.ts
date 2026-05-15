import { FastifyInstance } from 'fastify';
import { config } from '../config.js';

const BASE = 'http://localhost:3000';
const COOKIE = config.NCM_COOKIE || '';

async function fetchNcm(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  if (COOKIE) url.searchParams.set('cookie', COOKIE);
  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`NCM ${resp.status}`);
  return resp.json();
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
    try {
      // NCM song_like_check uses POST with body
      const url = new URL(`${BASE}/song/like/check`);
      if (COOKIE) url.searchParams.set('cookie', COOKIE);
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
    const body = req.body as { like: boolean };
    try {
      const url = new URL(`${BASE}/like`);
      if (COOKIE) url.searchParams.set('cookie', COOKIE);
      await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id=${songId}&like=${body.like ? 'true' : 'false'}&alg=itembased&time=3`,
        signal: AbortSignal.timeout(8000),
      });
      return { ok: true };
    } catch {
      return reply.status(502).send({ ok: false });
    }
  });
}
