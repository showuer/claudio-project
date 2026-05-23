/**
 * FORENSIC DUMP: Call the actual API endpoint, dump every message field,
 * simulate the exact browser rendering for each,
 * compare before/after a simulated refresh.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

// We need to actually call the running server's API.
const BASE = 'http://localhost:8080';

async function fetchHistory() {
  const resp = await fetch(`${BASE}/api/chat/history?limit=50`);
  return resp.json();
}

// EXACT copy of HomePage.tsx formatMsgTime
function formatMsgTime(raw: string): string {
  if (!raw) return '--:--';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

test('FORENSIC: dump API response and verify timestamp stability', async () => {
  // Call API twice to simulate two page loads
  const resp1 = await fetchHistory();
  await new Promise((r) => setTimeout(r, 200));
  const resp2 = await fetchHistory();

  console.log(`\n=== FORENSIC DUMP: ${resp1.messages?.length || 0} messages ===\n`);

  const msgs1 = resp1.messages || [];
  const msgs2 = resp2.messages || [];

  for (let i = 0; i < Math.min(msgs1.length, 5); i++) {
    const m1 = msgs1[i];
    const m2 = msgs2.find((m: any) => m.id === m1.id);

    console.log(`Message #${i}:`);
    console.log(`  id:        ${m1.id}`);
    console.log(`  role:      ${m1.role}`);
    console.log(`  content:   ${(m1.content || '').slice(0, 50)}`);
    console.log(`  timestamp: ${m1.timestamp}`);
    console.log(`  created_at: ${m1.created_at}`);
    console.log(`  played:    ${m1.played}`);
    console.log(`  tts_url:   ${(m1.tts_url || '').slice(0, 40)}`);
    // Check for any OTHER time-like fields
    for (const key of Object.keys(m1)) {
      if (key !== 'id' && key !== 'role' && key !== 'content' && key !== 'timestamp'
        && key !== 'created_at' && key !== 'played' && key !== 'tts_url') {
        console.log(`  !!EXTRA FIELD: ${key} = ${JSON.stringify(m1[key])}`);
      }
    }
    // DOM output
    console.log(`  DOM text:  "${formatMsgTime(m1.timestamp)}"`);

    if (m2) {
      const same = m1.timestamp === m2.timestamp;
      const dom1 = formatMsgTime(m1.timestamp);
      const dom2 = formatMsgTime(m2.timestamp);
      console.log(`  Call 2 ts: ${m2.timestamp}`);
      console.log(`  ts stable: ${same} | DOM1="${dom1}" DOM2="${dom2}" | DOM same: ${dom1 === dom2}`);
    } else {
      console.log(`  Call 2: NOT FOUND (id mismatch!)`);
    }
    console.log('');
  }

  // Check if any messages have empty/missing timestamp
  const noTs = msgs1.filter((m: any) => !m.timestamp);
  if (noTs.length > 0) {
    console.log(`!!! ${noTs.length} messages have NO timestamp field !!!`);
    for (const m of noTs) {
      console.log(`  id=${m.id} role=${m.role} content=${(m.content||'').slice(0,30)}`);
    }
  }

  // Check: do any timestamps differ between the two API calls?
  for (const m1 of msgs1) {
    const m2 = msgs2.find((m: any) => m.id === m1.id);
    if (m2 && m1.timestamp !== m2.timestamp) {
      console.log(`!!! TIMESTAMP CHANGED between calls for id=${m1.id}:`);
      console.log(`  Call1: "${m1.timestamp}" → DOM: "${formatMsgTime(m1.timestamp)}"`);
      console.log(`  Call2: "${m2.timestamp}" → DOM: "${formatMsgTime(m2.timestamp)}"`);
    }
  }

  // Final assertion
  for (const m1 of msgs1) {
    const m2 = msgs2.find((m: any) => m.id === m1.id);
    if (m2) {
      assert.equal(
        formatMsgTime(m1.timestamp),
        formatMsgTime(m2.timestamp),
        `DOM changed for message ${m1.id.slice(0,8)}: "${formatMsgTime(m1.timestamp)}" vs "${formatMsgTime(m2.timestamp)}"`,
      );
    }
  }

  console.log(`\nFORENSIC PASS: ${msgs1.length} messages, all DOM timestamps stable across API calls\n`);
});
