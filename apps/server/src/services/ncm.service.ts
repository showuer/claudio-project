import { config } from '../config.js';

const BASE = 'http://localhost:3000';
const COOKIE = config.NCM_COOKIE || '';

export interface SearchResult {
  id: string; name: string; artist: string; album: string; duration: number;
}

export interface SongDetail {
  id: string; name: string; artist: string; album: string; coverUrl: string; lyric: string; url: string | null; duration: number;
}

async function fetchNcm(path: string, params?: Record<string, string>): Promise<any> {
  try {
    const url = new URL(`${BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    // Pass cookie for VIP full-length songs
    if (COOKIE) url.searchParams.set('cookie', COOKIE);
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`NCM ${resp.status}`);
    return resp.json();
  } catch (err) {
    console.error(`[NCM] ${path}:`, (err as Error).message);
    return null;
  }
}

export const ncmService = {
  async search(keyword: string, limit: number = 10): Promise<SearchResult[]> {
    const json = await fetchNcm('/search', { keywords: keyword, limit: String(limit), type: '1' });
    if (!json?.result?.songs) return [];
    return json.result.songs.map((s: any) => ({
      id: String(s.id),
      name: s.name,
      artist: (s.artists || s.ar || []).map((a: any) => a.name).join(', '),
      album: s.album?.name || s.al?.name || '',
      duration: Math.floor((s.duration || s.dt || 0) / 1000),
    }));
  },

  async getSongUrl(songId: string): Promise<string | null> {
    // Try lossless and standard in parallel, use lossless if available
    const [lossless, standard] = await Promise.all([
      fetchNcm('/song/url/v1', { id: songId, level: 'lossless' }),
      fetchNcm('/song/url/v1', { id: songId, level: 'standard' }),
    ]);
    return lossless?.data?.[0]?.url || standard?.data?.[0]?.url || null;
  },

  async getSongDetail(songId: string): Promise<SongDetail | null> {
    const [detail, url] = await Promise.all([
      fetchNcm('/song/detail', { ids: songId }),
      ncmService.getSongUrl(songId),
    ]);
    if (!detail?.songs?.[0]) return null;
    const s = detail.songs[0];
    return {
      id: String(s.id), name: s.name,
      artist: (s.ar || []).map((a: any) => a.name).join(', '),
      album: s.al?.name || '', coverUrl: s.al?.picUrl || '',
      lyric: '', url, duration: Math.floor((s.dt || 0) / 1000),
    };
  },

  async getLyric(songId: string): Promise<string> {
    const json = await fetchNcm('/lyric', { id: songId });
    return json?.lrc?.lyric || '';
  },

  /** Get personalized FM radio recommendations (3 songs per call) */
  async getPersonalFm(): Promise<SearchResult[]> {
    const json = await fetchNcm('/personal_fm');
    if (!json?.data) return [];
    return json.data.map((s: any) => ({
      id: String(s.id),
      name: s.name,
      artist: (s.artists || s.ar || []).map((a: any) => a.name).join(', '),
      album: s.album?.name || s.al?.name || '',
      duration: Math.floor((s.duration || s.dt || 0) / 1000),
    }));
  },

  async getUserPlaylists(uid?: string): Promise<any[]> {
    const json = await fetchNcm('/user/playlist', uid ? { uid } : {});
    if (!json?.playlist) return [];
    return json.playlist.map((p: any) => ({
      id: String(p.id), name: p.name,
      coverUrl: p.coverImgUrl || '', trackCount: p.trackCount || 0,
    }));
  },
};
