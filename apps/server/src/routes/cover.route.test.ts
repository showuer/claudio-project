import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('cover route provides a same-origin image proxy for palette extraction', () => {
  const route = fs.readFileSync(path.resolve(__dirname, './cover.ts'), 'utf-8');
  const index = fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf-8');
  const hook = fs.readFileSync(path.resolve(__dirname, '../../../web/src/hooks/useCoverPalette.ts'), 'utf-8');
  const playerRoute = fs.readFileSync(path.resolve(__dirname, './player.ts'), 'utf-8');

  assert.match(route, /app\.get\('\/api\/cover-proxy'/);
  assert.match(route, /content-type/);
  assert.match(route, /startsWith\('image\/'\)/);
  assert.match(route, /cache-control/);
  assert.match(route, /access-control-allow-origin/);
  assert.match(index, /import \{ registerCoverRoutes \} from '\.\/routes\/cover\.js'/);
  assert.match(index, /registerCoverRoutes\(app\)/);
  assert.match(hook, /\/api\/cover-proxy\?url=/);
  assert.match(playerRoute, /\/api\/player\/detail\/:songId/);
  assert.match(playerRoute, /ncmService\.getSongDetail/);
});
