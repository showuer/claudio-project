# Claudio Memory And Search System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Claudio's canonical editable memory system, inject a compact memory summary into DeepSeek, improve music search intent handling, and archive non-runtime reference documents outside the repo.

**Architecture:** Add a focused `memory.service.ts` that owns profile initialization, section parsing, legacy migration, derived stats, and prompt summaries. Add a focused `search.service.ts` that owns Chinese music-intent normalization, playable-result validation, local fallback, and memory-aware ranking. Existing routes and frontend pages should call these services instead of directly reading loose markdown files.

**Tech Stack:** TypeScript, Fastify, Node built-in `fs/path`, existing SQLite repos, existing NCM HTTP service, React, Vitest/Node test runner through the repo's current commands.

---

## File Structure

- Create `apps/server/src/services/memory.service.ts`: canonical memory file initialization, markdown section helpers, legacy migration, stats synthesis, prompt-safe memory summary, editable profile API helpers, style tag updates, mood updates.
- Create `apps/server/src/services/memory.service.test.ts`: Node tests for migration, parsing, manual override priority, summary compactness, and missing-file behavior.
- Create `apps/server/src/services/search.service.ts`: intent detection, keyword extraction, NCM search, playable URL validation, local fallback, memory ranking, 10-track playlist candidates.
- Create `apps/server/src/services/search.service.test.ts`: Node tests for Chinese query normalization, chat/music distinction, playable filtering, local fallback, and memory ranking.
- Modify `apps/server/src/services/context.service.ts`: replace raw `taste.md` and `routines.md` reads with `memoryService.getPromptMemory()`.
- Modify `apps/server/src/prompts/system.md`: replace `{{taste}}` and `{{routines}}` with `{{memoryProfile}}`; preserve current Claudio voice and intro rules.
- Modify `apps/server/src/routes/profile.ts`: add memory endpoints, keep compatibility endpoints, and route style/mood edits through `memoryService`.
- Modify `apps/server/src/routes/chat.ts`: use `searchService` for explicit music intents before DeepSeek response generation; write mood through `memoryService`; keep AIDJ 10-track behavior.
- Modify `apps/server/src/routes/search.ts`: call `searchService.searchPlayable()` so plain search endpoint matches chat behavior.
- Modify `apps/web/src/api/client.ts`: add memory profile and memory summary methods.
- Modify `apps/web/src/pages/ProfilePage.tsx`: replace taste-only editor with Memory editor plus derived summary cards.
- Modify `apps/web/src/components/ProfileCard.tsx`: fetch compact memory summary endpoint while keeping current visual layout.
- Create `C:\Users\宅急便\Desktop\claudio-archive\2026-05-22-memory-cleanup\MANIFEST.md` during cleanup: record each moved non-runtime file, original path, reason, and reference check result.

---

### Task 1: Memory Service Tests

**Files:**
- Create: `apps/server/src/services/memory.service.test.ts`
- Create in task runtime only: temporary fixture directories through `node:test`

- [ ] **Step 1: Write failing memory tests**

Create `apps/server/src/services/memory.service.test.ts` with:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMemoryService } from './memory.service.js';

function makeUserDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudio-memory-'));
}

test('initializes memory.profile.md from legacy taste routines and mood files', async () => {
  const userDir = makeUserDir();
  fs.writeFileSync(path.join(userDir, 'taste.md'), '# 我的音乐品味\n\n## 风格偏好\n- R&B\n- 华语流行\n\n## 生活哲思\n- 夜里要慢一点\n', 'utf8');
  fs.writeFileSync(path.join(userDir, 'routines.md'), '# 作息\n- 深夜写代码时听歌\n', 'utf8');
  fs.writeFileSync(path.join(userDir, 'mood.md'), '有点累，但想被音乐接住', 'utf8');

  const service = createMemoryService({ userDir });
  const profile = await service.getEditableProfile();

  assert.match(profile.content, /# Claudio Memory Profile/);
  assert.match(profile.content, /## Taste[\s\S]*R&B/);
  assert.match(profile.content, /## Routines[\s\S]*深夜写代码/);
  assert.match(profile.content, /## Mood[\s\S]*有点累/);
});

test('manual overrides appear before learned statistics in prompt memory', async () => {
  const userDir = makeUserDir();
  fs.writeFileSync(path.join(userDir, 'memory.profile.md'), [
    '# Claudio Memory Profile',
    '',
    '## Identity',
    '- Claudio 是私人 AI 电台。',
    '',
    '## Manual Overrides',
    '- 不要推荐过度吵闹的歌。',
    '',
    '## Taste',
    '- 喜欢陶喆、R&B、夜晚感。',
    '',
    '## Dislikes And Boundaries',
    '- 不要硬摇滚。',
    '',
    '## Mood',
    '- 平静。',
    '',
    '## Routines',
    '- 晚上写代码。',
    '',
    '## Listening Stats',
    '- 保持自动统计。',
    '',
    '## Learned Preferences',
    '- 自动学习。',
    '',
    '## Recent Context',
    '- 无。',
    '',
    '## Search And Recommendation Rules',
    '- 明确要歌时才推歌。',
    '',
  ].join('\n'), 'utf8');

  const service = createMemoryService({ userDir, getStats: async () => ({
    totalHours: 1,
    totalPlays: 3,
    topArtists: [{ artist: 'Heavy Artist', count: 3 }],
  }) });
  const summary = await service.getPromptMemory('放点陶喆', 'music');

  assert.ok(summary.indexOf('Manual Overrides') < summary.indexOf('Learned'));
  assert.match(summary, /不要推荐过度吵闹的歌/);
  assert.match(summary, /陶喆/);
});

test('updates taste tags inside canonical memory profile', async () => {
  const userDir = makeUserDir();
  const service = createMemoryService({ userDir });

  const updated = await service.updateStyleTags(['r&b', ' mandarin pop ', '']);
  assert.deepEqual(updated.tags, ['R&B', 'MANDARIN POP']);

  const profile = await service.getEditableProfile();
  assert.match(profile.content, /## Taste[\s\S]*- R&B[\s\S]*- MANDARIN POP/);
});

test('summary endpoint returns compact UI fields', async () => {
  const userDir = makeUserDir();
  fs.writeFileSync(path.join(userDir, 'memory.profile.md'), [
    '# Claudio Memory Profile',
    '',
    '## Identity',
    '- Your private AI DJ.',
    '',
    '## Manual Overrides',
    '- 说话像温柔男主播。',
    '',
    '## Taste',
    '- R&B',
    '- 陶喆',
    '',
    '## Dislikes And Boundaries',
    '- 避免太吵。',
    '',
    '## Mood',
    '- 松弛',
    '',
    '## Routines',
    '- 深夜写代码。',
    '',
    '## Listening Stats',
    '- 自动统计。',
    '',
    '## Learned Preferences',
    '- 慢热旋律。',
    '',
    '## Recent Context',
    '- 刚刚在调歌。',
    '',
    '## Search And Recommendation Rules',
    '- 明确要歌才推。',
    '',
  ].join('\n'), 'utf8');

  const service = createMemoryService({ userDir, getStats: async () => ({
    totalHours: 2,
    totalPlays: 5,
    topArtists: [{ artist: '陶喆', count: 4 }],
  }) });
  const summary = await service.getSummary();

  assert.equal(summary.mood, '松弛');
  assert.deepEqual(summary.tags.slice(0, 2), ['R&B', '陶喆']);
  assert.equal(summary.topArtists[0], '陶喆');
  assert.equal(summary.totalPlays, 5);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/memory.service.test.ts
```

Expected: fail with a module-not-found error for `memory.service.js`.

- [ ] **Step 3: Commit failing tests**

```powershell
git add apps/server/src/services/memory.service.test.ts
git commit -m "test: define memory service behavior"
```

---

### Task 2: Memory Service Implementation

**Files:**
- Create: `apps/server/src/services/memory.service.ts`
- Modify only if imports require it: none
- Test: `apps/server/src/services/memory.service.test.ts`

- [ ] **Step 1: Implement memory service**

Create `apps/server/src/services/memory.service.ts` with these public interfaces:

```ts
export type MemoryMode = 'chat' | 'music' | 'aidj' | 'profile';

export interface MemoryStats {
  totalHours: number;
  totalPlays: number;
  topArtists: Array<{ artist: string; count: number }>;
}

export interface MemorySummary {
  tags: string[];
  topArtists: string[];
  mood: string;
  copy: string;
  philosophy: string;
  totalHours: number;
  totalPlays: number;
  avoid: string[];
  routines: string[];
}

export function createMemoryService(options?: {
  userDir?: string;
  appsUserDir?: string;
  getStats?: () => Promise<MemoryStats>;
}): {
  getEditableProfile(): Promise<{ content: string }>;
  saveEditableProfile(content: string): Promise<{ saved: true }>;
  getPromptMemory(userMessage: string, mode: MemoryMode): Promise<string>;
  getSummary(): Promise<MemorySummary>;
  updateStyleTags(tags: string[]): Promise<{ saved: true; tags: string[] }>;
  updateMood(mood: string): Promise<{ saved: true; mood: string }>;
  getSearchHints(): Promise<{ preferredArtists: string[]; tags: string[]; avoid: string[]; mood: string; routines: string[] }>;
}
```

Implementation details:

```ts
const SECTION_NAMES = [
  'Identity',
  'Manual Overrides',
  'Taste',
  'Dislikes And Boundaries',
  'Mood',
  'Routines',
  'Listening Stats',
  'Learned Preferences',
  'Recent Context',
  'Search And Recommendation Rules',
] as const;

function extractSection(content: string, name: string): string {
  const match = content.match(new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'));
  return match ? match[1].trim() : '';
}

function replaceSection(content: string, name: string, body: string): string {
  const section = `## ${name}\n${body.trim()}\n`;
  const re = new RegExp(`## ${name}\\n[\\s\\S]*?(?=\\n## |$)`);
  if (re.test(content)) return content.replace(re, section.trimEnd());
  return `${content.trimEnd()}\n\n${section}`;
}

function bulletLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}
```

Initialize missing profile by reading legacy files:

```ts
function buildInitialProfile(userDir: string, appsUserDir: string): string {
  const taste = readSafe(path.join(userDir, 'taste.md'), '# 我的音乐品味\n- 喜欢自然、有情绪连接的歌');
  const routines = readSafe(path.join(userDir, 'routines.md'), '- 全天都可以听歌，但深夜更需要陪伴感');
  const mood = readSafe(path.join(userDir, 'mood.md'), readSafe(path.join(appsUserDir, 'mood.md'), '平静')).trim();
  return [
    '# Claudio Memory Profile',
    '',
    '## Identity',
    '- Claudio 是一个私人 AI 电台和 AIDJ，语气像真实 FM 男主播。',
    '',
    '## Manual Overrides',
    '- 只有用户明确有放歌、搜歌、推歌需求时才推歌。',
    '- 推歌必须先生成一段完整 intro。',
    '',
    '## Taste',
    taste.trim(),
    '',
    '## Dislikes And Boundaries',
    '- 不要为了显得懂音乐而百科式解释。',
    '',
    '## Mood',
    `- ${mood || '平静'}`,
    '',
    '## Routines',
    routines.trim(),
    '',
    '## Listening Stats',
    '- 由播放记录自动生成。',
    '',
    '## Learned Preferences',
    '- 由喜欢、播放、跳过和搜索行为自动生成。',
    '',
    '## Recent Context',
    '- 暂无。',
    '',
    '## Search And Recommendation Rules',
    '- 搜歌先提取歌手、歌名或场景核心词，再查找可播放歌曲。',
    '',
  ].join('\n');
}
```

Prompt summary must include manual overrides before learned stats:

```ts
function buildPromptSummary(profile: string, stats: MemoryStats, mode: MemoryMode, userMessage: string): string {
  const manual = extractSection(profile, 'Manual Overrides');
  const taste = extractSection(profile, 'Taste');
  const avoid = extractSection(profile, 'Dislikes And Boundaries');
  const mood = extractSection(profile, 'Mood');
  const routines = extractSection(profile, 'Routines');
  const recent = extractSection(profile, 'Recent Context');
  const rules = extractSection(profile, 'Search And Recommendation Rules');
  const top = stats.topArtists.slice(0, 6).map((a) => `${a.artist}(${a.count})`).join('、') || '暂无';
  return [
    '## Claudio Memory For This Reply',
    `Mode: ${mode}`,
    `User request: ${userMessage.slice(0, 120)}`,
    '',
    'Manual Overrides:',
    manual || '- 无',
    '',
    'Current Mood:',
    mood || '- 平静',
    '',
    'Taste:',
    taste || '- 喜欢有情绪连接的音乐',
    '',
    'Routines:',
    routines || '- 全天可听歌',
    '',
    'Learned Listening Pattern:',
    `- Total plays: ${stats.totalPlays}`,
    `- Top artists: ${top}`,
    '',
    'Avoid:',
    avoid || '- 无',
    '',
    'Recommendation Strategy:',
    rules || '- 明确要歌时才推歌；intro 像真实 FM，不逐首介绍。',
    '',
    'Recent Context:',
    recent || '- 无',
  ].join('\n').slice(0, 1800);
}
```

- [ ] **Step 2: Run memory service tests**

Run:

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/memory.service.test.ts
```

Expected: all `memory.service` tests pass.

- [ ] **Step 3: Commit implementation**

```powershell
git add apps/server/src/services/memory.service.ts apps/server/src/services/memory.service.test.ts
git commit -m "feat: add canonical memory service"
```

---

### Task 3: Context And Prompt Integration

**Files:**
- Modify: `apps/server/src/services/context.service.ts`
- Modify: `apps/server/src/prompts/system.md`
- Test: add or extend `apps/server/src/services/context.service.test.ts`

- [ ] **Step 1: Write failing context test**

Create `apps/server/src/services/context.service.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('context service injects memoryProfile and no longer replaces taste/routines placeholders', () => {
  const source = fs.readFileSync(new URL('./context.service.ts', import.meta.url), 'utf8');
  const prompt = fs.readFileSync(new URL('../prompts/system.md', import.meta.url), 'utf8');

  assert.match(source, /memoryService\.getPromptMemory/);
  assert.doesNotMatch(source, /readFileSafe\(path\.join\(USER_DIR, 'taste\.md'\)/);
  assert.doesNotMatch(source, /replace\('\{\{taste\}\}'/);
  assert.match(prompt, /\{\{memoryProfile\}\}/);
  assert.doesNotMatch(prompt, /\{\{taste\}\}/);
  assert.doesNotMatch(prompt, /\{\{routines\}\}/);
});
```

- [ ] **Step 2: Run context test and confirm failure**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/context.service.test.ts
```

Expected: fail because the service still reads `taste.md` and `routines.md`.

- [ ] **Step 3: Update context service and prompt**

In `apps/server/src/services/context.service.ts`:

```ts
import { memoryService, type MemoryMode } from './memory.service.js';
```

Replace `assembleContext(userMessage: string)` with:

```ts
async assembleContext(userMessage: string, mode: MemoryMode = 'chat') {
  const memoryProfile = await memoryService.getPromptMemory(userMessage, mode);
  const weather = await weatherService.getCurrent();
  const weatherStr = weatherService.formatNatural(weather);
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} ${weekdays[now.getDay()]}`;
  const recentPlays = await playsRepo.getRecent(20);
  const recentStr = recentPlays.map((p) => `- ${p.song_name} - ${p.artist || '未知'}`).join('\n') || '无记录';
  const queue = await queueRepo.getAll();
  const queueStr = queue.map((q) => `${q.song_name} - ${q.artist || ''}`).join(', ') || '空';
  const systemPrompt = readFileSafe(path.join(__dirname, '..', 'prompts', 'system.md'), '你是 Claudio。{{memoryProfile}}');
  const fullSystem = `${systemPrompt}

## Current playback rule
When recommending songs, write one continuous playlist opening in "say" only. Do not write per-song intros. Return songs as metadata only: id, name, artist.`
    .replace('{{memoryProfile}}', memoryProfile)
    .replace('{{weather}}', weatherStr)
    .replace('{{time}}', timeStr)
    .replace('{{recentPlays}}', recentStr)
    .replace('{{currentQueue}}', queueStr);

  return { systemPrompt: fullSystem, userMessage, weather: weatherStr, time: timeStr };
}
```

In `apps/server/src/prompts/system.md`, replace the taste/routines block with:

```md
## 记忆
{{memoryProfile}}
```

- [ ] **Step 4: Run context tests**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/memory.service.test.ts src/services/context.service.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit context integration**

```powershell
git add apps/server/src/services/context.service.ts apps/server/src/prompts/system.md apps/server/src/services/context.service.test.ts
git commit -m "feat: inject canonical memory into prompts"
```

---

### Task 4: Profile Memory API

**Files:**
- Modify: `apps/server/src/routes/profile.ts`
- Test: extend `apps/server/src/routes/chat.route.test.ts` or create `apps/server/src/routes/profile.route.test.ts`

- [ ] **Step 1: Write route source test**

Create `apps/server/src/routes/profile.route.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('profile routes expose memory endpoints and delegate legacy endpoints to memoryService', () => {
  const source = fs.readFileSync(new URL('./profile.ts', import.meta.url), 'utf8');

  assert.match(source, /memoryService/);
  assert.match(source, /app\.get\('\/api\/profile\/memory'/);
  assert.match(source, /app\.put\('\/api\/profile\/memory'/);
  assert.match(source, /app\.get\('\/api\/profile\/memory\/summary'/);
  assert.match(source, /updateStyleTags/);
  assert.match(source, /updateMood/);
  assert.doesNotMatch(source, /writeFileSync\(path\.join\(USER_DIR, 'taste\.md'\)/);
});
```

- [ ] **Step 2: Run route test and confirm failure**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/routes/profile.route.test.ts
```

Expected: fail because memory endpoints do not exist.

- [ ] **Step 3: Update profile routes**

At the top of `apps/server/src/routes/profile.ts`:

```ts
import { memoryService } from '../services/memory.service.js';
```

Add endpoints:

```ts
app.get('/api/profile/memory', async () => {
  return memoryService.getEditableProfile();
});

app.put('/api/profile/memory', async (req) => {
  const { content } = req.body as { content: string };
  return memoryService.saveEditableProfile(String(content || ''));
});

app.get('/api/profile/memory/summary', async () => {
  return memoryService.getSummary();
});
```

Change compatibility endpoints:

```ts
app.get('/api/profile/taste', async () => {
  return memoryService.getEditableProfile();
});

app.put('/api/profile/taste', async (req) => {
  const { content } = req.body as { content: string };
  return memoryService.saveEditableProfile(String(content || ''));
});

app.get('/api/profile/styles', async () => {
  return memoryService.getSummary();
});

app.put('/api/profile/styles', async (req) => {
  const { tags } = req.body as { tags: string[] };
  if (!Array.isArray(tags)) return { saved: false, error: 'tags must be an array' };
  return memoryService.updateStyleTags(tags);
});

app.get('/api/profile/mood', async () => {
  const summary = await memoryService.getSummary();
  return { mood: summary.mood };
});

app.put('/api/profile/mood', async (req) => {
  const { mood } = req.body as { mood: string };
  return memoryService.updateMood(String(mood || ''));
});
```

- [ ] **Step 4: Run profile and memory tests**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/memory.service.test.ts src/routes/profile.route.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit API changes**

```powershell
git add apps/server/src/routes/profile.ts apps/server/src/routes/profile.route.test.ts
git commit -m "feat: expose editable memory profile"
```

---

### Task 5: Search Service Tests

**Files:**
- Create: `apps/server/src/services/search.service.test.ts`
- Create: `apps/server/src/services/search.service.ts`

- [ ] **Step 1: Write failing search tests**

Create `apps/server/src/services/search.service.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/search.service.test.ts
```

Expected: fail with a module-not-found error for `search.service.js`.

- [ ] **Step 3: Commit failing tests**

```powershell
git add apps/server/src/services/search.service.test.ts
git commit -m "test: define music search behavior"
```

---

### Task 6: Search Service Implementation

**Files:**
- Create: `apps/server/src/services/search.service.ts`
- Modify if needed: `apps/server/src/services/context.service.ts` only for shared `LibrarySong` export
- Test: `apps/server/src/services/search.service.test.ts`

- [ ] **Step 1: Implement search service**

Create `apps/server/src/services/search.service.ts`:

```ts
import { contextService } from './context.service.js';
import { memoryService } from './memory.service.js';
import { ncmService, type SearchResult } from './ncm.service.js';

export type MusicIntent =
  | { kind: 'music'; query: string; reason: 'explicit-search' | 'explicit-play' | 'scene' }
  | { kind: 'chat'; query: string; reason: 'question-about-entity' | 'no-music-intent' };

type NcmLike = Pick<typeof ncmService, 'search' | 'getSongUrl'>;

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
```

Public factory:

```ts
export function createSearchService(options?: {
  ncm?: NcmLike;
  getMemoryHints?: typeof memoryService.getSearchHints;
  getLocalCandidates?: typeof contextService.getCandidates;
}) {
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

  function score(song: SearchResult, keyword: string, hints: Awaited<ReturnType<typeof memoryService.getSearchHints>>): number {
    const haystack = `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    let value = 0;
    if (haystack.includes(lowerKeyword)) value += 20;
    if (hints.preferredArtists.some((artist) => song.artist?.toLowerCase().includes(artist.toLowerCase()))) value += 15;
    if (hints.tags.some((tag) => haystack.includes(tag.toLowerCase()))) value += 4;
    if (hints.avoid.some((term) => haystack.includes(term.toLowerCase()))) value -= 50;
    return value;
  }

  async function withPlayable(items: SearchResult[], limit: number): Promise<SearchResult[]> {
    const playable: SearchResult[] = [];
    for (const item of items) {
      if (!item.id) continue;
      const url = await ncm.getSongUrl(item.id);
      if (!url) continue;
      playable.push(item);
      if (playable.length >= limit) break;
    }
    return playable;
  }

  async function searchPlayable(message: string, limit = 10) {
    const intent = detectIntent(message);
    if (intent.kind === 'chat') return { intent, keyword: intent.query, source: 'none' as const, songs: [] };
    const hints = await getMemoryHints();
    const keyword = intent.query || hints.preferredArtists[0] || message;
    const remote = await withPlayable(await ncm.search(keyword, Math.max(limit * 2, 20)), limit);
    const remoteRanked = remote.sort((a, b) => score(b, keyword, hints) - score(a, keyword, hints));
    if (remoteRanked.length > 0) return { intent, keyword, source: 'ncm' as const, songs: remoteRanked.slice(0, limit) };
    const local = getLocalCandidates(300)
      .filter((song) => `${song.name} ${song.artist} ${song.album || ''}`.toLowerCase().includes(keyword.toLowerCase()) || hints.preferredArtists.includes(song.artist))
      .sort((a, b) => score(b, keyword, hints) - score(a, keyword, hints))
      .slice(0, limit);
    return { intent, keyword, source: 'local' as const, songs: local };
  }

  return { detectIntent, searchPlayable };
}

export const searchService = createSearchService();
```

- [ ] **Step 2: Run search tests**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/search.service.test.ts
```

Expected: all search service tests pass.

- [ ] **Step 3: Commit search service**

```powershell
git add apps/server/src/services/search.service.ts apps/server/src/services/search.service.test.ts
git commit -m "feat: add playable music search service"
```

---

### Task 7: Chat And Search Route Integration

**Files:**
- Modify: `apps/server/src/routes/chat.ts`
- Modify: `apps/server/src/routes/search.ts`
- Modify: `apps/server/src/routes/chat.route.test.ts`

- [ ] **Step 1: Extend route tests**

Add to `apps/server/src/routes/chat.route.test.ts`:

```ts
test('chat route uses searchService for explicit music intent before DeepSeek playlist flow', () => {
  const chatRoute = fs.readFileSync(new URL('./chat.ts', import.meta.url), 'utf8');

  assert.match(chatRoute, /searchService\.searchPlayable\(message,\s*AIDJ_TRACK_COUNT\)/);
  assert.doesNotMatch(chatRoute, /const searchMatch = message\.match/);
  assert.doesNotMatch(chatRoute, /ncmService\.search\(searchMatch\[2\]/);
});

test('chat route writes detected mood through memoryService', () => {
  const chatRoute = fs.readFileSync(new URL('./chat.ts', import.meta.url), 'utf8');

  assert.match(chatRoute, /memoryService\.updateMood/);
  assert.doesNotMatch(chatRoute, /writeFileSync\(path\.join\(rootDir, 'user', 'mood\.md'\)/);
});
```

Create `apps/server/src/routes/search.route.test.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('search route uses playable search service', () => {
  const source = fs.readFileSync(new URL('./search.ts', import.meta.url), 'utf8');
  assert.match(source, /searchService\.searchPlayable/);
  assert.doesNotMatch(source, /ncmService\.search/);
});
```

- [ ] **Step 2: Run route tests and confirm failure**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/routes/chat.route.test.ts src/routes/search.route.test.ts
```

Expected: fail because routes still use direct regex/NCM file writes.

- [ ] **Step 3: Update chat route imports**

In `apps/server/src/routes/chat.ts`:

```ts
import { searchService } from '../services/search.service.js';
import { memoryService } from '../services/memory.service.js';
```

Remove unused direct `fs/path/fileURLToPath/rootDir` mood writing if no longer needed.

- [ ] **Step 4: Replace simple search branch with playable playlist branch**

Replace the current simple search block that starts with `const searchMatch = message.match(/^(搜索|找|搜|有没有)\s*(.+)/i);` with:

```ts
const playableSearch = await searchService.searchPlayable(message, AIDJ_TRACK_COUNT);
if (playableSearch.intent.kind === 'music') {
  const songs = playableSearch.songs.map((s) => ({ id: s.id, name: s.name, artist: s.artist || '未知' }));
  if (songs.length === 0) {
    return { type: 'chat', say: `我认真找了「${playableSearch.keyword}」，但现在没有拿到可播放的版本。` };
  }
  const ctx = await contextService.assembleContext(message, 'music');
  const candidateStr = songs.map((s, i) => `${i + 1}. [${s.id}] ${s.name} - ${s.artist}`).join('\n');
  const openingPrompt = [
    { role: 'system' as const, content: ctx.systemPrompt.replace('{{chatHistory}}', '（本轮是明确搜歌/放歌请求）') },
    { role: 'user' as const, content: `用户明确想听: ${message}\n\n后端已经找到这些可播放歌曲:\n${candidateStr}\n\n只从这些歌里组织一个 10 首以内歌单。写一段完整中文 FM intro，不要逐首介绍。返回严格 JSON: {"theme":"主题","say":"180-280字中文开场，只重点解读其中一首最推荐的歌","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手"}]}` },
  ];
  const output = await deepseekService.chatComplete(openingPrompt);
  const say = ensureOneMinuteOpening(output.say || `找到 ${playableSearch.keyword} 了，我们慢慢听。`, songs);
  const ttsResult = await ttsService.synthesize(say);
  const djMsgId = crypto.randomUUID();
  await messagesRepo.insert({ id: djMsgId, role: 'dj', content: say, tts_url: ttsResult.audioUrl || null, played: 0 });
  return {
    type: 'playlist',
    id: djMsgId,
    say,
    ttsUrl: ttsResult.audioUrl,
    alignment: ttsResult.alignment,
    theme: output.theme || playableSearch.keyword,
    songs,
    songIntros: {},
    songIntroAlignments: {},
    source: playableSearch.source,
  };
}
```

- [ ] **Step 5: Update mood save**

Replace raw mood file write with:

```ts
if ((output as any).mood && typeof (output as any).mood === 'string') {
  await memoryService.updateMood((output as any).mood);
}
```

- [ ] **Step 6: Update search route**

In `apps/server/src/routes/search.ts`:

```ts
import { searchService } from '../services/search.service.js';

export function registerSearchRoutes(app: FastifyInstance) {
  app.get('/api/search', async (req) => {
    const { q, limit } = req.query as { q?: string; limit?: string };
    const result = await searchService.searchPlayable(q || '', parseInt(limit || '10'));
    return { results: result.songs, keyword: result.keyword, source: result.source };
  });
}
```

- [ ] **Step 7: Run backend route and service tests**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/*.test.ts src/routes/*.test.ts
```

Expected: all backend tests pass.

- [ ] **Step 8: Commit route integration**

```powershell
git add apps/server/src/routes/chat.ts apps/server/src/routes/search.ts apps/server/src/routes/chat.route.test.ts apps/server/src/routes/search.route.test.ts
git commit -m "feat: route music intent through playable search"
```

---

### Task 8: Frontend Memory Editor And Summary

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/ProfilePage.tsx`
- Modify: `apps/web/src/components/ProfileCard.tsx`
- Test if existing web test setup supports it: add targeted assertions under `apps/web/tests`

- [ ] **Step 1: Add API client methods**

In `apps/web/src/api/client.ts`, add:

```ts
async getMemory(): Promise<{ content: string }> {
  const resp = await fetch(`${BASE}/api/profile/memory`);
  return resp.json();
},

async saveMemory(content: string): Promise<{ saved: boolean }> {
  const resp = await fetch(`${BASE}/api/profile/memory`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return resp.json();
},

async getMemorySummary(): Promise<{
  tags: string[];
  topArtists: string[];
  mood: string;
  copy: string;
  philosophy: string;
  totalHours: number;
  totalPlays: number;
  avoid: string[];
  routines: string[];
}> {
  const resp = await fetch(`${BASE}/api/profile/memory/summary`);
  return resp.json();
},
```

- [ ] **Step 2: Update ProfilePage**

Change state:

```tsx
const [memory, setMemory] = useState('');
const [summary, setSummary] = useState<any>(null);
const [saved, setSaved] = useState(false);
```

Load memory:

```tsx
useEffect(() => {
  apiClient.getProfile().then(setStats);
  apiClient.getMemory().then((d) => setMemory(d.content));
  apiClient.getMemorySummary().then(setSummary);
}, []);
```

Save memory:

```tsx
const handleSaveMemory = async () => {
  await apiClient.saveMemory(memory);
  setSummary(await apiClient.getMemorySummary());
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
};
```

Replace the taste editor title and textarea:

```tsx
<div className="section-title">MEMORY PROFILE</div>
<div className="taste-editor">
  <textarea
    value={memory}
    onChange={(e) => { setMemory(e.target.value); setSaved(false); }}
    placeholder="# Claudio Memory Profile"
  />
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
    <button onClick={handleSaveMemory} style={{ fontFamily: 'var(--font-nav)', fontSize: 11, letterSpacing: '0.1em', background: 'var(--text-display)', color: 'var(--bg-stage)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 20px', cursor: 'pointer' }}>
      SAVE MEMORY
    </button>
    {saved && <span className="inline-status">[SAVED]</span>}
  </div>
</div>
```

Add summary cards below stats:

```tsx
{summary && (
  <>
    <div className="section-title">LEARNED MEMORY</div>
    <div className="stats-row">
      <div className="stat-card"><div className="stat-card-label">Mood</div><div className="stat-card-value">{summary.mood || '--'}</div></div>
      <div className="stat-card"><div className="stat-card-label">Taste</div><div className="stat-card-value" style={{ fontSize: 14 }}>{summary.tags?.slice(0, 2).join(' / ') || '--'}</div></div>
      <div className="stat-card"><div className="stat-card-label">Avoid</div><div className="stat-card-value" style={{ fontSize: 14 }}>{summary.avoid?.[0] || '--'}</div></div>
    </div>
  </>
)}
```

- [ ] **Step 3: Update ProfileCard fetch**

In `apps/web/src/components/ProfileCard.tsx`, change:

```ts
fetch('/api/profile/styles').then(r => r.json()).then(setProfile).catch(() => {});
```

to:

```ts
fetch('/api/profile/memory/summary').then(r => r.json()).then(setProfile).catch(() => {});
```

Keep `PUT /api/profile/styles` for chip editing until a dedicated chip endpoint exists, because the backend compatibility route now writes canonical memory.

- [ ] **Step 4: Run web build**

```powershell
pnpm --filter @claudio/web build
```

Expected: build succeeds.

- [ ] **Step 5: Commit frontend changes**

```powershell
git add apps/web/src/api/client.ts apps/web/src/pages/ProfilePage.tsx apps/web/src/components/ProfileCard.tsx
git commit -m "feat: add editable Claudio memory UI"
```

---

### Task 9: Archive Non-Runtime Reference Files

**Files:**
- Move only files verified as non-runtime references.
- Create outside repo: `C:\Users\宅急便\Desktop\claudio-archive\2026-05-22-memory-cleanup\MANIFEST.md`

- [ ] **Step 1: List candidate documents**

Run:

```powershell
Get-ChildItem -Force -File | Where-Object { $_.Extension -match '\.docx?$|\.txt$|\.md$' } | Select-Object Name,Length
Get-ChildItem -Recurse -File docs | Select-Object FullName,Length
```

Expected: identify only historical reference docs, not active specs or plans.

- [ ] **Step 2: Check references before moving each candidate**

For every candidate such as `veilledio_tutorial.doc`, run:

```powershell
rg -n "veilledio_tutorial|netease-music-mcp-tutorial" .
```

Expected: either no references or references only in historical docs. Do not move files referenced by source, tests, package scripts, active prompts, `AGENTS.md`, or `CLAUDE.md`.

- [ ] **Step 3: Move verified reference files outside Claudio**

Use native PowerShell with verified literal paths:

```powershell
$archive = "C:\Users\宅急便\Desktop\claudio-archive\2026-05-22-memory-cleanup"
New-Item -ItemType Directory -Force -Path $archive | Out-Null
Move-Item -LiteralPath "C:\Users\宅急便\Desktop\claudio-project\claudio-project\veilledio_tutorial.doc" -Destination $archive
Move-Item -LiteralPath "C:\Users\宅急便\Desktop\claudio-project\claudio-project\netease-music-mcp-tutorial.docx" -Destination $archive
```

Only run a `Move-Item` line after the exact file exists and reference checks pass.

- [ ] **Step 4: Write manifest**

Create `C:\Users\宅急便\Desktop\claudio-archive\2026-05-22-memory-cleanup\MANIFEST.md`:

```md
# Claudio Memory Cleanup Archive Manifest

Archive date: 2026-05-22

## Moved Files

| Original path | Archived path | Reason | Reference check |
| --- | --- | --- | --- |
| C:\Users\宅急便\Desktop\claudio-project\claudio-project\veilledio_tutorial.doc | C:\Users\宅急便\Desktop\claudio-archive\2026-05-22-memory-cleanup\veilledio_tutorial.doc | Historical reference, not runtime Claudio architecture | `rg` found no runtime references |
| C:\Users\宅急便\Desktop\claudio-project\claudio-project\netease-music-mcp-tutorial.docx | C:\Users\宅急便\Desktop\claudio-archive\2026-05-22-memory-cleanup\netease-music-mcp-tutorial.docx | Historical NetEase experiment reference | `rg` found no runtime references |
```

- [ ] **Step 5: Commit repo-side deletions from archive move**

```powershell
git status --short
git add -u
git commit -m "chore: archive legacy reference docs"
```

---

### Task 10: Full Verification

**Files:**
- No source edits unless verification exposes a concrete failure.

- [ ] **Step 1: Run backend build**

```powershell
pnpm --filter @claudio/server build
```

Expected: TypeScript build succeeds.

- [ ] **Step 2: Run backend tests**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/*.test.ts src/routes/*.test.ts
```

Expected: all backend tests pass.

- [ ] **Step 3: Run frontend build**

```powershell
pnpm --filter @claudio/web build
```

Expected: web build succeeds.

- [ ] **Step 4: Run frontend tests**

```powershell
pnpm --filter @claudio/web test
```

Expected: web test suite passes. If the repo has no web test script, record the exact package-manager error and rely on the successful build plus existing targeted tests.

- [ ] **Step 5: Verify memory file exists**

```powershell
Test-Path user/memory.profile.md
Select-String -Path user/memory.profile.md -Pattern "Claudio Memory Profile|Manual Overrides|Taste|Mood|Routines"
```

Expected: file exists and all canonical sections are present.

- [ ] **Step 6: Verify search examples through service tests**

```powershell
pnpm --filter @claudio/server exec node --import tsx --test src/services/search.service.test.ts
```

Expected: examples including `有没有陶喆的歌` pass.

- [ ] **Step 7: Final status check**

```powershell
git status --short
```

Expected: only intentional uncommitted user changes remain. Do not stage or revert unrelated user edits.
