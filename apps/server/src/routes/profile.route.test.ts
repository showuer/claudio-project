import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('profile routes expose memory endpoints and delegate legacy endpoints to memoryService', () => {
  const source = fs.readFileSync(new URL('./profile.ts', import.meta.url), 'utf8');

  assert.match(source, /memoryService/);
  assert.match(source, /app\.get\('\/api\/profile\/memory'/);
  assert.match(source, /app\.put\('\/api\/profile\/memory'/);
  assert.match(source, /app\.get\('\/api\/profile\/memory\/summary'/);
  assert.match(source, /updateStyleTags/);
  assert.match(source, /updateMood/);
  assert.doesNotMatch(source, /writeFileSync\(path\.join\(USER_DIR, 'taste\.md'\)/);
});
