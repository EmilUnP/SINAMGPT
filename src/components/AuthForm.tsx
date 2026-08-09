"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { History, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ThemeToggle } from "@/components/ThemeToggle";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

const safeNextPath = (raw: string | null): string | null => {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
};

export const AuthForm = ({ mode }: AuthFormProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [guestEnabled, setGuestEnabled] = useState(true);

  const isLogin = mode === "login";
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/settings");
        const data = (await res.json()) as {
          settings?: {
            registrationEnabled?: boolean;
            guestEnabled?: boolean;
          };
        };
        if (data.settings?.registrationEnabled === false) {
          setRegistrationEnabled(false);
        }
        if (data.settings?.guestEnabled === false) {
          setGuestEnabled(false);
        }
      } catch {
        // keep defaults
      }
    };
    void load();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isLogin && !registrationEnabled) {
      setError("Registration is currently closed. Please sign in instead.");
      return;
    }
    setIsLoading(true);

    try {
      const res = await fetch(`/api/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      router.push(nextPath || "/chat");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 text-[var(--home-fg)]">
      <AnimatedBackground />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle size="sm" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-3">
            <Image
              src={sinamLogo}
              alt="SINAMGPT"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full"
              style={{ width: "auto", height: "auto" }}
              priority
            />
            <span className="text-sm font-semibold tracking-wide text-[var(--home-fg)]">
              SINAMGPT
            </span>
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--home-fg)] sm:text-3xl">
            {isLogin ? "Sign in to your account" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-[var(--home-muted)]">
            {isLogin
              ? "Saved chats, full history, and unlimited messages."
              : registrationEnabled
                ? "Register once — then chat with your local company model."
                : "New registrations are currently closed by an admin."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <InfinityIcon size={12} /> Unlimited
            </span>
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <History size={12} /> Saved history
            </span>
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <ShieldCheck size={12} /> Local private
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-6 backdrop-blur-md"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <label className="block text-sm font-medium text-[var(--home-fg)]/80">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1.5 w-full rounded-2xl border border-[var(--home-card-border)] bg-[var(--composer-bg)] px-4 py-3 text-[15px] text-[var(--home-input)] outline-none transition placeholder:text-[var(--home-placeholder)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--ring)]"
              placeholder="e.g. emil"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-[var(--home-fg)]/80">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? 1 : 6}
              className="mt-1.5 w-full rounded-2xl border border-[var(--home-card-border)] bg-[var(--composer-bg)] px-4 py-3 text-[15px] text-[var(--home-input)] outline-none transition placeholder:text-[var(--home-placeholder)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--ring)]"
              placeholder={isLogin ? "••••••••" : "At least 6 characters"}
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || (!isLogin && !registrationEnabled)}
            className="mt-6 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading
              ? isLogin
                ? "Signing in…"
                : "Creating…"
              : isLogin
                ? "Sign in"
                : registrationEnabled
                  ? "Create account"
                  : "Registration closed"}
          </button>

          <p className="mt-5 text-center text-sm text-[var(--home-muted)]">
            {isLogin ? (
              registrationEnabled ? (
                <>
                  No account?{" "}
                  <Link
                    href="/register"
                    className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
                  >
                    Register
                  </Link>
                </>
              ) : (
                <>Registration is closed · sign in if you already have an account</>
              )
            ) : (
              <>
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
                >
                  Sign in
                </Link>
              </>
            )}
          </p>
        </form>

        {guestEnabled ? (
          <p className="mt-6 text-center text-sm text-[var(--home-faint)]">
            Or{" "}
            <Link
              href="/"
              className="text-[var(--accent)] underline decoration-[var(--accent)]/25 underline-offset-4 hover:opacity-90"
            >
              try SINAMGPT without signing in
            </Link>
          </p>
        ) : (
          <p className="mt-6 text-center text-sm text-[var(--home-faint)]">
            Guest try-chat is currently disabled
          </p>
        )}
      </div>
    </div>
  );
};
