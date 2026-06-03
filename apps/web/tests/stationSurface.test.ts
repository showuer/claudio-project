import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('station surfaces define distinct aidj random cafe and library themes', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /id: 'aidj'/);
  assert.match(surface, /random-infinite/);
  assert.match(surface, /focus-cafe/);
  assert.match(surface, /focus-library/);
  assert.match(surface, /Claudio Live/);
  assert.match(surface, /Focus Space/);
  assert.match(css, /\.station-page--aidj/);
  assert.match(css, /\.station-page--random/);
  assert.match(css, /\.station-page--cafe/);
  assert.match(css, /\.station-page--library/);
});

test('cover palette feeds a mesh-gradient color field', () => {
  const paletteHook = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useCoverPalette.ts'), 'utf-8');
  const meshHook = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useMeshGradient.ts'), 'utf-8');
  const mesh = fs.readFileSync(path.resolve(__dirname, '../src/components/MeshGradientBackground.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(paletteHook, /type CoverPalette/);
  assert.match(paletteHook, /trackId: string/);
  assert.match(paletteHook, /coverUrl: string/);
  assert.match(paletteHook, /source: 'extracted' \| 'fallback'/);
  assert.match(paletteHook, /paletteCache = new Map/);
  assert.match(paletteHook, /paletteInflightCache = new Map/);
  assert.match(paletteHook, /const key = `\$\{trackId \|\| 'unknown-track'\}::\$\{coverUrl \|\| 'no-cover'\}`/);
  assert.match(paletteHook, /nextPalette\.trackId !== \(trackId \|\| ''\)/);
  assert.match(paletteHook, /nextPalette\.coverUrl !== \(coverUrl \|\| ''\)/);
  assert.match(paletteHook, /schedulePaletteExtraction/);
  assert.match(paletteHook, /requestIdleCallback/);
  assert.match(paletteHook, /seedPaletteCache = new Map/);
  assert.match(paletteHook, /createSeedPalette/);
  assert.match(paletteHook, /deriveHueColor/);
  assert.match(paletteHook, /canvas\.getContext\('2d'/);
  assert.match(paletteHook, /normalizePalette/);
  assert.match(paletteHook, /fallbackPalette/);
  assert.match(meshHook, /requestAnimationFrame/);
  assert.match(meshHook, /lerp/);
  assert.match(meshHook, /lerpHexColor/);
  assert.doesNotMatch(meshHook, /--p\$\{index \+ 1\}-x/);
  assert.doesNotMatch(meshHook, /--p\$\{index \+ 1\}-y/);
  assert.doesNotMatch(meshHook, /setState/);
  assert.match(mesh, /coverUrl\?: string/);
  assert.match(mesh, /trackId\?: string/);
  assert.match(mesh, /palette\.trackId === trackId/);
  assert.match(mesh, /toCoverSrc/);
  assert.match(mesh, /mesh-cover-prism/);
  assert.match(mesh, /decoding="async"/);
  assert.match(mesh, /mesh-background-field/);
  assert.match(mesh, /mesh-blob/);
  assert.match(mesh, /mesh-rhythm-map/);
  assert.match(css, /\.mesh-cover-prism__slice--a/);
  assert.match(css, /\.mesh-cover-prism__slice[\s\S]*object-fit: contain/);
  assert.match(css, /\.mesh-rhythm-map span/);
  assert.match(css, /@keyframes mesh-rhythm-swell/);
  assert.match(css, /@keyframes mesh-cover-drift/);
  assert.match(css, /\.mesh-blob/);
  assert.match(css, /@keyframes mesh-blob-flow/);
  assert.doesNotMatch(css, /radial-gradient\(circle at var\(--p1-x/);
  assert.doesNotMatch(css, /will-change: opacity, background/);
  assert.match(css, /\.mesh-background-field[\s\S]*contain: paint/);
  assert.match(css, /\.mesh-vignette/);
  assert.match(css, /--cover-primary/);
});

test('station mode renders as a full-screen homepage replacement', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const app = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
  const stage = fs.readFileSync(path.resolve(__dirname, '../src/components/Stage.tsx'), 'utf-8');
  const ambient = fs.readFileSync(path.resolve(__dirname, '../src/components/CoverAmbientBackground.tsx'), 'utf-8');
  const coverHook = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useResolvedCoverUrl.ts'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /className=\{`station-page station-page--/);
  assert.match(home, /stationSurfaceMounted/);
  assert.match(home, /station-view-shell/);
  assert.match(app, /CoverAmbientBackground/);
  assert.match(app, /activeStationMode/);
  assert.match(app, /songId=\{currentSong\?\.song_id\}/);
  assert.match(app, /useCoverPalette/);
  assert.match(app, /useResolvedCoverUrl/);
  assert.match(app, /--ambient-accent/);
  assert.match(app, /activeCoverUrl/);
  assert.match(stage, /style\?: CSSProperties/);
  assert.match(ambient, /songId\?: string/);
  assert.doesNotMatch(ambient, /\/api\/player\/detail\//);
  assert.match(coverHook, /coverDetailInflight/);
  assert.match(coverHook, /coverDetailCache/);
  assert.match(coverHook, /\/api\/player\/detail\//);
  assert.doesNotMatch(ambient, /tilePositions/);
  assert.doesNotMatch(ambient, /station-ambient-cover__tiles/);
  assert.match(ambient, /station-ambient-mesh/);
  assert.match(ambient, /station-ambient-cover__fill/);
  assert.match(ambient, /station-ambient-cover__map/);
  assert.equal((ambient.match(/className="station-ambient-mesh"/g) || []).length, 1);
  assert.match(ambient, /active\?: boolean/);
  assert.match(app, /active=\{true\}/);
  assert.match(ambient, /decoding="async"/);
  assert.match(ambient, /toCoverSrc/);
  assert.match(css, /\.station-page[\s\S]*height: 100%/);
  assert.match(css, /\.station-view-shell[\s\S]*visibility: hidden/);
  assert.match(css, /\.station-view-shell\.is-active[\s\S]*visibility: visible/);
  assert.match(css, /\.station-ambient[\s\S]*z-index: 1/);
  assert.match(css, /\.station-ambient[\s\S]*contain: paint/);
  assert.match(css, /\.station-ambient-layer[\s\S]*will-change: opacity, transform/);
  assert.match(css, /\.station-ambient-cover__map[\s\S]*object-fit: contain/);
  assert.match(css, /\.station-ambient-cover__fill[\s\S]*object-fit: cover/);
  assert.doesNotMatch(css, /\.station-ambient-cover__tiles/);
  assert.match(css, /\.station-ambient-mesh span:nth-child\(12\)/);
  assert.match(css, /@keyframes station-ambient-mesh-flow/);
  assert.doesNotMatch(css, /station-ambient-mesh-warp/);
  assert.doesNotMatch(css, /will-change: transform, opacity, filter/);
  assert.match(css, /--card-rim-shadow:[\s\S]*var\(--ambient-accent/);
  assert.match(css, /border-color: color-mix\(in srgb, var\(--ambient-accent/);
  assert.doesNotMatch(css, /@keyframes station-ambient-cover-breathe/);
  assert.doesNotMatch(home, /<StationSurface[\s\S]{0,800}<div className=\{`queue-bar/);
});

test('home and station pages share one persistent outer ambient mesh', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.doesNotMatch(css, /\.card:has\(\.station-page\)/);
  assert.match(css, /\.card:has\(\.station-view-shell\.is-active\)/);
  assert.doesNotMatch(css, /\.stage:not\(:has\(\.station-view-shell\.is-active\)\) > \.station-ambient/);
});

test('lyrics ignore stale network responses after a fast aidj track switch', () => {
  const store = fs.readFileSync(path.resolve(__dirname, '../src/stores/playerStore.ts'), 'utf-8');

  assert.match(store, /let lyricRequestSession = 0/);
  assert.match(store, /const requestSession = \+\+lyricRequestSession/);
  assert.match(store, /requestSession !== lyricRequestSession/);
  assert.match(store, /currentSong\?\.song_id !== songId/);
});

test('station playback state is separated from the visible station page', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');

  assert.match(home, /stationViewMode/);
  assert.match(home, /setStationViewMode\(mode\)/);
  assert.match(home, /leaveStationView/);
  assert.match(home, /onStop=\{leaveStationView\}/);
  assert.doesNotMatch(home, /onStop=\{p\.stopStation\}/);
  assert.match(home, /enterRadioSpace/);
  assert.match(home, /setStationViewMode\(p\.activeStationMode \|\| 'aidj'\)/);
  assert.match(home, /<GlobalPlayerBar/);
  assert.doesNotMatch(home, /HomeMiniPlayer/);
});

test('home keeps its compact queue while radio space keeps immersive controls', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');

  assert.match(home, /<GlobalPlayerBar[\s\S]*playlist=\{p\.playlist\}/);
  assert.match(home, /home-view-shell \$\{!stationViewMode \? 'is-active' : ''\}/);
  assert.doesNotMatch(home, /\{!stationViewMode && \(/);
  assert.match(home, /song=\{song\}/);
  assert.doesNotMatch(home, /className="player-strip"/);
  assert.doesNotMatch(home, /className=\{`queue-bar/);
  assert.doesNotMatch(home, /HomeMiniPlayer/);
  assert.match(surface, /station-page-player/);
  assert.match(surface, /station-page-queue/);
});

test('home and radio space crossfade through persistent overlay shells', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(home, /home-view-shell \$\{!stationViewMode \? 'is-active' : ''\}/);
  assert.match(home, /station-view-shell \$\{stationViewMode \? 'is-active' : ''\}/);
  assert.doesNotMatch(home, /\{!stationViewMode && \(/);
  assert.match(css, /\.home-view-shell,[\s\S]*\.station-view-shell \{[\s\S]*position: absolute[\s\S]*inset: 0/);
  assert.match(css, /\.home-view-shell,[\s\S]*\.station-view-shell \{[\s\S]*opacity: 0[\s\S]*visibility: hidden[\s\S]*pointer-events: none/);
  assert.match(css, /\.home-view-shell\.is-active,[\s\S]*\.station-view-shell\.is-active \{[\s\S]*opacity: 1[\s\S]*visibility: visible[\s\S]*pointer-events: auto/);
  assert.doesNotMatch(css, /\.station-view-shell\.is-active \{[^}]*position: relative/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.home-view-shell,[\s\S]*\.station-view-shell/);
});

test('station mode switching changes the active queue even while music is already playing', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');

  assert.match(home, /if \(mode === p\.activeStationMode\) \{[\s\S]*return;/);
  assert.match(home, /p\.startStation\(mode, modePlaylists\[mode\], modeCursors\[mode\], p\.stationHealth \|\| 'ok'\)/);
  assert.match(home, /p\.startStation\(mode, stationSongs, data\.cursor \|\| '', data\.health \|\| 'ok'\)/);
});

test('station playlists support refresh, likes, and click-to-play without polluting home', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const globalPlayer = fs.readFileSync(path.resolve(__dirname, '../src/components/GlobalPlayerBar.tsx'), 'utf-8');
  const store = fs.readFileSync(path.resolve(__dirname, '../src/stores/playerStore.ts'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /onRefresh/);
  assert.match(surface, /refreshing/);
  assert.match(surface, /className="station-refresh station-refresh--player"/);
  assert.match(globalPlayer, /onPlayTrack/);
  assert.match(globalPlayer, /onToggleTrackLike/);
  assert.match(globalPlayer, /likedTrackIds/);
  assert.match(globalPlayer, /global-player-like/);
  assert.match(globalPlayer, /event\.stopPropagation\(\)/);
  assert.match(home, /modePlaylists/);
  assert.match(home, /refreshStationMode/);
  assert.match(home, /onPlayTrack=\{p\.playTrack\}/);
  assert.match(home, /refreshingModes/);
  assert.match(store, /likedTrackIds/);
  assert.match(store, /LIKED_STORAGE/);
  assert.match(store, /toggleTrackLike/);
  assert.match(store, /playStationQueue/);
  assert.match(css, /\.global-player-like\.is-liked/);
});

test('persistent player replaces the home mini player', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const player = fs.readFileSync(path.resolve(__dirname, '../src/components/GlobalPlayerBar.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.doesNotMatch(home, /HomeMiniPlayer/);
  assert.match(home, /<GlobalPlayerBar/);
  assert.match(player, /global-player-bar/);
  assert.match(css, /\.global-player-shell[\s\S]*position: relative/);
  assert.match(css, /\.global-player-bar[\s\S]*grid-template-columns:/);
});

test('station mode includes synced scrolling lyrics', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /lyricLrc/);
  assert.match(surface, /parseLrc/);
  assert.match(surface, /station-lyrics/);
  assert.match(surface, /container\.scrollTo/);
  assert.doesNotMatch(surface, /scrollIntoView/);
  assert.match(surface, /active\.offsetTop - \(container\.clientHeight \* 0\.38\)/);
  assert.match(home, /lyricLrc=\{p\.lyricLrc\}/);
  assert.match(home, /p\.fetchLyric\(song\.song_id\)/);
  assert.match(css, /\.station-lyrics/);
  assert.match(css, /\.station-lyrics[\s\S]*height: 100%/);
  assert.match(css, /\.station-lyrics[\s\S]*overscroll-behavior: contain/);
  assert.match(css, /\.station-lyrics[\s\S]*overflow-anchor: none/);
  assert.match(css, /\.station-lyrics[\s\S]*scroll-padding: 32% 0 58%/);
  assert.match(css, /\.station-lyrics[\s\S]*padding: 32% 14px 58%/);
  assert.match(css, /\.station-lyrics[\s\S]*border: 0/);
  assert.match(css, /\.station-lyrics[\s\S]*background: transparent/);
  assert.match(css, /\.station-lyric-line\.active/);
});

test('station cover art is fetched from song detail when queue metadata is missing', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const app = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
  const coverHook = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useResolvedCoverUrl.ts'), 'utf-8');
  const playerRoute = fs.readFileSync(path.resolve(__dirname, '../../server/src/routes/player.ts'), 'utf-8');
  const chatStore = fs.readFileSync(path.resolve(__dirname, '../src/stores/chatStore.ts'), 'utf-8');
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');

  assert.match(surface, /useResolvedCoverUrl\(song\?\.song_id, song\?\.coverUrl\)/);
  assert.match(app, /useResolvedCoverUrl/);
  assert.match(coverHook, /coverDetailInflight/);
  assert.match(coverHook, /coverDetailCache/);
  assert.match(coverHook, /\/api\/player\/detail\//);
  assert.match(playerRoute, /app\.get\('\/api\/player\/detail\/:songId'/);
  assert.match(chatStore, /coverUrl: s\.coverUrl/);
  assert.match(home, /coverUrl: s\.coverUrl/);
});

test('station space exposes one clear home action', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /aria-label="Back to Claudio home"/);
  assert.match(surface, /className="station-exit"/);
  assert.match(surface, />X<\/button>/);
  assert.match(css, /\.station-exit/);
});

test('station title uses container-based CJK-safe typography', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /const titleText = song\?\.song_name \|\| 'Finding signal'/);
  assert.match(surface, /Array\.from\(titleText\)\.length > 8/);
  assert.match(surface, /className=\{`station-title/);
  assert.match(surface, /station-title--compact/);
  assert.match(css, /\.station-page[\s\S]*container-type: inline-size/);
  assert.match(css, /\.station-title[\s\S]*font-size: clamp\(30px, 7\.4cqw, 42px\)/);
  assert.match(css, /\.station-title[\s\S]*line-height: 1\.08/);
  assert.match(css, /\.station-title[\s\S]*white-space: nowrap/);
  assert.match(css, /\.station-title[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(css, /\.station-title[\s\S]*text-wrap: balance/);
  assert.match(css, /\.station-title--compact[\s\S]*font-size: clamp\(26px, 6\.3cqw, 36px\)/);
  assert.match(css, /\.station-title--compact[\s\S]*line-height: 1\.12/);
});

test('station layout restores its immersive player without reserving space for the home player', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');
  const stationPageAfter = css.match(/\.station-page::after\s*\{[^}]*\}/)?.[0] || '';

  assert.match(surface, /station-page-player/);
  assert.match(surface, /station-page-queue/);
  assert.match(surface, /station-current-like/);
  assert.match(surface, /station-volume/);
  assert.match(css, /\.station-page[\s\S]*width: min\(650px, calc\(100vw - 32px\)\)/);
  assert.match(css, /\.card:has\(\.station-view-shell\.is-active\)[\s\S]*width: min\(650px, calc\(100vw - 22px\)\)/);
  assert.match(css, /\.station-page[\s\S]*grid-template-rows:[\s\S]*76px[\s\S]*minmax\(118px, 0\.34fr\)[\s\S]*minmax\(480px, 2\.05fr\)[\s\S]*112px/);
  assert.doesNotMatch(css, /\.station-brand-mark/);
  assert.doesNotMatch(surface, /station-brand/);
  assert.doesNotMatch(stationPageAfter, /radial-gradient\(circle/);
  assert.match(css, /\.global-player-shell[\s\S]*width: calc\(100% - 2 \* var\(--queue-px, 0px\)\)/);
  assert.match(css, /\.global-player-queue[\s\S]*position: absolute/);
  assert.match(css, /\.global-player-queue\.is-open[\s\S]*pointer-events: auto/);
});

test('station modes have visible decorative identity and smooth transitions', () => {
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');

  assert.match(surface, /BackgroundGeometry/);
  assert.match(surface, /MeshGradientBackground/);
  assert.doesNotMatch(surface, /key=\{`hero-\$\{theme\}-/);
  assert.match(home, /stationPreviewMode/);
  assert.match(home, /setStationPreviewMode\(mode\)/);
  assert.match(home, /mode=\{stationSurfaceMode\}/);
  assert.match(css, /\.station-page--random[\s\S]*--station-accent/);
  assert.match(css, /\.station-page--cafe[\s\S]*--station-accent/);
  assert.match(css, /\.station-page--library[\s\S]*--station-accent/);
  assert.match(css, /@keyframes station-content-in/);
  assert.match(css, /\.station-geometry/);
  assert.match(css, /\.station-geo-lens--back/);
  assert.match(css, /\.station-geo-block/);
  assert.match(css, /\.station-geo-ring--large/);
  assert.match(css, /color-mix\(in srgb, var\(--cover-accent/);
  assert.doesNotMatch(css, /station-ribbon-drift/);
  assert.doesNotMatch(css, /\.station-ribbon/);
  assert.match(css, /\.mesh-cover-prism__slice--a[\s\S]*rotate\(-3deg\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('aidj view separates current view mode from playback source and binds to current track state', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');

  assert.match(home, /setStationViewMode\(mode\)/);
  assert.match(home, /if \(mode === 'aidj'\)/);
  assert.doesNotMatch(home, /if \(p\.activeStationMode && mode === 'aidj'\) return/);
  assert.doesNotMatch(home, /if \(p\.musicPlaying\) return/);
  assert.match(home, /lyricLrc=\{p\.lyricLrc\}/);
  assert.match(home, /p\.fetchLyric\(song\.song_id\)/);
  assert.match(surface, /const coverUrl = useResolvedCoverUrl\(song\?\.song_id, song\?\.coverUrl\)/);
  assert.match(surface, /song\?\.song_name \|\| 'Finding signal'/);
  assert.doesNotMatch(surface, /key=\{`hero-/);
  assert.doesNotMatch(surface, /key=\{`lyrics-/);
});

test('entering the aidj surface retries lyrics for the current song', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');

  assert.match(home, /if \(stationViewMode === 'aidj' && song\?\.song_id && !p\.lyricLrc\) \{/);
  assert.match(home, /p\.fetchLyric\(song\.song_id\)/);
  assert.match(home, /\}, \[stationViewMode\]\);/);
});

test('home radio entry restores the page without requesting a queue', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');

  assert.match(home, /const enterRadioSpace = useCallback\(\(\) => \{[\s\S]*setStationViewMode\(p\.activeStationMode \|\| 'aidj'\)/);
  assert.doesNotMatch(home, /const enterRadioSpace = useCallback\(\(\) => \{[\s\S]{0,180}sendAidj/);
  assert.match(home, /className="btn-aidj"[\s\S]*c\.sendAidj\('来点音乐'\)/);
});

test('aidj player exposes an explicit fresh narrated queue action', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../src/pages/HomePage.tsx'), 'utf-8');
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/components/StationSurface.tsx'), 'utf-8');

  assert.match(home, /if \(mode === 'aidj'\) \{[\s\S]*if \(!c\.isStreaming\) void c\.sendAidj\('来点音乐'\);[\s\S]*return;/);
  assert.doesNotMatch(surface, /mode !== 'aidj' && \(/);
  assert.match(surface, /mode === 'aidj' \? 'NEW' : 'REFRESH'/);
});

test('station mode switcher is a clear segmented control', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8');
  assert.match(css, /\.station-mode-tabs--page[\s\S]*border-radius: 999px/);
  assert.match(css, /\.station-mode-tabs--page button[\s\S]*min-height: 44px/);
  assert.match(css, /\.station-mode-tabs--page button\.active[\s\S]*var\(--cover-accent/);
});
