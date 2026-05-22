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
