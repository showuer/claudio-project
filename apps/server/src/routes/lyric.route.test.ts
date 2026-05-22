import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('like route updates canonical memory rather than legacy taste markdown', () => {
  const source = fs.readFileSync(new URL('./lyric.ts', import.meta.url), 'utf8');

  assert.match(source, /memoryService\.addTastePreference/);
  assert.doesNotMatch(source, /taste\.md/);
  assert.doesNotMatch(source, /writeFileSync\(tastePath/);
});
