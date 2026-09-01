import { createBrowserClient } from "@supabase/ssr";

// For Client Components. @supabase/ssr falls back to reading/writing
// document.cookie automatically here, so no custom cookie handlers needed.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
