# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is CatalogForge

A Shopify embedded app that generates PDF product catalogs and ZIP image bundles. Merchants select products, configure layout options, and the app produces downloadable files.

## Development Commands

```bash
# Local development (requires Docker for Postgres + Redis)
docker compose up -d              # Start Postgres + Redis
npm install && npm run setup      # Install deps + Prisma generate + migrate
npm run dev                       # Run Shopify embedded app (uses CLI tunnel)
npm run dev:worker                # Run BullMQ worker (separate terminal)

# Build & deploy
npm run build                     # Build Remix app
npm run deploy                    # Deploy app config to Shopify Partner Dashboard

# Testing
npm --prefix worker run test      # Run worker tests (tsx --test)

# Linting
npm run lint
```

## Architecture

**Remix App (`app/`)**: Embedded admin UI. Uses `shopify.authenticate.admin(request)` for auth. Routes under `app/routes/app.*` are the merchant-facing UI. API routes handle job creation and file downloads.

**Worker (`worker/`)**: Standalone BullMQ process that:
1. Fetches product data from Shopify GraphQL API
2. Downloads product images
3. Generates PDF catalogs using pdf-lib
4. Creates ZIP bundles using archiver
5. Stores artifacts in `LOCAL_STORAGE_ROOT`

**Shared (`packages/shared/`)**: Types and utilities shared between app and worker.

**Job Flow**: App enqueues jobs to Redis → Worker picks up job → Fetches products → Generates PDF/ZIP → Updates job status in Postgres → App polls status and serves download links.

## Key Files

- `app/shopify.server.ts` - Shopify app configuration and auth
- `app/routes/app._index.tsx` - Main UI for creating export jobs
- `worker/src/index.ts` - Worker entry point
- `prisma/schema.prisma` - Database schema (Session + Job models)
- `shopify.app.toml` - Shopify app configuration (scopes, URLs, webhooks)

## Environment Variables

```
SHOPIFY_API_KEY, SHOPIFY_API_SECRET  # From Shopify Partner Dashboard
SHOPIFY_APP_URL                       # Public URL (https://your-domain.com)
DATABASE_URL                          # PostgreSQL connection string
REDIS_HOST, REDIS_PORT                # Redis for BullMQ
LOCAL_STORAGE_ROOT                    # Where to store generated files (optional)
```

## Production Deployment

Uses Docker Compose with Caddy reverse proxy. See `docker-compose.prod.yml` and `Caddyfile`. Typical stack: web + worker + postgres + redis on single Hetzner box.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
