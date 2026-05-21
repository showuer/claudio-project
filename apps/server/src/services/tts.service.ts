import { config } from '../config.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', '..', '..', 'cache', 'tts');
fs.mkdirSync(CACHE_DIR, { recursive: true });

export interface TtsSegment {
  text: string;
  start: number;
  end: number;
}

export interface TtsAlignment {
  segments: TtsSegment[];
}

export interface TtsResult {
  audioUrl: string;
  duration: number;
  alignment?: TtsAlignment;
}

interface FishTimestampSegment {
  text?: string;
  start?: number;
  end?: number;
}

interface FishTimestampChunk {
  audio_base64?: string;
  chunk_audio_offset_sec?: number;
  alignment?: {
    segments?: FishTimestampSegment[];
    audio_duration?: number;
  };
}

function hashText(text: string): string {
  const voice = config.FISH_AUDIO_REFERENCE_ID || config.MIMO_VOICE_ID || 'default';
  return crypto.createHash('md5').update(`v10|fish-first|${config.FISH_AUDIO_MODEL}|${voice}|speed=1.08|emotion=strong|${text}`).digest('hex');
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function estimateAlignment(text: string, durationSeconds: number): TtsAlignment {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { segments: [] };

  let tokens: string[] = [];
  const Segmenter = (Intl as any).Segmenter;
  if (Segmenter) {
    tokens = Array.from(new Segmenter('zh-CN', { granularity: 'word' }).segment(clean))
      .map((part: any) => String(part.segment || '').trim())
      .filter(Boolean);
  }
  if (!tokens.length) {
    tokens = clean.match(/[\u3400-\u9fff]|[A-Za-z0-9]+|[^\s]/g) || [];
  }

  tokens = tokens.filter((part) => !/^[\p{P}\p{S}]+$/u.test(part));
  const total = Math.max(durationSeconds || 0, clean.length * 0.14, 1);
  const slot = total / Math.max(tokens.length, 1);

  return {
    segments: tokens.map((token, index) => ({
      text: token,
      start: roundSeconds(index * slot),
      end: roundSeconds((index + 1) * slot),
    })),
  };
}

export function normalizeFishTimestampChunks(chunks: FishTimestampChunk[]): { audio: Buffer; alignment: TtsAlignment; duration: number } {
  const audioParts: Buffer[] = [];
  const segments: TtsSegment[] = [];
  let duration = 0;
  let seenContentScript = false;

  for (const chunk of chunks) {
    if (chunk.audio_base64) {
      audioParts.push(Buffer.from(chunk.audio_base64, 'base64'));
    }

    const offset = Number(chunk.chunk_audio_offset_sec || 0);
    const chunkDuration = Number(chunk.alignment?.audio_duration || 0);
    if (chunkDuration > 0) duration = Math.max(duration, offset + chunkDuration);

    for (const segment of chunk.alignment?.segments || []) {
      const text = String(segment.text || '').trim();
      if (!text) continue;
      if (!seenContentScript && /^\[.*\]$/.test(text)) continue;
      if (!seenContentScript && /^[A-Za-z0-9,\- ]+$/.test(text)) continue;
      if (/[\u3400-\u9fff]/.test(text)) seenContentScript = true;
      const start = offset + Number(segment.start || 0);
      const end = offset + Number(segment.end || start);
      if (end <= start) continue;
      duration = Math.max(duration, end);
      segments.push({ text, start: roundSeconds(start), end: roundSeconds(end) });
    }
  }

  segments.sort((a, b) => a.start - b.start || a.end - b.end);
  return { audio: Buffer.concat(audioParts), alignment: { segments }, duration: roundSeconds(duration) };
}

const DJ_VOICE_STYLE = [
  '你是 Claudio，一个私人中文 FM 电台男主播。',
  '声音温暖、低一点、近一点，像深夜电台主持人在耳边自然说话。',
  '不要朗诵腔、播音腔、广告腔，也不要戏剧化。语速从容，音乐感强，旁白要比背景音乐更清楚。',
].join('\n');

const FISH_RADIO_STYLE = '[warm expressive Mandarin male radio host, close microphone, emotionally engaged late-night FM delivery, connected paragraph, natural breath, clear and slightly louder voice]';

function fishRadioText(text: string): string {
  return `${FISH_RADIO_STYLE}\n${text}`;
}

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
        audio: { format: 'mp3', voice: config.MIMO_VOICE_ID || '白桦' },
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

function fishFetchOptions(body: Record<string, unknown>, timeoutMs: number, useProxy: boolean): RequestInit & { dispatcher?: ProxyAgent } {
  const options: RequestInit & { dispatcher?: ProxyAgent } = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.FISH_AUDIO_KEY}`,
      'Content-Type': 'application/json',
      'model': config.FISH_AUDIO_MODEL,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (useProxy) options.dispatcher = new ProxyAgent(config.FISH_AUDIO_PROXY);
  return options;
}

async function fishFetch(url: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  try {
    return await undiciFetch(url, fishFetchOptions(body, timeoutMs, true) as any) as unknown as Response;
  } catch (err: any) {
    console.error(`[TTS] Fish proxy failed, retrying direct: ${err.message}`);
    return await undiciFetch(url, fishFetchOptions(body, timeoutMs, false) as any) as unknown as Response;
  }
}

async function tryFishTimestamp(text: string): Promise<{ buffer: Buffer; alignment: TtsAlignment; duration: number } | null> {
  if (!config.FISH_AUDIO_KEY) return null;
  try {
    const body: Record<string, unknown> = {
      text: fishRadioText(text),
      format: 'mp3',
      normalize: true,
      latency: 'balanced',
      temperature: 0.92,
      prosody: { speed: 1.08, volume: 2 },
    };
    if (config.FISH_AUDIO_REFERENCE_ID) body.reference_id = config.FISH_AUDIO_REFERENCE_ID;

    const resp = await fishFetch(
      'https://api.fish.audio/v1/tts/stream/with-timestamp',
      body,
      60000,
    );
    if (!resp.ok) {
      console.error(`[TTS] Fish timestamp HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
      return null;
    }

    const reader = resp.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    const chunks: FishTimestampChunk[] = [];
    let buffer = '';

    const parseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '[DONE]' || trimmed === 'data: [DONE]') return;
      const jsonText = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      try {
        const parsed = JSON.parse(jsonText) as FishTimestampChunk;
        if (parsed.audio_base64 || parsed.alignment) chunks.push(parsed);
      } catch { /* Fish may emit heartbeat lines. */ }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) parseLine(line);
    }
    if (buffer.trim()) parseLine(buffer);

    const normalized = normalizeFishTimestampChunks(chunks);
    if (normalized.alignment.segments.length < 3) {
      normalized.alignment = estimateAlignment(text, normalized.duration);
    }
    if (normalized.audio.length <= 100) return null;
    return { buffer: normalized.audio, alignment: normalized.alignment, duration: normalized.duration };
  } catch (err: any) {
    console.error(`[TTS] Fish timestamp: ${err.message}`);
    return null;
  }
}

async function tryFish(text: string): Promise<Buffer | null> {
  if (!config.FISH_AUDIO_KEY) return null;
  try {
    const body: Record<string, unknown> = {
      text: fishRadioText(text),
      format: 'mp3',
      prosody: { speed: 1.08, volume: 2 },
    };
    if (config.FISH_AUDIO_REFERENCE_ID) body.reference_id = config.FISH_AUDIO_REFERENCE_ID;
    const resp = await fishFetch('https://api.fish.audio/v1/tts', body, 20000);
    if (!resp.ok) {
      console.error(`[TTS] Fish HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
      return null;
    }
    const buf = await resp.arrayBuffer();
    return Buffer.from(buf);
  } catch (err: any) {
    console.error(`[TTS] Fish: ${err.message}`);
    return null;
  }
}

export const ttsService = {
  async synthesize(text: string): Promise<TtsResult> {
    const hash = hashText(text);
    const cachedFile = path.join(CACHE_DIR, `${hash}.mp3`);
    const cachedMeta = path.join(CACHE_DIR, `${hash}.json`);

    if (fs.existsSync(cachedFile)) {
      const meta = fs.existsSync(cachedMeta)
        ? JSON.parse(fs.readFileSync(cachedMeta, 'utf-8')) as { duration?: number; alignment?: TtsAlignment }
        : {};
      return {
        audioUrl: `/cache/tts/${hash}.mp3`,
        duration: meta.duration || text.length * 80,
        alignment: meta.alignment,
      };
    }

    const estimatedDuration = text.length * 90;
    const estimatedAlignment = estimateAlignment(text, estimatedDuration / 1000);

    const fishTimestamp = await tryFishTimestamp(text);
    if (fishTimestamp) {
      fs.writeFileSync(cachedFile, fishTimestamp.buffer);
      fs.writeFileSync(cachedMeta, JSON.stringify({
        duration: fishTimestamp.duration * 1000,
        alignment: fishTimestamp.alignment,
      }, null, 2));
      console.log(`[TTS] Fish timestamp OK: ${hash} (${fishTimestamp.buffer.length}B)`);
      return {
        audioUrl: `/cache/tts/${hash}.mp3`,
        duration: fishTimestamp.duration * 1000,
        alignment: fishTimestamp.alignment,
      };
    }

    const fishBuffer = await tryFish(text);
    if (fishBuffer && fishBuffer.length > 100) {
      fs.writeFileSync(cachedFile, fishBuffer);
      fs.writeFileSync(cachedMeta, JSON.stringify({
        duration: estimatedDuration,
        alignment: estimatedAlignment,
      }, null, 2));
      console.log(`[TTS] Fish OK: ${hash} (${fishBuffer.length}B)`);
      return {
        audioUrl: `/cache/tts/${hash}.mp3`,
        duration: estimatedDuration,
        alignment: estimatedAlignment,
      };
    }

    const mimoBuffer = await tryMimo(text);
    if (mimoBuffer && mimoBuffer.length > 100) {
      fs.writeFileSync(cachedFile, mimoBuffer);
      fs.writeFileSync(cachedMeta, JSON.stringify({
        duration: estimatedDuration,
        alignment: estimatedAlignment,
      }, null, 2));
      console.log(`[TTS] MiMo OK: ${hash} (${mimoBuffer.length}B)`);
      return {
        audioUrl: `/cache/tts/${hash}.mp3`,
        duration: estimatedDuration,
        alignment: estimatedAlignment,
      };
    }

    console.error('[TTS] All providers failed');
    return { audioUrl: '', duration: 0 };
  },
};
