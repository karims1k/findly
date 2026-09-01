"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

function describeAuthError(code: string | undefined): string {
  switch (code) {
    case "over_email_send_rate_limit":
      return "Too many sign-in emails sent recently — please wait a bit and try again.";
    case "email_address_invalid":
      return "That doesn't look like a valid email address.";
    default:
      return "Couldn't send the sign-in link. Please try again.";
  }
}

export default function AuthWidget() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoadingUser(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;

    setSending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(describeAuthError(error.code));
    } else {
      setSent(true);
    }
    setSending(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }

  if (loadingUser) {
    return <div className="h-7" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">{user.email}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-full border border-zinc-200 px-3 py-1 font-medium text-zinc-600 transition-colors hover:border-fuchsia-300 hover:text-fuchsia-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSendLink} className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-40 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-black outline-none focus:border-fuchsia-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      />
      <button
        type="submit"
        disabled={sending}
        className="shrink-0 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 px-3 py-1 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {sending ? "Sending…" : "Sign in"}
      </button>
    </form>
  );
}
