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

## Architecture Overview

### Project Structure

This is a React + TypeScript chat application with feature-based architecture:

- **Features**: Located in `src/features/chat/` containing components, hooks, API calls, and types
- **Shared**: Common utilities in `src/shared/` including components, hooks, and utilities
- **Pages**: Top-level page components in `src/pages/`

### Key Architecture Patterns

**Feature-Based Organization**: The chat feature is self-contained with its own:

- Components (ChatRoom, ChatMessage, ChatLogList, etc.)
- Custom hooks (useChatLog, useParticipants, useChatHandlers)
- API layer (chatApi.ts for Supabase integration)
- Type definitions (Chat, Participant, BroadcastMsg)

**State Management**: Uses React hooks with:

- Local state for UI components
- Custom hooks for feature-specific logic
- BroadcastChannel API for cross-tab communication
- Supabase for persistent chat log storage

**Data Flow**:

- Chat messages flow through `useChatHandlers` → `chatApi` → Supabase
- Real-time updates via `useBroadcastChannel` for multi-tab synchronization
- Chat logs loaded from Supabase on app start

### Import Aliases

- `@features` → `/src/features`
- `@shared` → `/src/shared`

## Supabase Integration

The app uses Supabase for chat log persistence. Configuration requires:

- `VITE_SUPABASE_URL` environment variable
- `VITE_SUPABASE_ANON_KEY` environment variable

Chat operations are handled in `src/features/chat/api/chatApi.ts` with functions for saving, loading, and clearing chat logs.

## Testing Strategy

Tests follow Japanese naming conventions and user-centric approach:

- Component tests focus on user interactions and rendering
- Unit tests for utilities and pure functions
- Integration tests for feature workflows
- Coverage threshold: 70% minimum for lines, functions, branches, and statements
- Tests use Testing Library with jsdom environment

## Conversation Guidelines

- 常に日本語で会話する
