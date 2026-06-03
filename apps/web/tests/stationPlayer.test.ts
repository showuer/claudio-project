import assert from 'node:assert/strict';
import test from 'node:test';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  volume = 1;
  currentTime = 0;
  duration = 120;
  paused = true;
  crossOrigin: string | null = null;

  constructor() {
    super();
    FakeAudio.instances.push(this);
  }

  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

function installBrowserStubs() {
  FakeAudio.instances = [];
  (globalThis as any).Audio = FakeAudio;
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => undefined };
  (globalThis as any).setInterval = () => 0;
  (globalThis as any).clearInterval = () => undefined;
  (globalThis as any).setTimeout = (fn: () => void) => { fn(); return 0; };
  (globalThis as any).clearTimeout = () => undefined;
  (globalThis as any).fetch = async () => ({ json: async () => ({}) });
}

test('starting a station replaces queue and marks station mode without narration', async () => {
  installBrowserStubs();
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();
  ps.init();

  ps.startStation('focus-cafe', [
    { song_id: 'cafe-1', song_name: 'Cafe One', artist: 'A', coverUrl: 'cafe.jpg' },
  ], 'cursor-a');

  const state = mod.usePlayerStore.getState();
  assert.equal(state.activeStationMode, 'focus-cafe');
  assert.equal(state.stationCursor, 'cursor-a');
  assert.equal(state.playlist[0].song_id, 'cafe-1');
  assert.equal(state.playlist[0].introUrl, '');
});

test('station refill appends unique songs without resetting current audio', async () => {
  installBrowserStubs();
  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();
  ps.init();
  ps.startStation('random-infinite', [
    { song_id: 'one', song_name: 'One', artist: 'A' },
  ], 'cursor-a');
  ps.playTrack(0);
  const audio = FakeAudio.instances[0];

  ps.appendStationSongs([
    { song_id: 'one', song_name: 'One Again', artist: 'A' },
    { song_id: 'two', song_name: 'Two', artist: 'B' },
  ], 'cursor-b');

  assert.equal(FakeAudio.instances[0], audio);
  assert.deepEqual(mod.usePlayerStore.getState().playlist.map((song) => song.song_id), ['one', 'two']);
  assert.equal(mod.usePlayerStore.getState().stationCursor, 'cursor-b');
});

test('station fade switch does not let an old fade mute the new track', async () => {
  installBrowserStubs();
  const intervals: Array<() => void> = [];
  const clearedIntervals = new Set<number>();
  (globalThis as any).setInterval = (fn: () => void) => {
    intervals.push(fn);
    return intervals.length;
  };
  (globalThis as any).clearInterval = (id: number) => {
    clearedIntervals.add(id);
  };

  const mod = await import('../src/stores/playerStore.ts');
  const ps = mod.usePlayerStore.getState();
  ps.init();
  ps.setVolume(0.72);
  ps.setPlaylist([{ song_id: 'old', song_name: 'Old', artist: 'A' }]);
  ps.playTrack(0);
  await Promise.resolve();

  const music = mod.getMusicAudioElement() as FakeAudio;
  const intervalCountBeforeStation = intervals.length;
  assert.equal(music.paused, false);

  ps.startStation('focus-cafe', [
    { song_id: 'new', song_name: 'New', artist: 'B' },
  ], 'cursor-new');
  await Promise.resolve();

  assert.equal(music.src, '/api/stream/new');
  for (let i = intervalCountBeforeStation; i < intervals.length; i++) {
    if (clearedIntervals.has(i + 1)) continue;
    const tick = intervals[i];
    tick();
    tick();
    tick();
    tick();
  }
  assert.equal(music.volume, 0.72);
});

test('station refill request is single-flight and excludes queued songs', async () => {
  const homePage = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf-8')
  );

  assert.match(homePage, /stationRefillInFlightRef/);
  assert.match(homePage, /remaining <= 5/);
  assert.match(homePage, /apiClient\.stationNext/);
  assert.match(homePage, /p\.playlist\.map\(\(item\) => item\.song_id\)/);
});
