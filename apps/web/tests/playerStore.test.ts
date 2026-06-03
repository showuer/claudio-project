import assert from 'node:assert/strict';
import test from 'node:test';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  crossOrigin: string | null = null;
  volume = 1;
  currentTime = 0;
  duration = 30;
  paused = true;
  onloadedmetadata: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(src = '') {
    super();
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.onloadedmetadata?.();
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

test('opening narration owns the single TTS audio and skips first song intro when music starts', async () => {
  FakeAudio.instances = [];
  (globalThis as any).Audio = FakeAudio;
  (globalThis as any).window = globalThis;
  (globalThis as any).setInterval = () => 0;
  (globalThis as any).clearInterval = () => undefined;
  (globalThis as any).setTimeout = () => 0;
  (globalThis as any).clearTimeout = () => undefined;
  (globalThis as any).requestAnimationFrame = () => 0;
  (globalThis as any).cancelAnimationFrame = () => undefined;
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
  };
  (globalThis as any).fetch = async () => ({
    json: async () => ({ url: '/song.mp3' }),
  });
  (globalThis as any).AudioContext = class {
    createMediaElementSource() { return { connect: () => {} }; }
    createGain() { return { gain: { value: 1 }, connect: () => {} }; }
    get destination() { return {}; }
    resume() {}
    get state() { return 'running'; }
  };

  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();
  ps.init();
  ps.setPlaylist([{ song_id: '1', song_name: 'Track', artist: 'Artist', introUrl: '/song-intro.mp3' }]);
  assert.equal(FakeAudio.instances[0].crossOrigin, 'anonymous');

  ps.playNarrationThenMusic('/opening.mp3', 0);
  assert.equal(mod.getNarrationAudioElement()?.src, '/opening.mp3');
  assert.equal(mod.usePlayerStore.getState().narrationUrl, '/opening.mp3');

  ps.playTrack(0, { skipIntro: true, keepNarration: true });
  assert.equal(mod.getNarrationAudioElement()?.src, '/opening.mp3');
  assert.equal(FakeAudio.instances[0].src, '/api/stream/1');
  assert.equal(FakeAudio.instances.some((a) => a.src === '/song-intro.mp3'), false);
});

test('new playlist waits for current song to finish before opening narration starts', async () => {
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();

  ps.setPlaylist([{ song_id: 'old', song_name: 'Old Track', artist: 'Artist' }]);
  ps.playTrack(0);
  assert.equal(FakeAudio.instances[0].src, '/api/stream/old');

  ps.queuePlaylist(
    [{ song_id: 'new', song_name: 'New Track', artist: 'New Artist', introUrl: '/ignored-song-intro.mp3' }],
    '/playlist-opening.mp3',
  );

  const queued = mod.usePlayerStore.getState();
  assert.deepEqual(
    queued.playlist.map((song) => song.song_id),
    ['old', 'new'],
  );
  assert.equal(queued.currentIndex, 0);
  assert.notEqual(mod.getNarrationAudioElement()?.src, '/playlist-opening.mp3');
  assert.equal(FakeAudio.instances[0].src, '/api/stream/old');

  ps.nextTrack();

  assert.equal(mod.getNarrationAudioElement()?.src, '/playlist-opening.mp3');
  assert.equal(FakeAudio.instances[0].src, '/api/stream/old');
  assert.equal(FakeAudio.instances.some((a) => a.src === '/ignored-song-intro.mp3'), false);
});

test('queued aidj playlist does not re-add songs already in the current queue', async () => {
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();

  ps.setPlaylist([
    { song_id: 'old', song_name: 'Old Track', artist: 'Artist' },
    { song_id: 'queued', song_name: 'Queued Track', artist: 'Artist' },
  ]);
  ps.playTrack(0);

  ps.queuePlaylist(
    [
      { song_id: 'old', song_name: 'Old Track Again', artist: 'Artist' },
      { song_id: 'queued', song_name: 'Queued Track Again', artist: 'Artist' },
      { song_id: 'fresh', song_name: 'Fresh Track', artist: 'Artist' },
    ],
    '/fresh-opening.mp3',
  );

  assert.deepEqual(
    mod.usePlayerStore.getState().playlist.map((song) => song.song_id),
    ['old', 'fresh'],
  );
});

test('normal aidj playlists clear station display state so home player and queue stay visible', async () => {
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();

  ps.startStation('focus-cafe', [
    { song_id: 'station', song_name: 'Station Track', artist: 'Cafe' },
  ], 'cursor-1', 'ok');
  assert.equal(mod.usePlayerStore.getState().activeStationMode, 'focus-cafe');

  ps.setPlaylist([{ song_id: 'aidj', song_name: 'AIDJ Track', artist: 'Claudio' }]);
  assert.equal(mod.usePlayerStore.getState().activeStationMode, '');

  ps.startStation('focus-library', [
    { song_id: 'library', song_name: 'Library Track', artist: 'Library' },
  ], 'cursor-2', 'ok');
  assert.equal(mod.usePlayerStore.getState().activeStationMode, 'focus-library');

  ps.queuePlaylist([{ song_id: 'daily', song_name: 'Daily Track', artist: 'Claudio' }], '/daily-intro.mp3');
  assert.equal(mod.usePlayerStore.getState().activeStationMode, '');
});

test('player store does not expose half-ready pending narration hooks', async () => {
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState() as any;

  assert.equal(typeof ps.setPendingPlaylistNarration, 'undefined');
});

test('player store skips to the next track when a stream keeps failing', async () => {
  (globalThis as any).setTimeout = (fn: () => void) => { fn(); return 0; };
  (globalThis as any).clearTimeout = () => undefined;

  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();

  ps.setPlaylist([
    { song_id: 'broken', song_name: 'Broken Track', artist: 'Artist' },
    { song_id: 'next', song_name: 'Next Track', artist: 'Artist' },
  ]);
  ps.playTrack(0);
  await Promise.resolve();

  const music = FakeAudio.instances[0];
  music.dispatchEvent(new Event('error'));
  music.dispatchEvent(new Event('error'));
  music.dispatchEvent(new Event('error'));
  await Promise.resolve();

  assert.equal(mod.usePlayerStore.getState().currentIndex, 1);
  assert.equal(music.src, '/api/stream/next');
});

test('late lyrics from the previous aidj track cannot overwrite the current track', async () => {
  const pending = new Map<string, (value: any) => void>();
  (globalThis as any).fetch = (url: string) => new Promise((resolve) => pending.set(url, resolve));

  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();
  ps.setPlaylist([{ song_id: 'lyric-a', song_name: 'A', artist: 'Artist' }]);
  const lyricA = ps.fetchLyric('lyric-a');

  ps.setPlaylist([{ song_id: 'lyric-b', song_name: 'B', artist: 'Artist' }]);
  const lyricB = ps.fetchLyric('lyric-b');

  pending.get('/api/lyric/lyric-b')?.({ json: async () => ({ lrc: '[00:01]B lyric', klyric: '' }) });
  await lyricB;
  assert.equal(mod.usePlayerStore.getState().lyricLrc, '[00:01]B lyric');

  pending.get('/api/lyric/lyric-a')?.({ json: async () => ({ lrc: '[00:01]A lyric', klyric: '' }) });
  await lyricA;
  assert.equal(mod.usePlayerStore.getState().lyricLrc, '[00:01]B lyric');
});
