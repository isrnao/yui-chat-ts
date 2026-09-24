# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build client assets (includes TypeScript compilation)
- `pnpm build:prod` - Generate sitemap, build client and SSR bundles, then prerender all room URLs
- `pnpm preview` - Preview client build
- `pnpm deploy` - Run `build:prod` and deploy `dist` to GitHub Pages

### Code Quality

- `pnpm lint` - Run ESLint on TypeScript and JSX files
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting
- `pnpm typecheck` - Run TypeScript type checking

### Testing

- `pnpm test` - Run all tests once
- `pnpm watch:test` - Run tests in watch mode
- `pnpm test:ui` - Run tests with UI interface
- Tests include coverage reporting with 50% minimum threshold
- Test files are located alongside source files (e.g., `Component.test.tsx`)

## React Compiler

React Compiler 1.0 is **enabled** for the app build and for tests. It is wired up in
`vite.config.ts` per the official Vite instructions — `@vitejs/plugin-react` v6 no longer takes a
`babel` option, so the compiler runs through `@rolldown/plugin-babel` with `reactCompilerPreset()`
(`@babel/core` is a required peer dependency of that plugin):

```ts
plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
```

**`@babel/core` is pinned to `~7.29.7` on purpose.** `babel-plugin-react-compiler@1.0.0` cannot
compile any function with a destructuring default (`({ a = 1 })`) under Babel 8, because Babel 8
removed `AssignmentPattern` from the `LVal` alias ([react/react#36868](https://github.com/react/react/issues/36868)).
The compiler skips such functions silently, so the build still passes. Only move `@babel/core` back
to 8 once a compiler release supports Babel 8 **and** `src/test/reactCompiler.test.ts` passes with it.

`src/test/reactCompiler.test.ts` (Compiler_Check) runs every production file in `src/` through the
compiler and fails on any `CompileError` that is not in its allowlist. A function may be opted out
only with `'use no memo'`, a comment saying why, and an allowlist entry.

The compiler rules ship with `eslint-plugin-react-hooks` v7 and are already active through
`reactHooks.configs.recommended` in `eslint.config.js`.

Manual memoization is being removed incrementally (the official guidance is not to strip it all at
once right after enabling the compiler). Event handlers and derived values now rely on the
compiler. What is deliberately **kept**:

- No `useCallback` is needed any more. The last ones were `RetroSplitter`'s drag handlers, whose
  identity gated the window `mousemove` / `mouseup` listeners; dragging now uses Pointer Events with
  `setPointerCapture` on the bar itself, so there are no window listeners to re-attach. The chat log
  needs none either: fetching and the realtime subscription live in `Room_Log_Store`
  (`api/roomLogStore.ts`), whose methods are stable, and components read it with
  `useSyncExternalStore`. Only add `useCallback` when the identity really appears in an effect's
  dependency array, with a comment saying why.
- `memo()` on `ChatLogList` / `ChatMessage` (component-level bailout for the long list).

Do not add _new_ manual memoization — let the compiler handle it.

## Architecture Overview

### Project Structure

This is a React + TypeScript chat application with feature-based architecture:

- **Features**: Located in `src/features/`. Four features:
  - `chat/` - main chat feature (components, hooks, API, types)
  - `chanari-chat/` - alternate "ちゃなり" chat UI variant
  - `two-shot-chat/` - ツーショットチャット at `/chat/2shot/`, a re-creation of CGI-RESCUE 2SHOT-CHAT
    v5.0.1 (see "Two-shot chat" below)
  - `top/` - top/landing page with room listing
- **Shared**: Common utilities in `src/shared/` including components, hooks, and utilities
- **Pages**: Top-level page components in `src/pages/` (e.g., `NotFoundPage`)
- **Routes**: Route wrappers in `src/routes/` (`ChatRoute`, `ChanariRoute`, `TwoShotRoute`, `TopRoute`,
  `NotFoundRoute`). `resolveRoute.ts` tries `matchTwoShotRoute` first, then chanari, then chat.

**Multiple Rooms**: The chat supports many rooms (organized by category) defined in
`src/features/chat/rooms.ts`. Messages are scoped by `room_id`; `DEFAULT_ROOM_ID` is the default,
and `getRoomMeta(roomId)` resolves room metadata (e.g., title).

### Key Architecture Patterns

**Feature-Based Organization**: The chat feature is self-contained with its own:

- Components (ChatRoom, ChatMessage, ChatLogList, ParticipantsList, ChatRanking, etc.)
- Custom hooks (useRoomLog, useChatSession, useChatIdentity, useParticipants, useRoomRanking, useLookSound, etc.)
- API layer (`api/roomLogStore.ts` store, `api/chatQueries.ts` reads, `api/saveChat.ts` writes, `api/realtime.ts` channels)
- Type definitions (Chat, Participant, ChatMetadata, etc.)

**State Management**: Uses React hooks with:

- Local state for UI components
- Custom hooks for feature-specific logic
- `useOptimistic` for optimistic message updates (see `useRoomLog` / `useChatSender`)
- An external store for the chat log (`Room_Log_Store`, read with `useSyncExternalStore`)
- Supabase for persistent storage AND real-time delivery

**Real-time delivery (source of truth)**: Cross-user real-time sync is handled by **Supabase
Realtime**, not BroadcastChannel:

- Message delivery: `subscribeChatLogs` in `api/realtime.ts` subscribes to Postgres `postgres_changes`
  (INSERT on the `chats` table, filtered by `room_id`). New messages from any user/device are
  pushed to all clients. `Room_Log_Store` (`api/roomLogStore.ts`) wires this up; `useRoomLog` reads it.
- look/unlook notifications: Supabase Realtime **broadcast** channel (`broadcastLookEvent` /
  `onLookBroadcast`).
- Note: the Web BroadcastChannel API is **not** used anywhere in this app; the former
  `src/shared/hooks/useBroadcastChannel.ts` was removed as dead code.

**Participants**: There is no presence table. The participant list is **derived from the message
log** by `getRecentParticipants` (`useParticipants.ts`): it scans the last 5 minutes of messages,
adding speakers and admin "Welcome" join messages, and removing admin "またきておくれやすぅ" exit
messages. Because the log is Realtime-synced, this reflects cross-user presence.

**Data Flow**:

- Chat messages flow through `useChatSession` → `useChatSender` → `api/saveChat.ts` → the `save-chat` Edge Function
  (optimistic insert into `chats`). Clients do **not** insert directly anymore; all inserts go
  through `supabase/functions/save-chat`, which sets `ip`/`ua` from request headers server-side.
- New rows propagate to all clients via the `subscribeChatLogs` Realtime subscription
- Chat logs are loaded from Supabase by `Room_Log_Store` (`api/chatQueries.ts`, no cache: every
  navigation is a full page load, so a cross-page cache never hits)
- `Room_Log_Store` keeps the log sorted newest-first (uuid v7 descending; a single incoming row is
  inserted by binary search in `mergeChatLogByUuid`). `ChatLogList` does **not** re-sort — it only
  slices, so anything feeding it must already be in that order.

**Page navigation**: there is no client-side router; moving between pages is a full page load
(MPA). Room URLs end with a slash (`/chat/<id>/`, `/chanari/<id>/`): GitHub Pages 301-redirects
`/chat/<id>` to `/chat/<id>/`, so links, canonical, og:url and the sitemap all use the slash form
(`buildChatRoomPath` / `buildRoomPath`). Room links (`/chat/*`, `/chanari/*`) are prefetched by the Speculation Rules script in
`index.html`, and pages are joined by cross-document View Transitions (`@view-transition` in
`App.css`, off under `prefers-reduced-motion`). Browsers without support just navigate normally.

### Import Aliases

- `@features` → `/src/features`
- `@shared` → `/src/shared`

## Supabase Integration

The app uses Supabase for both chat persistence and real-time delivery. Configuration requires:

- `VITE_SUPABASE_URL` environment variable
- `VITE_SUPABASE_ANON_KEY` environment variable

Chat operations are handled in `src/features/chat/api/` (`chatQueries.ts` for reads and logical
deletes, `saveChat.ts` for inserts, `realtime.ts` for channels). Key details:

- **Table**: `chats`. Primary key is a server-generated UUID v7; `time` (ms) is server-set.
  Columns include `room_id`, `name`, `color`, `message`, `system`, `email`, `ip`, `ua`, and a JSON
  `metadata` column (`ChatMetadata`: font style, avatar, `kind` of `normal | fortune | admin`,
  etc.).
- **Inserts go through the `save-chat` Edge Function** (`supabase/functions/save-chat`), executed
  with `service_role`. It derives `ip` (`x-forwarded-for` → `x-real-ip`) and `ua` (`user-agent`)
  from request headers, so those columns are server observations that cannot be supplied in the
  client payload. Their trust boundary still depends on Supabase Edge proxy header handling. RLS restricts INSERT on `chats` to `service_role`
  (migration `20250619000000_lock_insert_to_service_role.sql`); SELECT/UPDATE stay open.
- **Admin-chat triage**: after saving a non-system message in `com_sb` (管理者チャット),
  `save-chat` runs `triage.ts` in the background (`EdgeRuntime.waitUntil`). It classifies the
  message with JEV (okiraku-api `choice-v1`: bug / question / cr / chat) and switches on the
  result; only `cr` (feature request, probability ≥ 0.5, max 3/hour) opens a GitHub Issue on
  `isrnao/yui-chat-ts` and inserts a 管理人 reply 「機能要求を受け付けました（Issue #N）」.
  Requires the Supabase secrets `JEV_API_TOKEN` and `GITHUB_TOKEN`; if either is missing, triage
  is skipped and saving still works.
- **Deletes are logical**: clearing sets a `deleted` flag; reads filter `deleted = false`.
- **Real-time**: `subscribeChatLogs` (Postgres changes, INSERT) for messages; a broadcast channel
  for look/unlook events. See the "Real-time delivery" section above.

## Two-shot chat (`/chat/2shot/`)

Spec: `.kiro/specs/two-shot-chat/`. A private 1-on-1 chat that reproduces the original CGI's UI
(frames, tables, quirks-mode spacing) in React. The room id `'2shot'` (`TWO_SHOT_ROOM_ID` in
`rooms.ts`) keeps its metadata, top-page link and sitemap entry, but its page is **not** the normal
chat room and its conversation is **never** written to `chats` (old public `2shot` rows are left as
they are). `/chanari/2shot/` redirects to `/chat/2shot/`.

- **Rules**: `supabase/functions/two-shot/rules.ts` is the single source for the room state machine
  (seats, log, idle timeout, notices N1–N10 / E1–E12). It has no imports so Deno and Vitest share it;
  the client imports it by relative path. Property tests: `src/features/two-shot-chat/rules.test.ts`.
- **Edge Function `two-shot`** (`handler.ts`, `verify_jwt = false`): one endpoint for enter / read /
  say / leave / kick / close / clear. Authorization is the feature's own token (`x-two-shot-token`,
  stored only as SHA-256), not the anon key. Writes use `service_role` via `two_shot_commit`
  (compare-and-swap on the room version, retried up to 3 times). The duplicate-entry check (E2) uses an
  IP only when `TWO_SHOT_TRUSTED_IP_HEADER` is set (`<header>` or `x-forwarded-for:<n>`); unset means
  no IP check. Smoke-test with `bash scripts/smoke-two-shot-edge.sh` before `supabase functions deploy two-shot`.
- **Tables** (migration `20260924000000_two_shot.sql`, RLS on with no policies, only `service_role`):
  `two_shot_rooms` (one row per room: seats with IP/UA, log, version), `two_shot_admissions` (entry
  attempts for idempotent resend, 24 h), `two_shot_audit` (a copy of every message for abuse reports,
  30 days). `two_shot_commit` saves room + admission + audit atomically. The only public read is
  `two_shot_lobby()` (SECURITY DEFINER: status, and the waiting owner's sex/name/profile). pg_cron jobs
  `two-shot-purge-admissions` / `two-shot-purge-audit` delete expired rows hourly;
  `two_shot_maintenance_health()` reports their state. pgTAP: `supabase/tests/two_shot.sql`.
- **Client**: plain `fetch` only (`api/twoShotApi.ts`) — the route must not import the Supabase SDK
  or `shared/supabaseClient.ts`. `prerender-rooms.ts` fails the build if the route's static imports
  include a Supabase chunk, and `src/test/reachability.test.ts` checks the import graph. The tab's
  session lives in `sessionStorage` (`api/sessionStore.ts`), read with `useSyncExternalStore`; SSG and
  hydration always render the lobby. Messages and profiles are text, but HTML character references are
  decoded (`utils/decodeCharRefs.ts`) as the original did.
- **Top page count**: `roomCountsApi.ts` counts `2shot` from `two_shot_lobby()` (seated people) in
  parallel with the normal RPC, and excludes `2shot` from the public-log counts.
- **CI**: `.github/workflows/two-shot.yml` (Vitest, Deno tests, real DB migration + pgTAP, Edge Runtime smoke).

## Testing Strategy

Tests follow Japanese naming conventions and user-centric approach:

- Component tests focus on user interactions and rendering
- Unit tests for utilities and pure functions
- Integration tests for feature workflows
- Coverage threshold: 50% minimum for lines, functions, branches, and statements
- Tests use Testing Library with jsdom environment

## Conversation Guidelines

- 常に日本語で会話する
