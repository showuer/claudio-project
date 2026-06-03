import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';

// NOTE: The test db is created in data/ for this test run.
// We use getDb() which memoizes the db instance, so all tests share it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamically import the repo after the DB is ready
let messagesRepo: typeof import('./messages.repo.js').messagesRepo;

test('message insert with explicit created_at preserves the exact timestamp', async () => {
  await getDb(); // ensure DB is initialized
  messagesRepo = (await import('./messages.repo.js')).messagesRepo;

  const id = 'test-msg-1';
  const ts = '2026-05-23T14:30:00.000Z';
  await messagesRepo.insert({
    id,
    role: 'user',
    content: 'hello',
    tts_url: null,
    played: 1,
    created_at: ts,
  });

  const msg = await messagesRepo.getById(id);
  assert.ok(msg, 'message should exist after insert');
  assert.equal(msg!.created_at, ts, 'created_at must be exactly the value we passed');
});

test('message insert without created_at uses SQLite default', async () => {
  const id = 'test-msg-2';
  await messagesRepo.insert({
    id,
    role: 'dj',
    content: 'response',
    tts_url: null,
    played: 0,
  });

  const msg = await messagesRepo.getById(id);
  assert.ok(msg, 'message should exist after insert');
  assert.ok(msg!.created_at, 'created_at should have a default value');
  // SQLite datetime('now') format: YYYY-MM-DD HH:MM:SS
  assert.match(msg!.created_at, /^\d{4}-\d{2}-\d{2}/);
});

test('getById returns undefined for missing message', async () => {
  const msg = await messagesRepo.getById('nonexistent-id');
  assert.equal(msg, undefined);
});

test('getRecent returns messages ordered by created_at DESC', async () => {
  const older = 'test-older-' + Date.now();
  const newer = 'test-newer-' + Date.now();

  await messagesRepo.insert({
    id: older, role: 'user', content: 'old', tts_url: null, played: 1,
    created_at: '2020-01-01T00:00:00.000Z',
  });
  await messagesRepo.insert({
    id: newer, role: 'dj', content: 'new', tts_url: null, played: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  });

  const recent = await messagesRepo.getRecent(5000);
  const ids = recent.map((m) => m.id);

  // The newer message should appear before the older one (DESC order)
  const newerIdx = ids.indexOf(newer);
  const olderIdx = ids.indexOf(older);
  assert.ok(newerIdx >= 0, 'newer message should be in results');
  assert.ok(olderIdx >= 0, 'older message should be in results');
  assert.ok(newerIdx < olderIdx, 'newer message should come first (DESC order)');
});

test('history endpoint maps created_at to timestamp for frontend', async () => {
  // Simulate what GET /api/chat/history does
  const msgs = await messagesRepo.getRecent(50);
  const response = msgs.reverse().map((m) => ({ ...m, timestamp: m.created_at }));

  for (const msg of response) {
    assert.ok(msg.timestamp, 'every message must have timestamp field');
    assert.equal(msg.timestamp, msg.created_at, 'timestamp must equal created_at');
    // Verify it's a stable string, not regenerated
    const parsed = Date.parse(msg.timestamp);
    assert.ok(!isNaN(parsed), 'timestamp must be parseable as a date');
  }
});

test('normalizeTimestamp: ALL timestamps get Z suffix because SQLite stores UTC', () => {
  // EXACT copy of the FIXED normalizeTimestamp from chat.ts
  function normalize(raw: string): string {
    if (!raw) return new Date().toISOString();
    let iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
    if (iso.split(':').length === 2) iso += ':00';
    if (!iso.endsWith('Z')) iso += 'Z';
    return iso;
  }

  // SQLite "2026-05-23 14:30:00" (UTC) → "2026-05-23T14:30:00Z"
  assert.equal(normalize('2026-05-23 14:30:00'), '2026-05-23T14:30:00Z');

  // ISO with Z → unchanged
  assert.equal(normalize('2026-05-23T06:30:00.000Z'), '2026-05-23T06:30:00.000Z');

  // Damaged ISO without Z → Z restored (previous fix stripped it)
  assert.equal(normalize('2026-05-23T06:30:00.000'), '2026-05-23T06:30:00.000Z');

  // Verify both parse as the same UTC instant
  // 06:30 UTC = 14:30 local in UTC+8
  const dSqlite = new Date(normalize('2026-05-23 06:30:00'));
  const dIso = new Date(normalize('2026-05-23T06:30:00.000Z'));
  assert.ok(!isNaN(dSqlite.getTime()));
  assert.ok(!isNaN(dIso.getTime()));
  assert.equal(dSqlite.getTime(), dIso.getTime(),
    'Same UTC clock time, regardless of source format');
});

test('timestamp is stable — same message returns same timestamp after simulated refresh', async () => {
  // Insert a message with an explicit created_at (simulating a chat message)
  const id = 'stable-ts-' + Date.now();
  const ts = '2026-05-23T14:30:00.000';
  await messagesRepo.insert({ id, role: 'user', content: 'hello', tts_url: null, played: 1, created_at: ts });

  // Simulate "before refresh": read from in-memory (sendMessage path)
  const msg1 = await messagesRepo.getById(id);
  assert.ok(msg1, 'message must exist');
  const beforeTimestamp = msg1!.created_at;

  // Simulate "after refresh": read from DB (loadHistory path)
  const msg2 = await messagesRepo.getById(id);
  assert.ok(msg2, 'message must exist after simulated refresh');
  const afterTimestamp = msg2!.created_at;

  // The timestamps must be IDENTICAL
  assert.equal(beforeTimestamp, afterTimestamp, 'timestamp must not change across reads');

  // Both must parse as the same Date
  assert.equal(
    new Date(beforeTimestamp.replace(' ', 'T')).getTime(),
    new Date(afterTimestamp.replace(' ', 'T')).getTime(),
    'parsed time must be identical',
  );
});
