// Retailer allowlist, keyed by market region. This is used only to pick a
// trustworthy *seed* listing from Google Shopping's flat search results —
// see lib/compare.ts for why: Google groups the same product under several
// different "canonical product" groupings, and seeding from a sketchy
// listing can land on a junk grouping (verified empirically). Seeding from
// one of these known-legitimate retailers reliably lands on the clean
// grouping, which itself includes the official brand site and any other
// legitimate sellers Google groups there — so this list does NOT restrict
// which stores get shown to the user, only which grouping gets fetched.
//
// sourceMatch matches against the `source` field on flat google_shopping
// search results.

export type Region = "US" | "AE" | "WORLDWIDE";

export interface RetailerConfig {
  name: string;
  sourceMatch: string[];
}

interface RegionConfig {
  label: string;
  currency: string;
  serpapiParams: Record<string, string>;
  allowlist: RetailerConfig[];
}

export const REGIONS: Record<Region, RegionConfig> = {
  US: {
    label: "United States",
    currency: "USD",
    serpapiParams: { google_domain: "google.com", gl: "us", hl: "en" },
    allowlist: [
      { name: "Sephora", sourceMatch: ["sephora"] },
      { name: "Ulta Beauty", sourceMatch: ["ulta"] },
      { name: "Amazon", sourceMatch: ["amazon.com", "amazon"] },
      { name: "Target", sourceMatch: ["target"] },
      { name: "Nordstrom", sourceMatch: ["nordstrom"] },
      { name: "Macy's", sourceMatch: ["macy"] },
      { name: "Kohl's", sourceMatch: ["kohl"] },
      { name: "Shein", sourceMatch: ["shein"] },
    ],
  },
  AE: {
    label: "United Arab Emirates",
    currency: "AED",
    serpapiParams: {
      google_domain: "google.ae",
      gl: "ae",
      hl: "en",
      location: "Dubai, Dubai, United Arab Emirates",
    },
    allowlist: [
      { name: "Noon", sourceMatch: ["noon"] },
      { name: "Sephora UAE", sourceMatch: ["sephora"] },
      { name: "Namshi", sourceMatch: ["namshi"] },
      { name: "Faces", sourceMatch: ["faces"] },
      { name: "6thstreet", sourceMatch: ["6thstreet", "6th street"] },
      { name: "Amazon.ae", sourceMatch: ["amazon"] },
      { name: "Shein", sourceMatch: ["shein"] },
    ],
  },
  WORLDWIDE: {
    label: "Worldwide",
    currency: "USD",
    // No single Google Shopping locale covers every country's listings, so
    // "worldwide" queries the broadest catalog (US) and seeds from stores
    // widely known to ship internationally, rather than trying to localize
    // to the visitor's own market.
    serpapiParams: { google_domain: "google.com", gl: "us", hl: "en" },
    allowlist: [
      { name: "Amazon", sourceMatch: ["amazon.com", "amazon"] },
      { name: "Sephora", sourceMatch: ["sephora"] },
      { name: "ASOS", sourceMatch: ["asos"] },
      { name: "Feelunique", sourceMatch: ["feelunique"] },
      { name: "Lookfantastic", sourceMatch: ["lookfantastic"] },
      { name: "Notino", sourceMatch: ["notino"] },
      { name: "Strawberrynet", sourceMatch: ["strawberrynet"] },
      { name: "iHerb", sourceMatch: ["iherb"] },
      { name: "Cult Beauty", sourceMatch: ["cult beauty", "cultbeauty"] },
      { name: "Shein", sourceMatch: ["shein"] },
    ],
  },
};

// Peer-to-peer marketplaces to also seed from, whenever Google happens to
// list one of them directly as a top-level flat result (common for rare,
// discontinued, or vintage items; uncommon for current mainstream
// products). Not region-specific — these platforms operate the same way
// everywhere. Rows sourced from these are tagged as "Marketplace seller" in
// the UI and filtered for used/resale language, since there's no
// structured condition field to check.
const MARKETPLACE_SOURCE_MATCH = ["ebay", "depop", "poshmark", "mercari", "vinted"];

export function isMarketplaceSource(sourceName: string | undefined): boolean {
  if (!sourceName) return false;
  const lower = sourceName.toLowerCase();
  return MARKETPLACE_SOURCE_MATCH.some((needle) => lower.includes(needle));
}

// Countries we have a dedicated, curated retailer list for. "Local" mode
// resolves to one of these when the visitor's detected country matches;
// otherwise it falls back to Worldwide rather than guessing at a locale we
// haven't actually verified retailers for.
const LOCAL_COUNTRY_TO_REGION: Record<string, Region> = {
  US: "US",
  AE: "AE",
};

export function resolveLocalRegion(countryCode: string | null | undefined): Region {
  if (!countryCode) return "WORLDWIDE";
  return LOCAL_COUNTRY_TO_REGION[countryCode.toUpperCase()] ?? "WORLDWIDE";
}

export function matchRetailerBySource(sourceName: string | undefined, region: Region): RetailerConfig | null {
  if (!sourceName) return null;
  const lower = sourceName.toLowerCase();
  return REGIONS[region].allowlist.find((r) => r.sourceMatch.some((needle) => lower.includes(needle))) ?? null;
}
