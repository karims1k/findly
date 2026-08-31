import { isMarketplaceSource, matchRetailerBySource, REGIONS, type Region } from "./retailers";

const SERPAPI_BASE = "https://serpapi.com/search.json";

// No structured "condition" field exists on these store objects, so used
// items can only be caught heuristically via language in the listing
// title or offer details. This will miss some used listings and could in
// rare cases flag a legitimately-new item (e.g. a "refurbished packaging"
// promo) — a best-effort filter, not a guarantee.
const USED_ITEM_KEYWORDS = [
  "used", "pre-owned", "preowned", "pre owned", "second hand", "secondhand",
  "swatched", "refurbished", "worn",
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function storeDomain(link: string | undefined): string | null {
  if (!link) return null;
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function looksUsed(store: SerpApiStore): boolean {
  const text = [store.title, ...(store.details_and_offers ?? [])].filter(Boolean).join(" ").toLowerCase();
  return USED_ITEM_KEYWORDS.some((kw) => text.includes(kw));
}

// A store counts as the official brand site if its name or domain closely
// matches the product's own brand name (e.g. brand "Fenty Beauty" vs. store
// "Fenty Beauty" / domain "fentybeauty.com").
function isOfficialStore(store: SerpApiStore, brand: string | undefined): boolean {
  if (!brand) return false;
  const normBrand = normalize(brand);
  if (!normBrand) return false;

  const normName = store.name ? normalize(store.name) : "";
  if (normName && (normName.includes(normBrand) || normBrand.includes(normName))) return true;

  const domain = storeDomain(store.link);
  const normDomainLabel = domain ? normalize(domain.split(".")[0]) : "";
  if (normDomainLabel && (normDomainLabel.includes(normBrand) || normBrand.includes(normDomainLabel))) return true;

  return false;
}

interface SerpApiShoppingResult {
  source?: string;
  title?: string;
  thumbnail?: string;
  serpapi_immersive_product_api?: string;
}

interface SerpApiStore {
  name?: string;
  link?: string;
  title?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  extracted_price?: number;
  shipping?: string;
  total?: string;
  extracted_total?: number;
  details_and_offers?: string[];
}

interface SerpApiImmersiveResponse {
  error?: string;
  product_results?: {
    title?: string;
    brand?: string;
    stores?: SerpApiStore[];
  };
}

interface SerpApiShoppingResponse {
  error?: string;
  shopping_results?: SerpApiShoppingResult[];
}

export interface ComparisonRow {
  retailer: string;
  price: string | null;
  extractedPrice: number | null;
  rating: number | null;
  reviews: number | null;
  shipping: string | null;
  total: string | null;
  delivery: string | null;
  inStock: boolean | null;
  link: string | null;
  image: string | null;
  isOfficial: boolean;
  isMarketplace: boolean;
}

export interface CompareResult {
  query: string;
  region: Region;
  productTitle: string | null;
  rows: ComparisonRow[];
}

// Google Shopping groups every seller of "the same" product under one
// immersive-product page in some markets (US), but splits them into
// separate top-level entries in others (AE) — see build notes. So we
// collect every distinct immersive-product token among allowlisted matches
// and merge their store lists, rather than assuming one lookup covers
// everyone. Each lookup is a separate SerpApi credit on top of the initial
// search, so this is a coverage/cost tradeoff — kept low to leave headroom
// on the free tier (250 searches/month); raise it once on a paid plan.
const MAX_IMMERSIVE_LOOKUPS = 4;

function extractDelivery(offers: string[] | undefined): string | null {
  if (!offers) return null;
  return offers.find((o) => /delivery/i.test(o)) ?? null;
}

function extractInStock(offers: string[] | undefined): boolean | null {
  if (!offers) return null;
  if (offers.some((o) => /out of stock/i.test(o))) return false;
  if (offers.some((o) => /in stock/i.test(o))) return true;
  return null;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SerpApi request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function compareProduct(query: string, region: Region, apiKey: string): Promise<CompareResult> {
  const searchUrl = new URL(SERPAPI_BASE);
  searchUrl.searchParams.set("engine", "google_shopping");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(REGIONS[region].serpapiParams)) {
    searchUrl.searchParams.set(key, value);
  }

  const searchData = await fetchJson<SerpApiShoppingResponse>(searchUrl);
  if (searchData.error) {
    throw new Error(`SerpApi error: ${searchData.error}`);
  }

  const results = searchData.shopping_results ?? [];
  // The allowlist is used only to pick trustworthy *seed* listings for the
  // immersive-product lookup below — Google groups the same real-world item
  // under several different "canonical product" pages, and seeding from a
  // sketchy listing can land on a junk grouping (verified: a reseller-seeded
  // lookup returned eBay/Depop mixed with spam instead of real retailers).
  // Seeding from a known legitimate retailer reliably lands on the clean
  // grouping, which itself includes the official brand site and other
  // legitimate sellers Google groups there — so the allowlist does NOT gate
  // which stores get shown, only which grouping gets fetched. Marketplace
  // platforms (eBay, Depop, ...) are also seeded from opportunistically,
  // whenever Google lists one of them directly — this surfaces them for
  // products where they're a primary listing (rare/discontinued items)
  // without forcing extra lookups for every search.
  const matched = results.filter(
    (r) => matchRetailerBySource(r.source, region) !== null || isMarketplaceSource(r.source)
  );

  // The flat search results carry each listing's own submitted product
  // image (distinct per listing, sourced from their Google Merchant feed) —
  // capture it here since the immersive-product lookup below doesn't carry
  // a per-store image, only a shared product gallery. Pulled from the full
  // unfiltered result set (not just `matched`) since we now show stores
  // beyond the seed allowlist, e.g. the official brand site. Names between
  // the two calls don't always match exactly (flat result says
  // "fentybeauty.com", immersive store says "Fenty Beauty"), so this is
  // matched fuzzily rather than by exact key.
  const imageCandidates: { key: string; thumbnail: string }[] = [];
  for (const r of results) {
    if (r.source && r.thumbnail) {
      imageCandidates.push({ key: normalize(r.source), thumbnail: r.thumbnail });
    }
  }

  function findImage(storeName: string): string | null {
    const key = normalize(storeName);
    const exact = imageCandidates.find((c) => c.key === key);
    if (exact) return exact.thumbnail;
    const fuzzy = imageCandidates.find((c) => c.key.includes(key) || key.includes(c.key));
    return fuzzy?.thumbnail ?? null;
  }

  const uniqueImmersiveUrls = [
    ...new Set(matched.map((r) => r.serpapi_immersive_product_api).filter((u): u is string => !!u)),
  ].slice(0, MAX_IMMERSIVE_LOOKUPS);

  let productTitle: string | null = null;
  let brand: string | undefined;
  const allStores: SerpApiStore[] = [];

  const immersiveResponses = await Promise.allSettled(
    uniqueImmersiveUrls.map((rawUrl) => {
      const url = new URL(rawUrl);
      url.searchParams.set("api_key", apiKey);
      return fetchJson<SerpApiImmersiveResponse>(url);
    })
  );

  for (const settled of immersiveResponses) {
    if (settled.status !== "fulfilled" || settled.value.error) continue;
    const productResults = settled.value.product_results;
    if (!productResults) continue;
    productTitle ??= productResults.title ?? null;
    brand ??= productResults.brand;
    allStores.push(...(productResults.stores ?? []));
  }

  const cheapestPerStore = new Map<string, ComparisonRow>();
  for (const store of allStores) {
    if (!store.name || looksUsed(store)) continue;

    const key = normalize(store.name);
    const row: ComparisonRow = {
      retailer: store.name,
      price: store.price ?? null,
      extractedPrice: store.extracted_price ?? null,
      rating: store.rating ?? null,
      reviews: store.reviews ?? null,
      shipping: store.shipping ?? null,
      total: store.total ?? null,
      delivery: extractDelivery(store.details_and_offers),
      inStock: extractInStock(store.details_and_offers),
      link: store.link ?? null,
      image: findImage(store.name),
      isOfficial: isOfficialStore(store, brand),
      isMarketplace: isMarketplaceSource(store.name),
    };

    const existing = cheapestPerStore.get(key);
    const existingPrice = existing?.extractedPrice ?? Infinity;
    const newPrice = row.extractedPrice ?? Infinity;
    if (!existing || newPrice < existingPrice) {
      cheapestPerStore.set(key, row);
    }
  }

  const candidates = [...cheapestPerStore.values()];

  // Widely-carried generic products (e.g. drugstore skincare) can pull in a
  // long tail of regional resellers, some of which price-gouge far above
  // the going rate (observed: a reseller at 5-10x the price of every other
  // listing for the same item). There's no "verified seller" signal to
  // check, so this is a blunt but effective guard: drop anything priced
  // more than 3x the median of the group. Median (not min) so a single
  // unusually cheap or expensive listing can't skew the cutoff itself.
  const prices = candidates
    .map((r) => r.extractedPrice)
    .filter((p): p is number => p !== null && Number.isFinite(p))
    .sort((a, b) => a - b);
  const median = prices.length
    ? prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[(prices.length - 1) / 2]
    : null;
  const priceCeiling = median !== null ? median * 3 : null;

  const rows = candidates
    .filter((r) => priceCeiling === null || r.extractedPrice === null || r.extractedPrice <= priceCeiling)
    .sort((a, b) => (a.extractedPrice ?? Infinity) - (b.extractedPrice ?? Infinity));

  return { query, region, productTitle, rows };
}
