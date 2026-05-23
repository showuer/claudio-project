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

  assert.match(css, /\.profile-card-tags b[\s\S]*font-size: 9\.5px/);
  assert.match(css, /\.profile-card-tags b[\s\S]*justify-content: center/);
  assert.match(css, /\.profile-card-tags b[\s\S]*padding: 6px 13px 7px/);
  assert.match(css, /\.profile-card-tags b[\s\S]*color: #D8DEE8/);
  assert.match(css, /\.profile-card-tags b[\s\S]*border: 1px solid rgba\(255,255,255,0\.28\)/);
  assert.match(css, /\.profile-card-tags b[\s\S]*text-shadow: none/);
  assert.match(css, /\.tag-label[\s\S]*text-overflow: ellipsis/);
  assert.match(css, /\.tag-x[\s\S]*position: absolute/);
  assert.match(css, /\.tag-add[\s\S]*color: #8DEBCB/);
});

test('profile card internal layout uses balanced section proportions', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.profile-card[\s\S]*width: min\(450px, 92vw\)/);
  assert.match(css, /\.profile-card[\s\S]*min-height: 392px/);
  assert.match(css, /\.profile-card-inner[\s\S]*display: flex/);
  assert.match(css, /\.profile-card-inner[\s\S]*padding: 48px 44px 38px/);
  assert.match(css, /\.profile-card-head[\s\S]*margin-bottom: 22px/);
  assert.match(css, /\.profile-card-stats[\s\S]*margin: 0 0 24px/);
  assert.match(css, /\.profile-card-stats div[\s\S]*border-radius: 12px/);
  assert.match(css, /\.profile-card-tags[\s\S]*margin-bottom: 18px/);
  assert.match(css, /\.profile-card-philosophy[\s\S]*margin-top: auto/);
});

test('home surfaces keep subtle elevation in light and dark themes', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.card[\s\S]*--panel-shadow:/);
  assert.match(css, /\.card\[data-theme="light"\][\s\S]*--panel-shadow:/);
  assert.match(css, /\.queue-bar[\s\S]*box-shadow: var\(--panel-shadow-soft\)/);
  assert.match(css, /\.chat-bar[\s\S]*box-shadow: var\(--panel-shadow-soft\)/);
  assert.match(css, /\.chat-bar[\s\S]*width: calc\(100% - 2 \* var\(--queue-px, 28px\)\)/);
  assert.match(css, /\.chat-bar[\s\S]*background: #2A2A2E/);
  assert.match(css, /\.player-strip[\s\S]*background: transparent/);
  assert.match(css, /\.chat-bubble[\s\S]*box-shadow:/);
  assert.match(css, /\.card\[data-theme="light"\] \.chat-bubble[\s\S]*box-shadow:/);
  assert.match(css, /\.chat-input-bar[\s\S]*box-shadow: var\(--panel-shadow\)/);
});

test('music and volume tracks show hover thumbs without permanent knobs', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.progress-bar \.progress-fill::after/);
  assert.match(css, /\.player-strip \.vol-fill::after/);
  assert.match(css, /\.speaking-track span::after/);
  assert.match(css, /opacity: 0/);
  assert.match(css, /\.progress-bar \.progress-line:hover \.progress-fill::after[\s\S]*opacity: 1/);
  assert.match(css, /\.player-strip \.vol-track:hover \.vol-fill::after[\s\S]*opacity: 1/);
  assert.match(css, /\.speaking-track:hover span::after[\s\S]*opacity: 1/);
});

test('music progress and volume tracks support pointer dragging', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(homePage, /function startTrackDrag/);
  assert.match(homePage, /window\.addEventListener\('pointermove'/);
  assert.match(homePage, /onPointerDown=\{\(e\) => startTrackDrag\(e, p\.seekTo\)\}/);
  assert.match(homePage, /onPointerDown=\{\(e\) => startTrackDrag\(e, p\.setVolume\)\}/);
  assert.match(homePage, /onPointerDown=\{\(e\) => startTrackDrag\(e, onSeekMusic\)\}/);
  assert.equal(homePage.includes('className="progress-line" onClick'), false);
  assert.equal(homePage.includes('className="vol-track" onClick'), false);
  assert.equal(homePage.includes('className="speaking-track" onClick'), false);
  assert.match(css, /\.progress-bar \.progress-line[\s\S]*touch-action: none/);
  assert.match(css, /\.player-strip \.vol-track[\s\S]*touch-action: none/);
  assert.match(css, /\.speaking-track[\s\S]*touch-action: none/);
});

test('aidj button does not reload or pause current music before recommendation returns', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );
  const playerStore = fs.readFileSync(
    path.resolve(__dirname, '../src/stores/playerStore.ts'),
    'utf-8',
  );

  assert.equal(homePage.includes("p.preparePlayback(); c.sendAidj('来点音乐')"), false);
  assert.match(homePage, /className="btn-aidj"[\s\S]*c\.sendAidj\('来点音乐'\)/);
  assert.match(playerStore, /queuePlaylist: \(songs, narrationUrl = ''\) =>/);
  assert.match(playerStore, /const isCurrentSongPlaying = !!currentSong && !!audio && !audio\.paused/);
  assert.match(playerStore, /pendingPlaylistIntroUrl = narrationUrl/);
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
  assert.equal(homePage.includes('function estimateWords'), true);
  assert.equal(homePage.includes('function tokenizeSentence'), true);
  assert.equal(homePage.includes('buildSentenceSegments(sayText, audioDurationSec)'), true);
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

test('speaking overlay transcript fills available space and only highlights text', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../src/styles/global.css'),
    'utf-8',
  );

  assert.match(css, /\.speaking-transcript[\s\S]*flex: 1 1 auto/);
  assert.match(css, /\.speaking-transcript[\s\S]*height: auto/);
  assert.match(css, /\.speaking-transcript[\s\S]*min-height: min\(320px, 42vh\)/);
  assert.match(css, /\.speaking-line\.is-current[\s\S]*border-left-color:/);
  assert.match(css, /\.speaking-line\.is-current p[\s\S]*color: #f8fafc/);
  assert.match(css, /\.speaking-line\.is-current[\s\S]*font-weight: 600/);
  assert.match(css, /\.word\.current[\s\S]*font-weight: 700/);
  assert.equal(css.includes('box-decoration-break: clone'), false);
}
);

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
  assert.match(homePage, /const groupCount = 28/);
  assert.match(homePage, /groupEnergies/);
  assert.match(homePage, /edgeDrive/);
  assert.match(homePage, /edgeWeight/);
  assert.match(homePage, /baseLevel/);
  assert.match(homePage, /groupedPulse/);
  assert.match(homePage, /Math\.max\(34, energy \* rect\.height \* shape\)/);
  assert.match(homePage, /catch \(err\)[\s\S]*spectrum draw skipped/);
  assert.match(homePage, /canvas\.width !== nextWidth \|\| canvas\.height !== nextHeight/);
  assert.match(homePage, /typeof ctx\.roundRect === 'function'/);
});

test('WaveformCanvas uses setTransform instead of cumulative scale to avoid dpr stacking', () => {
  const waveform = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'WaveformCanvas.tsx'),
    'utf-8',
  );
  assert.match(waveform, /ctx\.setTransform\(dpr,\s*0,\s*0,\s*dpr,\s*0,\s*0\)/);
  assert.doesNotMatch(waveform, /ctx\.scale\(dpr,\s*dpr\)/);
});

test('subtitle text always comes from say, never from provider alignment', () => {
  const homePage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/HomePage.tsx'),
    'utf-8',
  );
  // estimateWords tokenizes sentence.text — never provider text
  assert.match(homePage, /tokenizeSentence\(sentence\.text\)/);
  // words are built by estimateWords, not by filtering provider segments
  assert.match(homePage, /s\.words = estimateWords\(s\)/);
  // Provider is ONLY used for rescaling sentence start/end times
  assert.doesNotMatch(homePage, /aligned\.filter/);
  // No code path that uses provider segment text as display text
  assert.doesNotMatch(homePage, /sentenceWords/);
  // Word rendering uses w.text (which comes from tokenizeSentence)
  assert.match(homePage, /w\.text/);
  // Fallback always renders segment.text (original say) not word text
  assert.match(homePage, /segment\.text/);
});
