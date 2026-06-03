import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('home keeps one persistent player bar while radio space owns its immersive controls', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const globalPlayer = fs.readFileSync(path.resolve(__dirname, '../src/components/GlobalPlayerBar.tsx'), 'utf-8');

  assert.match(home, /<GlobalPlayerBar/);
  assert.equal((home.match(/<GlobalPlayerBar/g) || []).length, 1);
  assert.match(home, /home-view-shell \$\{!stationViewMode \? 'is-active' : ''\}[\s\S]*<GlobalPlayerBar/);
  assert.doesNotMatch(home, /\{!stationViewMode && \(/);
  assert.doesNotMatch(home, /HomeMiniPlayer/);
  assert.doesNotMatch(home, /className="player-strip"/);
  assert.doesNotMatch(home, /className={`queue-bar/);
  assert.match(surface, /station-page-player/);
  assert.match(surface, /station-page-queue/);
  assert.match(surface, /station-current-like/);
  assert.match(surface, /station-volume/);
  assert.match(globalPlayer, /global-player-bar/);
  assert.match(globalPlayer, /global-player-queue/);
  assert.match(globalPlayer, /onToggleMusic/);
  assert.match(globalPlayer, /onVolume/);
  assert.match(globalPlayer, /onToggleTrackLike/);
  assert.match(globalPlayer, /onOpenStation/);
  assert.match(globalPlayer, /aria-label="Open radio space"/);
});

test('home radio entry and radio-space home action only navigate pages', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');

  assert.match(home, /const enterRadioSpace = useCallback\(\(\) => \{/);
  assert.match(home, /setStationViewMode\(p\.activeStationMode \|\| 'aidj'\)/);
  assert.doesNotMatch(home, /<div className="station-switch">[\s\S]*FLOW[\s\S]*CAFE[\s\S]*LIB/);
  assert.match(home, /<button className="radio-entry" onClick=\{enterRadioSpace\}>RADIO<\/button>/);
  assert.match(home, /onOpenStation=\{enterRadioSpace\}/);
  assert.match(surface, /className="station-exit"/);
  assert.match(surface, />X<\/button>/);
});

test('home player occupies the Claudio status row with a taller standalone proportion', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');
  const chatSection = home.match(/<div className="chat-section">[\s\S]*?<div className="chat-msgs"/)?.[0] || '';
  const inputModule = home.match(/<div className="chat-input-bar">[\s\S]*?<div className="chat-input-row">/)?.[0] || '';

  assert.match(css, /\.global-player-shell[\s\S]*container-type: inline-size/);
  assert.match(chatSection, /<GlobalPlayerBar[\s\S]*<div className="chat-msgs"/);
  assert.doesNotMatch(inputModule, /<GlobalPlayerBar/);
  assert.match(css, /\.global-player-shell[\s\S]*position: relative[\s\S]*width: calc\(100% - 2 \* var\(--queue-px, 0px\)\)/);
  assert.match(css, /@container persistent-player \(max-width: 390px\)/);
  assert.match(css, /\.global-player-bar[\s\S]*min-height: 84px/);
  assert.match(css, /\.global-player-bar[\s\S]*padding: 13px 34px/);
  assert.match(css, /\.global-player-track,\s*\n\.global-player-actions,\s*\n\.global-player-transport \{[\s\S]*transform: translateY\(7px\)/);
  assert.match(css, /\.chat-bar \{[\s\S]*margin: 0 auto/);
  assert.match(css, /\.card[\s\S]*--card-radius-x: var\(--g3-h, 87px\)/);
  assert.match(css, /\.card[\s\S]*--card-radius-y: var\(--g3-v, 85px\)/);
  assert.match(css, /\.global-player-bar[\s\S]*border-radius:\s*var\(--card-radius-x\) var\(--card-radius-x\) 0 0 \/\s*var\(--card-radius-y\) var\(--card-radius-y\) 0 0/);
  assert.match(css, /\.chat-section[\s\S]*padding-bottom: 0/);
});

test('home input module is independent from the player row', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');
  const inputModule = home.match(/<div className="chat-input-bar">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';

  assert.doesNotMatch(inputModule, /<GlobalPlayerBar/);
  assert.match(inputModule, /<div className="chat-input-row">/);
  assert.match(css, /\.chat-input-bar[\s\S]*margin-top: 0/);
});

test('home attached player does not render a progress divider', () => {
  const globalPlayer = fs.readFileSync(path.resolve(__dirname, '../src/components/GlobalPlayerBar.tsx'), 'utf-8');

  assert.doesNotMatch(globalPlayer, /global-player-progress-row/);
  assert.doesNotMatch(globalPlayer, /global-player-progress"/);
});

test('home input module uses a neutral outline instead of a purple stroke', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');
  const attachedSectionStart = css.lastIndexOf('.chat-section {');
  const attachedShellStart = css.indexOf('.global-player-shell {', attachedSectionStart);
  const attachedInputOverride = css.slice(attachedSectionStart, attachedShellStart);

  assert.match(attachedInputOverride, /\.chat-input-bar \{[\s\S]*border: 1px solid rgba\(255,255,255,0\.14\)/);
  assert.match(attachedInputOverride, /\.chat-input-bar:focus-within \{[\s\S]*border-color: rgba\(255,255,255,0\.24\)/);
  assert.match(attachedInputOverride, /\.chat-input:focus \{[\s\S]*border-color: rgba\(255,255,255,0\.22\)/);
  assert.doesNotMatch(attachedInputOverride, /rgba\(120,100,220/);
});

test('home uses a responsive 650px shell, 1200px max height, and readable light controls', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(css, /\.card \{[\s\S]*width: min\(var\(--card-w, 650px\), calc\(100vw - 22px\)\)/);
  assert.match(css, /\.card \{[\s\S]*max-height: var\(--card-maxh, 1200px\)/);
  assert.match(css, /\.card \{[\s\S]*var\(--ambient-primary/);
  assert.match(css, /\.card \{[\s\S]*var\(--ambient-secondary/);
  assert.match(css, /\.card \{[\s\S]*var\(--ambient-accent/);
  assert.match(css, /\.card\[data-theme="light"\] \.radio-entry[\s\S]*color: #1A1A1A/);
  assert.match(css, /\.card\[data-theme="light"\] \.global-player-bar[\s\S]*background: rgba\(255,255,255,0\.88\)/);
  assert.match(css, /\.card\[data-theme="light"\] \.global-player-copy strong[\s\S]*color: #1A1A1A/);
});

test('home queue shares the immersive palette-aware station list language', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(css, /\.global-player-queue,\s*\n\.station-page-queue \{/);
  assert.match(css, /\.global-player-queue-list > div,\s*\n\.station-page-queue-list div \{/);
  assert.match(css, /\.global-player-queue-list \.global-player-like,\s*\n\.station-like \{/);
  assert.match(css, /\.global-player-queue \{[\s\S]*border-radius: 24px/);
  assert.match(css, /\.global-player-queue \{[\s\S]*color-mix\(in srgb, var\(--ambient-primary/);
  assert.match(css, /\.global-player-queue \{[\s\S]*color-mix\(in srgb, var\(--ambient-accent/);
  assert.match(css, /\.global-player-queue-list::-webkit-scrollbar \{[\s\S]*width: 0/);
  assert.match(css, /\.global-player-queue-list > div\.active \{[\s\S]*box-shadow: inset 2px 0 0 var\(--ambient-accent/);
  assert.match(css, /\.global-player-queue-list \.global-player-like \{[\s\S]*border-radius: 999px[\s\S]*background: transparent/);
  assert.match(css, /\.global-player-queue-list \.global-player-like:hover \{[\s\S]*background: rgba\(255,255,255,0\.08\)/);
  assert.match(css, /\.card\[data-theme="light"\] \.global-player-queue \{[\s\S]*color-mix\(in srgb, var\(--ambient-primary/);
  assert.match(css, /\.card\[data-theme="light"\] \.global-player-queue-list > div\.active \{[\s\S]*box-shadow: inset 2px 0 0 var\(--ambient-accent/);
  assert.doesNotMatch(css, /\.card\[data-theme="light"\] \.station-page-queue/);
});

test('radio space uses an internal mode selector with one FLOW name', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');

  assert.match(surface, /label: 'FLOW'/);
  assert.doesNotMatch(surface, /label: 'Random'/);
  assert.match(surface, /station-mode-tabs--page/);
  assert.match(home, /if \(mode === p\.activeStationMode\) \{/);
  assert.match(home, /p\.startStation\(mode, modePlaylists\[mode\], modeCursors\[mode\], p\.stationHealth \|\| 'ok'\)/);
});
