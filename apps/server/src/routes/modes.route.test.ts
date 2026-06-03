import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('mode routes are independent from chat, deepseek, and tts', () => {
  const source = fs.readFileSync(path.join(__dirname, 'modes.ts'), 'utf-8');

  assert.match(source, /app\.post\('\/api\/modes\/start'/);
  assert.match(source, /app\.post\('\/api\/modes\/next'/);
  assert.match(source, /stationModesService\.start/);
  assert.match(source, /stationModesService\.next/);
  assert.doesNotMatch(source, /deepseekService|ttsService|messagesRepo|registerChatRoutes/);
});

test('server registers mode routes', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf-8');
  assert.match(index, /import \{ registerModeRoutes \} from '\.\/routes\/modes\.js'/);
  assert.match(index, /registerModeRoutes\(app\)/);
});
