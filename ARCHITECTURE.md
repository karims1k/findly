# ARCHITECTURE.md — Findly

Companion to `CLAUDE.md`. That file tells you the rules; this one tells you how data actually moves through the system.

## Application architecture

Single Next.js 16 App Router application. No separate backend service — "backend" is just Next.js Route Handlers running as Vercel serverless functions, plus one `proxy.ts` (Next 16's renamed middleware) that runs on every request.

```
Browser (app/page.tsx, "use client")
   │
   ├── GET  /api/compare  ──────────► lib/compare.ts ──────────► SerpApi (google_shopping,
   │                                                              google_immersive_product)
   ├── POST /api/lens     ──────────► lib/lens.ts     ──────────► SerpApi (Image upload,
   │                                                              google_lens type=products)
   ├── GET  /auth/callback ─────────► lib/supabase/server.ts ───► Supabase Auth
   │
   ├── lib/favorites.ts (direct Supabase client calls, no Next.js route) ─► Supabase Postgres
   │                                                              (`favorites` table, RLS-enforced)
   │
   ├── (client-side, direct fetch, no Next.js route involved)
   │     ├── https://ipapi.co/json/            — geo-IP for "Local" mode + currency
   │     └── https://open.er-api.com/v6/...    — daily exchange rates
   │
   └── proxy.ts (runs on every request, all routes) ───────────► Supabase Auth (session refresh)
```

## Request/data flow: a text search

1. User types a query (or clicks a category tile/chip, or a browse-grid product card) in `app/page.tsx`.
2. `handleSearch()` builds `GET /api/compare?q=<query>&region=<region>[&trusted=1]`. `trusted=1` is added only for browse-grid drill-down clicks (see `CLAUDE.md` point 7).
3. `app/api/compare/route.ts`:
   a. Validates `q` and `region`.
   b. Checks `isInScope(q)` from `lib/category.ts` — skipped if `trusted=1`.
   c. Checks `lib/cache.ts` (in-memory, per-server-instance) for a cached result under key `${region}:${query.toLowerCase()}`.
   d. On a cache miss, calls `search(query, region, apiKey)` from `lib/compare.ts`.
   e. Returns JSON with `Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400` — this is what actually makes repeat/popular queries fast across *all* visitors in production, since Vercel's edge network honors it independently of the in-memory cache.
4. Inside `search()` (`lib/compare.ts`):
   a. Calls SerpApi `engine=google_shopping` once (1 credit).
   b. Clusters the flat results by title similarity (Jaccard word-overlap).
   c. Decides **single** vs **browse** mode based on whether one cluster dominates.
   d. **Browse mode**: filters clusters to "trusted" sources (known retailer/marketplace, or the brand's own name), takes the cheapest item per cluster, returns up to 12 `BrowseProduct`s — no further SerpApi calls.
   e. **Single mode**: picks seed listings from the dominant cluster that match the region's retailer allowlist (or falls back to the whole cluster), fetches up to `MAX_IMMERSIVE_LOOKUPS` (4) `serpapi_immersive_product_api` links in parallel (each is 1 more SerpApi credit), merges their `stores` arrays, applies the used-item filter, official-store detection, marketplace tagging, and the price-outlier filter (drop >3× median), then returns a sorted `ComparisonRow[]`.
5. `page.tsx` receives a `SearchResult` (`{mode: "single", rows: [...]}` or `{mode: "browse", products: [...]}`), converts every price to the visitor's local currency for display (`lib/currency.ts`, using `rates` already fetched on mount), and renders either the comparison list or the browse grid.
6. Clicking a browse-grid product card re-runs step 2 with that product's exact title and `trusted: true`.

## Request/data flow: a photo search

1. User picks/takes a photo. `resizeImageForUpload()` in `page.tsx` downsizes it client-side to ≤500KB JPEG (SerpApi's Image API limit).
2. `POST /api/lens` with the image + current `region` (form-data).
3. `app/api/lens/route.ts` → `lib/lens.ts` `findSimilarProducts()`:
   a. `POST https://serpapi.com/image` with the image → get an `image_id`.
   b. `GET` SerpApi `engine=google_lens&type=products&image_id=...` → up to dozens of real shopping listings from many countries/stores (not just the "best guess" — see `CLAUDE.md` point 9 for why `type=products` was chosen over `type=visual_matches`).
   c. Maps up to 16 into `BrowseProduct[]`, each carrying its **own** `currency` (since results span many countries) rather than one shared result-level currency.
4. Returns a `BrowseResult` directly (`query: "your photo"`) — no category-scope check (not free text), no HTTP caching (every photo is unique).
5. `page.tsx` renders it exactly like a regular browse grid. Tapping a card re-runs a normal `trusted` text search for that title — from here on it's indistinguishable from the text-search flow above.

## Authentication flow

1. `AuthWidget.tsx` (mounted top-right of `page.tsx`) collects an email and calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: "<origin>/auth/callback" } })` using the browser Supabase client (`lib/supabase/client.ts`).
2. Supabase emails a magic link pointing at `/auth/callback?code=...`.
3. `app/auth/callback/route.ts` uses the server Supabase client (`lib/supabase/server.ts`) to call `exchangeCodeForSession(code)`, which sets session cookies, then redirects to `/` (or `/?authError=1` on failure — **currently not read by the frontend**, a known gap).
4. `proxy.ts` runs on every subsequent request (matcher excludes static assets/images/favicons) and calls `supabase.auth.getUser()`, which transparently refreshes the session cookie if the access token has expired. Without this, sessions would silently die after the access token's short TTL even with a valid refresh token.
5. `AuthWidget.tsx` also subscribes to `supabase.auth.onAuthStateChange()` on mount, so the UI reflects sign-in/out immediately without a page reload.
6. `page.tsx` also independently subscribes to `supabase.auth.onAuthStateChange()` (separate from `AuthWidget.tsx`'s own subscription — deliberately decoupled) to know when to load/clear the signed-in user's favorites. See "Request/data flow: favorites" below for how the authenticated user is actually used.

## Request/data flow: favorites

1. On sign-in (detected via `page.tsx`'s own `onAuthStateChange` subscription), `page.tsx` calls `listFavorites()` from `lib/favorites.ts`, which queries the `favorites` table directly through the Supabase browser client — RLS means the query only ever returns rows where `user_id = auth.uid()`, with no need for a `WHERE` clause in application code.
2. **Saving**: clicking a heart icon (on a single-product result or a browse-grid card) calls `addFavorite(productTitle, region, imageUrl)`. This inserts `{ user_id, product_title, region, image_url }` — never a price, since prices change constantly (see `CLAUDE.md` → Database). A duplicate save (same user+title+region) hits the table's `unique` constraint (Postgres error code `23505`) and is treated as a silent no-op success rather than surfaced as an error.
3. **Viewing**: the "♥ Favorites" header link (visible only when signed in) opens a dedicated view in `page.tsx` populated from the already-loaded favorites list. Each entry's "Compare" button re-runs a normal `trusted` text search against `/api/compare` for that saved title — favorites never display a stored price, only the product identity, so viewing one always reflects live pricing.
4. **Removing**: `removeFavorite(productTitle, region)` deletes the matching row, scoped by `user_id` (and further enforced by the RLS delete policy even if the `.eq("user_id", ...)` clause were ever removed by mistake).
5. On sign-out, `page.tsx` clears all favorites-related state (`favoriteKeys`, `favoritesList`) — it does not attempt any further Supabase calls, since a signed-out client has no `auth.uid()` for RLS to match against.

## AI / external API integrations

| Integration | Where | What it's used for |
|---|---|---|
| SerpApi `google_shopping` | `lib/compare.ts` | Primary product search |
| SerpApi `google_immersive_product` (via a link returned by the search above, not a separate engine param) | `lib/compare.ts` | Per-store price/rating/delivery detail for single-product mode |
| SerpApi `google_lens` (`type=products`) | `lib/lens.ts` | Photo search |
| SerpApi `/image` (upload) | `lib/lens.ts` | Prerequisite for the Lens call above |
| Supabase Auth | `lib/supabase/*`, `proxy.ts`, `AuthWidget.tsx`, `auth/callback/route.ts` | Magic-link sign-in only |
| ipapi.co | `page.tsx` (`detectCountry()`) | Client-side geo-IP → drives "Local" region + default currency |
| open.er-api.com | `lib/currency.ts` (`fetchExchangeRates()`) | Daily USD-based exchange rates for currency conversion |

No LLM/AI model integration exists in the running application itself (Claude was used to *build* it, but the app makes no calls to any AI API at runtime).

## Database structure

One application table, `favorites` (defined in `supabase/migrations/001_favorites.sql`, run manually via the Supabase SQL Editor — no migration runner is wired into this project):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | `gen_random_uuid()` default |
| `user_id` | `uuid` | FK → `auth.users(id)`, `on delete cascade` |
| `product_title` | `text` | The saved product's title — this plus `region` is what "Compare" re-searches for |
| `image_url` | `text`, nullable | Representative thumbnail shown in the favorites list |
| `region` | `text` | One of `US` / `AE` / `WORLDWIDE` — which region's data the favorite was saved from |
| `created_at` | `timestamptz` | Defaults to `now()` |

A `unique (user_id, product_title, region)` constraint prevents duplicate saves. Row Level Security is enabled with three policies (select/insert/delete), each requiring `auth.uid() = user_id` — a signed-in user can only ever see or modify their own rows, enforced at the database level regardless of what the client sends. Accessed exclusively through `lib/favorites.ts`, called directly from `page.tsx` via the Supabase browser client — there is no `/api/favorites` route, since RLS makes a server-side proxy unnecessary here.

**Deliberately not stored**: price, currency, retailer, or any other point-in-time comparison data — see "Request/data flow: favorites" above for why.

## Frontend structure

- `app/layout.tsx` — root HTML shell, font loading (Geist, Geist Mono, Playfair Display), metadata.
- `app/page.tsx` — the entire application UI and client-side state machine. Key state: `query`, `locationMode` (`"local" | "worldwide"`), `detectedCountry`, `rates`, `result` (the current `SearchResult` or `null`), `loading`, `error`, plus photo-upload state (`photoBusy`, `photoError`) and favorites state (`user`, `favoriteKeys`, `showFavorites`, `favoritesList`, `favoritesError`). No client-side router usage beyond the implicit one page — this is intentionally a single-page app.
- `components/Logo.tsx`, `components/AuthWidget.tsx` — the only components extracted out of `page.tsx`.
- `app/globals.css` — Tailwind import, custom color tokens (`@theme inline`), background animation keyframes.
- `app/icon.tsx`, `app/apple-icon.tsx` — server-rendered (at request/build time) icon images via `next/og`'s `ImageResponse`, sharing the same visual design as `Logo.tsx` (kept in sync manually — there's no shared source of truth between the three files, so a logo redesign means editing all three).

## Backend structure

Three Route Handlers (see "Important API endpoints" in `CLAUDE.md`) plus `proxy.ts`. All business logic lives in `lib/*.ts` as plain, mostly-pure functions — route handlers are thin wrappers that validate input, call a `lib/` function, and shape the HTTP response (status code, `Cache-Control` header, error message).

## External services
See the integrations table above, plus Vercel (hosting) and GitHub (source control / CI trigger for Vercel).

## How the major pieces communicate
- **Frontend ↔ own backend**: plain `fetch()` to relative URLs (`/api/compare`, `/api/lens`), JSON in/out (multipart for the photo upload).
- **Own backend ↔ SerpApi**: server-side `fetch()` with an API key query param, JSON responses. No SDK — hand-rolled request building in `lib/compare.ts` and `lib/lens.ts`.
- **Own backend ↔ Supabase**: `@supabase/ssr`'s server client, cookie-based session, no direct REST/SQL calls outside the Supabase JS client.
- **Frontend ↔ Supabase**: `@supabase/ssr`'s browser client, same cookie-based session (shared with the server side via `proxy.ts`'s refresh). `lib/favorites.ts` uses this same browser client to read/write the `favorites` table directly — no Route Handler sits in between, since RLS (not application code) is what enforces access control.
- **Frontend ↔ third-party public APIs** (ipapi.co, open.er-api.com): direct client-side `fetch()`, no server involvement, results cached in `localStorage`.
