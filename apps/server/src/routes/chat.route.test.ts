import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('chat routes synthesize only playlist openings, not per-song intros', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.equal(chatRoute.includes('const introTasks = songs'), false);
  assert.equal(chatRoute.includes('ttsService.synthesize(s.intro'), false);
  assert.match(chatRoute, /Do not write per-song intros/);
  assert.match(chatRoute, /Choose exactly one strongest recommendation/);
  assert.match(chatRoute, /Do not introduce every song/);
});

test('chat routes return playlist payloads only after opening tts is complete', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.equal(chatRoute.includes('synthesizeOpeningInBackground'), false);
  assert.match(chatRoute, /const ttsResult = await ttsService\.synthesize/);
  assert.equal(chatRoute.includes('ttsPending: true'), false);
  assert.equal(chatRoute.includes("type: 'dj_tts_ready'"), false);
});

test('aidj collects a stable ten song queue', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /const AIDJ_TRACK_COUNT = 10/);
  assert.match(chatRoute, /async function collectAidjSongs/);
  assert.match(chatRoute, /attempt < 4 && songs\.length < targetCount/);
  assert.match(chatRoute, /contextService\.getCandidates\(targetCount \* 3\)/);
  assert.match(chatRoute, /return songs\.slice\(0, targetCount\)/);
  assert.equal(chatRoute.includes('getCandidates(8)'), false);
});
