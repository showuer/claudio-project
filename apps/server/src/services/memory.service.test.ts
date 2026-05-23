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

test('keeps legacy nested markdown headings inside canonical sections parseable', async () => {
  const userDir = makeUserDir();
  fs.writeFileSync(path.join(userDir, 'taste.md'), [
    '# 我的音乐品味',
    '',
    '## 风格偏好',
    '- 华语流行/R&B：陶喆',
    '',
    '## 不喜欢的',
    '- 重型摇滚/金属',
    '- 抖音热歌',
    '',
  ].join('\n'), 'utf8');

  const service = createMemoryService({ userDir });
  const profile = await service.getEditableProfile();
  const summary = await service.getSummary();

  assert.match(profile.content, /### 风格偏好/);
  assert.doesNotMatch(profile.content, /\n## 风格偏好/);
  assert.match(profile.content, /## Dislikes And Boundaries[\s\S]*重型摇滚/);
  assert.match(profile.content, /## Dislikes And Boundaries[\s\S]*抖音热歌/);
  assert.doesNotMatch(profile.content, /## Taste[\s\S]*抖音热歌[\s\S]*## Dislikes And Boundaries/);
  assert.match((await service.getPromptMemory('放点陶喆', 'music')), /陶喆/);
  assert.ok(summary.tags.includes('华语流行/R&B'));
  assert.equal(summary.tags.includes('我的音乐品味'), false);
  assert.equal(summary.tags.includes('不需要翻译。'), false);
  assert.ok(summary.avoid.some((item) => item.includes('重型摇滚')));
});

test('normalizes an existing profile that contains unknown level-two legacy headings', async () => {
  const userDir = makeUserDir();
  fs.writeFileSync(path.join(userDir, 'memory.profile.md'), [
    '# Claudio Memory Profile',
    '',
    '## Taste',
    '- R&B',
    '',
    '## 风格偏好',
    '- 陶喆',
    '',
  ].join('\n'), 'utf8');

  const service = createMemoryService({ userDir });
  const profile = await service.getEditableProfile();

  assert.match(profile.content, /### 风格偏好/);
  assert.doesNotMatch(profile.content, /\n## 风格偏好/);
  assert.match(await service.getPromptMemory('放点陶喆', 'music'), /陶喆/);
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

  const service = createMemoryService({
    userDir,
    getStats: async () => ({
      totalHours: 1,
      totalPlays: 3,
      topArtists: [{ artist: 'Heavy Artist', count: 3 }],
    }),
  });
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

test('adds liked artists to canonical taste preferences without touching other sections', async () => {
  const userDir = makeUserDir();
  const service = createMemoryService({ userDir });

  const first = await service.addTastePreference('陶喆');
  const second = await service.addTastePreference('陶喆');
  const profile = await service.getEditableProfile();

  assert.equal(first.added, true);
  assert.equal(second.added, false);
  assert.match(profile.content, /### 风格偏好[\s\S]*- 陶喆/);
  assert.match(profile.content, /## Manual Overrides[\s\S]*## Taste/);
});

test('liked songs create weak song/style signals without defining artist taste', async () => {
  const userDir = makeUserDir();
  const service = createMemoryService({ userDir });

  const saved = await service.recordLikedSongSignal({ id: '123', name: '普通朋友', artist: '陶喆' });
  const profile = await service.getEditableProfile();
  const promptMemory = await service.getPromptMemory('来点中午听的歌', 'music');
  const tasteSection = profile.content.match(/## Taste\n([\s\S]*?)(?=\n## |$)/)?.[1] || '';

  assert.equal(saved.saved, true);
  assert.ok(saved.signals.includes('华语 R&B / soul'));
  assert.match(profile.content, /## Liked Song Signals[\s\S]*普通朋友 - 陶喆[\s\S]*weak style signals: 华语 R&B \/ soul/);
  assert.doesNotMatch(tasteSection, /- 陶喆/);
  assert.doesNotMatch(profile.content, /## Liked Song Signals[\s\S]*- 无/);
  assert.match(promptMemory, /weak evidence only/);
  assert.match(promptMemory, /普通朋友 - 陶喆/);
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
    '## Profile Quote',
    '- 真正要紧的歌，通常会在你安静下来的时候出现。',
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

  const service = createMemoryService({
    userDir,
    getStats: async () => ({
      totalHours: 2,
      totalPlays: 5,
      topArtists: [{ artist: '陶喆', count: 4 }],
    }),
  });
  const summary = await service.getSummary();

  assert.equal(summary.mood, '松弛');
  assert.deepEqual(summary.tags.slice(0, 2), ['R&B', '陶喆']);
  assert.equal(summary.topArtists[0], '陶喆');
  assert.equal(summary.totalPlays, 5);
  assert.equal(summary.philosophy, '真正要紧的歌，通常会在你安静下来的时候出现。');
});

test('summary profile quote does not expose manual rules as philosophy', async () => {
  const userDir = makeUserDir();
  fs.writeFileSync(path.join(userDir, 'memory.profile.md'), [
    '# Claudio Memory Profile',
    '',
    '## Manual Overrides',
    '- 只有用户明确有放歌、搜歌、推歌需求时才推歌。',
    '',
    '## Taste',
    '- R&B',
    '',
  ].join('\n'), 'utf8');

  const service = createMemoryService({ userDir });
  const summary = await service.getSummary();

  assert.notEqual(summary.philosophy, '只有用户明确有放歌、搜歌、推歌需求时才推歌。');
  assert.equal(summary.philosophy, '只在你真的想听歌的时候，把那首歌递到你手边。');
});
