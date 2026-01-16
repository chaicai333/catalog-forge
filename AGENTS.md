# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Remix admin UI and API routes (Shopify embedded app).
- `worker/`: BullMQ worker that builds PDFs and ZIPs.
- `packages/`: shared types/utilities (e.g., `packages/shared`).
- `extensions/`: Shopify app extensions (if present).
- `prisma/`: database schema and migrations.
- `storage/`: local job artifacts (PDF/ZIP/manifest).
- `docs/`: additional documentation.

## Build, Test, and Development Commands
- `npm run dev`: run the embedded app via Shopify CLI.
- `npm run dev:worker`: start the export worker locally.
- `npm run build`: build the Remix app.
- `npm run start`: serve the built app.
- `npm run setup`: generate Prisma client and run migrations.
- `npm run lint`: run ESLint.
- `npm run deploy`: deploy app config/extensions via Shopify CLI.
- `npm --prefix worker run test`: run worker tests (tsx).

## Coding Style & Naming Conventions
- TypeScript throughout. Indentation is 2 spaces.
- Prefer clear, descriptive names for jobs and settings.
- Linting via ESLint; formatting follows Prettier defaults if enabled.

## Testing Guidelines
- Worker tests live under `worker/test/` and run with `tsx --test`.
- No formal coverage requirement is enforced; add tests for new logic where possible.

## Commit & Pull Request Guidelines
- No strict commit message convention is enforced. Use concise, descriptive messages.
- PRs should include a brief summary, testing performed, and screenshots for UI changes.

## Architecture & Configuration Notes
- Jobs are enqueued in Redis (BullMQ) and processed by the worker.
- Key env vars: `SHOPIFY_APP_URL`, `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`,
  `LOCAL_STORAGE_ROOT` (optional).
- Deployments on Hetzner typically run web + worker + Postgres + Redis via Docker Compose.
