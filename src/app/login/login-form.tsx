"use client";

import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

type Audience = "TEAM" | "CLIENT";

// Same two doors as the Campaign Panel login: team → Google (password as a
// fallback), client → email + password. Restyled to match this app.
export default function LoginForm() {
  const router = useRouter();
  const [audience, setAudience] = useState<Audience>("TEAM");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Read ?error= after mount (reading it during render causes a hydration mismatch)
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e === "AccessDenied")
      setNotice("That Google account hasn't been added to the tracker yet, or it's been set to inactive. Ask your admin.");
    if (e === "Inactive") {
      // Clear the stale login cookie so the next sign-in starts fresh
      signOut({ redirect: false });
      setNotice("Your login wasn't found or is inactive. If you were just added, sign in again; otherwise ask your admin.");
    }
  }, []);

  async function onGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/home" });
  }

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(audience === "CLIENT" ? "/portal" : "/home");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-canvas p-1 text-[13px] font-medium">
        {(["TEAM", "CLIENT"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => { setAudience(a); setError(null); }}
            className={`rounded-md py-1.5 transition-colors ${audience === a ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {a === "TEAM" ? "TBM team" : "Brand / client"}
          </button>
        ))}
      </div>

      {notice && <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{notice}</p>}

      {audience === "TEAM" && (
        <>
          <button
            type="button"
            onClick={onGoogle}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-line bg-surface py-2.5 text-[13px] font-medium hover:bg-canvas disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-4 w-4" />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-muted">or with a password</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={onCredentials} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input py-2"
            placeholder={audience === "TEAM" ? "you@theboredmonkey.com" : "you@brand.com"}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field-input py-2" placeholder="••••••••" />
        </label>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? "Signing in…" : "Sign in"} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
