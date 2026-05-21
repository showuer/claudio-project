# TTS Speaking Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Claudio bar full-screen TTS speaking overlay with real Fish timestamp alignment and real Web Audio analyzer rendering.

**Architecture:** The server enriches existing chat SSE `done` payloads with `alignment`. The web stores alignment on DJ messages, opens a local overlay player from the Claudio bar, and uses the overlay audio element as the source for transcript timing and analyzer canvases.

**Tech Stack:** Fastify, TypeScript, Fish Audio HTTP/SSE, undici ProxyAgent, React 19, Zustand, Web Audio API, Canvas.

---

## File Structure

- Modify `apps/server/src/services/tts.service.ts`: Fish timestamp synthesis, chunk parsing, alignment normalization, cache metadata.
- Add `apps/server/src/services/tts.service.test.ts`: Node test coverage for Fish timestamp chunk normalization.
- Modify `apps/server/src/routes/chat.ts`: include `alignment` for opening and intro TTS payloads.
- Modify `apps/server/src/config.ts`: add optional Fish reference/proxy/model settings.
- Modify `apps/server/src/routes/stream.ts`: fix `writeHead` header typing.
- Modify `apps/web/src/stores/chatStore.ts`: store alignment on DJ messages and expose latest narration.
- Modify `apps/web/src/pages/HomePage.tsx`: clickable Claudio bar and overlay component.
- Modify `apps/web/src/styles/global.css`: overlay visual styling.

## Tasks

### Task 1: Backend Timestamp Alignment

- [ ] Add a failing Node test for merging Fish chunks into global segments.
- [ ] Run the test and confirm it fails because the helper is missing.
- [ ] Implement the helper and Fish timestamp request path.
- [ ] Run the test and confirm it passes.

### Task 2: Chat Contract

- [ ] Add `alignment` to the `ttsService.synthesize()` return type.
- [ ] Pass opening and per-song intro alignment through `/api/chat` and `/api/aidj`.
- [ ] Keep audio fallback compatible with existing clients.

### Task 3: Overlay UI

- [ ] Extend chat messages with optional `alignment`.
- [ ] Add local overlay audio state in `HomePage.tsx`.
- [ ] Draw analyzer canvases from `AnalyserNode`.
- [ ] Render transcript rows from alignment and `currentTime`.
- [ ] Open from `.chat-bar`, close from the overlay `x`.

### Task 4: Verification

- [ ] Run `pnpm --filter @claudio/server build`.
- [ ] Run `pnpm --filter @claudio/web build`.
- [ ] Start the local dev server and inspect `localhost:5173`.
- [ ] Verify the Claudio bar opens the overlay and the layout matches the supplied reference.
