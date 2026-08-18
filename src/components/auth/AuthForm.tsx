"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { History, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { MessageKey } from "@/messages";

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

const AUTH_ERROR_KEYS: Record<string, MessageKey> = {
  "Invalid username or password": "auth.invalidCredentials",
  "Too many login attempts. Try again later.": "auth.tooManyAttempts",
  "Username and password are required": "auth.usernamePasswordRequired",
  "Could not log in": "auth.couldNotLogIn",
  "Too many registration attempts. Try again later.": "auth.tooManyRegister",
  "Username must be at least 3 characters": "auth.usernameMin",
  "Username is too long": "auth.usernameMax",
  "Use letters, numbers, . _ - only": "auth.usernameChars",
  "Password must be at least 6 characters": "auth.passwordMin",
  "Invalid input": "auth.invalidInput",
  "This username is reserved": "auth.usernameReserved",
  "Username already taken": "auth.usernameTaken",
  "Could not create account": "auth.couldNotCreate",
};

const mapAuthError = (
  message: string,
  t: (key: MessageKey) => string,
): string => {
  const key = AUTH_ERROR_KEYS[message];
  if (key) return t(key);
  if (message.toLowerCase().includes("registration is currently closed")) {
    return t("auth.registrationClosedError");
  }
  return message;
};

export const AuthForm = ({ mode }: AuthFormProps) => {
  const t = useTranslations();
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
      setError(t("auth.registrationClosedError"));
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
        setError(mapAuthError(data.error || t("auth.somethingWrong"), t));
        return;
      }

      router.push(nextPath || "/chat");
      router.refresh();
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 text-[var(--home-fg)] safe-x pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <AnimatedBackground />

      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top,0px))] z-20 flex items-center gap-1.5 sm:right-6">
        <LanguageToggle size="sm" />
        <ThemeToggle size="sm" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-3">
            <Image
              src={sinamLogo}
              alt={t("common.brand")}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full"
              style={{ width: "auto", height: "auto" }}
              priority
            />
            <span className="text-sm font-semibold tracking-wide text-[var(--home-fg)]">
              {t("common.brand")}
            </span>
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--home-fg)] sm:text-3xl">
            {isLogin ? t("auth.signInTitle") : t("auth.registerTitle")}
          </h1>
          <p className="mt-2 text-sm text-[var(--home-muted)]">
            {isLogin
              ? t("auth.signInSubtitle")
              : registrationEnabled
                ? t("auth.registerSubtitle")
                : t("auth.registerClosedSubtitle")}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <InfinityIcon size={12} /> {t("auth.chipUnlimited")}
            </span>
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <History size={12} /> {t("auth.chipHistory")}
            </span>
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <ShieldCheck size={12} /> {t("auth.chipPrivate")}
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-5 backdrop-blur-md sm:p-6"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <label className="block text-sm font-medium text-[var(--home-fg)]/80">
            {t("auth.username")}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1.5 w-full rounded-2xl border border-[var(--home-card-border)] bg-[var(--composer-bg)] px-4 py-3 text-base text-[var(--home-input)] sm:text-[15px] outline-none transition placeholder:text-[var(--home-placeholder)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--ring)]"
              placeholder={t("auth.usernamePlaceholder")}
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-[var(--home-fg)]/80">
            {t("auth.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? 1 : 6}
              className="mt-1.5 w-full rounded-2xl border border-[var(--home-card-border)] bg-[var(--composer-bg)] px-4 py-3 text-base text-[var(--home-input)] sm:text-[15px] outline-none transition placeholder:text-[var(--home-placeholder)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--ring)]"
              placeholder={isLogin ? "••••••••" : t("auth.passwordPlaceholderNew")}
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
                ? t("auth.signingIn")
                : t("auth.creating")
              : isLogin
                ? t("auth.signIn")
                : registrationEnabled
                  ? t("auth.createAccount")
                  : t("auth.registrationClosed")}
          </button>

          <p className="mt-5 text-center text-sm text-[var(--home-muted)]">
            {isLogin ? (
              registrationEnabled ? (
                <>
                  {t("auth.noAccount")}{" "}
                  <Link
                    href="/register"
                    className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
                  >
                    {t("auth.register")}
                  </Link>
                </>
              ) : (
                <>{t("auth.registrationClosedHint")}</>
              )
            ) : (
              <>
                {t("auth.haveAccount")}{" "}
                <Link
                  href="/login"
                  className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
                >
                  {t("auth.signIn")}
                </Link>
              </>
            )}
          </p>
        </form>

        {guestEnabled ? (
          <p className="mt-6 text-center text-sm text-[var(--home-faint)]">
            {t("auth.or")}{" "}
            <Link
              href="/"
              className="text-[var(--accent)] underline decoration-[var(--accent)]/25 underline-offset-4 hover:opacity-90"
            >
              {t("auth.tryWithoutSignIn")}
            </Link>
          </p>
        ) : (
          <p className="mt-6 text-center text-sm text-[var(--home-faint)]">
            {t("auth.guestDisabled")}
          </p>
        )}
      </div>
    </div>
  );
};
