import { contextService } from './context.service.js';
import { memoryService, type SearchHints } from './memory.service.js';
import { ncmService } from './ncm.service.js';
import { getTemporalSearchTerms } from './temporalMusic.service.js';

export interface SongCandidate {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration?: number;
}

export type MusicIntent =
  | { kind: 'music'; query: string; reason: 'explicit-search' | 'explicit-play' | 'scene' }
  | { kind: 'chat'; query: string; reason: 'question-about-entity' | 'no-music-intent' };

export interface SearchPlayableResult {
  intent: MusicIntent;
  keyword: string;
  source: 'ncm' | 'local' | 'none';
  songs: SongCandidate[];
}

export interface ClaudioSearchService {
  detectIntent(message: string): MusicIntent;
  searchPlayable(message: string, limit?: number): Promise<SearchPlayableResult>;
}

type NcmLike = {
  search(keyword: string, limit?: number): Promise<SongCandidate[]>;
  getSongUrl(songId: string): Promise<string | null>;
};

const SEARCH_PREFIX = /^(?:搜索|搜一下|搜|找一下|找|有没有|有沒有|有没有一些|有没有点|有没有什么)\s*/i;
const PLAY_PREFIX = /^(?:播放|放一下|放点|来点|想听|我想听|听听|给我放|推荐|推点)\s*/i;
const QUESTION_ENTITY = /^(?!.*(?:播放|放点|想听|搜|找|推荐|推点|来点)).*(?:是谁|是什么|介绍一下|什么意思)\??$/;

function cleanQuery(message: string): string {
  return message
    .trim()
    .replace(/[？?。！!，,]/g, '')
    .replace(/的歌(?:曲)?$/g, '')
    .replace(/歌$/g, '')
    .trim();
}

function textOf(song: SongCandidate): string {
  return `${song.name} ${song.artist || ''} ${song.album || ''}`.toLowerCase();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => needle && haystack.includes(needle.toLowerCase()));
}

function isGenericMusicQuery(query: string): boolean {
  const cleaned = query.replace(/\s+/g, '').toLowerCase();
  return !cleaned || /^(音乐|歌|歌曲|听歌|来点音乐|随便|私人漫游|aidj|music)$/.test(cleaned);
}

export function createSearchService(options?: {
  ncm?: NcmLike;
  getMemoryHints?: () => Promise<SearchHints>;
  getLocalCandidates?: (count?: number) => SongCandidate[];
}): ClaudioSearchService {
  const ncm = options?.ncm || ncmService;
  const getMemoryHints = options?.getMemoryHints || memoryService.getSearchHints.bind(memoryService);
  const getLocalCandidates = options?.getLocalCandidates || contextService.getCandidates.bind(contextService);

  function detectIntent(message: string): MusicIntent {
    const raw = message.trim();
    if (QUESTION_ENTITY.test(raw)) return { kind: 'chat', query: raw, reason: 'question-about-entity' };
    if (SEARCH_PREFIX.test(raw)) return { kind: 'music', query: cleanQuery(raw.replace(SEARCH_PREFIX, '')), reason: 'explicit-search' };
    if (PLAY_PREFIX.test(raw)) return { kind: 'music', query: cleanQuery(raw.replace(PLAY_PREFIX, '')), reason: 'explicit-play' };
    if (/适合|氛围|心情|晚上|深夜|写代码|通勤|睡前|工作|学习/.test(raw) && /歌|音乐|听/.test(raw)) {
      return { kind: 'music', query: cleanQuery(raw), reason: 'scene' };
    }
    return { kind: 'chat', query: raw, reason: 'no-music-intent' };
  }

  function score(song: SongCandidate, keyword: string, hints: SearchHints): number {
    const haystack = textOf(song);
    const lowerKeyword = keyword.toLowerCase();
    let value = 0;
    if (lowerKeyword && haystack.includes(lowerKeyword)) value += 20;
    if (includesAny(song.artist.toLowerCase(), hints.preferredArtists)) value += 15;
    if (includesAny(haystack, hints.tags)) value += 4;
    if (includesAny(haystack, hints.avoid)) value -= 50;
    return value;
  }

  async function withPlayable(items: SongCandidate[], limit: number): Promise<SongCandidate[]> {
    const playable: SongCandidate[] = [];
    for (const item of items) {
      if (!item?.id) continue;
      const url = await ncm.getSongUrl(item.id);
      if (!url) continue;
      playable.push(item);
      if (playable.length >= limit) break;
    }
    return playable;
  }

  async function searchPlayable(message: string, limit = 10): Promise<SearchPlayableResult> {
    const intent = detectIntent(message);
    if (intent.kind === 'chat') {
      return { intent, keyword: intent.query, source: 'none' as const, songs: [] as SongCandidate[] };
    }

    const hints = await getMemoryHints();
    const temporalTerms = getTemporalSearchTerms();
    const keyword = intent.query || hints.preferredArtists[0] || message;
    const remoteKeyword = isGenericMusicQuery(keyword)
      ? temporalTerms[0]
      : intent.reason === 'scene'
        ? `${keyword} ${temporalTerms[0]}`
        : keyword;
    const remote = await withPlayable(await ncm.search(remoteKeyword, Math.max(limit * 2, 20)), limit);
    const remoteRanked = remote.sort((a, b) => score(b, keyword, hints) - score(a, keyword, hints));
    if (remoteRanked.length > 0) {
      return { intent, keyword: remoteKeyword, source: 'ncm' as const, songs: remoteRanked.slice(0, limit) };
    }

    const lowerKeyword = keyword.toLowerCase();
    const local = getLocalCandidates(300)
      .filter((song) => {
        const haystack = textOf(song);
        return haystack.includes(lowerKeyword) || includesAny(song.artist.toLowerCase(), hints.preferredArtists);
      })
      .sort((a, b) => score(b, keyword, hints) - score(a, keyword, hints))
      .slice(0, limit);

    return { intent, keyword, source: 'local' as const, songs: local };
  }

  return { detectIntent, searchPlayable };
}

export const searchService = createSearchService();
