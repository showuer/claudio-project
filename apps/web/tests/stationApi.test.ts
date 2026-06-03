import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('api client exposes independent station mode endpoints', () => {
  const client = fs.readFileSync(path.resolve(__dirname, '../src/api/client.ts'), 'utf-8');

  assert.match(client, /stationStart/);
  assert.match(client, /\/api\/modes\/start/);
  assert.match(client, /stationNext/);
  assert.match(client, /\/api\/modes\/next/);
  assert.doesNotMatch(client, /stationStart[\s\S]{0,240}\/api\/chat/);
});
