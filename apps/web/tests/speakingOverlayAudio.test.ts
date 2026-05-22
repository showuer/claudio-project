import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('speaking overlay analyzes music without rerouting the audio element output', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('createMediaElementSource'), false);
  assert.equal(homePage.includes('captureStream'), true);
  assert.equal(homePage.includes('createMediaStreamSource'), true);
});

test('speaking overlay reconnects the music analyser when the song changes', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('disconnectMusicAnalyser'), true);
  assert.equal(homePage.includes('[open, song?.song_id, musicPlaying]'), true);
});

test('speaking overlay footer uses a tts progress track instead of a second spectrum', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('miniCanvasRef'), false);
  assert.equal(homePage.includes('speaking-tts-track'), true);
});

test('speaking overlay badge reflects playlist track count, not subtitle segments', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('TTS • {segments.length} segments'), false);
  assert.equal(homePage.includes('QUEUE • {playlistCount} TRACKS'), true);
  assert.equal(homePage.includes('playlistCount={p.playlist.length}'), true);
});

test('home and speaking overlay share Claudio identity sizing and profile entry', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.page-logo[\s\S]*font-size: clamp\(28px, 6vw, 38px\)/);
  assert.match(css, /\.speaking-name[\s\S]*font-size: clamp\(28px, 6vw, 38px\)/);
  assert.match(css, /\.speaking-hero[\s\S]*padding: var\(--head-pt, 16px\) var\(--head-px, 28px\) 0/);
  assert.match(css, /\.speaking-identity > div[\s\S]*padding-top: 5px/);
  assert.match(css, /\.speaking-avatar-button[\s\S]*width: 44px[\s\S]*height: 44px/);
  assert.equal(homePage.includes('className="speaking-avatar-button"'), true);
  assert.equal(homePage.includes('onOpenProfile={() => setProfileOpen(true)}'), true);
});

test('speaking overlay status reflects narration, music, or paused state', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes("const statusText = narrationPlaying ? 'Speaking...' : musicPlaying ? 'Playing...' : 'Paused';"), true);
  assert.equal(homePage.includes('<div className="speaking-status"><span />{statusText}</div>'), true);
});

test('profile card header removes copy subtitle and centers Claudio with avatar', () => {
  const profileCard = fs.readFileSync(
    path.resolve(__dirname, '../src/components/ProfileCard.tsx'),
    'utf-8',
  );
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.equal(profileCard.includes("profile?.copy || 'Your private AI DJ'"), false);
  assert.match(css, /\.profile-card-head[\s\S]*align-items: center/);
  assert.match(css, /\.profile-card-head > div[\s\S]*min-height: 64px/);
  assert.match(css, /\.profile-card-head strong[\s\S]*line-height: 1/);
});

test('profile tags are readable chips with stronger contrast', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.profile-card-tags b[\s\S]*font-size: 9px/);
  assert.match(css, /\.profile-card-tags b[\s\S]*padding: 4px 10px 5px/);
  assert.match(css, /\.profile-card-tags b[\s\S]*color: #F3F4F6/);
  assert.match(css, /\.profile-card-tags b[\s\S]*border: 1px solid rgba\(255,255,255,0\.28\)/);
  assert.match(css, /\.tag-add[\s\S]*color: #A7F3D0/);
});

test('profile card internal layout uses balanced section proportions', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.profile-card[\s\S]*width: 540px/);
  assert.match(css, /\.profile-card[\s\S]*min-height: 392px/);
  assert.match(css, /\.profile-card-inner[\s\S]*padding: 44px 38px 34px/);
  assert.match(css, /\.profile-card-head[\s\S]*margin-bottom: 24px/);
  assert.match(css, /\.profile-card-stats[\s\S]*margin-bottom: 22px/);
  assert.match(css, /\.profile-card-stats div[\s\S]*border-radius: 12px/);
  assert.match(css, /\.profile-card-tags[\s\S]*margin-bottom: 20px/);
});

test('speaking overlay fully covers the home card chrome while open', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.card[\s\S]*--card-radius:/);
  assert.match(css, /\.card[\s\S]*--card-rim-shadow:/);
  assert.match(css, /\.card[\s\S]*border-radius: var\(--card-radius\)/);
  assert.equal(css.includes('.card { --card-radius: 32px; width: 92vw'), false);
  assert.match(css, /\.card::before[\s\S]*display: none/);
  assert.match(css, /\.card::after[\s\S]*display: none/);
  assert.match(css, /\.speaking-overlay[\s\S]*inset: 0/);
  assert.match(css, /\.speaking-overlay[\s\S]*border-radius: var\(--card-radius\)/);
  assert.match(css, /\.speaking-shell[\s\S]*border-radius: var\(--card-radius\)/);
  assert.match(css, /\.speaking-overlay[\s\S]*background: #000/);
  assert.match(css, /\.card:has\(\.speaking-overlay\)[\s\S]*border-color: rgba\(0,255,200,0\.24\)/);
  assert.match(css, /\.card:has\(\.speaking-overlay\)[\s\S]*box-shadow: var\(--card-rim-shadow\)/);
  assert.match(css, /\.card:has\(\.speaking-overlay\)::before,[\s\S]*\.card:has\(\.speaking-overlay\)::after[\s\S]*opacity: 0/);
});

test('stage and card keep contrast with living ambient light', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.stage::before[\s\S]*animation: ambient-bloom/);
  assert.match(css, /\.stage::after[\s\S]*mix-blend-mode: screen/);
  assert.match(css, /@keyframes ambient-bloom/);
  assert.match(css, /@keyframes ambient-drift[\s\S]*17%[\s\S]*39%[\s\S]*61%[\s\S]*83%/);
  assert.match(css, /\.card[\s\S]*radial-gradient\(ellipse 108% 72% at 50% 0%/);
  assert.match(css, /\.card[\s\S]*radial-gradient\(ellipse 72% 48% at 50% 48%/);
});

test('speaking overlay does not close automatically when narration finishes', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('c.markPlayed(latestNarration.id);\n    setSpeakingOpen(false);'), false);
});

test('speaking overlay only auto-closes after it observed active narration', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('speakingSessionRef.current.sawPlaying = true'), true);
  assert.equal(homePage.includes('if (!speakingSessionRef.current.sawPlaying) return;'), true);
});

test('speaking overlay marks narration played only once after playback ends', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );
  const chatStore = fs.readFileSync(
    path.resolve(__dirname, '../src/stores/chatStore.ts'),
    'utf-8',
  );

  assert.equal(homePage.includes('if (latestNarration.played) return;'), true);
  assert.equal(homePage.includes('latestNarration?.played'), true);
  assert.equal(homePage.includes('latestNarration, p.narrationUrl'), false);
  assert.equal(chatStore.includes('if (!target || target.played) return s;'), true);
});

test('speaking overlay fits subtitle segments to real audio duration', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('function fitSegmentsToDuration'), true);
  assert.equal(homePage.includes('targetDuration / lastEnd'), true);
  assert.equal(homePage.includes('buildSentenceSegments(fallbackText, targetDuration)'), true);
  assert.equal(homePage.includes('splitNarrationSentences'), true);
});

test('speaking overlay scrolls only the subtitle container to the current sentence', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );

  assert.equal(homePage.includes('transcriptRef'), true);
  assert.equal(homePage.includes('scrollIntoView'), false);
  assert.equal(homePage.includes('function scrollTranscriptTo'), true);
  assert.equal(homePage.includes("typeof transcript.scrollTo === 'function'"), true);
  assert.equal(homePage.includes('transcript.scrollTop = nextTop'), true);
  assert.equal(homePage.includes('scrollTranscriptTo(transcript, targetTop)'), true);
  assert.equal(homePage.includes('currentLine.offsetTop'), true);
});

test('speaking overlay spectrum uses full available hero area and grouped rhythm', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.equal(css.includes('height: min(164px, 19vh)'), false);
  assert.match(css, /\.speaking-hero[\s\S]*overflow: hidden/);
  assert.match(css, /\.speaking-spectrum[\s\S]*top:/);
  assert.match(css, /\.speaking-spectrum[\s\S]*bottom: 0/);
  assert.match(css, /\.speaking-spectrum[\s\S]*height: calc\(100% - 96px\)/);
  assert.match(css, /\.speaking-spectrum[\s\S]*z-index: 1/);
  assert.match(css, /\.speaking-card[\s\S]*z-index: 5/);
  assert.match(homePage, /const groupCount = 24/);
  assert.match(homePage, /groupEnergies/);
  assert.match(homePage, /baseLevel/);
  assert.match(homePage, /groupedPulse/);
  assert.match(homePage, /Math\.max\(34, energy \* rect\.height \* shape\)/);
  assert.match(homePage, /catch \(err\)[\s\S]*spectrum draw skipped/);
  assert.match(homePage, /canvas\.width !== nextWidth \|\| canvas\.height !== nextHeight/);
  assert.match(homePage, /typeof ctx\.roundRect === 'function'/);
});
