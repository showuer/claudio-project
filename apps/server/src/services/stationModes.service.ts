import { contextService } from './context.service.js';
import { memoryService, type SearchHints } from './memory.service.js';
import { ncmService, type SearchResult } from './ncm.service.js';

export type StationMode = 'random-infinite' | 'focus-cafe' | 'focus-library';

export interface StationSong {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration?: number;
  coverUrl?: string;
  url: string;
}

export interface StationBatch {
  mode: StationMode;
  cursor: string;
  songs: StationSong[];
  health: 'ok' | 'fallback' | 'thin';
}

export interface StationRequest {
  mode: StationMode;
  cursor?: string;
  excludeSongIds?: string[];
}

type Candidate = {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration?: number;
  coverUrl?: string;
};

type NcmLike = {
  search(keyword: string, limit?: number): Promise<Candidate[]>;
  getSongUrl(songId: string): Promise<string | null>;
  getPersonalFm(): Promise<Candidate[]>;
  getDailyRecommend?(): Promise<Candidate[]>;
};

function normalizeCandidate(song: Partial<SearchResult> & { id?: string; name?: string; artist?: string }): Candidate | null {
  if (!song.id || !song.name) return null;
  return {
    id: String(song.id),
    name: song.name,
    artist: song.artist || 'Unknown',
    album: song.album || '',
    duration: song.duration || 0,
    coverUrl: (song as Candidate).coverUrl || '',
  };
}

function text(song: Candidate) {
  return `${song.name} ${song.artist || ''} ${song.album || ''}`.toLowerCase();
}

function isLibraryCandidate(song: Candidate) {
  const haystack = text(song);
  if (/(feat\.|ft\.|rap|hip hop|vocal|voice|remix|说唱|人声|主唱|歌词)/i.test(haystack)) return false;
  return /(piano|instrumental|ambient|study|lofi|jazz|classical|钢琴|纯音乐|器乐|轻音乐|古典|氛围)/i.test(haystack);
}

function isCafeCandidate(song: Candidate) {
  const haystack = text(song);
  if (/(hardstyle|metal|trap|dubstep|rock|rap|说唱|重金属|摇滚|电音)/i.test(haystack)) return false;
  return /(lofi|lo-fi|jazz|jazzhop|cafe|coffee|r&b|soul|chill|study|原声|爵士|咖啡|轻松)/i.test(haystack);
}

function modeSeeds(mode: StationMode, hints: Partial<SearchHints>) {
  const taste = [...(hints.tags || []), ...(hints.preferredArtists || [])].filter(Boolean).slice(0, 3);
  if (mode === 'focus-library') return [...taste, '纯音乐 学习 钢琴', 'instrumental study ambient'];
  if (mode === 'focus-cafe') return [...taste, 'lofi jazzhop cafe', '咖啡厅 lofi 爵士'];
  return [...taste, '私人fm', 'chill discovery'];
}

function score(song: Candidate, hints: Partial<SearchHints>) {
  const haystack = text(song);
  let value = 1;
  for (const artist of hints.preferredArtists || []) if (artist && haystack.includes(artist.toLowerCase())) value += 10;
  for (const tag of hints.tags || []) if (tag && haystack.includes(tag.toLowerCase())) value += 4;
  for (const avoid of hints.avoid || []) if (avoid && haystack.includes(avoid.toLowerCase())) value -= 50;
  return value;
}

export function createStationModesService(options?: {
  ncm?: NcmLike;
  getLocalCandidates?: (count?: number) => Candidate[];
  getTasteHints?: () => Promise<Partial<SearchHints>>;
  random?: () => number;
}) {
  const ncm = options?.ncm || ncmService;
  const random = options?.random || Math.random;
  const recentIdsByMode = new Map<StationMode, string[]>();
  const recentArtistsByMode = new Map<StationMode, string[]>();
  const getLocalCandidates = options?.getLocalCandidates || ((count?: number) =>
    contextService.getCandidates(count).map((song) => ({
      id: song.id,
      name: song.name,
      artist: song.artist,
      album: song.album,
      duration: 0,
    })));
  const getTasteHints = options?.getTasteHints || memoryService.getSearchHints.bind(memoryService);

  function primaryArtist(song: Candidate) {
    return (song.artist || 'Unknown').split(/[,/&、，]/)[0].trim().toLowerCase();
  }

  async function build(req: StationRequest): Promise<StationBatch> {
    const hints = await getTasteHints();
    const exclude = new Set(req.excludeSongIds || []);
    const recentIds = new Set(recentIdsByMode.get(req.mode) || []);
    const recentArtists = new Set(recentArtistsByMode.get(req.mode) || []);
    const candidates: Candidate[] = [];

    for (const seed of modeSeeds(req.mode, hints)) {
      const found = await ncm.search(seed, 24);
      candidates.push(...found.map(normalizeCandidate).filter(Boolean) as Candidate[]);
    }
    if (req.mode === 'random-infinite') {
      const fm = await ncm.getPersonalFm();
      candidates.push(...fm.map(normalizeCandidate).filter(Boolean) as Candidate[]);
      if (ncm.getDailyRecommend) {
        const daily = await ncm.getDailyRecommend();
        candidates.push(...daily.map(normalizeCandidate).filter(Boolean) as Candidate[]);
      }
    }
    candidates.push(...getLocalCandidates(80).map(normalizeCandidate).filter(Boolean) as Candidate[]);

    const seen = new Set<string>(exclude);
    const filtered = candidates
      .filter((song) => song.id && !seen.has(song.id))
      .filter((song) => (req.mode === 'focus-library' ? isLibraryCandidate(song) : req.mode === 'focus-cafe' ? isCafeCandidate(song) : true))
      .map((song) => ({ song, jitter: random() }))
      .sort((a, b) => score(b.song, hints) - score(a.song, hints) || a.jitter - b.jitter)
      .map(({ song }) => song);

    const songs: StationSong[] = [];
    const artistCounts = new Map<string, number>();
    async function collect(skipRecent: boolean) {
      for (const song of filtered) {
        if (songs.length >= 15) break;
        if (seen.has(song.id) || (!skipRecent && (recentIds.has(song.id) || recentArtists.has(primaryArtist(song))))) continue;
        const artist = primaryArtist(song);
        if (req.mode === 'random-infinite' && (artistCounts.get(artist) || 0) >= 2) continue;
        const url = await ncm.getSongUrl(song.id);
        if (!url) continue;
        seen.add(song.id);
        artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
        songs.push({ ...song, url });
      }
    }
    await collect(false);
    if (songs.length < 10) await collect(true);

    const previousIds = recentIdsByMode.get(req.mode) || [];
    recentIdsByMode.set(req.mode, [...previousIds, ...songs.map((song) => song.id)].slice(-120));
    recentArtistsByMode.set(req.mode, [...new Set(songs.map(primaryArtist))]);

    return {
      mode: req.mode,
      cursor: `${Date.now()}-${random().toString(36).slice(2, 8)}`,
      songs,
      health: songs.length >= 10 ? 'ok' : songs.length > 0 ? 'thin' : 'fallback',
    };
  }

  return {
    start: build,
    next: build,
  };
}

export const stationModesService = createStationModesService();
