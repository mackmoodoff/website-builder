# AI Store Builder

Two flows live here:

- **`/wizard`** (primary) — a multi-step "clone a competitor store" wizard:
  pick a market, describe your product/brand/competitors, generate branded
  images with AI, then Claude drafts an original (not copied) store structure
  inspired by the competitor's positioning, and it's pushed into Shopify as a
  draft product + an unpublished Dawn theme copy.
- **`/generate`** (legacy, simpler) — one prompt in, Claude drafts pages +
  starter products, pushed straight onto the connected store's existing theme.

Both are MVP scaffolds, not finished products — see "What's not built yet"
below.

## The `/wizard` flow

1. **Connect** — merchant enters their `*.myshopify.com` domain and goes
   through standard Shopify OAuth (`/api/auth` → Shopify → `/api/auth/callback`).
   The offline access token is stored in a local database (`Session` table).
   The callback redirects to `/wizard`.
2. **Market + brand + competitors** (`/wizard`) — target market (determines
   site language), product name/description, supplier link (e.g. AliExpress),
   brand name/logo/color, store email, and one or more competitor links (the
   first is the "main" competitor). Saved via `POST /api/wizard`
   (`src/app/api/wizard/route.ts`).
3. **Materials** (`/wizard/[id]/materials`) — `POST /api/wizard/[id]/scrape`
   (`src/lib/scrape.ts`) does a best-effort pull of reference images/text from
   the competitor and supplier links (via `/products.json` for Shopify-based
   competitors, otherwise basic meta-tag/`<img>` scraping — AliExpress and other
   heavily JS-rendered sites will yield limited data since there's no headless
   browser here). The merchant can also generate branded AI images
   (`POST /api/wizard/[id]/images/generate`, KIE AI's `gpt-image-2` async job
   API via `src/lib/image-gen.ts`) from a creative brief. At least 8 images
   must be selected (`POST /api/wizard/[id]/images/select`) to continue.
4. **Build** — selecting images immediately kicks off the background build
   (`POST /api/wizard/[id]/build` → `src/lib/wizard-build.ts`, no separate
   confirmation step): Claude drafts homepage, product page, and
   cart/checkout copy in the target market's language, **structurally
   inspired by the competitor's positioning but 100% original wording** (not
   scraped/copied text) — see "Why not a literal copy" below. The
   `/wizard/[id]/build` page polls `GET /api/wizard/[id]/status` for a live
   progress bar.
5. **Push** — `POST /api/wizard/[id]/push` (`src/lib/wizard-push.ts`) creates
   an **active, published-to-Online-Store** product with the selected images
   (uploaded via Shopify's staged-upload flow,
   `src/lib/shopify-staged-upload.ts`) and a new theme copied from Shopify's
   free Dawn theme (`src/lib/shopify-theme-push.ts`), with a fully
   custom-authored header, footer, homepage, and product page (icons, hover/
   glow effects, scroll-reveal animations — see `src/lib/dawn-local.ts`)
   pushed onto it via the Shopify CLI (`src/lib/shopify-cli-push.ts`). Cart
   and checkout stay Shopify's own native pages/mechanics — only those two
   are still Dawn defaults, intentionally.

### Why not a literal copy

Scraping and republishing a competitor's exact text/layout is a copyright and
Shopify-ToS risk. This build instead uses the competitor/supplier data only as
*reference material* (what they sell, how they position it) and has Claude
write original copy in the same structural spirit. It also could not be a
truly pixel-perfect clone in practice: standard (non-Shopify Plus) stores
can't fully redesign the checkout page via the API — only branding (logo,
colors) and the thank-you message are customizable, which is why
`checkoutBranding` only covers the thank-you message.

## The `/generate` flow (legacy)

1. **Generate** — merchant describes their business on `/generate`. Claude
   (`src/lib/ai.ts`) returns a structured JSON "store plan": brand copy,
   navigation, homepage sections, informational pages, and a starter product
   catalog, validated with `zod` (`src/lib/store-plan.ts`).
2. **Push** — `POST /api/push` (`src/lib/shopify-push.ts`) creates the pages
   and draft products (no images) on the connected store's *existing* theme,
   plus brand metafields.

## Setup

### 1. Create a Shopify app (Partner/Dev Dashboard)

1. Go to [partners.shopify.com](https://partners.shopify.com) → Apps → Create app
   ("Start from Dev Dashboard").
2. **App URL**: your deployed URL (or an `ngrok`/Cloudflare tunnel URL while developing).
3. **Allowed redirection URL(s)**: `<App URL>/api/auth/callback`.
4. **Use legacy install flow**: enabled — this app implements the classic
   OAuth redirect flow manually (`src/lib/shopify-oauth.ts`), not Shopify's
   newer managed installation.
5. **Embed app in Shopify admin**: disabled — this app runs standalone, not
   inside the admin iframe (no App Bridge yet).
6. **Scopes**: `write_products,read_products,write_content,read_content,write_online_store_pages,read_online_store_pages,write_themes,read_themes,write_publications,read_publications`
   (`write_themes`/`read_themes` are required to create a theme; `write_publications`/`read_publications`
   are required to publish products to the Online Store sales channel).
7. Copy the **Client ID** (API key) and **Client secret** (API secret) from
   the app's "Client credentials" section.

If you change scopes on an app a store has already installed, reinstall
(redo the OAuth connect flow) so the store grants the new scopes.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (must match
the Partner Dashboard App URL exactly, no trailing slash — no other stray
text on that line), `ANTHROPIC_API_KEY`
([console.anthropic.com](https://console.anthropic.com)), and
`OPENAI_API_KEY` ([platform.openai.com](https://platform.openai.com), used
only for the `/wizard` Materials step's image generation). Never commit
`.env.local` — it's already gitignored. Note that `npx prisma` commands read
`.env`, not `.env.local` — keep both in sync, or `copy .env.local .env`
(Windows) / `cp .env.local .env` (macOS/Linux) after editing.

### 3. Install deps and set up the database

```bash
npm install
npx prisma migrate dev
```

This creates `prisma/dev.db` (SQLite) with the `Session` table (OAuth
tokens), `StoreProject`/`StoreWizard` tables, and `StoreImage`.

### 4. Run it

```bash
npm run dev
```

Open the app, enter a `*.myshopify.com` dev store domain, connect it, then
either flow above.

### Testing through a tunnel (ngrok / Cloudflare)

Next.js's dev server blocks cross-origin requests to its own static assets by
default. `next.config.ts` allowlists `*.trycloudflare.com` and
`*.ngrok-free.app`/`*.ngrok-free.dev` via `allowedDevOrigins` — add your own
tunnel's domain pattern there if you use a different provider.

## Project structure

```
src/
  app/
    page.tsx                          connect-store landing page
    wizard/page.tsx                   step 2: market/product/brand/competitors form
    wizard/[id]/materials/page.tsx    step 3-4: reference + AI image generation/selection
    wizard/[id]/build/page.tsx        step 6-7: live build progress + push to Shopify
    generate/page.tsx                 legacy: prompt -> AI plan preview -> push
    api/auth/route.ts                 begin Shopify OAuth
    api/auth/callback/route.ts        OAuth callback, stores offline session
    api/wizard/route.ts               create a wizard run
    api/wizard/[id]/route.ts          fetch/patch a wizard run
    api/wizard/[id]/scrape/route.ts   competitor + supplier scrape
    api/wizard/[id]/images/*/route.ts generate / select reference images
    api/wizard/[id]/build/route.ts    kicks off the background site-plan build
    api/wizard/[id]/status/route.ts   polled for the live progress bar
    api/wizard/[id]/push/route.ts     push product + theme to Shopify
    api/generate/route.ts             legacy: calls Claude, stores + returns the plan
    api/push/route.ts                 legacy: pushes a plan into the store
  lib/
    shopify.ts                 shopify-api client + Prisma session storage
    shopify-oauth.ts           manual OAuth helpers (authorize URL, HMAC, token exchange)
    shopify-push.ts            legacy GraphQL Admin API calls (pages, products, metafields)
    shopify-staged-upload.ts   uploads base64 images via Shopify's staged-upload flow
    shopify-theme-push.ts      create/poll a Dawn theme copy, set logo + hero copy
    wizard-push.ts             orchestrates the wizard's product + theme push
    wizard-build.ts            orchestrates the background site-plan build + progress log
    site-plan.ts               Claude prompts + zod schemas for the site plan
    scrape.ts                  best-effort competitor/supplier scraping
    image-gen.ts               OpenAI gpt-image-1 branded image generation
    markets.ts                 market -> language mapping
    ai.ts / store-plan.ts      legacy prompt + schema for the /generate flow
    db.ts                      Prisma client singleton
prisma/schema.prisma           Session, StoreProject, StoreWizard, StoreImage models
```

## What's not built yet

- **Billing** — no Shopify billing API integration.
- **Embedded admin UI / App Bridge** — standalone web app, not embedded
  inside the Shopify admin iframe.
- **Full checkout redesign** — not possible via the API on non-Plus plans;
  only branding + thank-you message are customizable (see above).
- **Robust scraping** — no headless browser, so heavily JS-rendered sites
  (AliExpress, many storefronts) yield limited reference data. A future
  improvement would add Playwright-based rendering.
- **No automated theme-code writes** — Shopify blocks both the REST Asset API
  and the GraphQL `themeFilesUpsert` mutation for standard apps unless Shopify
  grants a manual "theme access" exemption (apply via the link in the error
  message this app surfaces if you try). Until/unless that's granted, the push
  step creates the draft product + unpublished Dawn theme copy, and the UI
  shows the merchant the exact logo/heading/subheading to paste into Shopify's
  own Theme Editor (~1 minute, manual).
- **Multi-tenant auth for the builder itself** — anyone who knows a shop
  domain and completes Shopify OAuth can run the wizard for that shop; add
  proper user accounts before opening this up publicly.
- Production Postgres/MySQL instead of SQLite, and object storage instead of
  base64-in-SQLite for images, before real-world use.
