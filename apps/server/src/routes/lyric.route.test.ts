import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('like route records weak song signals rather than fixed artist taste', () => {
  const source = fs.readFileSync(new URL('./lyric.ts', import.meta.url), 'utf8');

  assert.match(source, /memoryService\.recordLikedSongSignal/);
  assert.doesNotMatch(source, /memoryService\.addTastePreference/);
  assert.match(source, /weak song\/style signal/);
  assert.doesNotMatch(source, /taste\.md/);
  assert.doesNotMatch(source, /writeFileSync\(tastePath/);
});
