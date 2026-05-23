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
  assert.match(chatRoute, /buildPlaylistOpeningPrompt/);
  assert.match(chatRoute, /150-240 Chinese characters/);
});

test('music and aidj intros share concise time-aware opening rules', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /function buildPlaylistOpeningPrompt/);
  assert.match(chatRoute, /150-240 Chinese characters/);
  assert.match(chatRoute, /Mention at most two song names total/);
  assert.match(chatRoute, /Match the current time exactly/);
  assert.match(chatRoute, /Single likes are weak signals/);
  assert.match(chatRoute, /buildPlaylistOpeningPrompt\(message, candidateStr, ctx\.time, 'music'\)/);
  assert.match(chatRoute, /buildPlaylistOpeningPrompt\(userInput, songInfoStr, ctx\.time, 'aidj'\)/);
  assert.match(chatRoute, /normalizePlaylistOpening\(output\.say/);
  assert.match(chatRoute, /normalizePlaylistOpening\(opening\.say/);
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

test('chat route uses searchService for explicit music intent before DeepSeek playlist flow', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /searchService\.searchPlayable\(message,\s*AIDJ_TRACK_COUNT\)/);
  assert.doesNotMatch(chatRoute, /const searchMatch = message\.match/);
  assert.doesNotMatch(chatRoute, /ncmService\.search\(searchMatch\[2\]/);
});

test('chat route writes detected mood through memoryService', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /memoryService\.updateMood/);
  assert.doesNotMatch(chatRoute, /writeFileSync\(path\.join\(rootDir, 'user', 'mood\.md'\)/);
});

test('chatHistory placeholder is replaced in all code paths', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');
  const scheduler = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'scheduler.service.ts'),
    'utf-8',
  );

  // chat.ts: all three paths replace {{chatHistory}}
  const replaceCount = (chatRoute.match(/\{\{chatHistory\}\}/g) || []).length;
  // systemPrompt.replace calls that don't use {{chatHistory}} shouldn't leave it unreplaced
  const unreplacedInChat = chatRoute
    .split('\n')
    .filter((line) => line.includes("systemPrompt") && line.includes("content:") && !line.includes('{{chatHistory}}'))
    .length;
  // Every line that sets content: systemPrompt... should also replace {{chatHistory}}
  // Actually, context.service returns systemPrompt, and chat.ts replaces {{chatHistory}} on it
  assert.match(chatRoute, /replace\('\{\{chatHistory\}\}'/);

  // scheduler: must also replace {{chatHistory}} (was the bug)
  assert.match(scheduler, /replace\('\{\{chatHistory\}\}'/);
  assert.match(scheduler, /定时自动问候/);
});
