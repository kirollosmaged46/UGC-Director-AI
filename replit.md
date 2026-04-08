# UGC Creator — AI-Powered Content Studio

## Overview

A premium mobile app (Expo + React Native) for creative directors. Upload a product photo and generate authentic UGC content (photos + real mp4 videos) powered by OpenAI. Backed by an Express API server using Replit AI Integrations (no user API key required).

## Architecture

pnpm workspace monorepo:
- `artifacts/mobile` — Expo SDK 54 React Native app (5 tabs: Studio, Direction, Director AI, Generate, History)
- `artifacts/api-server` — Express 5 API server with Zod-validated routes
- `lib/db` — PostgreSQL + Drizzle ORM (conversations + messages tables)
- `lib/integrations-openai-ai-server` — OpenAI client (image editing via `editImages()`)
- `lib/api-spec` — OpenAPI YAML + orval codegen (Zod + React Query types)

## Key Features

- **Studio** — upload product photo via gallery or camera
- **Direction** — 3 ad angles (us-vs-them / before-after / social-proof), 5 lighting moods, 4 aspect ratios, platform targeting, output type (photo / video / both)
- **Director AI** — streaming SSE chat with creative director persona; extracts creative brief
- **Generate** — swipeable image pager, real mp4 video player (expo-video), hook/caption generator
- **History** — browse past generations

## API Routes

- `POST /api/ugc/generate` — generate UGC photos or real mp4 videos (Zod validated)
  - Ad angles: `us-vs-them`, `before-after`, `social-proof`
  - Photo: generates N images with gpt-image-1 directly
  - Video: generates 3-scene concept (gpt-5.2) → 3 keyframe images (gpt-image-1) → ffmpeg Ken Burns stitch → GCS upload → signed URL
- `POST /api/ugc/hooks` — generate scroll-stopping captions (Zod validated)
- `GET/POST /api/openai/conversations` — conversation CRUD
- `POST /api/openai/conversations/:id/messages` — streaming SSE chat

## Video Pipeline

1. gpt-5.2 generates 3-scene storyboard matching the ad angle narrative
2. 3 keyframe images generated in parallel via gpt-image-1
3. ffmpeg Ken Burns (zoompan) + xfade crossfade → ~12.5s H264 mp4
4. Uploaded to Replit Object Storage (GCS) via `videoStorage.ts`
5. Signed URL (24h valid) returned to mobile client
6. Mobile plays with `expo-video` `VideoView`

## Object Storage

- Provisioned via Replit Object Storage
- Bucket ID in `DEFAULT_OBJECT_STORAGE_BUCKET_ID` secret
- Videos stored at `ugc-videos/{uuid}.mp4`
- `artifacts/api-server/src/lib/videoStorage.ts` handles upload + signed URL

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile**: Expo SDK 54, React Native 0.81, expo-router v6, expo-video
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod ^3.25.76
- **AI**: Replit AI Integrations (OpenAI gpt-image-1 + gpt-5.2)
- **Video**: ffmpeg (Nix, v6.1.2) + @google-cloud/storage
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm --filter @workspace/mobile run typecheck` — typecheck mobile app
- `pnpm --filter @workspace/api-server exec tsc --noEmit` — typecheck API server
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API types from OpenAPI spec
- `pnpm --filter @workspace/db exec tsc -p tsconfig.json` — rebuild DB declarations
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Important Notes

- Do NOT use `uuid` package in mobile — crashes iOS; use `Date.now().toString() + Math.random()`
- Mobile `baseUrl` is `https://${process.env.EXPO_PUBLIC_DOMAIN}` (set once in `_layout.tsx`)
- `editImages()` from `@workspace/integrations-openai-ai-server` takes file paths (not base64)
- ffmpeg is available system-wide at `/nix/store/.../bin/ffmpeg` — no npm package needed
- Object storage sidecar at `http://127.0.0.1:1106` for auth + signed URLs
