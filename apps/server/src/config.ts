import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-v4-flash'),
  NCM_APPID: z.string().optional(),
  NCM_PRIVATE_KEY: z.string().optional(),
  NCM_COOKIE: z.string().optional(),
  MIMO_API_KEY: z.string().optional(),
  MIMO_VOICE_ID: z.string().optional(),
  FISH_AUDIO_KEY: z.string().optional(),
  FISH_AUDIO_REFERENCE_ID: z.string().default('6f3aa0f9c0a641b4a0f731305c74e0b1'),
  FISH_AUDIO_MODEL: z.string().default('s2-pro'),
  FISH_AUDIO_PROXY: z.string().default('http://127.0.0.1:7892'),
  FISH_AUDIO_ALLOW_MIMO_FALLBACK: z.string().optional().transform((value) => /^(1|true|yes)$/i.test(value || '')),
  HEFENG_API_KEY: z.string().optional(),
  HEFENG_CITY: z.string().default('上海'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
});

export const config = envSchema.parse(process.env);
