# AIDJ Entry And Refresh Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AIDJ navigation non-destructive while preserving an explicit way to request a fresh narrated queue.

**Architecture:** Keep the change inside the existing HomePage orchestration and StationSurface control layer. The global audio singleton and queue semantics remain untouched.

**Tech Stack:** React, TypeScript, Zustand, Node test runner

---

### Task 1: Lock The Interaction Boundary

**Files:**
- Modify: `apps/web/tests/stationSurface.test.ts`

- [ ] **Step 1: Replace the old top-tab expectation**

Assert that AIDJ entry checks `!p.playlist.length && !c.isStreaming` before calling `c.sendAidj('来点音乐')`.

- [ ] **Step 2: Assert the explicit refresh path**

Assert that `refreshStationMode('aidj')` calls `c.sendAidj('来点音乐')` and that StationSurface renders the refresh action for AIDJ.

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `pnpm --filter @claudio/web exec tsx --test tests/stationSurface.test.ts`

Expected: FAIL because AIDJ entry currently sends unconditionally and the AIDJ refresh action is hidden.

### Task 2: Implement The Boundary

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/components/StationSurface.tsx`

- [ ] **Step 1: Guard initial AIDJ generation**

In `startStationMode`, call `sendAidj` only when `p.playlist.length === 0` and `c.isStreaming === false`.

- [ ] **Step 2: Route explicit AIDJ refresh**

In `refreshStationMode`, call `sendAidj` for `aidj`; keep existing station API refresh for the other modes.

- [ ] **Step 3: Render the refresh action for AIDJ**

Render the existing player refresh control in all modes and label the AIDJ action `New queue`.

- [ ] **Step 4: Run verification**

Run:

```powershell
pnpm --filter @claudio/web exec tsx --test tests/stationSurface.test.ts tests/speakingOverlayAudio.test.ts tests/playerStore.test.ts
pnpm --filter @claudio/web exec tsc --noEmit
pnpm --filter @claudio/web build
```

Expected: all commands pass.
