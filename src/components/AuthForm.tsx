"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { History, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

export const AuthForm = ({ mode }: AuthFormProps) => {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [guestEnabled, setGuestEnabled] = useState(true);

  const isLogin = mode === "login";

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

      router.push("/chat");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 text-white">
      <AnimatedBackground />

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
            <span className="text-sm font-semibold tracking-wide text-sky-100">
              SINAMGPT
            </span>
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {isLogin ? "Sign in to your account" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-sky-200/50">
            {isLogin
              ? "Saved chats, full history, and unlimited messages."
              : registrationEnabled
                ? "Register once — then chat with your local company model."
                : "New registrations are currently closed by an admin."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="chip border border-sky-400/15 bg-sky-500/10 text-sky-100/80">
              <InfinityIcon size={12} /> Unlimited
            </span>
            <span className="chip border border-sky-400/15 bg-sky-500/10 text-sky-100/80">
              <History size={12} /> Saved history
            </span>
            <span className="chip border border-sky-400/15 bg-sky-500/10 text-sky-100/80">
              <ShieldCheck size={12} /> Local private
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-sky-400/15 bg-[#0c1424]/80 p-6 shadow-[0_24px_80px_rgba(15,40,90,0.45)] backdrop-blur-md"
        >
          <label className="block text-sm font-medium text-sky-100/80">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1.5 w-full rounded-2xl border border-sky-400/15 bg-[#071018]/70 px-4 py-3 text-[15px] text-white outline-none transition placeholder:text-sky-200/30 focus:border-sky-400/50 focus:ring-4 focus:ring-sky-500/15"
              placeholder="e.g. emil"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-sky-100/80">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? 1 : 6}
              className="mt-1.5 w-full rounded-2xl border border-sky-400/15 bg-[#071018]/70 px-4 py-3 text-[15px] text-white outline-none transition placeholder:text-sky-200/30 focus:border-sky-400/50 focus:ring-4 focus:ring-sky-500/15"
              placeholder={isLogin ? "••••••••" : "At least 6 characters"}
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
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

          <p className="mt-5 text-center text-sm text-sky-200/45">
            {isLogin ? (
              registrationEnabled ? (
                <>
                  No account?{" "}
                  <Link
                    href="/register"
                    className="text-sky-300 underline decoration-sky-400/30 underline-offset-4 hover:text-sky-200"
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
                  className="text-sky-300 underline decoration-sky-400/30 underline-offset-4 hover:text-sky-200"
                >
                  Sign in
                </Link>
              </>
            )}
          </p>
        </form>

        {guestEnabled ? (
          <p className="mt-6 text-center text-sm text-sky-200/40">
            Or{" "}
            <Link
              href="/"
              className="text-sky-300/80 underline decoration-sky-400/25 underline-offset-4 hover:text-sky-200"
            >
              try SINAMGPT without signing in
            </Link>
          </p>
        ) : (
          <p className="mt-6 text-center text-sm text-sky-200/40">
            Guest try-chat is currently disabled
          </p>
        )}
      </div>
    </div>
  );
};
