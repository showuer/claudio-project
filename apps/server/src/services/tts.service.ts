import { config } from '../config.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', '..', '..', 'cache', 'tts');
fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashText(text: string): string {
  const voice = config.MIMO_VOICE_ID || '茉莉';
  return crypto.createHash('md5').update(`v3|${voice}|${text}`).digest('hex');
}

// Style instruction: natural female DJ voice, relaxed and conversational
const DJ_VOICE_STYLE =
  '用正常的语速和语气说话，像朋友之间聊天一样自然。' +
  '不要朗诵腔，不要播音腔，不要戏剧化的起伏。' +
  '就是普通人在说话，放松、随意、真诚。';

async function tryMimo(text: string): Promise<Buffer | null> {
  if (!config.MIMO_API_KEY) return null;
  try {
    const resp = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'api-key': config.MIMO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mimo-v2.5-tts',
        messages: [
          { role: 'user', content: DJ_VOICE_STYLE },
          { role: 'assistant', content: text },
        ],
        audio: { format: 'mp3', voice: config.MIMO_VOICE_ID || '茉莉' },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as { choices?: Array<{ message?: { audio?: { data?: string } } }> };
    const b64 = json.choices?.[0]?.message?.audio?.data;
    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  } catch (err: any) {
    console.error(`[TTS] MiMo: ${err.message}`);
    return null;
  }
}

async function tryFish(text: string): Promise<Buffer | null> {
  if (!config.FISH_AUDIO_KEY) return null;
  try {
    const resp = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.FISH_AUDIO_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, format: 'mp3' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return Buffer.from(buf);
  } catch (err: any) {
    console.error(`[TTS] Fish: ${err.message}`);
    return null;
  }
}

export const ttsService = {
  async synthesize(text: string): Promise<{ audioUrl: string; duration: number }> {
    const hash = hashText(text);
    const cachedFile = path.join(CACHE_DIR, `${hash}.mp3`);
    if (fs.existsSync(cachedFile)) {
      return { audioUrl: `/cache/tts/${hash}.mp3`, duration: text.length * 80 };
    }

    // Try providers in order
    for (const [name, fn] of [['Fish', tryFish], ['MiMo', tryMimo]] as const) {
      const buffer = await fn(text);
      if (buffer && buffer.length > 100) {
        fs.writeFileSync(cachedFile, buffer);
        console.log(`[TTS] ${name} OK: ${hash} (${buffer.length}B)`);
        return { audioUrl: `/cache/tts/${hash}.mp3`, duration: text.length * 80 };
      }
    }

    console.error('[TTS] All providers failed');
    return { audioUrl: '', duration: 0 };
  },
};
