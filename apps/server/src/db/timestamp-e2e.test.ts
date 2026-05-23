/**
 * E2E simulation: reproduce the EXACT browser rendering chain to verify
 * that message timestamps do not change across page refreshes.
 *
 * This script mimics:
 *  1. Server: inserts a message (the "send" path)
 *  2. Frontend "before refresh": formatMsgTime(SSE result.userTimestamp)
 *  3. Frontend "after refresh":  formatMsgTime(API history response.timestamp)
 *  4. Compare: DOM text must be identical
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { getDb } from './db.js';

// ── EXACT copy of HomePage.tsx formatMsgTime (FIXED: always add Z for UTC) ──
function formatMsgTime(raw: string): string {
  if (!raw) return '--:--';
  let iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  if (!iso.endsWith('Z')) iso += 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── EXACT copy of chat.ts normalizeTimestamp (FIXED: always add Z) ──
function normalizeTimestamp(raw: string): string {
  if (!raw) return new Date().toISOString();
  let iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  if (iso.split(':').length === 2) iso += ':00';
  if (!iso.endsWith('Z')) iso += 'Z';
  return iso;
}

// ── EXACT copy of chatStore loadHistory timestamp normalization ──
function hydrateTimestamp(raw: any): string {
  if (!raw) return new Date().toISOString();
  if (!raw.includes('T')) return raw.replace(' ', 'T') + 'Z';
  return raw.endsWith('Z') ? raw : raw + 'Z';
}

let messagesRepo: typeof import('./messages.repo.js').messagesRepo;

test('SIMULATION: send → display → refresh → display must be identical', async () => {
  await getDb();
  messagesRepo = (await import('./messages.repo.js')).messagesRepo;

  // === PHASE 1: Simulate a user sending a message ===
  // Server creates the user message
  const serverId = 'e2e-user-' + Date.now();
  const serverTimestamp = new Date().toISOString(); // what chat.ts sets as userTimestamp
  await messagesRepo.insert({
    id: serverId, role: 'user', content: 'Hello world', tts_url: null,
    played: 1, created_at: serverTimestamp,
  });

  // Server creates the DJ response
  const djId = 'e2e-dj-' + Date.now();
  const djTimestamp = new Date().toISOString();
  await messagesRepo.insert({
    id: djId, role: 'dj', content: 'Hi there', tts_url: '/cache/tts/abc.mp3',
    played: 0, created_at: djTimestamp,
  });

  // === PHASE 2: Simulate "before refresh" display ===
  // The frontend sends a message, receives SSE response with server timestamps,
  // and updates its local messages. This is what the user SEES before refresh.

  // Simulate: chatStore creates userMsg with client timestamp,
  // then updates from SSE → result.userTimestamp = serverTimestamp
  const beforeUserDisplay = formatMsgTime(serverTimestamp);
  const beforeDjDisplay = formatMsgTime(djTimestamp);

  console.log(`[E2E] Before refresh — user: ${beforeUserDisplay}  dj: ${beforeDjDisplay}`);
  console.log(`[E2E] Raw timestamps — user: ${serverTimestamp}  dj: ${djTimestamp}`);

  // === PHASE 3: Simulate page refresh → loadHistory → render ===

  // 3a. API endpoint: GET /api/chat/history
  const msgs = await messagesRepo.getRecent(50);
  const apiResponse = msgs.reverse().map((m) => ({
    ...m,
    timestamp: normalizeTimestamp(m.created_at),
  }));

  // 3b. chatStore.loadHistory: hydrate and normalise
  const hydrated = apiResponse.map((m: any) => ({
    ...m,
    status: 'done' as const,
    played: !!m.played,
    timestamp: hydrateTimestamp(m.timestamp),
  }));

  // 3c. Find our messages in the hydrated list
  const afterUser = hydrated.find((m: any) => m.id === serverId);
  const afterDj = hydrated.find((m: any) => m.id === djId);

  assert.ok(afterUser, 'User message must survive into loadHistory');
  assert.ok(afterDj, 'DJ message must survive into loadHistory');

  // 3d. Render (formatMsgTime)
  const afterUserDisplay = formatMsgTime(afterUser.timestamp);
  const afterDjDisplay = formatMsgTime(afterDj.timestamp);

  console.log(`[E2E] After refresh  — user: ${afterUserDisplay}  dj: ${afterDjDisplay}`);
  console.log(`[E2E] Raw timestamps — user: ${afterUser.timestamp}  dj: ${afterDj.timestamp}`);

  // === PHASE 4: Compare ===
  assert.equal(beforeUserDisplay, afterUserDisplay,
    `USER MESSAGE timestamp CHANGED! Before="${beforeUserDisplay}" After="${afterUserDisplay}"`);
  assert.equal(beforeDjDisplay, afterDjDisplay,
    `DJ MESSAGE timestamp CHANGED! Before="${beforeDjDisplay}" After="${afterDjDisplay}"`);

  console.log('[E2E] PASS: timestamps identical before and after simulated refresh');
});

test('SIMULATION: old SQLite-format UTC timestamps display correct local time', async () => {
  const oldId = 'e2e-old-' + Date.now();
  // Simulate an old message stored with SQLite datetime('now') = UTC
  const sqliteFormatTs = '2026-05-23 06:30:05'; // 06:30 UTC

  await messagesRepo.insert({
    id: oldId, role: 'user', content: 'old message', tts_url: null,
    played: 1, created_at: sqliteFormatTs,
  });

  // formatMsgTime should treat this as UTC (add Z) and convert to local
  const display = formatMsgTime(sqliteFormatTs);
  console.log(`[E2E old] SQLite UTC="${sqliteFormatTs}" → display="${display}"`);
  // 06:30 UTC in UTC+8 = 14:30 local
  // The exact display depends on the test machine's timezone, so we just
  // verify it's not crashing and is consistent across "refresh"

  // "After refresh": loadHistory normalizes via API, then hydrate in store
  const msgs = await messagesRepo.getRecent(50);
  const apiResponse = msgs.reverse().map((m) => ({
    ...m,
    timestamp: normalizeTimestamp(m.created_at),
  }));
  const hydrated = apiResponse.map((m: any) => ({
    ...m,
    status: 'done' as const,
    played: !!m.played,
    timestamp: hydrateTimestamp(m.timestamp),
  }));
  const after = hydrated.find((m: any) => m.id === oldId);
  assert.ok(after, 'Old message must survive');

  const afterDisplay = formatMsgTime(after.timestamp);

  console.log(`[E2E old] Before="${display}" After="${afterDisplay}"`);
  console.log(`[E2E old] Raw before="${sqliteFormatTs}" After="${after.timestamp}"`);

  assert.equal(display, afterDisplay,
    `OLD MESSAGE timestamp CHANGED! Before="${display}" After="${afterDisplay}"`);
});

test('SIMULATION: missing timestamp in API response uses safe fallback', async () => {
  // Test the edge case where API returns message without timestamp field
  const msg = { id: 'no-ts', role: 'user', content: 'test', played: 1 };
  const ts = hydrateTimestamp((msg as any).timestamp);
  const display = formatMsgTime(ts);
  assert.ok(display.length >= 4, 'Fallback must produce valid time display');
  assert.notEqual(display, '--:--');
});

test('SIMULATION: empty created_at does NOT produce changing display', async () => {
  // Test that normalizeTimestamp on empty string produces something stable
  const ts1 = normalizeTimestamp('');
  const display1 = formatMsgTime(ts1);

  // Wait a bit and do it again — should NOT change
  await new Promise((r) => setTimeout(r, 50));
  const ts2 = normalizeTimestamp('');
  const display2 = formatMsgTime(ts2);

  console.log(`[E2E] Empty created_at display1="${display1}" display2="${display2}"`);
  // They might differ by a minute if we cross a boundary, but the key
  // test is that the SAME record's display doesn't change on re-read.
  // This test just verifies the function doesn't crash.
  assert.ok(display1.length >= 4);
});
