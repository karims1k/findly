"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ComparisonRow, SearchResult } from "@/lib/compare";
import { REGIONS, resolveLocalRegion, type Region } from "@/lib/retailers";
import { convertAmount, currencyForCountry, fetchExchangeRates, formatCurrency } from "@/lib/currency";
import { addFavorite, listFavorites, removeFavorite, type Favorite } from "@/lib/favorites";
import { createClient } from "@/lib/supabase/client";
import AuthWidget from "@/components/AuthWidget";
import Logo from "@/components/Logo";

function favoriteKey(productTitle: string, region: Region): string {
  return `${region}:${productTitle}`;
}

// Converts a price into the visitor's local currency for display when
// exchange rates are available; falls back to the original formatted
// string (still correct, just not localized) if rates are missing or the
// currency pair isn't in the rate table.
function displayPrice(
  extractedPrice: number | null,
  sourceCurrency: string,
  fallback: string | null,
  localCurrency: string,
  rates: Record<string, number> | null
): string {
  if (extractedPrice === null) return fallback ?? "n/a";
  if (sourceCurrency === localCurrency) return fallback ?? formatCurrency(extractedPrice, sourceCurrency);
  if (!rates) return fallback ?? formatCurrency(extractedPrice, sourceCurrency);
  const converted = convertAmount(extractedPrice, sourceCurrency, localCurrency, rates);
  if (converted === null) return fallback ?? formatCurrency(extractedPrice, sourceCurrency);
  return formatCurrency(converted, localCurrency);
}

type LocationMode = "local" | "worldwide";

interface DetectedCountry {
  code: string;
  name: string;
}

// Both the geo-detect and exchange-rate lookups hit third-party APIs with
// tight rate limits (we've hit ipapi.co's ourselves during testing) and
// don't change quickly — location is stable for a session, rates update
// once a day. Caching them per-browser means a repeat visit skips both
// network calls entirely instead of blocking on them again.
function readLocalCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, savedAt } = JSON.parse(raw);
    if (typeof savedAt !== "number" || Date.now() - savedAt > maxAgeMs) return null;
    return value as T;
  } catch {
    return null;
  }
}

function writeLocalCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // private browsing, storage quota, etc. — safe to ignore
  }
}

async function detectCountry(): Promise<DetectedCountry | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.country_code) return null;
    return { code: data.country_code, name: data.country_name ?? data.country_code };
  } catch {
    return null;
  }
}

const MAX_UPLOAD_BYTES = 500 * 1024;

async function resizeImageForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let lastBlob: Blob | null = null;
  for (const quality of [0.75, 0.6, 0.45, 0.3]) {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) continue;
    lastBlob = blob;
    if (blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  if (!lastBlob) throw new Error("Could not process that image");
  return lastBlob;
}

type SortKey = "price" | "rating" | "delivery";

type ApiResponse = SearchResult | { error: string };

const RETAILER_COLORS: Record<string, string> = {
  Sephora: "from-rose-500 to-pink-600",
  "Ulta Beauty": "from-orange-400 to-rose-500",
  Amazon: "from-amber-400 to-orange-500",
  "Amazon.ae": "from-amber-400 to-orange-500",
  Target: "from-red-500 to-rose-600",
  Nordstrom: "from-slate-600 to-slate-800",
  "Macy's": "from-red-600 to-red-800",
  "Kohl's": "from-sky-500 to-blue-600",
  Noon: "from-yellow-400 to-amber-500",
  "Sephora UAE": "from-rose-500 to-pink-600",
  Namshi: "from-teal-400 to-cyan-600",
  Faces: "from-fuchsia-500 to-purple-600",
  "6thstreet": "from-emerald-400 to-teal-600",
};

function retailerGradient(name: string) {
  return RETAILER_COLORS[name] ?? "from-fuchsia-500 to-purple-600";
}

const CATEGORIES = [
  {
    label: "Makeup",
    query: "makeup",
    subtitle: "Foundations, lips, eyes and more.",
    image:
      "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcSOP3o8B6eFLBpIJAue9GjRwe8lKQxh3E8A_z_48rzXLWw9zSgrwHMLKAhVezvC0N9CAEkuuMkG9reje4BEIL3hWK47cqLs",
  },
  {
    label: "Perfume",
    query: "perfume",
    subtitle: "Luxury & niche fragrances for every mood.",
    image:
      "https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcQbue6zQkeMKWDvPFSsUDLpqj9p0PSffEy_eFI4zI2b2AfGQBo_7glxDwbCfxKVywwawJ8AJ9q-wa1MjMM3tT_0u42IepLq4g",
  },
  {
    label: "Skincare",
    query: "skincare",
    subtitle: "Serums, moisturizers and skincare essentials.",
    image:
      "https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcQL68Sll87p7t77rTouS4yPR4H9sxHvZqmBu2EHWOWRJhQhZTGoSMK28lX6u6trK37EndaAJ4b3P6w7CLBFKJ2FdAcHdlZcqmvS9BXv7V9m4nzQ35hU7T6GCQ",
  },
  {
    label: "Beauty Accessories",
    query: "makeup brush set",
    subtitle: "Brushes, tools and beauty must-haves.",
    image:
      "https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQDmW8YdpW_BvxPS2xO6oMum8N29SpXDDrgzbhHXmH3kx23GXrj1lQY4MSiBvvjarkXR9PH2C_MHwq9cu4EATEQmPp2KRPSZw",
  },
];

const MORE_CATEGORIES = [
  { label: "Lipstick", query: "lipstick", icon: "💋" },
  { label: "Foundation", query: "foundation", icon: "✨" },
  { label: "Mascara & Eyes", query: "mascara", icon: "👁️" },
  { label: "Nail Polish", query: "nail polish", icon: "💅" },
  { label: "Cologne", query: "cologne", icon: "🌿" },
  { label: "Body Mist", query: "body mist", icon: "🌊" },
  { label: "Moisturizer", query: "moisturizer", icon: "💧" },
  { label: "Serum", query: "serum", icon: "🧪" },
  { label: "Sunscreen", query: "sunscreen", icon: "☀️" },
  { label: "Cleanser", query: "cleanser", icon: "🧼" },
  { label: "Face Mask", query: "face mask", icon: "🧖" },
  { label: "Hair Care", query: "shampoo", icon: "💆" },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [locationMode, setLocationMode] = useState<LocationMode>("local");
  const [detectedCountry, setDetectedCountry] = useState<DetectedCountry | null>(null);
  const [geoStatus, setGeoStatus] = useState<"loading" | "done" | "error">("loading");
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Reading localStorage and calling setState synchronously in an effect
    // body isn't allowed (React flags it as a footgun), so the cache check
    // is deferred a microtask via .then() — same shape as the async fetch
    // path below, just effectively instant instead of a network round trip.
    Promise.resolve().then(() => {
      if (cancelled) return;
      const cachedCountry = readLocalCache<DetectedCountry>("findly:geo", 6 * 60 * 60 * 1000);
      if (cachedCountry) {
        setDetectedCountry(cachedCountry);
        setGeoStatus("done");
      } else {
        detectCountry().then((country) => {
          if (cancelled) return;
          setDetectedCountry(country);
          setGeoStatus(country ? "done" : "error");
          if (country) writeLocalCache("findly:geo", country);
        });
      }
    });

    Promise.resolve().then(() => {
      if (cancelled) return;
      const cachedRates = readLocalCache<Record<string, number>>("findly:rates", 12 * 60 * 60 * 1000);
      if (cachedRates) {
        setRates(cachedRates);
      } else {
        fetchExchangeRates().then((r) => {
          if (cancelled) return;
          setRates(r);
          if (r) writeLocalCache("findly:rates", r);
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const localRegion = resolveLocalRegion(detectedCountry?.code);
  const region: Region = locationMode === "worldwide" ? "WORLDWIDE" : localRegion;
  const isLocalUnsupported = locationMode === "local" && geoStatus === "done" && localRegion === "WORLDWIDE";
  const localCurrency = currencyForCountry(detectedCountry?.code);

  // Tracked independently of AuthWidget (which manages its own sign-in UI)
  // since the results view needs to know whether to show save/heart
  // buttons at all — kept as a separate subscription rather than lifting
  // AuthWidget's state up, to avoid coupling the two components.
  const [user, setUser] = useState<User | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesList, setFavoritesList] = useState<Favorite[] | null>(null);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setFavoriteKeys(new Set());
        setFavoritesList(null);
        setShowFavorites(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    listFavorites()
      .then((favs) => setFavoriteKeys(new Set(favs.map((f) => favoriteKey(f.productTitle, f.region)))))
      .catch(() => {
        /* non-critical — heart buttons just won't show pre-filled state */
      });
  }, [user]);

  async function toggleFavorite(productTitle: string, favRegion: Region, imageUrl: string | null) {
    if (!user) return;
    const key = favoriteKey(productTitle, favRegion);
    const alreadyFavorited = favoriteKeys.has(key);
    setFavoritesError(null);
    try {
      if (alreadyFavorited) {
        await removeFavorite(productTitle, favRegion);
        setFavoriteKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setFavoritesList((prev) => (prev ? prev.filter((f) => favoriteKey(f.productTitle, f.region) !== key) : prev));
      } else {
        await addFavorite(productTitle, favRegion, imageUrl);
        setFavoriteKeys((prev) => new Set(prev).add(key));
      }
    } catch {
      setFavoritesError("Couldn't update favorites. Please try again.");
    }
  }

  async function openFavorites() {
    setResult(null);
    setError(null);
    setShowFavorites(true);
    setFavoritesError(null);
    try {
      const favs = await listFavorites();
      setFavoritesList(favs);
    } catch {
      setFavoritesError("Couldn't load your favorites. Please try again.");
    }
  }

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const requestId = ++requestIdRef.current;
    setPhotoBusy(true);
    setPhotoError(null);
    setError(null);
    setResult(null);

    try {
      const resized = await resizeImageForUpload(file);
      const formData = new FormData();
      formData.append("image", resized, "photo.jpg");
      formData.append("region", region);
      const res = await fetch("/api/lens", { method: "POST", body: formData });
      const data: ApiResponse = await res.json();
      if (requestId !== requestIdRef.current) return; // a newer search superseded this one
      if (!res.ok || "error" in data) {
        setPhotoError("error" in data ? data.error : "Couldn't identify that photo");
      } else {
        setResult(data);
      }
    } catch {
      if (requestId === requestIdRef.current) setPhotoError("Could not process that image");
    } finally {
      if (requestId === requestIdRef.current) setPhotoBusy(false);
    }
  }

  async function handleSearch(e?: React.FormEvent, overrideQuery?: string, opts?: { trusted?: boolean }) {
    e?.preventDefault();
    const q = overrideQuery ?? query;
    if (!q.trim() || loading || photoBusy) return;
    if (overrideQuery !== undefined) setQuery(overrideQuery);

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowFavorites(false);

    try {
      // "Trusted" queries are exact product titles clicked from one of
      // our own browse grids — they only appear there because the parent
      // search already passed the category-scope check (or, for photo
      // search, came straight from a beauty-product photo). Real product
      // titles use marketing language ("Glaze", "Plumpgasm", ...) that a
      // fixed keyword list can't fully anticipate, so re-running that
      // check on a title we already trust was producing false rejections
      // — skip it here rather than for freely-typed search box queries.
      const trustedParam = opts?.trusted ? "&trusted=1" : "";
      const res = await fetch(`/api/compare?q=${encodeURIComponent(q)}&region=${region}${trustedParam}`);
      const data: ApiResponse = await res.json();
      if (requestId !== requestIdRef.current) return; // a newer search superseded this one
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Something went wrong");
      } else {
        setResult(data);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError("Network error — could not reach the comparison service");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  const sortedRows = useMemo(() => {
    if (!result || result.mode !== "single") return [];
    const compare: Record<SortKey, (a: ComparisonRow, b: ComparisonRow) => number> = {
      price: (a, b) => (a.extractedPrice ?? Infinity) - (b.extractedPrice ?? Infinity),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      delivery: (a, b) => Number(!!b.delivery) - Number(!!a.delivery),
    };
    const comparator = compare[sortKey];
    // Official store(s) always lead the list, regardless of sort mode —
    // everything else is ordered by the selected criterion beneath it.
    const official = result.rows.filter((r) => r.isOfficial).sort(comparator);
    const rest = result.rows.filter((r) => !r.isOfficial).sort(comparator);
    return [...official, ...rest];
  }, [result, sortKey]);

  const cheapestPrice = sortedRows.length
    ? Math.min(...sortedRows.map((r) => r.extractedPrice ?? Infinity))
    : null;

  function handleReset() {
    setResult(null);
    setError(null);
    setQuery("");
    setPhotoError(null);
    setShowFavorites(false);
  }

  return (
    <div className="relative flex flex-1 justify-center overflow-hidden bg-gradient-to-b from-cream to-blush dark:from-[#1f1310] dark:to-[#150d0b]">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="bg-blob absolute -top-24 -left-24 h-[26rem] w-[26rem] rounded-full bg-dustyrose/25 blur-3xl dark:bg-dustyrose/10"
          style={{ animation: "drift-a 26s ease-in-out infinite" }}
        />
      </div>

      <main className="relative z-10 flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <div className="flex items-center justify-end gap-3">
          {user && (
            <button
              type="button"
              onClick={openFavorites}
              className="flex items-center gap-1 text-xs font-medium text-dustyrose-dark transition-colors hover:text-brandbrown"
            >
              ♥ Favorites{favoriteKeys.size > 0 ? ` (${favoriteKeys.size})` : ""}
            </button>
          )}
          <AuthWidget />
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <Logo />
          <p className="text-sm text-brandbrown-light dark:text-zinc-400">
            Makeup, perfume &amp; skincare only — find the best price, delivery, and reviews across retailers.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <form onSubmit={handleSearch} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-dustyrose/25 bg-cardbg px-4 py-1 shadow-sm focus-within:border-dustyrose focus-within:ring-2 focus-within:ring-dustyrose/20 dark:border-zinc-700 dark:bg-zinc-900">
              <span aria-hidden className="text-brandbrown-light">
                🔍
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Fenty Beauty Gloss Bomb Universal Lip Luminizer"
                className="flex-1 bg-transparent px-3 py-3 text-sm text-black outline-none dark:text-zinc-50"
              />
              <span aria-hidden className="h-6 w-px bg-dustyrose/25 dark:bg-zinc-700" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoBusy}
                title="Search by photo"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg text-brandbrown-light transition-colors hover:bg-dustyrose/10 disabled:opacity-50"
              >
                {photoBusy ? "⏳" : "📷"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            <div className="flex rounded-full border border-dustyrose/25 bg-cardbg p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              {(["local", "worldwide"] as LocationMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLocationMode(m)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium capitalize transition-colors ${
                    locationMode === m
                      ? "bg-dustyrose text-white shadow-sm"
                      : "text-brandbrown-light hover:text-dustyrose-dark"
                  }`}
                >
                  {m === "local" ? "📍 Local" : "🌍 Worldwide"}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || photoBusy}
              className="w-full rounded-full bg-dustyrose px-6 py-3 text-sm font-semibold text-white shadow-md shadow-dustyrose/30 transition-transform hover:scale-[1.01] hover:bg-dustyrose-dark disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "Searching…" : "Compare Prices"}
            </button>
          </form>

          {locationMode === "local" && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-brandbrown-light dark:text-zinc-400">
              {geoStatus === "loading" && "Detecting your location…"}
              {geoStatus === "error" &&
                "Couldn't detect your location — showing worldwide retailers instead."}
              {geoStatus === "done" && !isLocalUnsupported && (
                <>
                  <span aria-hidden>🛡️</span>
                  {`Showing ${REGIONS[localRegion].label} retailers.`}
                </>
              )}
              {geoStatus === "done" && isLocalUnsupported &&
                `We don't have a curated retailer list for ${detectedCountry?.name} yet — showing worldwide retailers instead.`}
            </p>
          )}

          {photoError && (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {photoError}
            </p>
          )}
        </div>

        {!result && !loading && !error && !showFavorites && (
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-lg font-semibold text-brandbrown dark:text-zinc-100">
              Browse Categories
            </h2>
            <div className="flex flex-col gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.query}
                  type="button"
                  onClick={() => handleSearch(undefined, cat.query)}
                  className="flex items-center gap-4 rounded-2xl border border-dustyrose/15 bg-cardbg p-3 text-left shadow-sm transition-transform hover:scale-[1.01] hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-blush">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cat.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex-1">
                    <div className="font-serif text-lg font-semibold text-brandbrown dark:text-zinc-100">
                      {cat.label}
                    </div>
                    <p className="text-xs text-brandbrown-light dark:text-zinc-400">{cat.subtitle}</p>
                  </div>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dustyrose/15 text-dustyrose-dark"
                  >
                    →
                  </span>
                </button>
              ))}
            </div>

            <h2 className="mt-2 text-sm font-medium text-brandbrown-light dark:text-zinc-400">More to explore</h2>
            <div className="flex flex-wrap gap-2">
              {MORE_CATEGORIES.map((cat) => (
                <button
                  key={cat.query}
                  type="button"
                  onClick={() => handleSearch(undefined, cat.query)}
                  className="flex items-center gap-1.5 rounded-full border border-dustyrose/25 bg-cardbg px-4 py-2 text-sm font-medium text-brandbrown shadow-sm transition-colors hover:border-dustyrose hover:text-dustyrose-dark dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-dustyrose/15 pt-5 dark:border-zinc-800">
              {[
                { icon: "🏷️", title: "Best Prices", subtitle: "Compare across top retailers." },
                { icon: "🚚", title: "Delivery Estimates", subtitle: "See delivery speed before you buy." },
                { icon: "⭐", title: "Aggregated Ratings", subtitle: "Ratings sourced via Google Shopping." },
              ].map((badge) => (
                <div key={badge.title} className="flex flex-col items-center gap-1 text-center">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-dustyrose/15 text-base"
                  >
                    {badge.icon}
                  </span>
                  <span className="text-xs font-semibold text-brandbrown dark:text-zinc-200">{badge.title}</span>
                  <span className="text-[11px] text-brandbrown-light dark:text-zinc-500">{badge.subtitle}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(result || error || showFavorites) && (
          <button
            type="button"
            onClick={handleReset}
            className="flex w-fit items-center gap-1 text-sm font-medium text-dustyrose-dark transition-colors hover:text-brandbrown dark:text-fuchsia-400 dark:hover:text-fuchsia-300"
          >
            ← Back to categories
          </button>
        )}

        {showFavorites && (
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-lg font-semibold text-brandbrown dark:text-zinc-100">My Favorites</h2>

            {favoritesError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {favoritesError}
              </p>
            )}

            {favoritesList === null && !favoritesError && (
              <p className="text-center text-sm text-brandbrown-light dark:text-zinc-400">Loading favorites…</p>
            )}

            {favoritesList !== null && favoritesList.length === 0 && (
              <p className="text-center text-sm text-brandbrown-light dark:text-zinc-400">
                No favorites saved yet — tap the heart icon on any product to save it here.
              </p>
            )}

            {favoritesList !== null && favoritesList.length > 0 && (
              <div className="flex flex-col gap-3">
                {favoritesList.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex items-center gap-4 rounded-2xl border border-dustyrose/15 bg-cardbg p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-blush dark:bg-zinc-800">
                      {fav.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fav.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-bold text-dustyrose-dark">
                          {fav.productTitle.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brandbrown dark:text-zinc-100">
                        {fav.productTitle}
                      </p>
                      <p className="text-xs text-brandbrown-light dark:text-zinc-500">
                        Saved from {REGIONS[fav.region].label}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearch(undefined, fav.productTitle, { trusted: true })}
                      className="shrink-0 rounded-full bg-dustyrose px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-dustyrose-dark"
                    >
                      Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(fav.productTitle, fav.region, fav.imageUrl)}
                      title="Remove from favorites"
                      className="shrink-0 text-lg"
                    >
                      ❤️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {result && result.mode === "single" && result.rows.length === 0 && !error && (
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            No listings found among supported retailers for &quot;{result.query}&quot;.
          </p>
        )}

        {result && result.mode === "browse" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Results for &quot;{result.query}&quot;
            </h2>

            {result.products.length === 0 ? (
              <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                No products found among supported retailers for &quot;{result.query}&quot;.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {result.products.map((product, i) => {
                    const isFavorited = favoriteKeys.has(favoriteKey(product.title, result.region));
                    return (
                      <div
                        key={`${product.title}-${i}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSearch(undefined, product.title, { trusted: true })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") handleSearch(undefined, product.title, { trusted: true });
                        }}
                        className="relative flex cursor-pointer flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        {user && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(product.title, result.region, product.image);
                            }}
                            title={isFavorited ? "Remove from favorites" : "Save to favorites"}
                            className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm shadow-sm dark:bg-zinc-800/90"
                          >
                            {isFavorited ? "❤️" : "🤍"}
                          </button>
                        )}
                        <div className="aspect-square w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                          {product.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image}
                              alt={product.title}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-500 to-purple-600 text-2xl font-bold text-white">
                              {product.title.charAt(0)}
                            </div>
                          )}
                        </div>
                        <span className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {product.title}
                        </span>
                        <span className="text-sm font-bold text-dustyrose-dark dark:text-fuchsia-400">
                          {product.extractedPrice !== null
                            ? `From ${displayPrice(
                                product.extractedPrice,
                                product.currency ?? result.currency,
                                product.price,
                                localCurrency,
                                rates
                              )}`
                            : "See price"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
                  Tap a product to compare its price, delivery, and reviews across retailers.
                </p>
              </>
            )}
          </div>
        )}

        {result && result.mode === "single" && result.rows.length > 0 && (
          <div className="flex flex-col gap-4">
            {result.productTitle && (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{result.productTitle}</h2>
                {user && (
                  <button
                    type="button"
                    onClick={() =>
                      toggleFavorite(
                        result.productTitle as string,
                        result.region,
                        sortedRows.find((r) => r.image)?.image ?? null
                      )
                    }
                    title={
                      favoriteKeys.has(favoriteKey(result.productTitle as string, result.region))
                        ? "Remove from favorites"
                        : "Save to favorites"
                    }
                    className="text-lg"
                  >
                    {favoriteKeys.has(favoriteKey(result.productTitle as string, result.region)) ? "❤️" : "🤍"}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2 text-xs">
              <span className="self-center font-medium text-zinc-500 dark:text-zinc-400">Sort by</span>
              {(["price", "rating", "delivery"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`rounded-full px-3.5 py-1.5 font-medium capitalize transition-all ${
                    sortKey === key
                      ? "bg-dustyrose text-white shadow-md shadow-dustyrose/25"
                      : "border border-dustyrose/25 bg-cardbg text-brandbrown-light hover:border-dustyrose hover:text-dustyrose-dark dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {sortedRows.map((row) => {
                const isBestPrice = row.extractedPrice === cheapestPrice;
                return (
                  <div
                    key={row.retailer}
                    className={`flex flex-col gap-3 rounded-2xl p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${
                      row.isOfficial
                        ? "border-2 border-amber-300 bg-amber-50/50 shadow-amber-900/5 dark:border-amber-700 dark:bg-amber-950/20"
                        : "border border-zinc-200 bg-white shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                        {row.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image}
                            alt={row.retailer}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${retailerGradient(
                              row.retailer
                            )} text-sm font-bold text-white`}
                          >
                            {row.retailer.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{row.retailer}</span>
                          {row.isOfficial && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                              ✓ Official store
                            </span>
                          )}
                          {isBestPrice && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                              Best price
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {row.rating ? (
                            <span className="flex items-center gap-1 text-amber-500">
                              ★ {row.rating}
                              <span className="text-zinc-400 dark:text-zinc-500">
                                ({row.reviews?.toLocaleString() ?? 0})
                              </span>
                            </span>
                          ) : (
                            <span>No rating</span>
                          )}
                          {row.isMarketplace && (
                            <span
                              title="Sold by an individual seller — condition isn't independently verified"
                              className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            >
                              Marketplace seller
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:gap-8">
                      <div className="text-left sm:text-right">
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                          {displayPrice(row.extractedPrice, result.currency, row.price, localCurrency, rates)}
                        </div>
                        {row.shipping && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            +{row.shipping.replace(/^\+\s*/, "")} shipping
                          </div>
                        )}
                      </div>

                      <span
                        className={`hidden shrink-0 rounded-full px-3 py-1 text-xs font-medium sm:inline-block ${
                          row.delivery
                            ? "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {row.delivery ?? "Delivery unavailable"}
                      </span>

                      {row.link && (
                        <a
                          href={row.link}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="shrink-0 rounded-xl bg-dustyrose px-4 py-2 text-sm font-semibold text-white shadow-md shadow-dustyrose/25 transition-transform hover:scale-105 hover:bg-dustyrose-dark"
                        >
                          Buy
                        </a>
                      )}
                    </div>

                    {row.delivery && (
                      <span className="inline-block w-fit rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-700 sm:hidden dark:bg-teal-900/50 dark:text-teal-300">
                        {row.delivery}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
              Ratings and prices are sourced via Google Shopping and may not reflect real-time retailer data.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
