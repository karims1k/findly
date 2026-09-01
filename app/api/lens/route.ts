import { findSimilarProducts } from "@/lib/lens";
import { classifyUpstreamError } from "@/lib/errors";
import { REGIONS, type Region } from "@/lib/retailers";
import type { BrowseResult } from "@/lib/compare";

const MAX_IMAGE_BYTES = 500 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error("[api/lens] SERPAPI_KEY is not configured");
    return Response.json(
      { error: "Something's misconfigured on our end. We're on it — please try again shortly." },
      { status: 500 }
    );
  }

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Missing image file" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image too large (max 500KB)" }, { status: 400 });
  }

  const regionField = form.get("region");
  const region: Region = typeof regionField === "string" && regionField in REGIONS ? (regionField as Region) : "WORLDWIDE";

  try {
    const products = await findSimilarProducts(file, apiKey);
    // Top-level currency is just a fallback default here — each product
    // carries its own `currency` since Lens sources them from many
    // countries at once.
    const result: BrowseResult = {
      mode: "browse",
      query: "your photo",
      region,
      currency: REGIONS[region].currency,
      products,
    };
    return Response.json(result);
  } catch (err) {
    console.error("[api/lens] upstream error:", err);
    const { message, status } = classifyUpstreamError(
      err,
      "Something went wrong identifying that photo. Please try again."
    );
    return Response.json({ error: message }, { status });
  }
}
