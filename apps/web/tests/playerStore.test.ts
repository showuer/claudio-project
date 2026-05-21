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

test('player store does not expose half-ready pending narration hooks', async () => {
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState() as any;

  assert.equal(typeof ps.setPendingPlaylistNarration, 'undefined');
});
