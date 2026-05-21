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
});
