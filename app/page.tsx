"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComparisonRow } from "@/lib/compare";
import { REGIONS, resolveLocalRegion, type Region } from "@/lib/retailers";

type LocationMode = "local" | "worldwide";

interface DetectedCountry {
  code: string;
  name: string;
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

interface ApiResponse {
  query: string;
  region: Region;
  productTitle: string | null;
  rows: ComparisonRow[];
  error?: string;
}

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

export default function Home() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [locationMode, setLocationMode] = useState<LocationMode>("local");
  const [detectedCountry, setDetectedCountry] = useState<DetectedCountry | null>(null);
  const [geoStatus, setGeoStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    detectCountry().then((country) => {
      if (cancelled) return;
      setDetectedCountry(country);
      setGeoStatus(country ? "done" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const localRegion = resolveLocalRegion(detectedCountry?.code);
  const region: Region = locationMode === "worldwide" ? "WORLDWIDE" : localRegion;
  const isLocalUnsupported = locationMode === "local" && geoStatus === "done" && localRegion === "WORLDWIDE";

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoMatch, setPhotoMatch] = useState<{ raw: string; thumbnail: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoMatch(null);

    try {
      const resized = await resizeImageForUpload(file);
      const formData = new FormData();
      formData.append("image", resized, "photo.jpg");
      const res = await fetch("/api/lens", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data.error ?? "Couldn't identify that photo");
      } else {
        setQuery(data.guess);
        setPhotoMatch({ raw: data.raw, thumbnail: data.thumbnail });
      }
    } catch {
      setPhotoError("Could not process that image");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading || photoBusy) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/compare?q=${encodeURIComponent(query)}&region=${region}`);
      const data: ApiResponse = await res.json();
      if (requestId !== requestIdRef.current) return; // a newer search superseded this one
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
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
    if (!result) return [];
    const rows = [...result.rows];
    switch (sortKey) {
      case "price":
        return rows.sort((a, b) => (a.extractedPrice ?? Infinity) - (b.extractedPrice ?? Infinity));
      case "rating":
        return rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      case "delivery":
        return rows.sort((a, b) => Number(!!b.delivery) - Number(!!a.delivery));
      default:
        return rows;
    }
  }, [result, sortKey]);

  const cheapestPrice = sortedRows.length
    ? Math.min(...sortedRows.map((r) => r.extractedPrice ?? Infinity))
    : null;

  return (
    <div className="flex flex-1 justify-center bg-white dark:bg-zinc-950">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            Findly
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Makeup, perfume &amp; skincare only — find the best price, delivery, and reviews across retailers.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-md shadow-zinc-900/5 sm:flex-row dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white pr-2 focus-within:border-fuchsia-400 focus-within:ring-2 focus-within:ring-fuchsia-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-within:ring-fuchsia-900">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Fenty Beauty Gloss Bomb Universal Lip Luminizer"
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-black outline-none dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoBusy}
                title="Search by photo"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg transition-colors hover:bg-fuchsia-50 disabled:opacity-50 dark:hover:bg-fuchsia-950"
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
            <div className="flex shrink-0 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-950">
              {(["local", "worldwide"] as LocationMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLocationMode(m)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    locationMode === m
                      ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-sm"
                      : "text-zinc-600 hover:text-fuchsia-600 dark:text-zinc-300"
                  }`}
                >
                  {m === "local" ? "📍 Local" : "🌍 Worldwide"}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={loading || photoBusy}
              className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-600/30 transition-transform hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "Searching…" : "Compare"}
            </button>
          </form>

          {locationMode === "local" && (
            <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
              {geoStatus === "loading" && "Detecting your location…"}
              {geoStatus === "error" &&
                "Couldn't detect your location — showing worldwide retailers instead."}
              {geoStatus === "done" && !isLocalUnsupported && `Showing ${REGIONS[localRegion].label} retailers.`}
              {geoStatus === "done" && isLocalUnsupported &&
                `We don't have a curated retailer list for ${detectedCountry?.name} yet — showing worldwide retailers instead.`}
            </p>
          )}

          {photoMatch && (
            <div className="flex items-center gap-3 rounded-xl bg-fuchsia-50 px-4 py-2 text-xs text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200">
              {photoMatch.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoMatch.thumbnail} alt="" className="h-8 w-8 rounded-md object-cover" />
              )}
              <span>
                Matched from your photo: <span className="font-medium">{photoMatch.raw}</span> — edit the search
                above if that&apos;s not quite right.
              </span>
              <button
                type="button"
                onClick={() => setPhotoMatch(null)}
                className="ml-auto shrink-0 text-fuchsia-400 hover:text-fuchsia-700 dark:hover:text-fuchsia-100"
              >
                ×
              </button>
            </div>
          )}

          {photoError && (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {photoError}
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {result && result.rows.length === 0 && !error && (
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            No listings found among supported retailers for &quot;{result.query}&quot;.
          </p>
        )}

        {result && result.rows.length > 0 && (
          <div className="flex flex-col gap-4">
            {result.productTitle && (
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{result.productTitle}</h2>
            )}

            <div className="flex gap-2 text-xs">
              <span className="self-center font-medium text-zinc-500 dark:text-zinc-400">Sort by</span>
              {(["price", "rating", "delivery"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`rounded-full px-3.5 py-1.5 font-medium capitalize transition-all ${
                    sortKey === key
                      ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md shadow-fuchsia-600/25"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:border-fuchsia-200 hover:text-fuchsia-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{row.price ?? "n/a"}</div>
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
                          className="shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-fuchsia-600/25 transition-transform hover:scale-105"
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
