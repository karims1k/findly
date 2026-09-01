import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Where the magic-link email points to: exchanges the one-time code for a
// real session, then sends the user back to the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(origin);
    }
  }

  return NextResponse.redirect(`${origin}/?authError=1`);
}
