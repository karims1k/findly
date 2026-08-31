// Photo-based search: upload an image to SerpApi's Image API to get an
// image_id, then run Google Lens against it to find the closest visual
// match. Lens match titles are noisy (site boilerplate, occasional wrong
// product), so we clean them up into a plausible search query but the
// caller is expected to let the user confirm/edit it before searching —
// this is a starting guess, not a guaranteed-correct identification.

export interface LensGuess {
  guess: string;
  raw: string;
  thumbnail: string | null;
}

export async function identifyImage(image: Blob, apiKey: string): Promise<LensGuess> {
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
  lensUrl.searchParams.set("type", "visual_matches");
  lensUrl.searchParams.set("api_key", apiKey);

  const lensRes = await fetch(lensUrl);
  const lensData = await lensRes.json();
  if (lensData.error) {
    throw new Error(lensData.error);
  }

  const top = lensData.visual_matches?.[0];
  if (!top?.title) {
    throw new Error("Couldn't identify a product in that photo");
  }

  return {
    guess: cleanGuess(top.title),
    raw: top.title,
    thumbnail: top.thumbnail ?? null,
  };
}

function cleanGuess(raw: string): string {
  let s = raw;

  // Visual-match titles are often "<product title> - <SiteName>" or
  // "<product> | <SiteName>". Drop a short trailing segment since that's
  // almost always the site/retailer name, not part of the product.
  const segments = s.split(/\s+[-|]\s+/);
  if (segments.length > 1 && segments[segments.length - 1].length <= 24) {
    segments.pop();
    s = segments.join(" - ");
  }

  s = s.replace(/^buy\s+/i, "").replace(/^shop\s+/i, "");
  s = s.replace(/\bonline\s+at\s+low\s+prices?\b.*$/i, "");
  s = s.replace(/,\s*$/, "").trim();

  return s || raw;
}
