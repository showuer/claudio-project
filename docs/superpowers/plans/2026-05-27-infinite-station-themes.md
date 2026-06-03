# Infinite Station Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build independent Random Infinite, Cafe, and Library station themes with no chat/TTS pollution and buffered uninterrupted playback.

**Architecture:** Add a dedicated backend station mode service and `/api/modes/*` routes. Add a frontend station API client, player-store station state, and separate station surface components rendered by `HomePage`. The player owns fade switching, queue append, refill thresholds, failure skip, and Cloudflare-friendly single-flight refill behavior.

**Tech Stack:** Fastify, TypeScript, sql.js-backed app state, React, Zustand, Vite, Node test runner with `tsx --test`, CSS.

---

## File Structure

- Create `apps/server/src/services/stationModes.service.ts`: mode registry, taste-weighted picking, mode filters, cursor handling, URL validation, fallback batches.
- Create `apps/server/src/services/stationModes.service.test.ts`: unit tests for mode filtering, dedupe, cursor, and no chat/TTS dependency.
- Create `apps/server/src/routes/modes.ts`: `POST /api/modes/start` and `POST /api/modes/next`.
- Create `apps/server/src/routes/modes.route.test.ts`: static route contract tests ensuring no DeepSeek/TTS/messagesRepo usage.
- Modify `apps/server/src/index.ts`: register mode routes.
- Modify `apps/server/src/services/ncm.service.ts`: expose cover URL in search/FM/daily results where available.
- Modify `apps/web/src/api/client.ts`: add `stationStart` and `stationNext`.
- Modify `apps/web/src/stores/playerStore.ts`: add station mode state, fade switch, append queue, refill threshold, failure tracking.
- Create `apps/web/src/components/StationSurface.tsx`: Random/Cafe/Library homepage theme surfaces.
- Create `apps/web/src/components/CoverAmbientBackground.tsx`: current-cover Gaussian ambient background.
- Modify `apps/web/src/pages/HomePage.tsx`: render station surfaces and station controls without touching chat/TTS flow.
- Modify `apps/web/src/styles/global.css`: add station theme styling.
- Create `apps/web/tests/stationApi.test.ts`: API payload contract tests.
- Create `apps/web/tests/stationPlayer.test.ts`: player-store station behavior tests.
- Create `apps/web/tests/stationSurface.test.ts`: static UI/theme contract tests.

---

### Task 1: Backend Station Service

**Files:**
- Create: `apps/server/src/services/stationModes.service.ts`
- Create: `apps/server/src/services/stationModes.service.test.ts`

- [ ] **Step 1: Write failing tests for mode batches**

Create `apps/server/src/services/stationModes.service.test.ts` with:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createStationModesService } from './stationModes.service.ts';

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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @claudio/server exec tsx --test src/services/stationModes.service.test.ts`

Expected: FAIL because `stationModes.service.ts` does not exist.

- [ ] **Step 3: Implement station service**

Create `apps/server/src/services/stationModes.service.ts` with these exported types and service factory:

```ts
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

interface StationRequest {
  mode: StationMode;
  cursor?: string;
  excludeSongIds?: string[];
}

type NcmLike = {
  search(keyword: string, limit?: number): Promise<SearchResult[]>;
  getSongUrl(songId: string): Promise<string | null>;
  getPersonalFm(): Promise<SearchResult[]>;
};

function text(song: SearchResult) {
  return `${song.name} ${song.artist || ''} ${song.album || ''}`.toLowerCase();
}

function isLibraryCandidate(song: SearchResult) {
  const haystack = text(song);
  if (/(feat\.|ft\.|rap|hip hop|vocal|voice|remix|说唱|人声|主唱|歌词)/i.test(haystack)) return false;
  return /(piano|instrumental|ambient|study|lofi|jazz|classical|钢琴|纯音乐|器乐|轻音乐|古典|氛围)/i.test(haystack);
}

function isCafeCandidate(song: SearchResult) {
  const haystack = text(song);
  if (/(hardstyle|metal|trap|dubstep|rock|rap|说唱|重金属|摇滚|电音)/i.test(haystack)) return false;
  return /(lofi|lo-fi|jazz|jazzhop|cafe|coffee|r&b|soul|chill|study|原声|爵士|咖啡|轻松)/i.test(haystack);
}

function modeSeeds(mode: StationMode, hints: SearchHints) {
  const taste = [...hints.tags, ...hints.preferredArtists].filter(Boolean).slice(0, 3);
  if (mode === 'focus-library') return [...taste, '纯音乐 学习 钢琴', 'instrumental study ambient'];
  if (mode === 'focus-cafe') return [...taste, 'lofi jazzhop cafe', '咖啡厅 lofi 爵士'];
  return [...taste, '私人fm', 'chill discovery'];
}

function score(song: SearchResult, hints: SearchHints) {
  const haystack = text(song);
  let value = 1;
  for (const artist of hints.preferredArtists) if (artist && haystack.includes(artist.toLowerCase())) value += 10;
  for (const tag of hints.tags) if (tag && haystack.includes(tag.toLowerCase())) value += 4;
  for (const avoid of hints.avoid) if (avoid && haystack.includes(avoid.toLowerCase())) value -= 50;
  return value;
}

export function createStationModesService(options?: {
  ncm?: NcmLike;
  getLocalCandidates?: (count?: number) => SearchResult[];
  getTasteHints?: () => Promise<SearchHints>;
}) {
  const ncm = options?.ncm || ncmService;
  const getLocalCandidates = options?.getLocalCandidates || contextService.getCandidates.bind(contextService);
  const getTasteHints = options?.getTasteHints || memoryService.getSearchHints.bind(memoryService);

  async function build(req: StationRequest): Promise<StationBatch> {
    const hints = await getTasteHints();
    const exclude = new Set(req.excludeSongIds || []);
    const candidates: SearchResult[] = [];

    for (const seed of modeSeeds(req.mode, hints)) {
      candidates.push(...await ncm.search(seed, 24));
    }
    if (req.mode === 'random-infinite') candidates.push(...await ncm.getPersonalFm());
    candidates.push(...getLocalCandidates(80));

    const seen = new Set<string>(exclude);
    const filtered = candidates
      .filter((song) => song?.id && !seen.has(song.id))
      .filter((song) => req.mode === 'focus-library' ? isLibraryCandidate(song) : req.mode === 'focus-cafe' ? isCafeCandidate(song) : true)
      .sort((a, b) => score(b, hints) - score(a, hints));

    const songs: StationSong[] = [];
    for (const song of filtered) {
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      const url = await ncm.getSongUrl(song.id);
      if (!url) continue;
      songs.push({ ...song, url });
      if (songs.length >= 15) break;
    }

    return {
      mode: req.mode,
      cursor: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
```

- [ ] **Step 4: Run service tests**

Run: `pnpm --filter @claudio/server exec tsx --test src/services/stationModes.service.test.ts`

Expected: PASS.

---

### Task 2: Backend Mode Routes

**Files:**
- Create: `apps/server/src/routes/modes.ts`
- Create: `apps/server/src/routes/modes.route.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write failing route contract tests**

Create `apps/server/src/routes/modes.route.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('mode routes are independent from chat, deepseek, and tts', () => {
  const source = fs.readFileSync(path.join(__dirname, 'modes.ts'), 'utf-8');

  assert.match(source, /app\.post\('\/api\/modes\/start'/);
  assert.match(source, /app\.post\('\/api\/modes\/next'/);
  assert.match(source, /stationModesService\.start/);
  assert.match(source, /stationModesService\.next/);
  assert.doesNotMatch(source, /deepseekService|ttsService|messagesRepo|registerChatRoutes/);
});

test('server registers mode routes', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf-8');
  assert.match(index, /import \{ registerModeRoutes \} from '\.\/routes\/modes\.js'/);
  assert.match(index, /registerModeRoutes\(app\)/);
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `pnpm --filter @claudio/server exec tsx --test src/routes/modes.route.test.ts`

Expected: FAIL because `modes.ts` is missing and `index.ts` is not registered.

- [ ] **Step 3: Implement route**

Create `apps/server/src/routes/modes.ts`:

```ts
import { FastifyInstance } from 'fastify';
import { stationModesService, type StationMode } from '../services/stationModes.service.js';

const MODES = new Set<StationMode>(['random-infinite', 'focus-cafe', 'focus-library']);

function parseMode(mode: unknown): StationMode {
  if (typeof mode === 'string' && MODES.has(mode as StationMode)) return mode as StationMode;
  throw new Error('Invalid station mode');
}

export function registerModeRoutes(app: FastifyInstance) {
  app.post('/api/modes/start', async (req, reply) => {
    const body = req.body as { mode?: unknown; excludeSongIds?: string[] };
    try {
      return await stationModesService.start({
        mode: parseMode(body?.mode),
        excludeSongIds: Array.isArray(body?.excludeSongIds) ? body.excludeSongIds : [],
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Mode start failed' });
    }
  });

  app.post('/api/modes/next', async (req, reply) => {
    const body = req.body as { mode?: unknown; cursor?: string; excludeSongIds?: string[] };
    try {
      return await stationModesService.next({
        mode: parseMode(body?.mode),
        cursor: body?.cursor || '',
        excludeSongIds: Array.isArray(body?.excludeSongIds) ? body.excludeSongIds : [],
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Mode next failed' });
    }
  });
}
```

Modify `apps/server/src/index.ts`:

```ts
import { registerModeRoutes } from './routes/modes.js';
```

and call:

```ts
registerModeRoutes(app);
```

near the other route registrations.

- [ ] **Step 4: Run route and service tests**

Run:

```powershell
pnpm --filter @claudio/server exec tsx --test src/services/stationModes.service.test.ts src/routes/modes.route.test.ts
```

Expected: PASS.

---

### Task 3: Cover URL Support

**Files:**
- Modify: `apps/server/src/services/ncm.service.ts`
- Test: `apps/server/src/services/stationModes.service.test.ts`

- [ ] **Step 1: Add test expectation for cover URL**

In `stationModes.service.test.ts`, add:

```ts
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
```

- [ ] **Step 2: Modify `SearchResult`**

In `apps/server/src/services/ncm.service.ts`, change:

```ts
export interface SearchResult {
  id: string; name: string; artist: string; album: string; duration: number;
}
```

to:

```ts
export interface SearchResult {
  id: string; name: string; artist: string; album: string; duration: number; coverUrl?: string;
}
```

Add `coverUrl` in `search`, `getPersonalFm`, `getDailyRecommend`, and playlist-track mapping from `s.album?.picUrl`, `s.al?.picUrl`, or equivalent NCM payload fields.

- [ ] **Step 3: Run server tests**

Run:

```powershell
pnpm --filter @claudio/server exec tsx --test src/services/stationModes.service.test.ts
pnpm --filter @claudio/server build
```

Expected: PASS.

---

### Task 4: Frontend Station API

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/tests/stationApi.test.ts`

- [ ] **Step 1: Write API contract test**

Create `apps/web/tests/stationApi.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('api client exposes independent station mode endpoints', () => {
  const client = fs.readFileSync(path.resolve(__dirname, '../src/api/client.ts'), 'utf-8');

  assert.match(client, /stationStart/);
  assert.match(client, /\/api\/modes\/start/);
  assert.match(client, /stationNext/);
  assert.match(client, /\/api\/modes\/next/);
  assert.doesNotMatch(client, /stationStart[\s\S]{0,240}\/api\/chat/);
});
```

- [ ] **Step 2: Run API test to verify failure**

Run: `pnpm --filter @claudio/web exec tsx --test tests/stationApi.test.ts`

Expected: FAIL because methods are missing.

- [ ] **Step 3: Add API methods**

In `apps/web/src/api/client.ts`, add:

```ts
  async stationStart(mode: string, excludeSongIds: string[] = []): Promise<any> {
    const resp = await fetch(`${BASE}/api/modes/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, excludeSongIds }),
    });
    return resp.json();
  },

  async stationNext(mode: string, cursor: string, excludeSongIds: string[] = []): Promise<any> {
    const resp = await fetch(`${BASE}/api/modes/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, cursor, excludeSongIds }),
    });
    return resp.json();
  },
```

- [ ] **Step 4: Run API test**

Run: `pnpm --filter @claudio/web exec tsx --test tests/stationApi.test.ts`

Expected: PASS.

---

### Task 5: Player Store Station State

**Files:**
- Modify: `apps/web/src/stores/playerStore.ts`
- Create: `apps/web/tests/stationPlayer.test.ts`

- [ ] **Step 1: Write station player tests**

Create `apps/web/tests/stationPlayer.test.ts`:

```ts
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
  play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  constructor() { super(); FakeAudio.instances.push(this); }
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @claudio/web exec tsx --test tests/stationPlayer.test.ts`

Expected: FAIL because station methods and state do not exist.

- [ ] **Step 3: Extend `Song` and `PlayerState`**

In `apps/web/src/stores/playerStore.ts`, change `Song` to:

```ts
export interface Song {
  song_id: string; song_name: string; artist: string; intro?: string; introUrl?: string; coverUrl?: string; url?: string;
}
```

Add:

```ts
export type StationMode = 'random-infinite' | 'focus-cafe' | 'focus-library' | '';
```

Add state fields and methods to `PlayerState`:

```ts
  activeStationMode: StationMode;
  stationCursor: string;
  stationHealth: 'idle' | 'ok' | 'refilling' | 'thin' | 'fallback' | 'error';
  stationBuffering: boolean;
  stationRecentFailures: string[];
  startStation: (mode: StationMode, songs: Song[], cursor: string, health?: PlayerState['stationHealth']) => void;
  appendStationSongs: (songs: Song[], cursor: string, health?: PlayerState['stationHealth']) => void;
  stopStation: () => void;
```

- [ ] **Step 4: Implement station methods**

Add initial state:

```ts
  activeStationMode: '',
  stationCursor: '',
  stationHealth: 'idle',
  stationBuffering: false,
  stationRecentFailures: [],
```

Implement:

```ts
  startStation: (mode, songs, cursor, health = 'ok') => {
    const nextSongs = uniqueSongs(songs.map(withoutSongIntro));
    pendingPlaylistIntroUrl = '';
    pendingPlaylistStartIndex = -1;
    if (audio && !audio.paused) fadeMusicTo(0, 800);
    set({
      activeStationMode: mode,
      stationCursor: cursor,
      stationHealth: health,
      stationBuffering: false,
      playlist: nextSongs,
      currentIndex: 0,
      musicPlaying: false,
      progressMs: 0,
    });
    localStorage.setItem(STORAGE, JSON.stringify({ playlist: nextSongs, currentIndex: 0, activeStationMode: mode, stationCursor: cursor }));
    if (nextSongs.length) setTimeout(() => get().playTrack(0), 850);
  },

  appendStationSongs: (songs, cursor, health = 'ok') => {
    const existing = new Set(get().playlist.map((song) => song.song_id));
    const additions = uniqueSongs(songs.map(withoutSongIntro)).filter((song) => !existing.has(song.song_id));
    set((state) => ({
      playlist: [...state.playlist, ...additions],
      stationCursor: cursor,
      stationHealth: health,
      stationBuffering: false,
    }));
  },

  stopStation: () => {
    set({ activeStationMode: '', stationCursor: '', stationHealth: 'idle', stationBuffering: false, stationRecentFailures: [] });
  },
```

- [ ] **Step 5: Run player tests**

Run:

```powershell
pnpm --filter @claudio/web exec tsx --test tests/stationPlayer.test.ts tests/playerStore.test.ts
```

Expected: PASS.

---

### Task 6: Frontend Station Surfaces

**Files:**
- Create: `apps/web/src/components/CoverAmbientBackground.tsx`
- Create: `apps/web/src/components/StationSurface.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/styles/global.css`
- Create: `apps/web/tests/stationSurface.test.ts`

- [ ] **Step 1: Write UI contract test**

Create `apps/web/tests/stationSurface.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('station surfaces define distinct random cafe and library themes', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /random-infinite/);
  assert.match(surface, /focus-cafe/);
  assert.match(surface, /focus-library/);
  assert.match(surface, /Focus Space/);
  assert.match(css, /\.station-surface--random/);
  assert.match(css, /\.station-surface--cafe/);
  assert.match(css, /\.station-surface--library/);
});

test('cover ambient background uses blurred cover-derived color field', () => {
  const ambient = fs.readFileSync(path.resolve(__dirname, '../src/components/CoverAmbientBackground.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(ambient, /coverUrl/);
  assert.match(ambient, /station-ambient/);
  assert.match(css, /\.station-ambient[\s\S]*filter: blur/);
  assert.match(css, /\.station-ambient[\s\S]*background/);
});
```

- [ ] **Step 2: Run UI test to verify failure**

Run: `pnpm --filter @claudio/web exec tsx --test tests/stationSurface.test.ts`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement cover ambient component**

Create `apps/web/src/components/CoverAmbientBackground.tsx`:

```tsx
interface CoverAmbientBackgroundProps {
  coverUrl?: string;
  mode: string;
}

export function CoverAmbientBackground({ coverUrl, mode }: CoverAmbientBackgroundProps) {
  return (
    <div className={`station-ambient station-ambient--${mode || 'default'}`} aria-hidden="true">
      {coverUrl && <img src={coverUrl} alt="" />}
      <div className="station-ambient-fallback" />
    </div>
  );
}
```

- [ ] **Step 4: Implement station surface component**

Create `apps/web/src/components/StationSurface.tsx`:

```tsx
import type { Song, StationMode } from '../stores/playerStore';
import { CoverAmbientBackground } from './CoverAmbientBackground';

interface StationSurfaceProps {
  mode: StationMode;
  song: Song | null;
  queueLength: number;
  health: string;
  buffering: boolean;
  onSelectMode: (mode: Exclude<StationMode, ''>) => void;
  onStop: () => void;
}

const labels = {
  'random-infinite': 'Random Infinite',
  'focus-cafe': 'Cafe',
  'focus-library': 'Library',
} as const;

export function StationSurface({ mode, song, queueLength, health, buffering, onSelectMode, onStop }: StationSurfaceProps) {
  if (!mode) return null;
  return (
    <section className={`station-surface station-surface--${mode}`}>
      <CoverAmbientBackground coverUrl={song?.coverUrl} mode={mode} />
      <div className="station-topline">
        <span>{mode === 'random-infinite' ? 'SIGNAL FLOW' : 'FOCUS SPACE'}</span>
        <button onClick={onStop}>EXIT</button>
      </div>
      <div className="station-title-block">
        <p>{labels[mode]}</p>
        <h2>{song?.song_name || 'Finding signal'}</h2>
        <span>{song?.artist || 'Claudio is tuning the room'}</span>
      </div>
      <div className="station-mode-tabs">
        <button className={mode === 'random-infinite' ? 'active' : ''} onClick={() => onSelectMode('random-infinite')}>Random</button>
        <button className={mode === 'focus-cafe' ? 'active' : ''} onClick={() => onSelectMode('focus-cafe')}>Cafe</button>
        <button className={mode === 'focus-library' ? 'active' : ''} onClick={() => onSelectMode('focus-library')}>Library</button>
      </div>
      <div className="station-health">
        <span>{buffering ? 'REFILLING' : health.toUpperCase()}</span>
        <span>{queueLength} BUFFERED</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add CSS**

Append to `apps/web/src/styles/global.css`:

```css
.station-surface {
  position: relative;
  min-height: 430px;
  overflow: hidden;
  border-radius: 28px;
  padding: 28px;
  isolation: isolate;
}
.station-ambient { position: absolute; inset: -42px; z-index: -2; overflow: hidden; }
.station-ambient img {
  width: 100%; height: 100%; object-fit: cover; filter: blur(48px) saturate(1.35);
  transform: scale(1.18); opacity: 0.72;
}
.station-ambient-fallback { position: absolute; inset: 0; opacity: 0.82; }
.station-surface--random .station-ambient-fallback {
  background: radial-gradient(circle at 25% 20%, rgba(69,98,255,.62), transparent 44%),
    radial-gradient(circle at 75% 64%, rgba(0,255,200,.38), transparent 50%), #050508;
}
.station-surface--cafe .station-ambient-fallback {
  background: radial-gradient(circle at 28% 24%, rgba(164,96,42,.48), transparent 48%),
    radial-gradient(circle at 78% 74%, rgba(76,39,20,.62), transparent 56%), #120c08;
}
.station-surface--library .station-ambient-fallback {
  background: radial-gradient(circle at 34% 18%, rgba(255,210,116,.58), transparent 46%),
    radial-gradient(circle at 70% 72%, rgba(134,92,45,.28), transparent 58%), #18130c;
}
.station-topline, .station-health, .station-mode-tabs { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.station-title-block { margin-top: 88px; max-width: 86%; }
.station-title-block p, .station-health { font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.4px; color: rgba(255,255,255,.72); }
.station-title-block h2 { font-size: clamp(36px, 8vw, 62px); line-height: .95; margin: 10px 0; }
.station-mode-tabs button, .station-topline button {
  border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.22); color: #fff;
  border-radius: 999px; padding: 8px 12px; font-family: var(--font-mono); font-size: 10px;
}
.station-mode-tabs button.active { background: rgba(255,255,255,.9); color: #111; }
```

- [ ] **Step 6: Wire into HomePage**

In `apps/web/src/pages/HomePage.tsx`, import:

```ts
import { StationSurface } from '../components/StationSurface';
```

Render after the hero/player area or in place of the hero when `p.activeStationMode` exists:

```tsx
{p.activeStationMode && (
  <StationSurface
    mode={p.activeStationMode}
    song={song}
    queueLength={p.playlist.length}
    health={p.stationHealth}
    buffering={p.stationBuffering}
    onSelectMode={(mode) => startStationMode(mode)}
    onStop={p.stopStation}
  />
)}
```

Define `startStationMode` in HomePage after `song`:

```ts
const startStationMode = useCallback(async (mode: 'random-infinite' | 'focus-cafe' | 'focus-library') => {
  const excludeSongIds = p.playlist.map((item) => item.song_id);
  const data = await apiClient.stationStart(mode, excludeSongIds);
  const stationSongs = (data.songs || []).map((s: any) => ({
    song_id: s.id,
    song_name: s.name,
    artist: s.artist,
    coverUrl: s.coverUrl,
    url: s.url,
  }));
  p.startStation(mode, stationSongs, data.cursor || '', data.health || 'ok');
}, [p]);
```

- [ ] **Step 7: Run UI test**

Run: `pnpm --filter @claudio/web exec tsx --test tests/stationSurface.test.ts`

Expected: PASS.

---

### Task 7: Station Refill Reliability

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/stores/playerStore.ts`
- Test: `apps/web/tests/stationPlayer.test.ts`

- [ ] **Step 1: Add single-flight refill test**

Append to `apps/web/tests/stationPlayer.test.ts`:

```ts
test('station refill request is single-flight and excludes queued songs', async () => {
  const homePage = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf-8')
  );

  assert.match(homePage, /stationRefillInFlightRef/);
  assert.match(homePage, /remaining <= 5/);
  assert.match(homePage, /apiClient\.stationNext/);
  assert.match(homePage, /p\.playlist\.map\(\(item\) => item\.song_id\)/);
});
```

- [ ] **Step 2: Implement refill effect**

In `HomePage.tsx`, add:

```ts
const stationRefillInFlightRef = useRef(false);
```

Add effect:

```ts
useEffect(() => {
  if (!p.activeStationMode || !p.stationCursor || stationRefillInFlightRef.current) return;
  const remaining = p.playlist.length - p.currentIndex - 1;
  if (remaining > 5) return;
  stationRefillInFlightRef.current = true;
  const excludeSongIds = p.playlist.map((item) => item.song_id);
  apiClient.stationNext(p.activeStationMode, p.stationCursor, excludeSongIds)
    .then((data) => {
      const stationSongs = (data.songs || []).map((s: any) => ({
        song_id: s.id,
        song_name: s.name,
        artist: s.artist,
        coverUrl: s.coverUrl,
        url: s.url,
      }));
      p.appendStationSongs(stationSongs, data.cursor || p.stationCursor, data.health || 'ok');
    })
    .catch(() => {
      usePlayerStore.setState({ stationHealth: 'error', stationBuffering: false });
    })
    .finally(() => {
      stationRefillInFlightRef.current = false;
    });
}, [p.activeStationMode, p.stationCursor, p.currentIndex, p.playlist.length]);
```

- [ ] **Step 3: Ensure track failures are remembered in station mode**

In `scheduleNextAfterPlaybackFailure` or the `audio error` path in `playerStore.ts`, add failed song id to `stationRecentFailures` before skipping:

```ts
const failed = usePlayerStore.getState().playlist[usePlayerStore.getState().currentIndex];
if (failed?.song_id) {
  usePlayerStore.setState((state) => ({
    stationRecentFailures: [...state.stationRecentFailures, failed.song_id].slice(-50),
  }));
}
```

- [ ] **Step 4: Run player and UI tests**

Run:

```powershell
pnpm --filter @claudio/web exec tsx --test tests/stationPlayer.test.ts tests/stationSurface.test.ts tests/playerStore.test.ts
```

Expected: PASS.

---

### Task 8: Verification And Browser QA

**Files:**
- No new files unless fixing defects found by tests or browser QA.

- [ ] **Step 1: Run backend tests and build**

Run:

```powershell
pnpm --filter @claudio/server exec tsx --test src/services/stationModes.service.test.ts src/routes/modes.route.test.ts src/routes/chat.route.test.ts
pnpm --filter @claudio/server build
```

Expected: all tests PASS, `tsc` PASS.

- [ ] **Step 2: Run frontend tests and build**

Run:

```powershell
pnpm --filter @claudio/web exec tsx --test tests/stationApi.test.ts tests/stationPlayer.test.ts tests/stationSurface.test.ts tests/playerStore.test.ts tests/speakingOverlayAudio.test.ts
pnpm --filter @claudio/web build
```

Expected: all tests PASS, Vite build PASS.

- [ ] **Step 3: Restart dev servers if needed**

If Vite/server are already running, rely on HMR for source changes. If not, start the existing dev command used by the project. Verify:

- Backend listens on `http://localhost:8080`.
- Frontend listens on `http://localhost:5173`.

- [ ] **Step 4: Browser QA**

Use the in-app browser at `http://localhost:5173/`.

Verify:

- Random station starts without chat message or TTS.
- Cafe station uses dim warm original-wood color temperature, not literal wood texture.
- Library station uses warm yellow reading-light styling and low motion.
- Current song cover creates blurred Gaussian ambience behind the station surface.
- Switching modes fades out current music and starts the selected mode.
- Remaining queue refill does not pause current audio.
- TTS overlay still opens/closes normally in default mode.

- [ ] **Step 5: Cloudflare-style slow network check**

Temporarily simulate slow `/api/modes/next` by adding a local delay in route code during testing or by using browser throttling. Confirm:

- Current song continues playing while refill waits.
- UI shows health/buffering state.
- Only one refill request is in flight.
- Removing the delay restores normal refill.

Remove any temporary delay before final verification.

---

## Self-Review Checklist

- Spec coverage: station API, no chat/TTS, three themes, cover Gaussian ambience, fade switching, buffered refill, Cloudflare slow path, and tests are covered.
- Placeholder scan: no `TBD`, `TODO`, or implementation placeholders remain.
- Type consistency: backend mode ids are `random-infinite`, `focus-cafe`, `focus-library`; frontend `StationMode` uses the same ids.
- Risk: Library instrumental filtering is heuristic in v1; tests should protect obvious vocal/rap rejection, but real-world metadata may still need tuning after listening tests.
