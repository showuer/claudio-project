import cron from 'node-cron';
import { contextService } from './context.service.js';
import { deepseekService } from './deepseek.service.js';
import { ttsService } from './tts.service.js';

type BroadcastFn = (event: object) => void;

let broadcast: BroadcastFn = () => {};

export function setBroadcast(fn: BroadcastFn) {
  broadcast = fn;
}

async function triggerGreeting(label: string) {
  const startTime = Date.now();
  try {
    const ctx = await contextService.assembleContext(label);
    const systemPrompt = ctx.systemPrompt.replace('{{chatHistory}}', '（定时自动问候，无前序对话）');
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `${ctx.time}\n天气: ${ctx.weather}\n请给出今天这个时段的简短问候和音乐建议。` },
    ];
    const result = await deepseekService.chatComplete(messages);
    if (!result.say) {
      console.error(`[Scheduler] ${label}: DeepSeek returned empty say`);
      return;
    }
    const ttsResult = await ttsService.synthesize(result.say);
    if (!ttsResult.audioUrl) {
      console.error(`[Scheduler] ${label}: TTS failed`);
      return;
    }

    broadcast({
      type: 'dj_message',
      data: { id: crypto.randomUUID(), say: result.say, ttsUrl: ttsResult.audioUrl, play: result.play || result.songs || [], timestamp: new Date().toISOString() },
    });
    console.log(`[Scheduler] ${label}: OK (${Date.now() - startTime}ms)`);
  } catch (err: any) {
    console.error(`[Scheduler] ${label} FAILED (${Date.now() - startTime}ms):`, err.message || err);
  }
}

const tasks: cron.ScheduledTask[] = [];

export function startScheduler() {
  tasks.push(cron.schedule('0 7 * * *', () => triggerGreeting('早安问候'), { timezone: 'Asia/Shanghai' }));
  tasks.push(cron.schedule('0 12 * * *', () => triggerGreeting('午间播报'), { timezone: 'Asia/Shanghai' }));
  tasks.push(cron.schedule('0 18 * * *', () => triggerGreeting('傍晚问候'), { timezone: 'Asia/Shanghai' }));
  tasks.push(cron.schedule('0 22 * * *', () => triggerGreeting('晚安问候'), { timezone: 'Asia/Shanghai' }));
}

export function stopScheduler() {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
