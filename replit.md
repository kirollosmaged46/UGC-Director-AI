# UGC Creator — AI-Powered Content Studio

## Overview

A full-stack content creation platform with two products:
1. **UGC AI Ad Studio** — Web app that generates polished video ads from product info through an AI pipeline (Claude script → ElevenLabs TTS → Kling AI video → FFmpeg assembly → Object Storage)
2. **UGC Creator** — Expo mobile app for UGC photo/video generation powered by OpenAI

## Architecture

pnpm workspace monorepo:
- `artifacts/ugc-studio` — React + Vite web app (built to static files, served by api-server)
- `artifacts/api-server` — Express 5 API server (port 8080) — serves ugc-studio static files + all API routes
- `artifacts/mobile` — Expo SDK 54 React Native app (preview path: `/mobile`)
- `artifacts/mockup-sandbox` — Vite dev server for UI component previews
- `lib/api-spec` — OpenAPI YAML + orval codegen (Zod + React Query types)
- `lib/api-zod` — Zod schemas generated from OpenAPI spec
- `lib/api-client-react` — React Query hooks generated from OpenAPI spec
- `lib/db` — PostgreSQL + Drizzle ORM

## Running Workflows

- **Start Backend** — `PORT=8080 pnpm --filter @workspace/api-server run dev` (starts Express at port 8080, builds ugc-studio first)
- **Start Mobile** — `pnpm --filter @workspace/mobile run dev` (starts Expo Metro at port 18115)
- **Start UGC Studio** — `node artifacts/ugc-studio/proxy.mjs` (HTTP proxy port 3000 → port 8080, for Replit artifact routing)

## UGC AI Ad Studio (Web)

### Frontend (`artifacts/ugc-studio`)
- React + Vite + TypeScript
- React Hook Form + Zod validation
- Shadcn/ui components + Tailwind CSS
- Multi-step progress UI during video generation
- File uploads for product image, reference video, creator avatar (sent as base64, stripped of data URL prefix)
- Polling via `useAdgenStatus` hook until job completes
- Shows final video URL with download/copy/share buttons

### Backend Adgen Pipeline (`artifacts/api-server/src/routes/adgen/`)
- `POST /api/adgen/generate` — queues a job, returns `{ jobId }`
- `GET /api/adgen/status/:jobId` — returns job status + step progress
- `POST /api/adgen/regenerate` — re-runs a completed job
- Pipeline steps (in `steps/`):
  1. `scriptGeneration.ts` — Claude claude-sonnet-4-6 generates ad script
  2. `voiceoverGeneration.ts` — ElevenLabs TTS (graceful fallback: silent audio)
  3. `videoGeneration.ts` — Kling AI video generation (graceful fallback: Ken Burns slideshow)
  4. `videoAssembly.ts` — FFmpeg assembles clips with audio
  5. Object Storage upload → signed URL returned

### Serving Architecture
- `artifacts/api-server/src/app.ts` serves ugc-studio's built static files via `express.static()`
- SPA catch-all: all non-API routes return `index.html`
- Backend dev script builds ugc-studio frontend before starting the server

## Mobile App (`artifacts/mobile`)

5 tabs: Studio, Direction, Director AI, Generate, History

### API Routes (Mobile)
- `POST /api/ugc/generate` — generate UGC photos or real mp4 videos
  - Ad angles: `us-vs-them`, `before-after`, `social-proof`
  - Photo: generates N images with gpt-image-1
  - Video: 3-scene concept (gpt-5.2) → 3 keyframe images (gpt-image-1) → ffmpeg Ken Burns stitch → Object Storage upload
- `POST /api/ugc/hooks` — generate scroll-stopping captions
- `GET/POST /api/openai/conversations` — conversation CRUD
- `POST /api/openai/conversations/:id/messages` — streaming SSE chat

## Environment Variables / Secrets Required

- `ANTHROPIC_API_KEY` (or use Replit AI Integrations proxy — claude-sonnet-4-6)
- `ELEVENLABS_API_KEY` — TTS; pipeline uses silent fallback if missing
- `KLING_API_KEY` — video generation; pipeline uses Ken Burns fallback if missing
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — Replit Object Storage bucket for video uploads

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **Web framework**: React 19 + Vite
- **API framework**: Express 5
- **Mobile**: Expo SDK 54, React Native 0.81, expo-router v6, expo-video
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod ^3.25.76
- **AI**: Claude claude-sonnet-4-6 (via Anthropic), ElevenLabs TTS, Kling AI
- **Video**: ffmpeg (Nix, v6.1.2)
- **Object Storage**: Replit Object Storage
- **Build**: esbuild (CJS bundle for server), Vite (ESM bundle for frontend)

## Key Commands

- `pnpm --filter @workspace/ugc-studio run build` — build ugc-studio frontend
- `pnpm --filter @workspace/api-server exec tsc --noEmit` — typecheck API server
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types from OpenAPI spec
- `pnpm --filter @workspace/mobile run typecheck` — typecheck mobile app
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Important Notes

- Do NOT use `uuid` package in mobile — crashes iOS; use `Date.now().toString() + Math.random()`
- `editImages()` from `@workspace/integrations-openai-ai-server` takes file paths (not base64)
- ffmpeg is available system-wide via Nix — no npm package needed
- Object storage sidecar at `http://127.0.0.1:1106` for auth + signed URLs
- Anthropic model: use `claude-sonnet-4-6` (not claude-sonnet-4-20250514 or newer names)
- base64 uploads: strip `data:...;base64,` prefix before sending to API — only send the raw base64 content
- Do NOT add `--localhost` to Expo Metro — it restricts binding to 127.0.0.1 and breaks workflow health checks

## Mobile Workflow

The `Start Mobile` workflow runs Expo Metro at port 18115.

**babel-preset-expo symlink**: Metro workers spawn from the root workspace dir so they can't find `babel-preset-expo`. A symlink exists at `node_modules/babel-preset-expo` → the pnpm store entry. If this breaks after pnpm installs, re-run:
```
ln -sfn "$(pwd)/$(ls -d node_modules/.pnpm/babel-preset-expo* | head -1)/node_modules/babel-preset-expo" node_modules/babel-preset-expo
```

## Preview Pane Notes

- The ugc-studio preview pane may show the mobile app in the IDE due to Replit's internal artifact routing  
- The ugc-studio IS accessible and working: port 8080 (backend) and port 3000 (proxy)
- For external access, the backend at port 8080 is mapped to external port 80
- The artifact-managed `artifacts/ugc-studio: web` workflow fails port detection (Replit limitation) — this doesn't affect actual functionality
