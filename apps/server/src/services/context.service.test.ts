import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('context service injects memoryProfile and no longer replaces taste or routines placeholders', () => {
  const source = fs.readFileSync(new URL('./context.service.ts', import.meta.url), 'utf8');
  const prompt = fs.readFileSync(new URL('../prompts/system.md', import.meta.url), 'utf8');

  assert.match(source, /memoryService\.getPromptMemory/);
  assert.doesNotMatch(source, /readFileSafe\(path\.join\(USER_DIR, 'taste\.md'\)/);
  assert.doesNotMatch(source, /replace\('\{\{taste\}\}'/);
  assert.match(prompt, /\{\{memoryProfile\}\}/);
  assert.doesNotMatch(prompt, /\{\{taste\}\}/);
  assert.doesNotMatch(prompt, /\{\{routines\}\}/);
});
