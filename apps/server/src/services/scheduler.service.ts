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
  try {
    const ctx = await contextService.assembleContext(label);
    const messages = [
      { role: 'system' as const, content: ctx.systemPrompt },
      { role: 'user' as const, content: `${ctx.time}\n天气: ${ctx.weather}\n请给出今天这个时段的简短问候和音乐建议。` },
    ];
    const result = await deepseekService.chatComplete(messages);
    const ttsResult = await ttsService.synthesize(result.say);

    broadcast({
      type: 'dj_message',
      data: { id: crypto.randomUUID(), say: result.say, ttsUrl: ttsResult.audioUrl, play: result.play },
    });
  } catch { /* silent fail */ }
}

export function startScheduler() {
  cron.schedule('0 7 * * *', () => triggerGreeting('早安问候'), { timezone: 'Asia/Shanghai' });
  cron.schedule('0 12 * * *', () => triggerGreeting('午间播报'), { timezone: 'Asia/Shanghai' });
  cron.schedule('0 18 * * *', () => triggerGreeting('傍晚问候'), { timezone: 'Asia/Shanghai' });
  cron.schedule('0 22 * * *', () => triggerGreeting('晚安问候'), { timezone: 'Asia/Shanghai' });
}
