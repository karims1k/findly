// Photo-based search: upload an image to SerpApi's Image API to get an
// image_id, then run Google Lens against it with type=products.
//
// This intentionally does NOT try to identify "the exact item" and search
// for just that — Lens's type=visual_matches mode (used previously) is
// dominated by social posts (TikTok/Instagram/Pinterest), and picking one
// "best guess" title collapses everything into a single exact-product
// search. type=products instead returns dozens of real shopping listings
// directly, spanning both exact matches AND close-but-different
// alternatives (other brands, generic/dupe listings) across a much wider,
// more global set of stores — which is what actually answers "find me
// something like this, wherever it's sold."
import type { BrowseProduct } from "./compare";
import { normalizeCurrencyCode } from "./currency";

interface LensPrice {
  value?: string;
  extracted_value?: number;
  currency?: string;
}

interface LensProductMatch {
  title?: string;
  source?: string;
  thumbnail?: string;
  price?: LensPrice;
}

const MAX_SIMILAR_PRODUCTS = 16;

export async function findSimilarProducts(image: Blob, apiKey: string): Promise<BrowseProduct[]> {
  const uploadForm = new FormData();
  uploadForm.append("image", image, "photo.jpg");
  uploadForm.append("api_key", apiKey);

  const uploadRes = await fetch("https://serpapi.com/image", { method: "POST", body: uploadForm });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.image_id) {
    throw new Error(uploadData.error ?? "Image upload failed");
  }

  const lensUrl = new URL("https://serpapi.com/search.json");
  lensUrl.searchParams.set("engine", "google_lens");
  lensUrl.searchParams.set("image_id", uploadData.image_id);
  lensUrl.searchParams.set("type", "products");
  lensUrl.searchParams.set("api_key", apiKey);

  const lensRes = await fetch(lensUrl);
  const lensData = await lensRes.json();
  if (lensData.error) {
    throw new Error(lensData.error);
  }

  const matches: LensProductMatch[] = lensData.visual_matches ?? [];
  const products = matches
    .filter((m): m is LensProductMatch & { title: string } => !!m.title)
    .slice(0, MAX_SIMILAR_PRODUCTS)
    .map((m) => ({
      title: m.title,
      price: m.price?.value ?? null,
      extractedPrice: m.price?.extracted_value ?? null,
      image: m.thumbnail ?? null,
      source: m.source ?? "",
      currency: m.price ? normalizeCurrencyCode(m.price.currency) : undefined,
    }));

  if (products.length === 0) {
    throw new Error("Couldn't find any similar products in that photo");
  }

  return products;
}
