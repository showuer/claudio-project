# Home Attached Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate Home player bar with a thinner, shorter now-playing strip attached to the top edge of the existing AIDJ input module.

**Architecture:** Keep the global audio state and station pages unchanged. Mount `GlobalPlayerBar` inside the Home chat input container, then use CSS positioning to make it an attached control strip while retaining cover navigation, transport, progress, likes, volume, and queue access.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner.

---

### Task 1: Lock The Attached Layout Contract

**Files:**
- Modify: `apps/web/tests/globalPlayerBar.test.ts`

- [ ] Add a source-level test asserting that `GlobalPlayerBar` is rendered inside `.chat-input-bar` before `.chat-input-row`.
- [ ] Assert that `.global-player-shell` is attached with `position: absolute`, a negative top offset, and a width below the input module width.
- [ ] Run `pnpm --filter @claudio/web exec tsx --test tests/globalPlayerBar.test.ts` and confirm the new test fails against the detached bar.

### Task 2: Attach The Existing Player Without Removing Controls

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/tests/stationSurface.test.ts`

- [ ] Move the existing `GlobalPlayerBar` mount into `.chat-input-bar`.
- [ ] Restyle `.global-player-shell` as a shorter attached strip and remove the detached footer reservation.
- [ ] Compact transport and progress styling while keeping cover navigation, likes, volume, and queue drawer behavior.
- [ ] Update the existing layout contract test from detached bottom positioning to attached positioning.

### Task 3: Verify The Home-Only Change

**Files:**
- Verify: `apps/web/src/components/StationSurface.tsx`

- [ ] Run focused player tests.
- [ ] Run the web regression suite, TypeScript check, and production build.
- [ ] Open the local page and visually confirm that the attached strip is narrower and thinner than the AIDJ input module while station pages remain unchanged.
