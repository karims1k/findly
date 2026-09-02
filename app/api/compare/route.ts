import { search, type SearchResult } from "@/lib/compare";
import type { Region } from "@/lib/retailers";
import { REGIONS } from "@/lib/retailers";
import { isInScope } from "@/lib/category";
import { getCached, setCached } from "@/lib/cache";
import { classifyUpstreamError } from "@/lib/errors";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// In addition to the in-memory cache below (which only helps a single warm
// server instance — Vercel runs multiple, so a cache hit there is never
// guaranteed), this tells Vercel's edge network to cache the response
// itself. That works across ALL visitors hitting the same query+region,
// not just repeat requests from the same browser or lucky instance, so a
// popular search (or one of the homepage category buttons) can be served
// instantly from the edge without invoking this function or SerpApi at
// all. stale-while-revalidate lets a slightly-stale response go out
// immediately while a fresh one is fetched in the background.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const region = (searchParams.get("region") ?? "US").toUpperCase() as Region;

  if (!query) {
    return Response.json({ error: "Missing required query param: q" }, { status: 400 });
  }
  if (!Object.keys(REGIONS).includes(region)) {
    return Response.json({ error: `Unknown region "${region}"` }, { status: 400 });
  }
  // "trusted" queries are exact product titles the client got from one of
  // our own browse grids (google_shopping-clustered or photo search) —
  // the parent search already passed this check (or, for photos, isn't
  // free-text at all), and real catalog titles use marketing language a
  // fixed keyword list can't fully anticipate, so re-checking here was
  // producing false rejections on legitimate products.
  const trusted = searchParams.get("trusted") === "1";
  if (!trusted && !isInScope(query)) {
    return Response.json(
      {
        error:
          "Findly only compares makeup, perfume, and skincare products. Try including a product type, like \"serum\" or \"perfume\", or a beauty brand name.",
      },
      { status: 422 }
    );
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error("[api/compare] SERPAPI_KEY is not configured");
    return Response.json(
      { error: "Something's misconfigured on our end. We're on it — please try again shortly." },
      { status: 500 }
    );
  }

  const cacheKey = `${region}:${query.toLowerCase()}`;
  const cached = getCached<SearchResult>(cacheKey);
  if (cached) {
    return Response.json(cached, { headers: CACHE_HEADERS });
  }

  try {
    const result = await search(query, region, apiKey);
    setCached(cacheKey, result, CACHE_TTL_MS);
    return Response.json(result, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("[api/compare] upstream error:", err);
    const { message, status } = classifyUpstreamError(
      err,
      "Something went wrong while comparing prices. Please try again."
    );
    return Response.json({ error: message }, { status });
  }
}
