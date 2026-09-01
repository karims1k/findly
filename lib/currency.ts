// Converts prices sourced in whatever currency a retailer/region reports
// them in (USD, AED, PKR, CLP, ...) into the visitor's own local currency
// for display, using a free daily-updated exchange rate feed. Conversion
// is display-only — sort order and "best price" comparisons are computed
// on the original values *before* conversion, which is safe as long as all
// rows being compared share one source currency (true for both our own
// search results and the fallback case), and simply not attempted across
// mismatched currencies.

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", AE: "AED", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", EG: "EGP", LB: "LBP",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR",
  IE: "EUR", PT: "EUR", GR: "EUR", FI: "EUR", LU: "EUR", SK: "EUR", SI: "EUR",
  LT: "EUR", LV: "EUR", EE: "EUR", CY: "EUR", MT: "EUR", HR: "EUR",
  CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
  BG: "BGN", TR: "TRY", RU: "RUB", UA: "UAH",
  CN: "CNY", JP: "JPY", KR: "KRW", HK: "HKD", TW: "TWD", SG: "SGD", MY: "MYR",
  TH: "THB", VN: "VND", PH: "PHP", ID: "IDR",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  ZA: "ZAR", NG: "NGN", KE: "KES", MA: "MAD", IL: "ILS",
};

const SYMBOL_TO_ISO: Record<string, string> = {
  "$": "USD",
  "R$": "BRL",
  "₹": "INR",
  "MX$": "MXN",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₩": "KRW",
  "₦": "NGN",
  "₺": "TRY",
  "₴": "UAH",
  "฿": "THB",
  "₪": "ILS",
  "₫": "VND",
  "₱": "PHP",
};

export function currencyForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return "USD";
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? "USD";
}

// Lens's price.currency field is sometimes a proper ISO code (SAR, PKR)
// and sometimes an ambiguous symbol ("$", "R$", "₹") — normalize both into
// a code the exchange-rate table can look up.
export function normalizeCurrencyCode(raw: string | null | undefined): string {
  if (!raw) return "USD";
  const trimmed = raw.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return SYMBOL_TO_ISO[trimmed] ?? "USD";
}

export async function fetchExchangeRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return null;
    const data = await res.json();
    if (data.result !== "success" || !data.rates) return null;
    return data.rates as Record<string, number>;
  } catch {
    return null;
  }
}

// `rates` is USD-based: rates[X] = how many units of X equal 1 USD.
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number | null {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
