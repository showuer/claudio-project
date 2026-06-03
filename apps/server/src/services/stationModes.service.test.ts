import assert from 'node:assert/strict';
import test from 'node:test';
import { createStationModesService } from './stationModes.service.js';

const songs = [
  { id: 'piano', name: 'Quiet Piano', artist: 'Mia', album: 'Desk', duration: 180, coverUrl: 'piano.jpg' },
  { id: 'rap', name: 'Rap Voice', artist: 'MC', album: 'Voice', duration: 200, coverUrl: 'rap.jpg' },
  { id: 'lofi', name: 'Low Cafe', artist: 'Wood Room', album: 'Cafe', duration: 210, coverUrl: 'lofi.jpg' },
  { id: 'jazz', name: 'Soft Jazzhop', artist: 'Amber', album: 'Night', duration: 210, coverUrl: 'jazz.jpg' },
];

test('library mode returns only instrumental low-distraction songs', async () => {
  const service = createStationModesService({
    ncm: {
      search: async () => songs,
      getSongUrl: async (id: string) => `/api/stream/${id}`,
      getPersonalFm: async () => songs,
    },
    getLocalCandidates: () => songs,
    getTasteHints: async () => ({ preferredArtists: [], tags: ['piano'], avoid: [] }),
  });

  const batch = await service.start({ mode: 'focus-library', excludeSongIds: [] });
  assert.equal(batch.mode, 'focus-library');
  assert.equal(batch.songs.some((song) => song.id === 'rap'), false);
  assert.equal(batch.songs.every((song) => song.url), true);
});

test('cafe mode allows lofi and jazzhop but excludes aggressive vocal/rap tracks', async () => {
  const service = createStationModesService({
    ncm: {
      search: async () => songs,
      getSongUrl: async (id: string) => `/api/stream/${id}`,
      getPersonalFm: async () => songs,
    },
    getLocalCandidates: () => songs,
    getTasteHints: async () => ({ preferredArtists: ['Amber'], tags: ['lofi', 'jazzhop'], avoid: [] }),
  });

  const batch = await service.start({ mode: 'focus-cafe', excludeSongIds: [] });
  assert.equal(batch.songs.some((song) => song.id === 'lofi'), true);
  assert.equal(batch.songs.some((song) => song.id === 'rap'), false);
});

test('next batch excludes current queue ids and returns a new cursor', async () => {
  const service = createStationModesService({
    ncm: {
      search: async () => songs,
      getSongUrl: async (id: string) => `/api/stream/${id}`,
      getPersonalFm: async () => songs,
    },
    getLocalCandidates: () => songs,
    getTasteHints: async () => ({ preferredArtists: [], tags: [], avoid: [] }),
  });

  const batch = await service.next({ mode: 'random-infinite', cursor: '0', excludeSongIds: ['piano', 'lofi'] });
  assert.equal(batch.songs.some((song) => song.id === 'piano'), false);
  assert.notEqual(batch.cursor, '0');
});

test('station songs preserve cover urls for ambient backgrounds', async () => {
  const service = createStationModesService({
    ncm: {
      search: async () => songs,
      getSongUrl: async (id: string) => `/api/stream/${id}`,
      getPersonalFm: async () => [],
    },
    getLocalCandidates: () => [],
    getTasteHints: async () => ({ preferredArtists: [], tags: [], avoid: [] }),
  });

  const batch = await service.start({ mode: 'random-infinite', excludeSongIds: [] });
  assert.equal(batch.songs[0].coverUrl?.endsWith('.jpg'), true);
});

test('random refresh limits repeated artists and avoids the immediately previous batch', async () => {
  const dominant = Array.from({ length: 12 }, (_, index) => ({
    id: `rad-${index}`,
    name: `RAD Track ${index}`,
    artist: 'RADWIMPS',
    duration: 200,
    coverUrl: `rad-${index}.jpg`,
  }));
  const variety = Array.from({ length: 24 }, (_, index) => ({
    id: `variety-${index}`,
    name: `Variety Track ${index}`,
    artist: `Artist ${index}`,
    duration: 200,
    coverUrl: `variety-${index}.jpg`,
  }));
  const pool = [...dominant, ...variety];
  let randomTick = 0;
  const service = createStationModesService({
    ncm: {
      search: async () => pool,
      getSongUrl: async (id: string) => `/api/stream/${id}`,
      getPersonalFm: async () => [],
      getDailyRecommend: async () => [],
    },
    getLocalCandidates: () => [],
    getTasteHints: async () => ({ preferredArtists: ['RADWIMPS'], tags: [], avoid: [] }),
    random: () => ((randomTick++ * 37) % 101) / 101,
  });

  const first = await service.start({ mode: 'random-infinite', excludeSongIds: [] });
  const second = await service.start({ mode: 'random-infinite', excludeSongIds: [] });

  assert.equal(first.songs.filter((song) => song.artist === 'RADWIMPS').length <= 2, true);
  assert.equal(second.songs.filter((song) => song.artist === 'RADWIMPS').length <= 2, true);
  assert.equal(first.songs.some((song) => second.songs.some((next) => next.id === song.id)), false);
  assert.equal(first.songs.some((song) => second.songs.some((next) => next.artist === song.artist)), false);
});
