# PROJECT_STATUS.md — Findly

**This file is the source of truth for "where things stand right now."** Read this before continuing any work, especially after a context compaction or a new session. If this file and your memory of the conversation disagree, trust this file (and the code) over the conversation.

Last verified against the actual codebase: 2026-09-02.

## CURRENT OBJECTIVE
Performance work: swapped `lib/cache.ts`'s per-instance in-memory cache for a shared Upstash Redis cache (commit `f1cd03a`), so repeat `/api/compare` searches are actually fast/cheap across all of Vercel's serverless instances, not just one lucky warm one. Code is pushed and the user has connected the Upstash integration in the Vercel dashboard, but **this has not yet been independently verified against production** — the next step is confirming a repeat search actually hits Redis rather than silently falling back to the old in-memory behavior.

## COMPLETED
- Core price-comparison engine (`lib/compare.ts`): SerpApi-backed search, single-vs-browse mode detection via title clustering, used-item filter, price-outlier filter, official-store detection, marketplace tagging.
- Category scoping (`lib/category.ts`) with a `trusted` bypass for internal drill-down/photo queries.
- Shared Upstash Redis cache (falls back to in-memory if not configured) + HTTP `Cache-Control` edge caching on `/api/compare`.
- Region system (US / AE / WORLDWIDE) with per-region currency and retailer allowlist (`lib/retailers.ts`).
- "Local" vs "Worldwide" region toggle, driven by client-side IP geolocation (`ipapi.co`), with graceful fallback and `localStorage` caching.
- Currency conversion to the visitor's local currency, display-only, across all result views (`lib/currency.ts`).
- Photo search via SerpApi Image API + Google Lens (`type=products`) — finds close-but-similar alternatives, not just the exact item (`lib/lens.ts`).
- Category browse UX: 4 hero category cards (Makeup, Perfume, Skincare, Beauty Accessories) + 12 "more to explore" chips, all wired to the same search/browse pipeline.
- Email magic-link authentication via Supabase (`AuthWidget.tsx`, `proxy.ts`, `app/auth/callback/route.ts`).
- **Favorites/wishlist feature**: `favorites` table in Supabase with RLS policies scoped to `auth.uid()` (`supabase/migrations/001_favorites.sql`), `lib/favorites.ts` (list/add/remove), heart-toggle buttons on single-product results and browse-grid cards, a "♥ Favorites" header link, and a "My Favorites" view with a "Compare" action per saved item. **Verified end-to-end by the user**: sign in → save from both a browse card and a single-product result → confirmed both listed in "My Favorites" → removed one via the list and one via the heart toggle → confirmed removal persisted after refresh.
- Custom logo (`components/Logo.tsx`) + generated favicon/apple-touch-icon (`app/icon.tsx`, `app/apple-icon.tsx`).
- Full visual redesign: warm dusty-rose/cream palette + Playfair Display serif, replacing the earlier vivid fuchsia/purple/Baloo-2 look, built from a supplied reference mockup.
- Bug fix: drill-down clicks from browse grids no longer get wrongly rejected by the category-scope filter (the `trusted=1` bypass), and the UI no longer shows the "Browse categories" tiles overlapping an active error message.
- Bug fix: the app no longer inherits the OS's dark-mode setting — a leftover `prefers-color-scheme: dark` override was making the background go near-black on dark-mode systems, even though the redesign was built to match one fixed light reference mockup. `dark:` Tailwind variants are now globally neutralized (see `CLAUDE.md` → UI rules).
- Official store(s) are now pinned to the top of single-product comparison results regardless of sort mode, with the remaining rows sorted by the active criterion (price/rating/delivery) beneath them.
- Deployed to Vercel (Pro plan) from GitHub `karims1k/findly`, auto-deploy on push to `main`.

## IN PROGRESS
Working tree is clean; the Redis-cache change is committed and pushed to `main` (`f1cd03a`). **Not yet verified**: that production is actually using Redis (vs. silently falling back to in-memory) — see CURRENT OBJECTIVE.

## NEXT TASKS
1. **Verify the Redis cache is actually being hit in production** — repeat the same search twice against the live URL and confirm the second is fast/doesn't re-bill SerpApi; check Upstash's dashboard for command activity as a second signal.
2. Also being discussed: swapping the `lib/category.ts` keyword/brand list for an LLM-based classifier, to close the whole class of category-scope false-rejection bugs rather than continuing to patch the keyword list. Not started — proposed, not yet agreed to.
3. Fix the silent-failure gap: `/auth/callback` redirects to `/?authError=1` on a failed magic-link exchange, but nothing in `page.tsx` reads that param — a failed sign-in currently shows nothing to the user.
4. Set up a real transactional email provider (e.g. Resend) in Supabase's Auth settings — the default built-in sender's rate limit was hit repeatedly during development and will not hold up for real users.
5. Consider whether SerpApi's free tier (250 searches/month) is sufficient, or whether a paid tier is needed before real traffic — one comparison can cost up to 5 SerpApi credits.

## KNOWN BUGS
- **Silent auth failure**: see NEXT TASKS #2. Not yet fixed.
- **Category-scope false rejections remain possible** for freely-typed search-box queries or category-chip clicks with unusual product titles — the `trusted` bypass only covers internally-originated queries (browse-grid drill-downs, photo search), by design. This is a heuristic limitation, not something with a clean fix (see `CLAUDE.md` → Important business logic #7).
- **Single/browse mode detection can misfire** on closely-related product-line variants (e.g. "Gloss Bomb" vs "Gloss Bomb Heat") — heuristic clustering, not a hard bug, but a known source of occasionally-odd results.
- **Delivery-speed data is sparse for the AE/local market** — Google's Shopping index for the UAE locale carries far fewer delivery estimates than the US one. Not fixable from our side; it's a data-availability gap.
- **Used-item filter can miss used listings** that don't use any of its trigger keywords (heuristic, no structured "condition" field exists to check instead).

## BLOCKERS
None. Working tree is clean; all work is committed and pushed. The Redis cache specifically is pushed but not yet independently verified live (see NEXT TASKS #1).

## RECENT CHANGES
(See `CHANGELOG.md` for full dated detail. Most recent first, summarized:)
- Swapped the in-memory `/api/compare` cache for a shared Upstash Redis cache (falls back to in-memory if unconfigured). — committed (`f1cd03a`), not yet independently verified live
- Docs synced to reflect `29edae2` being pushed and the live deployment being confirmed working. — committed (`1d10f6d`)
- Official store(s) pinned to the top of single-product comparison results, with the rest sorted by the active sort mode beneath them. — committed (`29edae2`)
- Fixed: the app no longer follows the OS's dark-mode setting (a leftover template override was turning the background near-black); the light cream/dusty-rose design is now always shown. — committed (`29edae2`)
- Favorites/wishlist feature: Supabase `favorites` table + RLS, heart-toggle save/remove on results, "My Favorites" view. Verified end-to-end by the user. — committed (`29edae2`)
- Full visual redesign to a warm dusty-rose/cream/serif "editorial beauty brand" identity, replacing the earlier vivid fuchsia/purple/Baloo-2 look, built to match a supplied reference mockup. Added a 4th category ("Beauty Accessories") with real sourced product images baked into the `CATEGORIES` array, and a 3-item trust-badge footer. — committed (`29edae2`)
- Fixed: browse-grid drill-down clicks could get wrongly rejected as "out of scope" (category-scope keyword filter false-negative on real product titles); fixed via a `trusted=1` bypass for internally-originated queries. Also fixed the UI showing category tiles and an error message simultaneously. — committed (`29edae2`)
- Performance pass: HTTP `Cache-Control` edge caching on `/api/compare`, `localStorage` caching for geo-detection and exchange rates, lazy-loaded result images. Category list expanded from 3 to 15 (3 hero + 12 chips). — committed (`415ed20` and earlier — verify exact commit if needed via `git log`)
- Photo search rebuilt to find close-but-similar alternatives (incl. Shein) instead of one exact-match guess; all prices converted to the visitor's local currency. — committed
- Email magic-link auth (Supabase), new logo/favicon, animated background, brand/category browsing (single-vs-browse mode split). — committed
- Original build: SerpApi-based comparison engine, region system, category scoping, caching, deployment to Vercel. — committed

## IMPORTANT DECISIONS
See `CLAUDE.md` → "Important decisions made during development" for the condensed list, and `CHANGELOG.md` for full detail with dates. The single most important one for future-you: **the retailer allowlist in `lib/retailers.ts` is a seed selector, not an output filter** — this was gotten wrong once already (silently hid official brand sites and third-party sellers) and fixed; do not revert it. Also worth knowing: **favorites save the product (title + region + image), never a frozen price** — viewing favorites always re-runs a live comparison, since prices change constantly. And: **`lib/cache.ts` degrades silently** — if the Upstash env vars are ever missing/wrong, the app keeps working via the in-memory fallback with no visible error, so a caching regression won't show up as a bug report, only as worse performance/cost. Check Upstash's own dashboard, not just app behavior, if cache effectiveness is ever in question.

## TESTING STATUS
No automated test suite. All verification so far has been:
- `npx tsc --noEmit` and `npm run lint` — **re-confirmed clean on 2026-09-02** after the Redis-cache change (and, before that, the favorites feature, dark-mode fix, and official-store sort change), all of which are now committed and pushed.
- Manual Playwright scripts in `dev-scripts/*.mjs`, run against a local `npm run dev` server and inspected via screenshots. These are not wired into any CI and won't run automatically.
- **Favorites feature specifically was verified live by the user** (not just scripted): signed in via real magic link, saved favorites from both a browse card and a single-product result, confirmed both in "My Favorites," removed one via each of the two remove paths, confirmed removal persisted after a refresh.
- **The production deployment was confirmed working by the user** after the redesign/favorites push (not just a successful build) — the explicit signal was "all good."
- **The Redis cache change has only been verified locally** (confirmed the code falls back gracefully to in-memory when no Redis env vars are present) — **not yet verified against production** now that the user has connected Upstash. See NEXT TASKS #1.
**Action for next session**: the type-check/lint are current, but re-run them again if you make any further edits before pushing — don't assume this confirmation stays valid across new changes.

## DEPLOYMENT STATUS
- Production: Vercel project `findly` (Pro plan), connected to GitHub `karims1k/findly` branch `main`, auto-deploy on push.
- **Live and confirmed working** as of 2026-09-02 through commit `4801a5f` — includes the full redesign, the favorites feature (backed by the live Supabase `favorites` table), the dark-mode fix, the official-store sort order, and the earlier category-scope/UI-overlap bug fix. Confirmed directly by the user against the production URL, not just inferred from a successful build.
- Commit `f1cd03a` (Redis cache) is pushed and should auto-deploy, but **has not yet been independently confirmed live** — see NEXT TASKS #1 and TESTING STATUS.
- Upstash Redis integration was connected by the user via the Vercel dashboard's Storage tab on 2026-09-02.
- Environment variables (`SERPAPI_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set in Vercel's dashboard already (confirmed working).
- Supabase Auth redirect URLs include both the local dev URL and the production URL (confirmed working — magic-link sign-in was tested end-to-end).
