# Local Development

## Services

Start Postgres and Redis with Docker:

```bash
docker compose up -d
```

## Environment

Copy the example env file and adjust as needed:

```bash
cp .env.example .env
```

Note: Postgres is mapped to `localhost:5433` to avoid clashing with any local install.

Shopify embedded apps also require `SHOPIFY_APP_URL`. Running `shopify app dev` will set it for you.
The worker also needs `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and `SCOPES` in `.env`.

## Database

Run Prisma migrations and generate the client:

```bash
npm install
npx prisma migrate dev --name init
```

## App + Worker

Run the Shopify app (embedded admin UI + API routes):

```bash
npm run dev
```

Run the worker in a separate terminal:

```bash
npm run dev:worker
```

## Cleanup expired files

```bash
npm --prefix worker run cleanup
```
