import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import { contextService } from './context.service.js';
import { deepseekService } from './deepseek.service.js';
import { ncmService, type SearchResult } from './ncm.service.js';
import { ttsService } from './tts.service.js';
import { getTemporalMusicProfile, type TemporalEnergy } from './temporalMusic.service.js';

type BroadcastFn = (event: object) => void;

interface RoutineSlot {
  id: string;
  label: string;
  timeRange: string;
  energy: TemporalEnergy;
  intent: string;
  queries: string[];
  avoid: string;
}

const ROUTINE_TRACK_COUNT = 10;

let broadcast: BroadcastFn = () => {};
const tasks: cron.ScheduledTask[] = [];
const lastTriggeredBySlot = new Map<string, string>();

export function setBroadcast(fn: BroadcastFn) {
  broadcast = fn;
}

export function getRoutineSlot(date = new Date()): RoutineSlot {
  const profile = getTemporalMusicProfile(date);
  return {
    id: profile.id,
    label: profile.id === 'forenoon' ? '上午专注' : `${profile.label}歌单`,
    timeRange: profile.timeRange,
    energy: profile.energy,
    intent: profile.selectionBias,
    queries: profile.searchTerms,
    avoid: profile.id === 'night' || profile.id === 'late-night'
      ? '默认更缓和，避免无请求地推特别兴奋、爆裂、夜店感、强 EDM；用户明确要高能量时不硬禁。'
      : '避免和当前时段明显冲突的编排。',
  };
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeSong(song: SearchResult) {
  return {
    id: String(song.id),
    name: song.name,
    artist: song.artist || 'Unknown',
    album: song.album || '',
    duration: song.duration || 0,
  };
}

async function pushPlayable(
  target: Array<ReturnType<typeof normalizeSong>>,
  seen: Set<string>,
  items: SearchResult[],
  limit: number,
) {
  for (const item of items) {
    if (!item?.id || seen.has(String(item.id))) continue;
    const url = await ncmService.getSongUrl(String(item.id));
    if (!url) continue;
    seen.add(String(item.id));
    target.push(normalizeSong(item));
    if (target.length >= limit) break;
  }
}

async function collectRoutineSongs(slot: RoutineSlot, targetCount = ROUTINE_TRACK_COUNT) {
  const songs: Array<ReturnType<typeof normalizeSong>> = [];
  const seen = new Set<string>();

  for (const query of slot.queries) {
    if (songs.length >= targetCount) break;
    await pushPlayable(songs, seen, await ncmService.search(query, 18), targetCount);
  }

  if (songs.length < targetCount) {
    await pushPlayable(songs, seen, await ncmService.getPersonalFm(), targetCount);
  }

  if (songs.length < targetCount) {
    await pushPlayable(
      songs,
      seen,
      contextService.getCandidates(targetCount * 4).map((s) => ({
        id: s.id,
        name: s.name,
        artist: s.artist,
        album: s.album,
        duration: 0,
      })),
      targetCount,
    );
  }

  return songs.slice(0, targetCount);
}

function buildRoutinePrompt(
  slot: RoutineSlot,
  ctx: Awaited<ReturnType<typeof contextService.assembleContext>>,
  songs: Array<ReturnType<typeof normalizeSong>>,
) {
  const songInfo = songs.map((s, i) => `${i + 1}. [${s.id}] ${s.name} - ${s.artist}`).join('\n');
  return `当前本地时间: ${ctx.time}
时段: ${slot.label} (${slot.timeRange})
能量倾向: ${slot.energy}
时段选歌倾向: ${slot.intent}
默认避开: ${slot.avoid}
天气: ${ctx.weather}

即将播放的 10 首歌:
${songInfo}

请写一段 90-160 个中文字符的 Claudio 电台开场。
硬规则:
- 必须适配当前时段，但时段只是软性音乐先验，不是硬禁令。
- 晚上和凌晨默认更缓和、更少冲击；可以有轻音乐、温柔 R&B、轻摇滚或轻律动，不要一棍子打死成纯低能量。
- 用户明确要高能量时尊重请求，只要编排别突兀。
- 只自然提到 0-2 首歌名，不要逐首介绍，不要把 10 首歌念一遍。
- 如果是中午，不能说夜里、晚安、睡前。
- 语气像真实私人 FM 男主播，具体、短一点，不要鸡汤套话。
- 只返回严格 JSON:
{"theme":"5字以内主题","say":"电台开场","songs":[{"id":"歌曲id","name":"歌名","artist":"歌手"}]}`;
}

async function triggerRoutine(label: string, date = new Date()) {
  const startTime = Date.now();
  const slot = getRoutineSlot(date);
  const dateKey = `${localDateKey(date)}:${slot.id}`;
  if (lastTriggeredBySlot.get(slot.id) === dateKey) {
    console.log(`[Scheduler] ${slot.label}: skipped duplicate trigger`);
    return;
  }
  lastTriggeredBySlot.set(slot.id, dateKey);

  try {
    const ctx = await contextService.assembleContext(label, 'music');
    const songs = await collectRoutineSongs(slot, ROUTINE_TRACK_COUNT);
    if (songs.length === 0) {
      console.error(`[Scheduler] ${slot.label}: no playable songs`);
      return;
    }

    const systemPrompt = ctx.systemPrompt.replace('{{chatHistory}}', '（定时自动问候，无前序对话）');
    const result = await deepseekService.chatComplete([
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: buildRoutinePrompt(slot, ctx, songs) },
    ]);
    const say = (result.say || '').trim() || `${slot.label}到了，我给你放一组更适合这个时间的歌。`;
    const ttsResult = await ttsService.synthesize(say);
    if (!ttsResult.audioUrl) {
      console.error(`[Scheduler] ${slot.label}: TTS failed`);
      return;
    }

    broadcast({
      type: 'dj_message',
      data: {
        id: randomUUID(),
        say,
        ttsUrl: ttsResult.audioUrl,
        alignment: ttsResult.alignment,
        songs: songs.map((s) => ({ id: s.id, name: s.name, artist: s.artist })),
        timestamp: new Date().toISOString(),
        source: 'routine',
        routine: { id: slot.id, label: slot.label, energy: slot.energy },
      },
    });
    console.log(`[Scheduler] ${slot.label}: OK (${Date.now() - startTime}ms, ${songs.length} songs)`);
  } catch (err: any) {
    console.error(`[Scheduler] ${slot.label} FAILED (${Date.now() - startTime}ms):`, err.message || err);
  }
}

export function startScheduler() {
  if (tasks.length > 0) return;
  tasks.push(cron.schedule('0 7 * * *', () => triggerRoutine('早晨启动'), { timezone: 'Asia/Shanghai' }));
  tasks.push(cron.schedule('0 12 * * *', () => triggerRoutine('午间缓冲'), { timezone: 'Asia/Shanghai' }));
  tasks.push(cron.schedule('0 18 * * *', () => triggerRoutine('傍晚放松'), { timezone: 'Asia/Shanghai' }));
  tasks.push(cron.schedule('0 22 * * *', () => triggerRoutine('晚上缓和'), { timezone: 'Asia/Shanghai' }));
}

export function stopScheduler() {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
