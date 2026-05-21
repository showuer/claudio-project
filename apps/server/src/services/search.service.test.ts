import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchService } from './search.service.js';

const tao = { id: '1', name: '普通朋友', artist: '陶喆', album: 'David Tao' };
const other = { id: '2', name: '爱很简单', artist: '陶喆', album: 'David Tao' };

test('normalizes Chinese music intent into core keyword', () => {
  const service = createSearchService();

  assert.deepEqual(service.detectIntent('有没有陶喆的歌'), { kind: 'music', query: '陶喆', reason: 'explicit-search' });
  assert.deepEqual(service.detectIntent('放点陶喆'), { kind: 'music', query: '陶喆', reason: 'explicit-play' });
  assert.deepEqual(service.detectIntent('搜一下普通朋友'), { kind: 'music', query: '普通朋友', reason: 'explicit-search' });
  assert.deepEqual(service.detectIntent('陶喆是谁'), { kind: 'chat', query: '陶喆是谁', reason: 'question-about-entity' });
});

test('searchPlayable filters unplayable NCM results', async () => {
  const service = createSearchService({
    ncm: {
      search: async () => [tao, { id: 'bad', name: '坏结果', artist: '未知', album: '' }],
      getSongUrl: async (id: string) => id === 'bad' ? null : `https://music.test/${id}.mp3`,
    },
    getMemoryHints: async () => ({ preferredArtists: [], tags: [], avoid: [], mood: '', routines: [] }),
    getLocalCandidates: () => [],
  });

  const result = await service.searchPlayable('有没有陶喆的歌', 10);

  assert.equal(result.intent.kind, 'music');
  assert.equal(result.keyword, '陶喆');
  assert.deepEqual(result.songs.map((s) => s.id), ['1']);
});

test('falls back to local library when NCM returns nothing playable', async () => {
  const service = createSearchService({
    ncm: {
      search: async () => [],
      getSongUrl: async () => null,
    },
    getMemoryHints: async () => ({ preferredArtists: ['陶喆'], tags: [], avoid: [], mood: '', routines: [] }),
    getLocalCandidates: () => [tao, other],
  });

  const result = await service.searchPlayable('放点陶喆', 10);

  assert.equal(result.source, 'local');
  assert.equal(result.songs.length, 2);
});

test('memory ranking lifts preferred artists', async () => {
  const service = createSearchService({
    ncm: {
      search: async () => [
        { id: 'x', name: '陌生歌', artist: '陌生人', album: '' },
        tao,
      ],
      getSongUrl: async (id: string) => `https://music.test/${id}.mp3`,
    },
    getMemoryHints: async () => ({ preferredArtists: ['陶喆'], tags: [], avoid: [], mood: '', routines: [] }),
    getLocalCandidates: () => [],
  });

  const result = await service.searchPlayable('来点R&B', 10);

  assert.equal(result.songs[0].artist, '陶喆');
});
