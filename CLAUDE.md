# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build for production (includes TypeScript compilation)
- `pnpm preview` - Preview production build
- `pnpm deploy` - Deploy to GitHub Pages

### Code Quality

- `pnpm lint` - Run ESLint on TypeScript and JSX files
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting
- `pnpm typecheck` - Run TypeScript type checking

### Testing

- `pnpm test` - Run all tests once
- `pnpm watch:test` - Run tests in watch mode
- `pnpm test:ui` - Run tests with UI interface
- Tests include coverage reporting with 70% minimum threshold
- Test files are located alongside source files (e.g., `Component.test.tsx`)

## React Compiler

React Compiler 1.0 is **enabled** for the app build and for tests. It is wired up in
`vite.config.ts` per the official Vite instructions — `@vitejs/plugin-react` v6 no longer takes a
`babel` option, so the compiler runs through `@rolldown/plugin-babel` with `reactCompilerPreset()`
(`@babel/core` is a required peer dependency of that plugin):

```ts
plugins: [react(), babel({ presets: [reactCompilerPreset()] }), mdx()],
```

The compiler rules ship with `eslint-plugin-react-hooks` v7 and are already active through
`reactHooks.configs.recommended` in `eslint.config.js`.

Manual memoization is being removed incrementally (the official guidance is not to strip it all at
once right after enabling the compiler). Event handlers and derived values now rely on the
compiler. What is deliberately **kept**:

- `useCallback` whose identity gates a `useEffect` (subscription setup): `useChatLog.mergeChat` /
  `reload`, `useAllRoomsChatLog.mergeChat` / `addOptimistic` / `reload`, `RetroSplitter`'s drag
  handlers, `TermsModal`'s effect callbacks. Each carries a comment saying why.
- `memo()` on `ChatLogList` / `ChatMessage` (component-level bailout for the long list).

Do not add _new_ manual memoization — let the compiler handle it.

## Architecture Overview

### Project Structure

This is a React + TypeScript chat application with feature-based architecture:

- **Features**: Located in `src/features/`. Three features:
  - `chat/` - main chat feature (components, hooks, API, types)
  - `chanari-chat/` - alternate "ちゃなり" chat UI variant
  - `top/` - top/landing page with room listing
- **Shared**: Common utilities in `src/shared/` including components, hooks, and utilities
- **Pages**: Top-level page components in `src/pages/` (e.g., `ChatLogPage`, `NotFoundPage`)
- **Routes**: Route wrappers in `src/routes/` (`ChatRoute`, `ChanariRoute`, `TopRoute`, `NotFoundRoute`)

**Multiple Rooms**: The chat supports many rooms (organized by category) defined in
`src/features/chat/rooms.ts`. Messages are scoped by `room_id`; `DEFAULT_ROOM_ID` is the default,
and `getRoomMeta(roomId)` resolves room metadata (e.g., title).

### Key Architecture Patterns

**Feature-Based Organization**: The chat feature is self-contained with its own:

- Components (ChatRoom, ChatMessage, ChatLogList, ParticipantsList, ChatRanking, etc.)
- Custom hooks (useChatLog, useParticipants, useChatHandlers, useChatRanking, useLookSound, etc.)
- API layer (`api/chatApi.ts` public surface + `api/chatLogResource.ts` for caching/paging)
- Type definitions (Chat, Participant, ChatMetadata, etc.)

**State Management**: Uses React hooks with:

- Local state for UI components
- Custom hooks for feature-specific logic
- `useOptimistic` for optimistic message updates (see `useChatLog`)
- Supabase for persistent storage AND real-time delivery

**Real-time delivery (source of truth)**: Cross-user real-time sync is handled by **Supabase
Realtime**, not BroadcastChannel:

- Message delivery: `subscribeChatLogs` in `chatApi.ts` subscribes to Postgres `postgres_changes`
  (INSERT on the `chats` table, filtered by `room_id`). New messages from any user/device are
  pushed to all clients. `useChatLog` wires this up.
- look/unlook notifications: Supabase Realtime **broadcast** channel (`broadcastLookEvent` /
  `onLookBroadcast`).
- Note: the Web BroadcastChannel API is **not** used anywhere in this app; the former
  `src/shared/hooks/useBroadcastChannel.ts` was removed as dead code.

**Participants**: There is no presence table. The participant list is **derived from the message
log** by `getRecentParticipants` (`useParticipants.ts`): it scans the last 5 minutes of messages,
adding speakers and admin "Welcome" join messages, and removing admin "またきておくれやすぅ" exit
messages. Because the log is Realtime-synced, this reflects cross-user presence.

**Data Flow**:

- Chat messages flow through `useChatHandlers` → `chatApi` → the `save-chat` Edge Function
  (optimistic insert into `chats`). Clients do **not** insert directly anymore; all inserts go
  through `supabase/functions/save-chat`, which sets `ip`/`ua` from request headers server-side.
- New rows propagate to all clients via the `subscribeChatLogs` Realtime subscription
- Chat logs are loaded from Supabase on app start (cached/paged via `chatLogResource.ts`)

### Import Aliases

- `@features` → `/src/features`
- `@shared` → `/src/shared`

## Supabase Integration

The app uses Supabase for both chat persistence and real-time delivery. Configuration requires:

- `VITE_SUPABASE_URL` environment variable
- `VITE_SUPABASE_ANON_KEY` environment variable

Chat operations are handled in `src/features/chat/api/chatApi.ts` (with `chatLogResource.ts` for
caching/paging). Key details:

- **Table**: `chats`. Primary key is a server-generated UUID v7; `time` (ms) is server-set.
  Columns include `room_id`, `name`, `color`, `message`, `system`, `email`, `ip`, `ua`, and a JSON
  `metadata` column (`ChatMetadata`: font style, avatar, `kind` of `normal | fortune | admin`,
  etc.).
- **Inserts go through the `save-chat` Edge Function** (`supabase/functions/save-chat`), executed
  with `service_role`. It derives `ip` (`x-forwarded-for` → `x-real-ip`) and `ua` (`user-agent`)
  from request headers, so those columns are tamper-proof server observations rather than
  client-reported values. RLS restricts INSERT on `chats` to `service_role`
  (migration `20250619000000_lock_insert_to_service_role.sql`); SELECT/UPDATE stay open.
- **Deletes are logical**: clearing sets a `deleted` flag; reads filter `deleted = false`.
- **Real-time**: `subscribeChatLogs` (Postgres changes, INSERT) for messages; a broadcast channel
  for look/unlook events. See the "Real-time delivery" section above.

## Testing Strategy

Tests follow Japanese naming conventions and user-centric approach:

- Component tests focus on user interactions and rendering
- Unit tests for utilities and pure functions
- Integration tests for feature workflows
- Coverage threshold: 70% minimum for lines, functions, branches, and statements
- Tests use Testing Library with jsdom environment

## Conversation Guidelines

- 常に日本語で会話する
