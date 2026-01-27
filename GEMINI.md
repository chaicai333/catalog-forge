# GEMINI.md

## Project Context
**Name:** Product Catalog PDF (Shopify App)
**Purpose:** Generate PDF catalogs and image ZIPs for Shopify stores.
**Stack:**
- **Frontend/API:** Remix (Shopify App Template), Polaris UI.
- **Backend/Worker:** Node.js, BullMQ (Redis) for job queues.
- **Database:** PostgreSQL (Prisma ORM).
- **PDF Generation:** pdf-lib, sharp (image processing).

## Architecture
- `app/`: Main Remix application (embedded in Shopify Admin).
- `worker/`: Background worker for processing export jobs.
- `prisma/`: Database schema.
- `storage/`: Local file storage for generated artifacts.

## Operational Guidelines
- **Commands:**
    - `npm run dev`: Start app.
    - `npm run dev:worker`: Start worker.
    - `npm run setup`: Database setup.
- **Conventions:**
    - Follow `AGENTS.md` for coding style.
    - Use `tsx` for running worker scripts/tests.

## Active Tasks
- [x] Initial setup verified.
- [x] Refactored configuration UI into a 2-column layout with live preview.
- [x] Implemented manual variant selection in product picker and backend filtering.