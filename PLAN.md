# CatalogForge V1 Plan

## Milestones

### M1: App foundation + local dev workflow
- Use Shopify Remix app template for embedded UI + API routes
- Add worker package for async jobs (BullMQ/Redis)
- Add shared types package for export settings + enums
- Set up Shopify embedded auth + session handling
- Set up DB schema + migrations (Shops, Jobs, JobFiles, JobIssues)
- Set up storage adapter interface (local filesystem for V1)
- Add basic job endpoints: create/list/get/rerun (no real processing yet)

### M2: Job pipeline + Shopify data extraction
- Implement job state machine + progress updates
- Implement GraphQL Bulk Operation query per scopeType
- Bulk downloader + JSONL parser to ProductRecord
- Implement fallback pagination when bulk fails
- Implement filters: include drafts (ACTIVE + DRAFT), exclude archived
- Implement collection scope + validation for grouping rule

### M3: Export artifacts + UI
- Image downloader (cover only) + retry + placeholder handling
- PDF renderer (GRID + ONE_PER_PAGE) with pricing modes
- Watermark overlay pass (diagonal, opacity levels, all pages)
- ZIP packer for cover images + optional README + manifest
- Upload outputs + signed URLs
- Admin UI screens: Create Export, Jobs/History, Job Detail with progress/issue display
- “Re-run with same settings” UX

### M4: Retention/cleanup + tests + docs
- Nightly cleanup job for expired files + JobFiles update
- Observability: errorSummary, jobId/shopId logging, issue tracking
- Tests: unit for pricing mode + bulk parsing; integration for job pipeline
- Docs: setup, env vars, local dev, Shopify scopes, data retention

## M1 Detailed Tasks (Initial Scaffold)

### Repository setup
- Shopify Remix template at repo root
- Workspace packages for `worker` and `packages/shared`

### Apps/packages placeholders
- `app/` for embedded Admin UI + API routes
- `worker/` for job processing
- `packages/shared` for shared types/utilities

### Next implementation steps
- Add queue wiring and worker processor
- Add local storage adapter and file retention wiring
- Flesh out UI screens + API validation
