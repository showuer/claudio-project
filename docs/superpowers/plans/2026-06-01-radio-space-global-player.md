# Radio Space And Global Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated playback surfaces with one persistent player and make Home/radio navigation non-destructive.

**Architecture:** `HomePage` continues to orchestrate page state while a focused `GlobalPlayerBar` renders outside both page branches. `StationSurface` becomes a themed playback space with an internal mode selector and refresh action, while navigation uses separate `RADIO` and `HOME` handlers.

**Tech Stack:** React, TypeScript, Zustand, CSS, Node test runner

---

### Task 1: Lock The State Boundary

**Files:**
- Create: `apps/web/tests/globalPlayerBar.test.ts`
- Modify: `apps/web/tests/stationSurface.test.ts`

- [ ] Add assertions for one persistent `GlobalPlayerBar`, one Home `RADIO` action, one radio-space `HOME` action, and internal mode selection.
- [ ] Add assertions that mini player, Home player strip, Home queue bar, and StationSurface transport controls are absent.
- [ ] Run the tests and confirm they fail against the duplicated implementation.

### Task 2: Build The Persistent Player

**Files:**
- Create: `apps/web/src/components/GlobalPlayerBar.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/styles/global.css`

- [ ] Move transport, progress, volume, current-like, and queue drawer UI into `GlobalPlayerBar`.
- [ ] Render it once outside the Home/radio conditional.
- [ ] Remove Home mini player and the old Home player/queue UI.

### Task 3: Simplify Radio Space

**Files:**
- Modify: `apps/web/src/components/StationSurface.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/styles/global.css`

- [ ] Replace StationSurface top tabs and close button with `HOME`.
- [ ] Render listening-mode selection as an internal control.
- [ ] Remove StationSurface transport and queue drawer.
- [ ] Make repeated selection of the active mode idempotent and cross-mode station switches use the existing fade path.

### Task 4: Verify

- [ ] Run focused tests.
- [ ] Run TypeScript checking.
- [ ] Run production build.
- [ ] Open the local app and visually inspect Home and radio space.

