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
  assert.match(chatRoute, /Mention at most one song name total/);
  assert.match(chatRoute, /Do not mention multiple artists as a roll call/);
  assert.match(chatRoute, /Do not say exact clock time/);
  assert.match(chatRoute, /Match the current time exactly/);
  assert.match(chatRoute, /Time-of-day music guidance/);
  assert.match(chatRoute, /soft musical prior, not a hard ban/);
  assert.match(chatRoute, /Single likes are weak signals/);
  assert.match(chatRoute, /buildPlaylistOpeningPrompt\(message, candidateStr, ctx\.time, 'music'\)/);
  assert.match(chatRoute, /buildPlaylistOpeningPrompt\(userInput, songInfoStr, ctx\.time, 'aidj'\)/);
  assert.match(chatRoute, /repairPlaylistOpeningIfNeeded\(output\.say/);
  assert.match(chatRoute, /normalizePlaylistOpening\(opening\.say/);
});

test('daily recommendation chat path uses playlist opening rules before tts', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /const wantsDaily = \/每日推荐\|今日推荐\|日推\|daily\//);
  assert.match(chatRoute, /const playlistRequest = wantsPrivateFm \|\| wantsDaily \|\| wantsPlaylist/);
  assert.match(chatRoute, /playlistRequest[\s\S]*buildPlaylistOpeningPrompt\(message, candidateStr, ctx\.time, wantsPrivateFm \? 'privateFm' : 'music'\)/);
  assert.match(chatRoute, /const say = hasSongs \? repairPlaylistOpeningIfNeeded\(output\.say, songs, playlistScene\) : output\.say/);
  assert.match(chatRoute, /ttsService\.synthesize\(say\)/);
  assert.match(chatRoute, /content: say/);
  assert.match(chatRoute, /done: true, id: djMsgId, say, ttsUrl/);
});

test('private fm chat path has its own opening scene and fallback copy', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /const wantsPrivateFm = \/私人\\s\*fm\|私人\\s\*FM\|私人漫游\|personal\\s\*fm\/i/);
  assert.match(chatRoute, /playlistScene = 'privateFm'/);
  assert.match(chatRoute, /buildPlaylistOpeningPrompt\(message, candidateStr, ctx\.time, wantsPrivateFm \? 'privateFm' : 'music'\)/);
  assert.match(chatRoute, /This is a private FM request/);
  assert.match(chatRoute, /这段私人 FM/);
  assert.match(chatRoute, /scene === 'privateFm'[\s\S]*\? '这段私人 FM'/);
  assert.match(chatRoute, /scene === 'daily'[\s\S]*\? '今天这组每日推荐'/);
});

test('playlist opening repair prevents multi-song name roll calls', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /function countMentionedSongs/);
  assert.match(chatRoute, /function countMentionedArtists/);
  assert.match(chatRoute, /function mentionsExactClockTime/);
  assert.match(chatRoute, /const needsRepair = songMentions > 1 \|\| artistMentions > 1 \|\| mentionsExactClockTime\(cleaned\)/);
  assert.match(chatRoute, /声音会变成清单/);
  assert.match(chatRoute, /我更想把注意力放在/);
});

test('chat routes return playlist payloads only after opening tts is complete', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.equal(chatRoute.includes('synthesizeOpeningInBackground'), false);
  assert.match(chatRoute, /const ttsResult = await ttsService\.synthesize/);
  assert.match(chatRoute, /app\.post\('\/api\/aidj'[\s\S]*'Content-Type': 'text\/event-stream'/);
  assert.doesNotMatch(chatRoute, /clientGoneAidj/);
  assert.equal(chatRoute.includes('ttsPending: true'), false);
  assert.equal(chatRoute.includes("type: 'dj_tts_ready'"), false);
});

test('aidj collects a stable ten song queue', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /const AIDJ_TRACK_COUNT = 10/);
  assert.match(chatRoute, /async function collectAidjSongs/);
  assert.match(chatRoute, /getTemporalSearchTerms\(currentTime\)/);
  assert.match(chatRoute, /attempt < 4 && songs\.length < targetCount/);
  assert.match(chatRoute, /contextService\.getCandidates\(targetCount \* 3\)/);
  assert.match(chatRoute, /return songs\.slice\(0, targetCount\)/);
  assert.equal(chatRoute.includes('getCandidates(8)'), false);
});

test('aidj excludes songs already in the current frontend queue', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /excludeSongIds\?: string\[\]/);
  assert.match(chatRoute, /new Set<string>\(excludeSongIds\.filter\(Boolean\)\)/);
  assert.match(chatRoute, /collectAidjSongs\(AIDJ_TRACK_COUNT, ctx\.time, excludeSongIds\)/);
});

test('aidj stream keeps current-track cover urls for the full player surface', () => {
  const chatRoute = fs.readFileSync(path.join(__dirname, 'chat.ts'), 'utf-8');

  assert.match(chatRoute, /coverUrl\?: string/);
  assert.match(chatRoute, /coverUrl: s\.coverUrl/);
  assert.match(chatRoute, /songs: songs\.map\(s => \(\{[\s\S]*coverUrl: s\.coverUrl/);
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

test('scheduler routine broadcasts carry time-aware songs exactly once per slot', () => {
  const scheduler = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'scheduler.service.ts'),
    'utf-8',
  );

  assert.match(scheduler, /const ROUTINE_TRACK_COUNT = 10/);
  assert.match(scheduler, /function collectRoutineSongs/);
  assert.match(scheduler, /songs: songs\.map/);
  assert.match(scheduler, /lastTriggeredBySlot/);
  assert.match(scheduler, /if \(tasks\.length > 0\) return/);
  assert.match(scheduler, /getTemporalMusicProfile/);
  assert.match(scheduler, /晚上和凌晨默认更缓和/);
  assert.match(scheduler, /不是硬禁令/);
  assert.match(scheduler, /用户明确要高能量时不硬禁/);
  assert.doesNotMatch(scheduler, /音乐建议/);
});
