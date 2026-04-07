# UGC Creator — AI-Powered Content Studio

## Overview

A premium mobile app (Expo + React Native) for creative directors. Upload a product photo and generate authentic UGC content (photos + video concepts) powered by OpenAI's image editing API. Backed by an Express API server using Replit AI Integrations (no user API key required).

## Architecture

pnpm workspace monorepo:
- `artifacts/mobile` — Expo React Native app (5 tabs: Studio, Direction, Director AI, Generate, History)
- `artifacts/api-server` — Express 5 API server with Zod-validated routes
- `lib/db` — PostgreSQL + Drizzle ORM (conversations + messages tables)
- `lib/integrations-openai-ai-server` — OpenAI client (image editing via `editImages()`)

## Key Features

- **Studio** — upload product photo via gallery or camera
- **Direction** — 6 camera angles, 5 lighting moods, 4 aspect ratios (9:16, 1:1, 4:5, 16:9), platform targeting
- **Director AI** — streaming SSE chat with creative director persona; extracts creative brief
- **Generate** — swipeable image pager with ratio-aware display, video concept storyboards, hook generator
- **History** — browse past generations

## API Routes

- `POST /api/ugc/generate` — generate UGC images or video concepts (Zod validated)
- `POST /api/ugc/hooks` — generate 5 scroll-stopping captions (Zod validated)
- `GET/POST /api/openai/conversations` — conversation CRUD (Zod validated)
- `POST /api/openai/conversations/:id/messages` — streaming SSE chat (Zod validated)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile**: Expo SDK 54, React Native 0.81, expo-router v6
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod ^3.25.76
- **AI**: Replit AI Integrations (OpenAI gpt-image-1 + gpt-5.2)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm --filter @workspace/mobile run typecheck` — typecheck mobile app
- `pnpm --filter @workspace/api-server run typecheck` — typecheck API server
- `pnpm --filter @workspace/db exec tsc -p tsconfig.json` — rebuild DB declarations
- `pnpm --filter @workspace/integrations-openai-ai-server exec tsc -p tsconfig.json` — rebuild openai lib declarations
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Important Implementation Notes

- expo-file-system v19: Use `FileSystem.Paths.cache.uri` (not `cacheDirectory`); encoding is `'base64'` string (not `FileSystem.EncodingType.Base64`)
- Tab bar has NO `position: "absolute"` — sits in normal layout flow; use `insets.bottom + N` for content padding
- Generation trigger: `generateTrigger` counter in UGCContext; Director calls `triggerGenerate()`, Generate screen watches it in `useEffect`
- SSE client uses buffered parsing (`sseBuffer.split("\n\n")`) to handle partial chunks correctly
- Do NOT use uuid package (crashes iOS); use `Date.now().toString() + Math.random().toString(36)`
- `integrations-openai-ai-server` lib must be built (`tsc -p tsconfig.json`) before api-server typecheck works

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
