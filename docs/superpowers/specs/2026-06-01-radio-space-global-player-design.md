# Radio Space And Global Player Design

## Goal

Separate page navigation from listening-mode changes and replace the three competing playback surfaces with one persistent bottom player.

## Navigation

- Home exposes one top-level `RADIO` button.
- `RADIO` enters the full radio space without changing the queue, restarting audio, or generating a recommendation.
- Radio space exposes one top-level `HOME` button.
- `HOME` returns to the Home page without changing audio state.

## Listening Modes

- The radio space contains an internal listening-mode selector: `AIDJ`, `FLOW`, `CAFE`, `LIBRARY`.
- `FLOW` is the only user-facing name for `random-infinite`.
- Selecting the currently active mode is idempotent.
- Selecting another non-AIDJ mode fades the current song out and starts the first song of the selected mode.
- Selecting `AIDJ` from another mode starts the narrated recommendation flow.
- Refresh remains an explicit action inside radio space.

## Persistent Player

- One `GlobalPlayerBar` is rendered by `HomePage` outside the Home/radio page branch.
- It owns the shared transport controls, cover, title, artist, heart, progress, volume, and queue drawer.
- Home `player-strip`, Home progress bar, Home queue bar, `HomeMiniPlayer`, and StationSurface player controls are removed.
- The drawer displays the global active queue and does not participate in page layout.

## State Boundary

- `stationViewMode` answers: which radio-space theme is visible?
- `p.activeStationMode` answers: which station queue is playing?
- `p.playlist`, `p.currentIndex`, and the singleton audio element answer: what is currently audible?
- Entering and leaving pages never mutate audio state.

