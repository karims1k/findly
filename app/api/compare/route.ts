import { search, type SearchResult } from "@/lib/compare";
import type { Region } from "@/lib/retailers";
import { REGIONS } from "@/lib/retailers";
import { isInScope } from "@/lib/category";
import { getCached, setCached } from "@/lib/cache";
import { classifyUpstreamError } from "@/lib/errors";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
  if (!isInScope(query)) {
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
    return Response.json(cached);
  }

  try {
    const result = await search(query, region, apiKey);
    setCached(cacheKey, result, CACHE_TTL_MS);
    return Response.json(result);
  } catch (err) {
    console.error("[api/compare] upstream error:", err);
    const { message, status } = classifyUpstreamError(
      err,
      "Something went wrong while comparing prices. Please try again."
    );
    return Response.json({ error: message }, { status });
  }
}
