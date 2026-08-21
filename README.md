# AI Store Builder

Describe your business, let AI (Claude) draft a full Shopify store starter
(brand copy, homepage sections, pages, starter products), then push it
straight into a connected Shopify store so it can be opened and edited like
any other template — in Shopify's own admin / theme editor.

## How it works

1. **Connect** — merchant enters their `*.myshopify.com` domain and goes
   through standard Shopify OAuth (`/api/auth` → Shopify → `/api/auth/callback`).
   The offline access token is stored in a local database (`Session` table).
2. **Generate** — merchant describes their business on `/generate`. The
   backend calls Claude (`src/lib/ai.ts`) with a prompt that returns a
   structured JSON "store plan": brand copy, navigation, homepage sections,
   informational pages, and a starter product catalog. The plan is validated
   with `zod` (`src/lib/store-plan.ts`) and shown as a preview.
3. **Push** — clicking "Push to Shopify" sends the plan to
   `/api/push`, which uses the Shopify Admin GraphQL API
   (`src/lib/shopify-push.ts`) to create the pages and draft products in the
   connected store, plus brand metafields. From there the merchant edits
   everything normally in Shopify (Online Store editor, product admin, etc.)
   and launches whenever they're ready.

This is an MVP scaffold, not a finished product — see "What's not built yet"
below.

## Setup

### 1. Create a Shopify app (Partner Dashboard)

1. Go to [partners.shopify.com](https://partners.shopify.com) → Apps → Create app.
2. Set the **App URL** to your deployed URL (or an `ngrok`/tunnel URL while developing).
3. Set the **Allowed redirection URL** to `<App URL>/api/auth/callback`.
4. Copy the **Client ID** (API key) and **Client secret** (API secret) from
   the app's "Client credentials" section.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (must match
the Partner Dashboard App URL exactly, no trailing slash), and
`ANTHROPIC_API_KEY` (from [console.anthropic.com](https://console.anthropic.com)).
Never commit `.env.local` — it's already gitignored.

### 3. Install deps and set up the database

```bash
npm install
npx prisma migrate dev --name init
```

This creates `prisma/dev.db` (SQLite) with the `Session` table (OAuth
tokens) and `StoreProject` table (generated plans).

### 4. Run it

```bash
npm run dev
```

Open `http://localhost:3000`, enter a `*.myshopify.com` dev store domain,
connect it, then describe a business on `/generate` and generate + push a
store plan.

## Project structure

```
src/
  app/
    page.tsx                 connect-store landing page
    generate/page.tsx        prompt -> AI plan preview -> push to Shopify
    api/auth/route.ts        begin Shopify OAuth
    api/auth/callback/route.ts   OAuth callback, stores offline session
    api/generate/route.ts    calls Claude, stores + returns the store plan
    api/push/route.ts        pushes a generated plan into the Shopify store
  lib/
    shopify.ts                shopify-api client + Prisma session storage
    shopify-oauth.ts          manual OAuth helpers (authorize URL, HMAC, token exchange)
    shopify-push.ts           GraphQL Admin API calls (pages, products, metafields)
    ai.ts                     Claude prompt + response parsing
    store-plan.ts             zod schema for the generated store plan
    db.ts                     Prisma client singleton
prisma/schema.prisma          Session + StoreProject models
```

## What's not built yet

- **Billing** — no Shopify billing API integration.
- **Embedded admin UI / App Bridge** — the flow currently runs as a
  standalone web app, not embedded inside the Shopify admin iframe.
- **Theme editing** — the AI plan is pushed as Shopify Pages, draft Products,
  and shop metafields, not a fully custom Liquid theme. Merchants edit the
  generated content with Shopify's own tools after the push.
- **Multi-tenant auth for the builder itself** — anyone who knows a shop
  domain and completes Shopify OAuth can generate/push for that shop; add
  proper user accounts before opening this up publicly.
- Production Postgres/MySQL instead of SQLite for `DATABASE_URL`.
