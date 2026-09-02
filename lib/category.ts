// Findly is scoped to makeup, perfume, and skincare only. SerpApi's Google
// Shopping results don't carry a structured product-category field we can
// check against, so this is a heuristic keyword + known-brand gate — it
// will reject obviously out-of-scope queries ("running shoes", "laptop")
// but can still miss a legitimate beauty query that's brand-name-only and
// happens to share no words with the keyword list, or with a brand outside
// the curated list below.

const BEAUTY_KEYWORDS = [
  "makeup", "make-up", "cosmetic", "cosmetics", "beauty",
  "foundation", "concealer", "lipstick", "lip gloss", "lip oil", "lip liner", "lip balm",
  "mascara", "eyeliner", "eyeshadow", "eye shadow", "blush", "bronzer", "highlighter",
  "contour", "setting spray", "primer", "brow", "nail polish",
  "perfume", "cologne", "fragrance", "eau de parfum", "eau de toilette", "edp", "edt", "body mist",
  "skincare", "skin care", "serum", "moisturizer", "moisturiser", "cleanser", "toner",
  "sunscreen", "spf", "retinol", "exfoliant", "exfoliator", "face mask", "eye cream",
  "night cream", "day cream", "hyaluronic", "niacinamide", "lotion", "body wash",
  "shampoo", "conditioner", "hair mask", "gloss bomb",
  "makeup brush", "beauty blender", "makeup sponge", "makeup bag", "cosmetic bag", "vanity case",
];

const BEAUTY_BRANDS = [
  "sephora", "ulta", "fenty beauty", "rare beauty", "charlotte tilbury", "mac cosmetics",
  "nars", "urban decay", "too faced", "tarte", "benefit cosmetics", "clinique",
  "estee lauder", "lancome", "l'oreal", "loreal", "maybelline", "revlon", "covergirl",
  "e.l.f.", "milk makeup", "glossier", "kylie cosmetics", "huda beauty",
  "anastasia beverly hills", "tom ford", "jo malone", "yves saint laurent", "ysl",
  "giorgio armani", "la mer", "drunk elephant", "the ordinary", "cerave", "neutrogena",
  "olay", "kiehl's", "kiehls", "fresh", "sunday riley", "tatcha", "sol de janeiro",
  "rhode skin", "summer fridays", "paula's choice", "first aid beauty", "cetaphil",
  "aveeno", "olaplex", "living proof", "dior", "chanel", "gucci", "versace", "prada",

];

// Matching ignores spaces/punctuation entirely (not just case), so a
// keyword like "lip gloss" also matches a query typed as "lipgloss" or
// "lip-gloss" — plain substring matching on lowercased text alone missed
// these since the space itself has to line up exactly.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isInScope(text: string): boolean {
  const normText = normalize(text);
  return (
    BEAUTY_KEYWORDS.some((kw) => normText.includes(normalize(kw))) ||
    BEAUTY_BRANDS.some((b) => normText.includes(normalize(b)))
  );
}
