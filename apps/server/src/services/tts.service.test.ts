import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { estimateAlignment, normalizeFishTimestampChunks } from './tts.service.js';

test('normalizes Fish timestamp chunks into global ordered segments', () => {
  const result = normalizeFishTimestampChunks([
    {
      audio_base64: Buffer.from('first').toString('base64'),
      chunk_audio_offset_sec: 0,
      alignment: {
        segments: [
          { text: '1971年', start: 0, end: 0.5 },
          { text: '大卫', start: 0.5, end: 0.9 },
        ],
        audio_duration: 1,
      },
    },
    {
      audio_base64: Buffer.from('second').toString('base64'),
      chunk_audio_offset_sec: 4.25,
      alignment: {
        segments: [
          { text: '你会', start: 0.1, end: 0.3 },
          { text: '感觉', start: 0.3, end: 0.8 },
        ],
        audio_duration: 0.8,
      },
    },
  ]);

  assert.equal(result.audio.length, 11);
  assert.deepEqual(result.alignment.segments, [
    { text: '1971年', start: 0, end: 0.5 },
    { text: '大卫', start: 0.5, end: 0.9 },
    { text: '你会', start: 4.35, end: 4.55 },
    { text: '感觉', start: 4.55, end: 5.05 },
  ]);
  assert.equal(result.duration, 5.05);
});

test('drops Fish voice style control tokens from alignment text', () => {
  const result = normalizeFishTimestampChunks([
    {
      audio_base64: Buffer.from('audio').toString('base64'),
      chunk_audio_offset_sec: 0,
      alignment: {
        segments: [
          { text: '[warm Mandarin male radio host]', start: 0, end: 0.4 },
          { text: 'warm', start: 0.4, end: 0.5 },
          { text: '1971年', start: 0.5, end: 0.9 },
          { text: '这首歌', start: 0.9, end: 1.2 },
        ],
        audio_duration: 1.2,
      },
    },
  ]);

  assert.deepEqual(result.alignment.segments, [
    { text: '1971年', start: 0.5, end: 0.9 },
    { text: '这首歌', start: 0.9, end: 1.2 },
  ]);
});

test('estimates dense Mandarin alignment when provider timestamps are sparse', () => {
  const result = estimateAlignment('晚上好，这里是 Claudio。让歌慢慢进来。', 4);

  assert.ok(result.segments.length >= 8);
  assert.equal(result.segments[0].start, 0);
  assert.ok(result.segments.at(-1)!.end <= 4.001);
  assert.ok(result.segments.some((segment) => segment.text.includes('Claudio')));
});

test('synthesis path prefers Fish before MiMo fallback', () => {
  const source = fs.readFileSync(new URL('./tts.service.ts', import.meta.url), 'utf-8');
  const mimoIndex = source.indexOf('const mimoBuffer = await tryMimo(text);');
  const fishIndex = source.indexOf('const fishTimestamp = await tryFishTimestamp(text);');

  assert.ok(mimoIndex > -1);
  assert.ok(fishIndex > -1);
  assert.ok(fishIndex < mimoIndex);
});
