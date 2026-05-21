# Claudio Memory And Search System Design

## Purpose

Claudio needs a real memory layer, not scattered markdown snippets. The system should learn automatically from listening behavior and chat context, while still letting the user manually override identity, taste, mood, routines, dislikes, and recommendation rules. The same work also needs to fix the weak music search flow, because memory is only useful if search and recommendation can reliably turn intent into playable music.

This design covers three connected outcomes:

- A unified runtime memory profile for taste, mood, routines, listening statistics, likes, dislikes, and manual overrides.
- A prompt-safe memory summary injected into DeepSeek instead of dumping raw files.
- A stronger search and recommendation router that normalizes user intent, verifies playable songs, and uses memory to rank results.

## Current Problems

The current app stores useful information in too many shallow places:

- `user/taste.md` stores taste and philosophy, but the format is loose and duplicated by style-tag editing.
- `user/routines.md` stores routines, but it is only pasted into the prompt.
- `user/mood.md` and `apps/user/mood.md` can diverge. The running backend writes `user/mood.md`, while another mood file exists under `apps/user`.
- `plays`, `messages`, `favorites`, `liked.json`, and `library.json` contain behavioral memory, but no service synthesizes them into a stable profile.
- `context.service.ts` reads taste and routines directly, which makes DeepSeek depend on raw, potentially long, messy files.
- Search intent is too literal. Phrases like "有没有陶喆的歌" can miss because the backend does not reliably extract the core query and route it through a playlist/intro flow.
- Historical reference files from earlier experiments live in the project root and docs, making it hard to tell what is active Claudio architecture and what is archived reference material.

## Recommended Architecture

Use one canonical runtime memory file plus one service-generated prompt summary.

Canonical editable file:

```text
user/memory.profile.md
```

Structured sections:

```md
# Claudio Memory Profile

## Identity
## Manual Overrides
## Taste
## Dislikes And Boundaries
## Mood
## Routines
## Listening Stats
## Learned Preferences
## Recent Context
## Search And Recommendation Rules
```

The file is for human editing and long-term persistence. DeepSeek should not receive the full file directly. Instead, `memory.service.ts` builds a shorter scenario-aware summary:

```md
## Claudio Memory For This Reply
Priority:
- Manual overrides are strongest.
- Current mood shapes tone.
- Taste and learned preferences shape music choice.
- Recent context can influence phrasing but must not overrule explicit user requests.

Manual overrides:
- User-edited rules, disliked artists or styles, and any fixed identity lines.

Current mood:
- Current mood label, confidence, source, and update time.

Taste:
- Preferred artists, genres, texture words, tempo, language, and listening philosophy.

Routines:
- Time-of-day patterns such as work focus, late-night radio, commute, and weekend discovery.

Learned listening pattern:
- Recent repeat artists, top songs, liked tags, and time-block preferences.

Avoid:
- Manual boundaries, repeated skip patterns, and artists or styles the user explicitly rejected.

Recommendation strategy:
- How to balance the explicit request, current mood, preferred texture, and discovery level.
```

The summary should stay compact, target about 800-1500 Chinese characters, and vary by context:

- Chat-only replies get identity, mood, and recent context.
- Music search gets taste, dislikes, learned preferences, and search rules.
- AIDJ gets mood, time/routine, recent listening drift, and recommendation strategy.
- Profile UI can request the full editable profile.

## Memory Learning Rules

Automatic learning should be conservative. Claudio should update high-confidence derived memory from behavior, but keep manual edits in charge.

Inputs:

- `plays`: recent plays, top artists, repeated listening, time-of-day patterns.
- `favorites` and `user/liked.json`: explicit positive feedback.
- skip events when available: negative feedback and overplayed songs.
- `messages`: recent music intents and user corrections.
- `memory.profile.md`: manual identity, taste, mood, routines, boundaries.
- `library.json`: local fallback universe.

Derived outputs:

- top artists, top recent artists, top repeated songs.
- active time blocks: morning, work, evening, late night.
- taste tags inferred from liked artists and manually edited tags.
- current mood with source and timestamp.
- disliked styles and hard boundaries.
- recommendation strategy for the current request.

Priority:

1. Explicit current user request.
2. Manual overrides in `memory.profile.md`.
3. Recent mood and recent conversation.
4. Explicit likes/dislikes.
5. Long-term listening statistics.
6. Generic fallback taste.

## File Consolidation

Runtime files that should remain inside Claudio:

- `user/memory.profile.md`: canonical editable memory.
- `user/library.json`: local song universe.
- `apps/server/src/prompts/system.md`: DeepSeek system template.
- `docs/superpowers/specs/*`: active implementation specs.
- `docs/superpowers/plans/*`: active implementation plans.

Files to migrate into `memory.profile.md`:

- `user/taste.md` -> `## Taste`, `## Dislikes And Boundaries`, philosophy lines under `## Identity` or `## Manual Overrides`.
- `user/routines.md` -> `## Routines`.
- `user/mood.md` and `apps/user/mood.md` -> `## Mood`; after migration, use only `user/memory.profile.md` for canonical mood.

Legacy files to preserve outside the Claudio repo, not delete:

```text
C:\Users\宅急便\Desktop\claudio-archive\
```

Move historical references there if they are not read by code and not active specs:

- `veilledio_tutorial.doc`
- `netease-music-mcp-tutorial.docx`
- older architecture summaries once their useful parts are reflected in current specs
- discarded NetEase CLI experiment notes if not needed in the active repo

Do not move files that are imported by code, active prompts, active tests, package files, or current specs/plans.

## Backend Components

Create `apps/server/src/services/memory.service.ts`.

Responsibilities:

- Read and initialize `user/memory.profile.md`.
- Parse sections without fragile free-text assumptions.
- Migrate legacy `taste.md`, `routines.md`, and mood files into the canonical profile.
- Compute derived memory from `plays`, `messages`, `favorites`, `liked.json`, and current time.
- Return `getPromptMemory(userMessage, mode)` for DeepSeek.
- Return `getEditableProfile()` and `saveEditableProfile(content)` for UI/API.
- Return search ranking hints: preferred artists, disliked terms, recent overplayed artists, preferred time-of-day styles.

Create `apps/server/src/services/search.service.ts`.

Responsibilities:

- Normalize music intent and extract search keywords.
- Distinguish chat questions from play/search intents.
- Search NCM HTTP proxy first.
- Validate playable URLs before queueing.
- Fall back to `library.json` when NCM search is empty or not playable.
- Rank results using memory hints.
- Return a stable 10-track playlist candidate set for explicit music intent.

Update `context.service.ts`.

- Stop reading `taste.md` and `routines.md` directly.
- Call `memoryService.getPromptMemory(userMessage, mode)`.
- Replace `{{memoryProfile}}` in `system.md`.
- Keep weather, time, recent plays, current queue, and chat history.

Update `profile.ts`.

- Keep compatibility routes temporarily:
  - `/api/profile/taste` should read/write the relevant `## Taste` part or return a view built from memory.
  - `/api/profile/mood` should update `## Mood`.
- Add `/api/profile/memory` for the full editable memory profile.
- Add `/api/profile/memory/summary` for derived stats and UI cards.

Update `chat.ts`.

- Use search intent routing before DeepSeek when user clearly wants music.
- For explicit play/search/recommendation intents:
  - normalize query.
  - fetch playable candidates.
  - ask DeepSeek to write intro based on real candidates and memory.
  - never let DeepSeek claim no songs were found unless backend search truly failed.
- For chat-only:
  - inject memory summary but do not generate songs.

## Prompt Changes

Update `apps/server/src/prompts/system.md` to use:

```md
{{memoryProfile}}
{{weather}}
{{time}}
{{recentPlays}}
{{currentQueue}}
{{chatHistory}}
```

The prompt should tell DeepSeek:

- Do not invent search results.
- If backend provided candidates, choose from them only.
- Respect manual dislikes and hard boundaries.
- Let mood shape tone, not override the user request.
- Use memory for emotional continuity, not surveillance-like narration.
- For playlist intros, mention only one strongest recommendation in depth and avoid per-song catalogue intros.

## Frontend

Profile can stay as the first visible surface, but it should expose a Memory editor.

Minimum UI:

- A memory tab or section in `ProfilePage`.
- Editable canonical memory text area.
- Derived stats cards: top artists, recent mood, active time block, strongest preferences, avoid list.
- Save button with explicit success/error state.

The existing small Profile card should keep showing compact stats only. It should read from the memory summary endpoint rather than manually parsing taste tags.

## Search Behavior

Examples that must work:

- "有没有陶喆的歌" -> query `陶喆`, explicit music intent.
- "放点陶喆" -> query `陶喆`, explicit music intent.
- "我想听 David Tao" -> query `David Tao`, explicit music intent.
- "搜一下普通朋友" -> query `普通朋友`, explicit music intent.
- "陶喆是谁" -> chat intent, no playlist.
- "来点适合晚上写代码的歌" -> scene intent, use memory+routines+library/NCM.

Result rules:

- Return 10 tracks when possible.
- Validate playable URLs.
- If currently playing, do not interrupt; existing queued-intro rules still apply.
- Keep current song as first when replacing queue during active playback.
- Generate intro and subtitles before frontend receives the new playlist payload.

## Archive And Cleanup Rules

Before moving any file:

1. Check code references with `rg`.
2. Check whether it is an active spec/plan.
3. Move only non-runtime historical references.
4. Move to `C:\Users\宅急便\Desktop\claudio-archive\YYYY-MM-DD-memory-cleanup\`.
5. Write an archive manifest there listing original path and reason.

Never move:

- `AGENTS.md`
- `CLAUDE.md`
- `package.json`, lockfiles, workspace files
- source files
- prompt files used by the server
- active specs and plans
- `user/library.json`

## Testing Strategy

Use TDD.

Backend tests:

- `memory.service.test.ts`
  - creates profile from legacy files.
  - respects manual overrides over learned stats.
  - summarizes mood/taste/routines into compact prompt memory.
  - handles missing files.
- `search.service.test.ts`
  - normalizes Chinese music intent.
  - distinguishes chat intent.
  - filters unplayable songs.
  - falls back to local library.
  - ranks memory-preferred artists higher.
- `context.service.test.ts`
  - injects `{{memoryProfile}}`.
  - no longer reads raw taste/routines directly.
- route tests for `/api/profile/memory`.

Frontend tests:

- Memory editor renders profile content.
- Save calls `/api/profile/memory`.
- Profile card reads compact summary fields.

Verification commands:

```powershell
pnpm --filter @claudio/server build
pnpm --filter @claudio/server exec node --import tsx --test src/services/*.test.ts src/routes/*.test.ts
pnpm --filter @claudio/web build
pnpm --filter @claudio/web test
```

## Rollout

Implement in small steps:

1. Add tests for memory parsing and prompt summary.
2. Add `memory.service.ts`.
3. Add migration from legacy files to `memory.profile.md`.
4. Add profile memory API.
5. Add tests for search intent and search result filtering.
6. Add `search.service.ts`.
7. Update `context.service.ts` and `system.md`.
8. Update `chat.ts` to route explicit music intent through search service.
9. Add frontend Memory editor.
10. Archive non-runtime reference files outside the repo with a manifest.
11. Run full verification.

## Open Decisions

The default implementation should choose:

- `user/memory.profile.md` as the canonical editable memory file.
- `C:\Users\宅急便\Desktop\claudio-archive\` as the external archive root.
- Markdown for editable memory and TypeScript objects for runtime summaries.
- Conservative automatic learning that never overwrites manual sections without keeping the user-editable source clear.
