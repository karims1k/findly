// Upstream (SerpApi) error messages are written for a developer managing
// that account — quota limits, invalid keys, HTTP status codes — and
// sometimes literally reference SerpApi by name or URL. None of that is
// meaningful or appropriate to show an end user of Findly, so any message
// matching a known upstream pattern gets rewritten into plain language
// here. Messages we wrote ourselves (e.g. "Couldn't identify a product in
// that photo") don't match any pattern and pass through unchanged, since
// they're already safe and specific. The raw error should still be logged
// server-side for debugging — this function only decides what the client
// sees.

interface FriendlyError {
  message: string;
  status: number;
}

export function classifyUpstreamError(err: unknown, fallbackMessage: string): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (/run out of searches|monthly limit|account has reached|upgrade your plan|out of searches/.test(lower)) {
    return { message: "We've hit our search limit for now — please try again later.", status: 503 };
  }
  if (/invalid api key/.test(lower)) {
    return { message: "Something's misconfigured on our end. We're on it — please try again shortly.", status: 500 };
  }
  if (/request failed: 429/.test(lower)) {
    return { message: "We're getting a lot of requests right now — please try again in a moment.", status: 503 };
  }
  if (/request failed: 5\d\d/.test(lower)) {
    return { message: "Our price data provider is temporarily unavailable — please try again shortly.", status: 503 };
  }
  if (/serpapi/i.test(raw)) {
    // Some other message that leaks the vendor name — don't show it verbatim.
    return { message: fallbackMessage, status: 502 };
  }

  return { message: raw, status: 502 };
}
