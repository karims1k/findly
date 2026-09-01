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

// For a browse grid, a source is worth displaying if it's a known
// retailer/marketplace, OR if it basically IS the thing being searched
// (e.g. searching "Fenty Beauty" and seeing a "Fenty Beauty" /
// "fentybeauty.com" source) — a brand's own catalog is inherently a
// legitimate source even though it's not in the curated retailer list.
function isBrowseCandidateSource(source: string | undefined, query: string, region: Region): boolean {
  if (!source) return false;
  if (matchRetailerBySource(source, region) !== null || isMarketplaceSource(source)) return true;

  const normSource = normalize(source);
  const normQuery = normalize(query);
  if (!normSource || !normQuery) return false;
  return normSource.includes(normQuery) || normQuery.includes(normSource);
}

interface SerpApiShoppingResult {
  source?: string;
  title?: string;
  thumbnail?: string;
  price?: string;
  extracted_price?: number;
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

export interface SingleResult {
  mode: "single";
  query: string;
  region: Region;
  productTitle: string | null;
  rows: ComparisonRow[];
}

export interface BrowseProduct {
  title: string;
  price: string | null;
  extractedPrice: number | null;
  image: string | null;
  source: string;
}

export interface BrowseResult {
  mode: "browse";
  query: string;
  region: Region;
  products: BrowseProduct[];
}

export type SearchResult = SingleResult | BrowseResult;

// Google Shopping groups every seller of "the same" product under one
// immersive-product page in some markets (US), but splits them into
// separate top-level entries in others (AE) — see build notes. So we
// collect every distinct immersive-product token among allowlisted matches
// and merge their store lists, rather than assuming one lookup covers
// everyone. Each lookup is a separate SerpApi credit on top of the initial
// search, so this is a coverage/cost tradeoff — kept low to leave headroom
// on the free tier (250 searches/month); raise it once on a paid plan.
const MAX_IMMERSIVE_LOOKUPS = 4;

// A query can return either "one product, many sellers" (e.g. an exact
// product name) or "many different products" (e.g. a bare brand or
// category name like "Fenty Beauty" or "makeup"). There's no field that
// says which — it has to be inferred from how similar the result titles
// are to each other. Titles are clustered by word overlap; if the biggest
// cluster covers most of the results, treat it as one product (existing
// price-comparison flow). Otherwise, it's a browse: show each cluster as
// its own product card instead of forcing them into one bogus comparison.
const TITLE_SIMILARITY_THRESHOLD = 0.5;
const MIN_RESULTS_FOR_BROWSE_CHECK = 4;
const DOMINANT_CLUSTER_SHARE_FOR_SINGLE = 0.5;
const MAX_BROWSE_PRODUCTS = 12;

function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function clusterByTitle(entries: SerpApiShoppingResult[]): SerpApiShoppingResult[][] {
  const clusters: { key: Set<string>; items: SerpApiShoppingResult[] }[] = [];
  for (const entry of entries) {
    if (!entry.title) continue;
    const words = titleWords(entry.title);
    const match = clusters.find((c) => jaccard(c.key, words) >= TITLE_SIMILARITY_THRESHOLD);
    if (match) {
      match.items.push(entry);
    } else {
      clusters.push({ key: words, items: [entry] });
    }
  }
  return clusters.map((c) => c.items).sort((a, b) => b.length - a.length);
}

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

function buildBrowseResult(clusters: SerpApiShoppingResult[][], query: string, region: Region): BrowseResult {
  const products: BrowseProduct[] = clusters.slice(0, MAX_BROWSE_PRODUCTS).map((cluster) => {
    const cheapest = cluster.reduce((best, r) =>
      (r.extracted_price ?? Infinity) < (best.extracted_price ?? Infinity) ? r : best
    );
    return {
      title: cheapest.title ?? query,
      price: cheapest.price ?? null,
      extractedPrice: cheapest.extracted_price ?? null,
      image: cheapest.thumbnail ?? null,
      source: cheapest.source ?? "",
    };
  });
  return { mode: "browse", query, region, products };
}

async function buildSingleResult(
  query: string,
  region: Region,
  apiKey: string,
  clusterEntries: SerpApiShoppingResult[]
): Promise<SingleResult> {
  // The flat search results carry each listing's own submitted product
  // image (distinct per listing, sourced from their Google Merchant feed) —
  // capture it here since the immersive-product lookup below doesn't carry
  // a per-store image, only a shared product gallery. Names between the two
  // calls don't always match exactly (flat result says "fentybeauty.com",
  // immersive store says "Fenty Beauty"), so this is matched fuzzily rather
  // than by exact key.
  const imageCandidates: { key: string; thumbnail: string }[] = [];
  for (const r of clusterEntries) {
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
    ...new Set(clusterEntries.map((r) => r.serpapi_immersive_product_api).filter((u): u is string => !!u)),
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

  return { mode: "single", query, region, productTitle, rows };
}

export async function search(query: string, region: Region, apiKey: string): Promise<SearchResult> {
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

  // Mode is decided from ALL results, not just allowlisted ones — a bare
  // brand query (e.g. "Fenty Beauty") returns results almost entirely
  // *sourced from the brand's own site*, which isn't in the retailer
  // allowlist at all (that list is for recognizing resellers of a specific
  // product, not the brand catalog itself). Clustering everything by title
  // similarity reveals the real shape of the results regardless of source.
  const clusters = clusterByTitle(results.filter((r) => r.title));
  const dominant = clusters[0] ?? [];
  const isBrowse =
    results.length >= MIN_RESULTS_FOR_BROWSE_CHECK &&
    clusters.length > 1 &&
    dominant.length / results.length < DOMINANT_CLUSTER_SHARE_FOR_SINGLE;

  if (isBrowse) {
    // Only show clusters backed by a source we'd actually trust to
    // display: a known retailer/marketplace, or a source that IS the
    // brand/name being searched (its own catalog is inherently legitimate,
    // even though it's not in the curated retailer list).
    const trustedClusters = clusters.filter((cluster) =>
      cluster.some((r) => isBrowseCandidateSource(r.source, query, region))
    );
    return buildBrowseResult(trustedClusters, query, region);
  }

  // Single-product mode: the allowlist is used only to pick trustworthy
  // *seed* listings from within the dominant cluster — Google groups the
  // same real-world item under several different "canonical product"
  // pages, and seeding from a sketchy listing can land on a junk grouping
  // (verified: a reseller-seeded lookup returned eBay/Depop mixed with
  // spam instead of real retailers). Seeding from a known legitimate
  // retailer reliably lands on the clean grouping, which itself includes
  // the official brand site and other legitimate sellers Google groups
  // there — so the allowlist does NOT gate which stores get shown in the
  // final result, only which grouping gets fetched. Marketplace platforms
  // (eBay, Depop, ...) are also seeded from opportunistically, whenever
  // Google lists one of them directly. If nothing in the dominant cluster
  // matches the allowlist (e.g. it's all the brand's own site), fall back
  // to seeding from the cluster itself — title-clustering is already a
  // meaningful quality signal on its own.
  const seedCandidates = dominant.filter(
    (r) => matchRetailerBySource(r.source, region) !== null || isMarketplaceSource(r.source)
  );
  return buildSingleResult(query, region, apiKey, seedCandidates.length ? seedCandidates : dominant);
}
