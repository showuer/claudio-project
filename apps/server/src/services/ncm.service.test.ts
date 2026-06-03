import test from 'node:test';
import assert from 'node:assert/strict';
import { ncmService } from './ncm.service.js';

test('song URL selection prefers high-bitrate browser-safe audio over standard', async () => {
  const originalFetch = globalThis.fetch;
  const requestedLevels: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const level = url.searchParams.get('level') || '';
    requestedLevels.push(level);

    const songUrl = level === 'exhigh'
      ? 'https://music.example/track-exhigh.mp3'
      : 'https://music.example/track-standard.mp3';

    return new Response(JSON.stringify({
      data: [{ id: 1, url: songUrl, code: 200, type: 'mp3' }],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const url = await ncmService.getSongUrl('1');

    assert.equal(url, 'https://music.example/track-exhigh.mp3');
    assert.deepEqual(requestedLevels, ['exhigh']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('song URL selection falls back through high-quality mp3 levels', async () => {
  const originalFetch = globalThis.fetch;
  const requestedLevels: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const level = url.searchParams.get('level') || '';
    requestedLevels.push(level);

    return new Response(JSON.stringify({
      data: [{ id: 1, url: level === 'higher' ? 'https://music.example/track-higher.mp3' : null, code: 200, type: 'mp3' }],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const url = await ncmService.getSongUrl('1');

    assert.equal(url, 'https://music.example/track-higher.mp3');
    assert.deepEqual(requestedLevels, ['exhigh', 'higher']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('song collections preserve cover artwork urls', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/search') {
      return new Response(JSON.stringify({
        result: {
          songs: [{
            id: 11,
            name: 'Search Song',
            artists: [{ name: 'Artist A' }],
            album: { name: 'Album A', picUrl: 'https://img.example/search.jpg' },
            duration: 190000,
          }],
        },
      }), { status: 200 });
    }
    if (url.pathname === '/personal_fm') {
      return new Response(JSON.stringify({
        data: [{
          id: 12,
          name: 'FM Song',
          artists: [{ name: 'Artist B' }],
          album: { name: 'Album B', picUrl: 'https://img.example/fm.jpg' },
          duration: 200000,
        }],
      }), { status: 200 });
    }
    if (url.pathname === '/playlist/track/all') {
      return new Response(JSON.stringify({
        songs: [{
          id: 13,
          name: 'Playlist Song',
          ar: [{ name: 'Artist C' }],
          al: { name: 'Album C', picUrl: 'https://img.example/playlist.jpg' },
          dt: 210000,
        }],
      }), { status: 200 });
    }
    if (url.pathname === '/recommend/songs') {
      return new Response(JSON.stringify({
        data: {
          dailySongs: [{
            id: 14,
            name: 'Daily Song',
            ar: [{ name: 'Artist D' }],
            al: { name: 'Album D', picUrl: 'https://img.example/daily.jpg' },
            dt: 220000,
          }],
        },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const [searchSong] = await ncmService.search('cover', 1);
    const [fmSong] = await ncmService.getPersonalFm();
    const [playlistSong] = await ncmService.getPlaylistTracks('100', 1);
    const [dailySong] = await ncmService.getDailyRecommend();

    assert.equal(searchSong.coverUrl, 'https://img.example/search.jpg');
    assert.equal(fmSong.coverUrl, 'https://img.example/fm.jpg');
    assert.equal(playlistSong.coverUrl, 'https://img.example/playlist.jpg');
    assert.equal(dailySong.coverUrl, 'https://img.example/daily.jpg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
