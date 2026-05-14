import { config } from '../config.js';
import crypto from 'node:crypto';

const BASE = 'https://interface.music.163.com';

interface AIDJParams {
  [key: string]: string | number | undefined;
}

function signParams(params: AIDJParams): Record<string, string> {
  const appId = config.NCM_APPID || '';
  const privateKey = config.NCM_PRIVATE_KEY || '';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');

  const all: Record<string, string> = { appId, timestamp, nonce };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      all[k] = String(v);
    }
  }

  // Sort keys alphabetically, concatenate key=value pairs
  const sorted = Object.keys(all).sort();
  const signStr = sorted.map((k) => `${k}=${all[k]}`).join('&') + `&key=${privateKey}`;
  const sign = crypto.createHash('md5').update(signStr).digest('hex');

  return { ...all, sign };
}

async function fetchAIDJ(path: string, params: AIDJParams = {}): Promise<any> {
  if (!config.NCM_APPID || !config.NCM_PRIVATE_KEY) {
    console.warn('[AIDJ] NCM_APPID or NCM_PRIVATE_KEY not configured');
    return null;
  }

  try {
    const signed = signParams(params);
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(signed)) {
      url.searchParams.set(k, v);
    }

    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error(`[AIDJ] ${path} HTTP ${resp.status}:`, text.slice(0, 200));
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      console.error(`[AIDJ] ${path} not JSON:`, text.slice(0, 200));
      return null;
    }
  } catch (err: any) {
    console.error(`[AIDJ] ${path}:`, err.message);
    return null;
  }
}

export interface AIDJTimbre {
  id: string;
  name: string;
  icon?: string;
}

export interface AIDJSong {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration?: number;
  narrationUrl?: string;
}

export interface AIDJResult {
  say: string;
  ttsUrl: string;
  songs: AIDJSong[];
  songIntros: Record<string, string>;
  source: 'aidj';
}

export const aidjService = {
  /** Get list of available DJ voice timbres */
  async getTimbres(): Promise<AIDJTimbre[]> {
    const json = await fetchAIDJ('/openapi/music/basic/aidj/audio/timbre/get');
    if (!json?.data) return [];
    const data = Array.isArray(json.data) ? json.data : json.data.list || [];
    return data.map((t: any) => ({
      id: String(t.id || t.timbreId || ''),
      name: String(t.name || t.timbreName || ''),
      icon: t.icon || t.cover || '',
    }));
  },

  /** Get personal FM radio recommendations */
  async getRadioFm(): Promise<AIDJSong[]> {
    const json = await fetchAIDJ('/openapi/music/basic/radio/fm/get/v2', { mode: 'random' });
    if (!json?.data) return [];
    const songs = Array.isArray(json.data) ? json.data : json.data.songs || json.data.list || [];
    return songs.map((s: any) => ({
      id: String(s.id || s.songId || ''),
      name: String(s.name || s.songName || ''),
      artist: String(s.artist || s.artistName || (s.ar || []).map((a: any) => a.name).join(', ') || '未知'),
      album: s.album || s.al?.name || '',
      duration: s.duration || s.dt || 0,
    }));
  },

  /** Get pre-generated DJ narration audio for a specific song */
  async getSongNarration(songId: string, timbreId?: string): Promise<string | null> {
    const params: AIDJParams = { songId };
    if (timbreId) params.timbreId = timbreId;
    const json = await fetchAIDJ('/openapi/music/basic/song/aidj/audio/get', params);
    const url = json?.data?.url || json?.data?.audioUrl || json?.data?.narrationUrl || null;
    return url;
  },

  /** Full AIDJ flow: get recommendations + narration for each song */
  async getFullProgram(timbreId?: string): Promise<AIDJResult | null> {
    const songs = await aidjService.getRadioFm();
    if (!songs.length) return null;

    // Get narration for each song in parallel
    const narrationResults = await Promise.all(
      songs.map(async (song) => {
        const url = await aidjService.getSongNarration(song.id, timbreId);
        return { id: song.id, url };
      })
    );

    const songIntros: Record<string, string> = {};
    for (const r of narrationResults) {
      if (r.url) songIntros[r.id] = r.url;
    }

    return {
      say: '',
      ttsUrl: '',
      songs,
      songIntros,
      source: 'aidj' as const,
    };
  },
};
