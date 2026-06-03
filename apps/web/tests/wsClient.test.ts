import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('websocket client removes page handlers and does not reconnect after cleanup', () => {
  const wsClient = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'ws.ts'), 'utf-8');
  const homePage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'HomePage.tsx'), 'utf-8');

  assert.match(wsClient, /Set<EventHandler>/);
  assert.match(wsClient, /off\(event: string, fn: EventHandler\)/);
  assert.match(wsClient, /shouldReconnect/);
  assert.match(wsClient, /if \(!this\.shouldReconnect\) return/);
  assert.match(homePage, /const handleDjMessage = \(data: any\) =>/);
  assert.match(homePage, /wsClient\.off\('dj_message', handleDjMessage\)/);
});
