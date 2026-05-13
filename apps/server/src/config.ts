import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  NCM_APPID: z.string().optional(),
  NCM_PRIVATE_KEY: z.string().optional(),
  NCM_COOKIE: z.string().optional(),
  MIMO_API_KEY: z.string().optional(),
  MIMO_VOICE_ID: z.string().optional(),
  FISH_AUDIO_KEY: z.string().optional(),
  HEFENG_API_KEY: z.string().optional(),
  HEFENG_CITY: z.string().default('上海'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
});

export const config = envSchema.parse(process.env);
