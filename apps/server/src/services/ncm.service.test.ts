import test from 'node:test';
import assert from 'node:assert/strict';
import { ncmService } from './ncm.service.js';

test('song URL selection prefers browser-safe standard audio over lossless', async () => {
  const originalFetch = globalThis.fetch;
  const requestedLevels: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const level = url.searchParams.get('level') || '';
    requestedLevels.push(level);

    const songUrl = level === 'standard'
      ? 'https://music.example/track-standard.mp3'
      : 'https://music.example/track-lossless.flac';

    return new Response(JSON.stringify({
      data: [{ id: 1, url: songUrl, code: 200, type: level === 'standard' ? 'mp3' : 'flac' }],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const url = await ncmService.getSongUrl('1');

    assert.equal(url, 'https://music.example/track-standard.mp3');
    assert.deepEqual(requestedLevels, ['standard']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
