# CHANGELOG.md — Findly

Dates below are git commit dates (verified via `git log --format="%h %ad %s" --date=short`), not conversation dates. As of 2026-09-02, everything below is committed and pushed — `git status` shows a clean working tree.

## 2026-08-31 — Initial build (commit `f4e0411`)
- **Change**: Built the initial Findly app from scratch — Next.js scaffold, SerpApi-based price comparison (`lib/compare.ts`), region system (US/AE/WORLDWIDE) with retailer allowlists, category-scope keyword gate, in-memory caching, basic UI (search box, category tiles, comparison table), deployed to Vercel from a new GitHub repo (`karims1k/findly`).
- **Why**: Research phase concluded SerpApi (Google Shopping + Immersive Product data) was the only practical data source — Amazon PA-API/affiliate networks require an existing live site and/or sales history to get real API access, which a pre-launch app doesn't have.
- **Files affected**: essentially the whole initial app — `app/`, `lib/compare.ts`, `lib/retailers.ts`, `lib/category.ts`, `lib/cache.ts`.
- **Notes**: The retailer allowlist was originally used to filter *output* (which stores get shown), not just to pick a search seed — this design was later found to be wrong and changed (see 2026-09-01 entries below).

## 2026-09-01 — Brand/category browsing, dark mode, photo auto-search (commit `45851d4`)
- **Change**: Split search results into two modes — "single product, many sellers" (comparison table) vs. "browse many distinct products" (grid) — detected by clustering result titles by similarity. Added category quick-search tiles, a colored (non-black) dark-mode background, and made photo search auto-run the comparison instead of requiring a manual follow-up submit.
- **Why**: A bare brand or category search (e.g. "Fenty Beauty") was previously being force-fit into a single nonsensical "comparison," since the app assumed every query resolved to one product.
- **Files affected**: `lib/compare.ts` (mode detection), `app/page.tsx` (browse grid UI, category tiles), `app/globals.css`.
- **Notes**: This is also where the "official store" and "marketplace seller" concepts (in `lib/compare.ts`) were introduced, and where the retailer-allowlist bug was found and fixed: seeding an immersive-product lookup from an untrustworthy listing was found (empirically) to return spam (eBay/Depop junk), while the allowlist was *also* being used to filter the final output — which silently hid the official brand's own site and other legitimate sellers not on the curated list. Fixed by keeping the allowlist as a seed-selector only.

## 2026-09-01 — Email login, new logo/favicon, animated background (commit `b0790b6`)
- **Change**: Added Supabase magic-link email authentication (`AuthWidget.tsx`, `proxy.ts`, `app/auth/callback/route.ts`); designed a real logo (`components/Logo.tsx`) with a matching generated favicon/apple-touch-icon (`app/icon.tsx`, `app/apple-icon.tsx`); added an animated gradient-blob background.
- **Why**: Login was added as groundwork for a planned favorites/wishlist feature (not yet built — see `PROJECT_STATUS.md`). The default Next.js icon and plain-text logo were replaced for a more distinct brand identity.
- **Files affected**: `components/Logo.tsx`, `components/AuthWidget.tsx`, `proxy.ts` (new), `app/auth/callback/route.ts` (new), `lib/supabase/client.ts` + `server.ts` (new), `app/icon.tsx` + `apple-icon.tsx` (new), `app/globals.css`.
- **Notes**: Supabase's built-in default email sender has a very low rate limit — hit repeatedly during testing. A real SMTP provider (Resend was discussed) was recommended but never actually connected; still an open task.

## 2026-09-01 — Similar-products photo search, currency conversion (commit `415ed20`)
- **Change**: Rebuilt photo search to use SerpApi's `google_lens&type=products` instead of `type=visual_matches` — surfaces dozens of real shopping listings (including close-but-different alternatives across many countries) instead of picking one "best guess" and searching for that exact item. Added Shein to all three regions' retailer lists. Added currency conversion: every price shown (regular search, browse grids, photo grid) now converts to the visitor's detected local currency via a free daily exchange-rate feed, falling back to the original currency if conversion isn't possible. Lightened the background to softer pastel tones.
- **Why**: The previous photo-search design ("identify the exact item, search for that") was too narrow per explicit product direction — the goal was finding similar/cheaper alternatives "even through Shein," not just the same SKU. Currency conversion was requested so a visitor always sees prices in their own currency regardless of which region's data answered the query.
- **Files affected**: `lib/lens.ts`, `lib/currency.ts` (new), `lib/compare.ts`, `lib/retailers.ts`, `app/api/lens/route.ts`, `app/page.tsx`.
- **Notes**: Currency conversion is strictly display-only — sorting and "best price" logic always compare raw same-currency values, never converted ones (see `CLAUDE.md` point 8). Verified against real exchange rates (e.g. a $29.50 USD result correctly displayed as ~AED 108).

---

## 2026-09-02 — Redesign, favorites feature, bug fixes, and project docs (commit `29edae2`)

Everything below was implemented and verified across this session, then committed and pushed to `main` together as one commit.

### Performance pass + category expansion
- **Change**: Added `Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400` to `/api/compare` responses so Vercel's edge network can serve repeat/popular queries to any visitor without re-invoking the function or SerpApi. Added `localStorage` caching (6h for geo-detection, 12h for exchange rates) to skip those network calls on repeat visits. Added `loading="lazy"` to result images. Expanded categories from 3 tiles to 3 hero tiles + 12 "more to explore" chips (Lipstick, Foundation, Mascara & Eyes, Nail Polish, Cologne, Body Mist, Moisturizer, Serum, Sunscreen, Cleanser, Face Mask, Hair Care).
- **Why**: Requested performance improvement + more category options. The `localStorage` caching also directly fixes real rate-limit errors hit against `ipapi.co` during development.
- **Files affected**: `app/api/compare/route.ts`, `app/page.tsx`.

### Bug fix: false category-scope rejections on drill-down + UI overlap
- **Change**: Added a `trusted=1` bypass on `/api/compare` for queries originating from Findly's own browse grids (drill-down clicks) or photo search, since those titles already came from a beauty-scoped search and real catalog titles ("HAUS LABS PhD Hybrid Lip Glaze Plumping Gloss") can fail a fixed keyword/brand list. Also fixed the "Browse categories" tiles rendering at the same time as an active error message, which read as "the app went back to the home screen."
- **Why**: Bug report — searching "lip gloss" then clicking a result could show an error while simultaneously showing the category tiles, which looked like the app had reset. Root-caused to the category-scope filter false-rejecting a legitimate product title on the drill-down search.
- **Files affected**: `app/api/compare/route.ts`, `app/page.tsx`.
- **Notes**: The `trusted` bypass must only ever be set for internally-originated queries (browse-grid card clicks) — never for the free-text search box or category tiles, which should stay scope-checked.

### Full visual redesign
- **Change**: Replaced the entire visual identity — fuchsia/purple/pink gradients + Baloo 2 rounded font + vivid animated blobs + vertical gradient category tiles — with a warm, editorial "beauty brand" look: dusty-rose/cream/blush palette (new Tailwind theme tokens in `app/globals.css`), Playfair Display serif for the logo and headings, a single soft animated background blob, horizontal category cards (real product photo + title + subtitle + chevron), a new "Beauty Accessories" category, and a 3-item trust-badge footer (Best Prices / Delivery Estimates / Aggregated Ratings). Extended the new palette through the results views (Buy buttons, sort pills) for consistency. Restyled `AuthWidget.tsx` and `Logo.tsx` to match.
- **Why**: Direct request, built from a supplied reference mockup image.
- **Files affected**: `app/page.tsx`, `app/globals.css`, `app/layout.tsx` (added Playfair Display font), `components/Logo.tsx`, `components/AuthWidget.tsx`, `lib/category.ts` (added accessory-related keywords so the new category passes scope).
- **Notes**: Category card images are real product photos sourced from live SerpApi results, fetched once during development and hardcoded into the `CATEGORIES` array in `page.tsx` — deliberately **not** fetched live on every page load (would add 4 extra SerpApi searches per homepage visit, undoing the caching work above). Trust-badge copy was deliberately written to be accurate to what the app actually provides (e.g. "Delivery Estimates" / "Aggregated Ratings" rather than the mockup's "Fast Delivery" / "Trusted Reviews", since Findly doesn't control delivery or independently verify reviews). Dark mode was updated to a warm dark-brown palette but not pixel-matched to any reference — light mode was the focus.

### Favorites/wishlist feature
- **Change**: Added a `favorites` table in Supabase (`supabase/migrations/001_favorites.sql`, run manually via the Supabase SQL Editor — no CLI/migration runner is wired up) with RLS policies scoping all access to `auth.uid()`. Added `lib/favorites.ts` (`listFavorites`, `addFavorite`, `removeFavorite`). Wired heart-toggle buttons into both single-product result rows and browse-grid cards, a "♥ Favorites (N)" header link (visible only when signed in), and a "My Favorites" list view with a "Compare" action (re-runs a live comparison) and a remove action per item.
- **Why**: Requested — this was the original reason auth was added early on, but no saved-data feature existed until now.
- **Files affected**: `supabase/migrations/001_favorites.sql` (new), `lib/favorites.ts` (new), `app/page.tsx`.
- **Notes**: Favorites store the **product** (title + region + image), not a frozen price snapshot — prices change constantly, so viewing a favorite always re-runs a live `/api/compare` call rather than showing a stale number. Browse-grid cards were restructured from `<button>` to `<div role="button" tabIndex={0}>` to legally nest a real heart `<button>` inside without invalid nested-button HTML. Verified end-to-end by the user: sign in → heart a browse-grid card and a single-product result → confirm both appear in "My Favorites" → remove one both ways (list remove button and re-toggling the heart) → confirmed removal persists after refresh.

### Fix: app ignored system dark mode instead of matching the reference design
- **Change**: Removed a leftover `@media (prefers-color-scheme: dark)` override in `app/globals.css` (from the original create-next-app template) that switched the page background to near-black on dark-mode systems, and neutralized Tailwind's `dark:` variant globally (`@custom-variant dark (&:where(.dark, .dark *));`) so the ~50 `dark:` classes throughout `app/page.tsx` and `components/AuthWidget.tsx` no longer activate automatically.
- **Why**: Bug report — the app still showed a dark background on a Mac in dark mode, even though the whole redesign was built to match one fixed light reference mockup. Findly has no light/dark toggle of its own, so it shouldn't inherit the OS's.
- **Files affected**: `app/globals.css`.
- **Notes**: The `dark:` utility classes were left in place (not deleted) since they're now simply inert — reversible later if a real in-app theme toggle is ever built. Verified by force-rendering the page with a dark-OS browser context and confirming the cream/dusty-rose look held.

### Official store pinned to top of comparison results
- **Change**: In single-product comparison mode, the row(s) marked `isOfficial` now always render first regardless of the active sort mode, with the rest of the rows sorted beneath them by whichever criterion is selected (price/rating/delivery — price ascending is the default).
- **Why**: Requested — the official brand store should be visually prioritized even when it isn't the cheapest option, with everything else still easy to scan cheapest-first.
- **Files affected**: `app/page.tsx` (`sortedRows` memo).
- **Notes**: Verified against a live result set (Charlotte Tilbury lipstick): the official Charlotte Tilbury store (AED 136) led the list while eBay (AED 32.91) led the remaining rows sorted low-to-high beneath it.

### Project documentation system
- **Change**: Created `CLAUDE.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`, and this `CHANGELOG.md` by inspecting the actual current codebase (not from memory/assumption). No functional code changed.
- **Why**: Requested — a durable memory system so work can continue accurately across sessions, context compaction, or long gaps.
- **Files affected**: the four new markdown files at the project root.
- **Notes**: Found and documented one real gap while inspecting: `/auth/callback` redirects to `/?authError=1` on a failed magic-link exchange, but `page.tsx` never reads that param, so a failed sign-in currently fails silently. Also confirmed no `favorites` table or any Supabase query beyond auth exists — the favorites feature discussed early on was never built.

## 2026-09-02 — Docs synced after push + live deployment confirmed (commit `1d10f6d`)
- **Change**: Updated `PROJECT_STATUS.md` and `CHANGELOG.md` to mark the redesign/favorites/dark-mode/sort-order batch (`29edae2`) as committed and pushed instead of pending, and to record that the user confirmed the live Vercel deployment matches what was verified locally.
- **Why**: Keep the docs honest as the source of truth for "where things stand right now," per the project's own documentation rules — a doc that still says "uncommitted" after a push is actively misleading to a future session.
- **Files affected**: `PROJECT_STATUS.md`, `CHANGELOG.md`.
- **Notes**: No code changed. As of this commit the working tree is clean and there is no known blocker or in-progress work.

## 2026-09-02 — Shared Redis cache for /api/compare (commit `f1cd03a`)
- **Change**: Rewrote `lib/cache.ts` to use Upstash Redis (via `@upstash/redis`, connected through Vercel's Storage/Marketplace integration) as the cache backing `/api/compare`, instead of a plain in-memory `Map`. Falls back automatically to the old in-memory behavior if no Redis credentials are present (e.g. local dev without the integration connected), so the app never hard-depends on it. `getCached`/`setCached` are now async; the cache write in `app/api/compare/route.ts` is fire-and-forget so a slow/failed cache write never delays the response to the user.
- **Why**: The previous in-memory cache was explicitly documented as ineffective in production — Vercel runs multiple serverless instances, each with its own memory, so a "cache hit" was never guaranteed and most requests likely re-hit SerpApi anyway. A shared store makes repeat searches actually fast and actually cheaper (fewer SerpApi credits spent) across the whole deployment, not just within one lucky warm instance.
- **Files affected**: `lib/cache.ts`, `app/api/compare/route.ts`, `package.json` (new dependency `@upstash/redis`).
- **Notes**: Reads two possible env var name pairs — `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN` — since Vercel's Upstash marketplace integration can surface either. User connected the Upstash integration in the Vercel dashboard before this was pushed. **Not yet independently verified against production** — next step is confirming a repeat search actually hits Redis (not just the in-memory fallback) once deployed.

## 2026-09-04 — Custom domain: findlybeauty.com
- **Change**: Purchased `findlybeauty.com` through Vercel's own domain registrar (Storage/Domains tab) and connected it to the `findly` project. No code changed.
- **Why**: Requested — the app previously only had a `*.vercel.app` URL; a real branded domain was wanted for eventual public use.
- **Files affected**: none (Vercel/DNS configuration only).
- **Notes**: Verified live via direct `curl`/`dig` checks (not just the dashboard's "connected" status) — DNS resolves, HTTPS certificate is valid, and the page served is genuinely the Findly app (confirmed via page title/content), not a placeholder. The bare domain redirects to `https://www.findlybeauty.com`.

## 2026-09-04 — Supabase Auth updated for the new domain
- **Change**: Added `https://findlybeauty.com/**` and `https://www.findlybeauty.com/**` to Supabase Auth → URL Configuration → Redirect URLs, and updated the Site URL to match. No code changed.
- **Why**: Follow-up from the custom domain switch — the redirect allowlist previously only had the `*.vercel.app` URL, so magic-link sign-in would have failed on `findlybeauty.com`.
- **Files affected**: none (Supabase dashboard configuration only).
- **Notes**: Verified working via a real sign-in test on `https://findlybeauty.com`. **New minor gap introduced**: `http://localhost:3000/**` was dropped from the Redirect URLs list during this update, so local dev magic-link sign-in will fail until it's re-added — see `PROJECT_STATUS.md` → NEXT TASKS #1. Production is unaffected.
