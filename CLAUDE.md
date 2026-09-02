# CLAUDE.md — Findly

Permanent reference for working on this codebase. Read this and `PROJECT_STATUS.md` before starting any non-trivial task. This file describes what actually exists in the code as of the date in `PROJECT_STATUS.md` — if something here looks stale, trust the code and fix this file, not the other way around.

## What this application does

**Findly** is a web-based price-comparison app scoped **only** to makeup, perfume, and skincare (plus a "Beauty Accessories" sub-category added later — brushes/tools). For a given product it shows price, delivery estimate, and review rating across multiple retailers, converted into the visitor's local currency, and links out to the retailer to complete the purchase. Signed-in users can save products to a favorites/wishlist list. No in-app checkout, no price-drop alerts.

Three ways to search:
1. **Text search** — free-text box, or one of the category tiles/chips.
2. **Photo search** — upload/take a photo; finds visually-similar products (not just the exact item) across a wide range of global retailers.
3. **Browse drill-down** — a broad query (a brand name, a category) returns a grid of distinct products; tapping one runs a full price comparison for that exact item.

## Tech stack

- **Framework**: Next.js 16.3.3, App Router, Turbopack, React 19.2.8, TypeScript
- **Styling**: Tailwind CSS v4 (via `@theme inline` tokens in `app/globals.css`), no component library
- **Fonts**: `next/font/google` — Geist (body), Geist Mono, Playfair Display (serif headings/logo)
- **Auth/DB client**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — email magic-link auth, plus one table (`favorites`) for the wishlist feature
- **Data source**: SerpApi (Google Shopping, Google Immersive Product, Google Lens, Image upload) — the only product-data provider; no Amazon PA-API / affiliate network integration was ever built despite early discussion
- **Hosting**: Vercel (Pro plan), auto-deploys on push to `main`
- **Source control**: GitHub, `karims1k/findly`
- **Dev tooling**: ESLint (flat config via `eslint.config.mjs`), TypeScript compiler, Playwright (dev-only, for manual verification — not a test framework here)

## Architecture (high level)

Single Next.js app, no separate backend. `app/page.tsx` is one large client component holding almost all UI and client-side state. Server-side logic lives in three route handlers plus a `proxy.ts` (Next 16's renamed `middleware.ts`) and a `lib/` folder of pure functions. See `ARCHITECTURE.md` for data-flow diagrams.

## Important folders and files

```
app/
  page.tsx                 — the entire UI: search box, region/currency logic, category tiles,
                              results rendering (single-product compare view + browse grid), photo upload
  layout.tsx                — root layout, font loading, <html>/<body>, metadata
  globals.css                — Tailwind import + custom theme color tokens (cream/blush/dustyrose/brandbrown)
                              + background blob keyframes
  icon.tsx / apple-icon.tsx  — dynamically generated favicon/apple-touch-icon (next/og ImageResponse)
  api/compare/route.ts       — GET; main search endpoint (text search, category tiles, browse drill-down)
  api/lens/route.ts          — POST; photo search endpoint
  auth/callback/route.ts     — GET; Supabase magic-link callback (exchanges code for session)
proxy.ts                     — refreshes Supabase session cookie on every request (see "Next.js 16 note" below)
lib/
  compare.ts                — core search/compare engine (SerpApi calls, mode detection, filtering)
  retailers.ts               — per-region config: locale params, currency, retailer allowlist (SEED-ONLY, see below)
  category.ts                — keyword/brand heuristic gate ("is this a beauty product query")
  currency.ts                 — country→currency map, symbol normalization, exchange-rate fetch/convert/format
  cache.ts                    — shared TTL cache for /api/compare results (Upstash Redis when configured,
                                  falls back to a per-instance in-memory Map otherwise)
  errors.ts                   — rewrites raw upstream (SerpApi) errors into user-safe messages
  lens.ts                     — photo search implementation (SerpApi Image API + Google Lens)
  favorites.ts                 — favorites CRUD (list/add/remove) against the Supabase `favorites` table
  supabase/client.ts           — Supabase client factory for Client Components
  supabase/server.ts           — Supabase client factory for Server Components/Route Handlers
components/
  Logo.tsx                    — icon + "Findly" wordmark (serif, dusty-rose, heart accent)
  AuthWidget.tsx               — sign-in/out UI, magic-link flow, mounted top-right of page.tsx
supabase/
  migrations/001_favorites.sql — `favorites` table + RLS policies. Run manually in the Supabase SQL Editor —
                                  there is no CLI/migration runner wired up in this project.
dev-scripts/*.mjs              — ad-hoc Playwright scripts used during development for manual verification.
                              NOT a test suite, NOT run in CI, NOT npm-scripted. Safe to ignore or delete;
                              new ones get added freely when verifying a change.
```

## How the pieces work

### Frontend
`app/page.tsx` is a single `"use client"` component. It holds all state: search query, region/location mode, loading/error, geo-detected country, exchange rates, photo-upload state, and the current `SearchResult` (discriminated union: `{mode: "single", ...}` or `{mode: "browse", ...}`, from `lib/compare.ts`). No routing beyond the one page + the two API routes + the auth callback — this is not a multi-page app.

### Backend / API
- **`GET /api/compare?q=<text>&region=<US|AE|WORLDWIDE>&trusted=<0|1>`** — validates input, checks category scope (skipped if `trusted=1`), checks in-memory cache, calls `search()` from `lib/compare.ts`, returns JSON with `Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400` so Vercel's edge network can serve repeat/popular queries to *any* visitor without re-invoking the function.
- **`POST /api/lens`** — multipart form with an `image` file (client resizes to ≤500KB JPEG before upload) and a `region` field. Calls `findSimilarProducts()` from `lib/lens.ts`. No category-scope check (photo input isn't free text). No HTTP caching (every photo is unique).
- **`GET /auth/callback?code=...`** — Supabase magic-link landing point.

### Database
One table: **`favorites`** (`supabase/migrations/001_favorites.sql`) — `id`, `user_id` (FK to `auth.users`, cascade delete), `product_title`, `image_url`, `region`, `created_at`, with a `unique (user_id, product_title, region)` constraint. RLS is enabled with three policies (select/insert/delete), all scoped to `auth.uid() = user_id` — a user can only ever see or modify their own rows. Accessed directly from the client via `lib/favorites.ts` using the Supabase JS client (no dedicated API route — RLS is the only access control layer, so this is safe).

**Important**: a favorite row stores the **product identity** (title + region + an image URL), never a price. Prices change constantly, so the "My Favorites" view always re-runs a live `/api/compare` call for each saved item rather than showing a stored number — don't add a cached/frozen price field to this table.

The migration file must be run manually via the Supabase dashboard's SQL Editor — there is no CLI or automated migration runner wired into this project. If the schema ever needs to change, add a new numbered migration file rather than editing `001_favorites.sql` in place, so the change history stays honest about what's actually been run against the live project.

### Authentication
Supabase magic-link (passwordless), via `@supabase/ssr`:
1. `AuthWidget.tsx` collects an email, calls `supabase.auth.signInWithOtp()` with `emailRedirectTo` pointing at `/auth/callback`.
2. Supabase emails a link. Clicking it hits `app/auth/callback/route.ts`, which calls `exchangeCodeForSession()` and redirects home on success, or to `/?authError=1` on failure.
3. **Known gap**: nothing in `page.tsx` reads `authError` — a failed exchange currently fails silently from the user's point of view.
4. `proxy.ts` runs on every request (matcher excludes static assets) and calls `supabase.auth.getUser()` to refresh the session cookie — this is required for SSR auth state to stay valid; removing it will cause random logouts.
5. Supabase project's **Redirect URLs** allowlist (in the Supabase dashboard, not this repo) must include both `http://localhost:3000/**` and the production URL, or magic links will fail in whichever environment isn't listed.
6. Supabase's default built-in email sender has a very low rate limit (empirically hit during development, ~a couple sends/hour). Fine for dev; a real SMTP provider (Resend was discussed, 100/day free tier) should be connected in Supabase's Auth settings before relying on this for real users.

### Environment variables (names only — never put values in this file)
- `SERPAPI_KEY` — server-only, used in `lib/compare.ts` and `lib/lens.ts`
- `NEXT_PUBLIC_SUPABASE_URL` — exposed to the browser by design (Supabase project URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — exposed to the browser by design (Supabase anon/public key; safe only because Supabase enforces access via RLS)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — server-only, used in `lib/cache.ts`. Optional: if unset, `lib/cache.ts` falls back to a per-instance in-memory cache instead of failing. Also accepts the equivalent `KV_REST_API_URL` / `KV_REST_API_TOKEN` names, since Vercel's Upstash marketplace integration can surface either naming.

All of these must also be set in the Vercel project's Environment Variables (Production) — they are **not** synced automatically from local `.env.local`. The Redis pair is set automatically when connecting the Upstash integration via Vercel's Storage tab, so it usually doesn't need to be typed in by hand.

## External services and integrations

| Service | Purpose | Notes |
|---|---|---|
| **SerpApi** | Sole product-data source: `engine=google_shopping` (search), `serpapi_immersive_product_api` link (per-store detail for single-product mode), `engine=google_lens&type=products` (photo search), `POST /image` (image upload for Lens) | Paid/metered. Free tier is 250 searches/month; one compare call can cost 1 (flat search) + up to 4 (immersive lookups) = up to 5 credits. `MAX_IMMERSIVE_LOOKUPS` in `lib/compare.ts` is the cost/coverage dial. |
| **Supabase** | Auth (magic link) + one table (`favorites`) | RLS-scoped to `auth.uid()`. Default email sender is rate-limited; see Authentication section. |
| **Upstash Redis** (via Vercel Marketplace) | Shared cache for `/api/compare` results (`lib/cache.ts`) | Free tier. Falls back to a per-instance in-memory cache if not connected — see Environment variables above. |
| **ipapi.co** | Client-side geo-IP lookup for "Local" mode and currency detection | Free tier, tight rate limit (hit during dev). Result cached in `localStorage` for 6h to reduce calls. |
| **open.er-api.com** | Free daily exchange-rate feed, no API key | Result cached in `localStorage` for 12h. |
| **Vercel** | Hosting, edge caching (via `Cache-Control` headers on `/api/compare`), auto-deploy from GitHub `main` | Pro plan (chosen because Hobby's ToS forbids affiliate-link-primary sites, which is the long-term monetization plan). |
| **GitHub** | Source control, connected to Vercel for CI/CD | `karims1k/findly` |

## Important API endpoints
See "Backend / API" above — there are only three: `GET /api/compare`, `POST /api/lens`, `GET /auth/callback`.

## Important components
- `app/page.tsx` — everything UI-related lives here (not yet split into subcomponents beyond `Logo` and `AuthWidget`; it's a large single file, ~920 lines, by original design choice for this project's size).
- `components/Logo.tsx`, `components/AuthWidget.tsx` — the only extracted components.

## UI / design system rules
Current design (as of the redesign covered in `PROJECT_STATUS.md`) is a warm, editorial "beauty brand" aesthetic:
- **Colors** (defined as Tailwind theme tokens in `app/globals.css`, usable as `bg-cream`, `text-brandbrown`, etc.): `cream` (#fdf3ee), `blush` (#f6e2d6), `dustyrose` (#d99a9d), `dustyrose-dark` (#c1797d), `brandbrown` (#5c3d38), `brandbrown-light` (#8a7267), `cardbg` (#fffaf7).
- **Typography**: Playfair Display (serif) for the logo wordmark and headings/titles; Geist (sans) for body text and UI chrome.
- **Logo**: `components/Logo.tsx` — dusty-rose gradient rounded-square icon with a white magnifying glass + sparkle, paired with the serif "Findly" wordmark and a small heart accent. This exact icon (scaled) is reused for the favicon (`app/icon.tsx`) and Apple touch icon (`app/apple-icon.tsx`) — if the logo design changes, update those three files together to keep them consistent.
- **Category cards**: horizontal cards (real product photo + title + subtitle + chevron), not the earlier vertical gradient-tile design. Category images are hardcoded SerpApi thumbnail URLs baked in at design time (in the `CATEGORIES` array in `page.tsx`) — **not** fetched live per page load, deliberately, to avoid adding 4 extra SerpApi searches to every homepage visit.
- Semantic colors are intentionally **not** part of the brand palette and should stay distinct: amber = "Official store" badge, emerald = "Best price" badge, gray = "Marketplace seller" tag, amber stars = rating. Don't recolor these to match the brand palette — they're status signals, not decoration.
- **Dark mode is intentionally disabled.** `dark:` Tailwind classes still exist throughout `page.tsx`/`AuthWidget.tsx` (harmless — just inert), but `app/globals.css` neutralizes the `dark` variant globally (`@custom-variant dark (&:where(.dark, .dark *));`, no code ever adds a `.dark` class), and the old `@media (prefers-color-scheme: dark)` override that swapped the background to near-black on dark-mode systems was removed. Findly always renders the one light cream/dusty-rose look regardless of the visitor's OS theme, per the reference mockup — don't reintroduce a media-query-driven dark palette without an explicit request.
- Background: a single soft, animated dusty-rose blob (`.bg-blob`, `drift-a` keyframe) behind a cream-to-blush gradient; respects `prefers-reduced-motion`.

## Important business logic (read before touching `lib/compare.ts`)

These are non-obvious and were arrived at empirically — don't "simplify" them without re-reading the comments in the source, which explain *why*:

1. **Single vs. browse mode** is decided by clustering flat search-result titles by word-overlap similarity (Jaccard ≥ 0.5). If one cluster dominates (≥50% of ≥4 results), it's treated as one product with many sellers ("single" mode). Otherwise it's genuinely many different products ("browse" mode, a grid). This heuristic can misfire on very-similar product-line variants (e.g. "Gloss Bomb" vs "Gloss Bomb Heat").
2. **The retailer allowlist (`lib/retailers.ts`) is a SEED SELECTOR, not an output filter.** It decides which flat search result to use as the seed for the expensive immersive-product lookup — verified empirically that seeding from an untrustworthy listing returns a junk grouping (spam resellers, eBay/Depop noise), while seeding from a known retailer returns the full clean grouping *including sellers not on the allowlist* (the official brand site, other legitimate stores). **Do not** re-introduce allowlist filtering on the output `stores` array — that was a real bug, fixed once already (it silently excluded official brand sites and other legitimate third-party sellers).
3. **Price-outlier filter**: drop any row priced >3× the group's median. Catches reseller price-gouging (observed: a reseller charging 5–10× the going rate for the same item). Uses median, not min, so one outlier can't skew its own cutoff.
4. **Used-item filter**: keyword-only (no structured "condition" field exists from SerpApi) — checks store title + `details_and_offers` text for words like "used", "pre-owned", "swatched". Will miss a used listing that doesn't use any of those words.
5. **Official-store detection**: a store counts as official if its name or domain closely matches the product's brand name (from the immersive lookup's `brand` field).
6. **Marketplace tagging**: eBay/Depop/Poshmark/Mercari/Vinted are recognized and shown (not blocked), tagged "Marketplace seller" in the UI so users know condition isn't independently verified. They're seeded from opportunistically (only when Google lists one directly as a top-level result) — not force-fetched, to control cost.
7. **Category-scope check (`lib/category.ts`)** is a heuristic keyword+brand list, deliberately **bypassed** (`trusted=1` query param) for queries that originate from Findly's own browse grids or photo search — those titles already come from a beauty-scoped search, and real catalog titles use marketing language ("Glaze", "Plumpgasm") a fixed keyword list can't fully anticipate. The bypass must **never** apply to the free-text search box or category tiles — those are genuine user-typed input and should stay gated.
8. **Currency conversion is display-only.** Sorting and "best price" comparisons always use the raw `extractedPrice` values from one consistent source currency — never compare converted amounts across different source currencies. `lib/currency.ts`'s `convertAmount` is only ever called at render time in `page.tsx`.
9. **Photo search deliberately does NOT try to find "the exact item.**" It uses `google_lens&type=products` (not `type=visual_matches`, which is dominated by social-media noise) to surface a broad set of close-but-different alternatives across many countries/stores — this was a deliberate pivot from an earlier "pick one best guess and search for that" design.
10. **Result ordering in single-product mode** (`sortedRows` in `app/page.tsx`): official-store row(s) (`isOfficial`) always render first, regardless of the active sort mode. Every other row is sorted beneath them by whichever criterion is selected (price ascending is the default). Don't let a future sort-mode change accidentally drop the official-first partition — it's a deliberate two-tier sort (official-first, then comparator), not a plain single-key sort.

## Things that must NOT be changed without a very good reason
- Don't make the retailer allowlist filter the *output* stores array again (point 2 above).
- Don't apply `isInScope()` to `trusted=1` requests, and don't add `trusted=1` to anything except internal drill-down/photo-search calls.
- Don't compare/sort prices across different currencies without converting first (and even then, only for display — see point 8).
- Don't remove the price-outlier or used-item filters without a replacement safeguard.
- `lib/cache.ts` only gives real cross-instance sharing in production when `UPSTASH_REDIS_REST_URL`/`TOKEN` (or `KV_REST_API_URL`/`TOKEN`) are actually set in Vercel — without them it silently degrades to a per-instance in-memory cache, which is much weaker but never breaks the app. The `Cache-Control` header on `/api/compare` is a separate, always-on layer (Vercel's edge network); keep both.
- Don't touch `git config` (global rule for this environment, not project-specific).
- Don't commit `.env.local` or paste secret values into any file, including these docs.
- Don't rename `proxy.ts` back to `middleware.ts` — Next.js 16 deprecated that convention; `export function proxy(...)` in `proxy.ts` is the current, correct form.

## Deployment
- GitHub `karims1k/findly`, branch `main` → Vercel project `findly` (Pro plan), auto-deploy on push.
- Live URL: the Vercel-assigned production domain for this project (check the Vercel dashboard or `git remote`/deployment history — deliberately not hardcoded here since it can change).
- Env vars must be added in Vercel's dashboard (Settings → Environment Variables, Production) separately from local `.env.local`.
- Supabase Auth → URL Configuration → Redirect URLs must list both the local dev URL and the production URL.

## Development commands
```
npm run dev     # next dev (Turbopack), http://localhost:3000
npm run build   # next build
npm run start   # next start (serve a production build locally)
npm run lint    # eslint
npx tsc --noEmit   # type-check without emitting (not a package.json script, but the standard pre-ship check used throughout this project)
```
No `nvm`/node version pinned in-repo, but development has used Node 24 via `nvm` (`export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"` if `node` isn't found on PATH directly).

## Testing
**No automated test suite exists.** `npm run lint` and `npx tsc --noEmit` are the only automated checks. Feature verification has been done manually via one-off Playwright scripts saved in `dev-scripts/*.mjs` (run with `node dev-scripts/<script>.mjs` against a running `npm run dev` server) — these are throwaway/reference scripts, not a maintained suite, and are not run in CI. If a real test suite gets added later, this section should be updated with the framework and `npm test` command.

## Known limitations
See `PROJECT_STATUS.md` → KNOWN BUGS for the current list (kept there since it changes more often than this file should).

## Important decisions made during development (chronological summary)
See `CHANGELOG.md` for the dated, detailed version. Highlights:
- Chose SerpApi over Amazon PA-API/affiliate networks as the sole data source (affiliate approval requires an existing live site; PA-API was deprecated mid-project in favor of "Creators API," and both require sales history to get a usable quota — impractical for a pre-launch app).
- Pivoted from a strict "one retailer allowlist filters everything" design to "allowlist seeds the lookup, output is unrestricted" after discovering the allowlist was silently hiding official brand sites and legitimate third-party sellers.
- Pivoted photo search from "identify the exact item" to "find close-but-similar alternatives" (`type=products` instead of `type=visual_matches`) per explicit product direction, which also happened to surface Shein and other budget retailers naturally.
- Chose Supabase over Clerk+separate-DB for auth specifically because a future "save favorites" feature needs a database anyway — one account/service instead of two.
- Chose Vercel Pro over Hobby because the Hobby plan's ToS forbids sites whose primary purpose is affiliate linking, which is this project's intended monetization path.
- Full visual identity redesign (fuchsia/purple/Baloo-2 playful → dusty-rose/cream/Playfair-serif editorial) per a supplied reference mockup — see `CHANGELOG.md` for the exact date.
