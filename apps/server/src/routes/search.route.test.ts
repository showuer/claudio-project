import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('search route uses playable search service', () => {
  const source = fs.readFileSync(new URL('./search.ts', import.meta.url), 'utf8');

  assert.match(source, /searchService\.searchPlayable/);
  assert.match(source, /`搜索 \$\{query\}`/);
  assert.doesNotMatch(source, /ncmService\.search/);
});
