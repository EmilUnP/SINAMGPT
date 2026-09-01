"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";
import { CircleAlert, History, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  parseAccountName,
  type AccountNameIssue,
} from "@/lib/account-name";
import type { MessageKey } from "@/messages";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

type FieldErrors = {
  username?: string;
  password?: string;
};

const safeNextPath = (raw: string | null): string | null => {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
};

const ISSUE_KEYS: Record<AccountNameIssue, MessageKey> = {
  empty: "auth.usernameRequired",
  min: "auth.usernameMin",
  max: "auth.usernameMax",
  chars: "auth.usernameChars",
  email: "auth.usernameEmail",
};

const AUTH_CODE_KEYS: Record<string, MessageKey> = {
  invalid_credentials: "auth.invalidCredentials",
  rate_limited: "auth.tooManyAttempts",
  username_password_required: "auth.usernamePasswordRequired",
  login_failed: "auth.couldNotLogIn",
  username_required: "auth.usernameRequired",
  username_min: "auth.usernameMin",
  username_max: "auth.usernameMax",
  username_chars: "auth.usernameChars",
  username_email: "auth.usernameEmail",
  password_min: "auth.passwordMin",
  password_max: "auth.passwordMax",
  invalid_input: "auth.invalidInput",
  username_reserved: "auth.usernameReserved",
  username_taken: "auth.usernameTaken",
  create_failed: "auth.couldNotCreate",
  registration_closed: "auth.registrationClosedError",
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
  "Enter a username or email address": "auth.usernameRequired",
  "Enter a valid email address": "auth.usernameEmail",
  "Password must be at least 6 characters": "auth.passwordMin",
  "Password is too long": "auth.passwordMax",
  "Invalid input": "auth.invalidInput",
  "This username is reserved": "auth.usernameReserved",
  "Username already taken": "auth.usernameTaken",
  "Could not create account": "auth.couldNotCreate",
};

const USERNAME_CODES = new Set([
  "username_required",
  "username_min",
  "username_max",
  "username_chars",
  "username_email",
  "username_reserved",
  "username_taken",
]);

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

const inputClass = (invalid: boolean): string =>
  `mt-1.5 w-full rounded-2xl border bg-[var(--composer-bg)] px-4 py-3 text-base text-[var(--home-input)] outline-none transition placeholder:text-[var(--home-placeholder)] sm:text-[15px] ${
    invalid
      ? "border-[var(--danger)]/45 focus:border-[var(--danger)] focus:ring-4 focus:ring-red-500/15"
      : "border-[var(--home-card-border)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--ring)]"
  }`;

const FieldMessage = ({
  id,
  message,
}: {
  id: string;
  message: string;
}) => (
  <p
    id={id}
    role="alert"
    className="mt-1.5 flex items-start gap-1.5 text-sm leading-snug text-[var(--danger)]"
  >
    <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
    <span>{message}</span>
  </p>
);

export const AuthForm = ({ mode }: AuthFormProps) => {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const usernameHintId = useId();
  const formErrorId = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
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

  const validate = (name = username, pass = password): FieldErrors => {
    const next: FieldErrors = {};
    if (isLogin) {
      if (!name.trim()) next.username = t("auth.usernameRequired");
      if (!pass) next.password = t("auth.passwordRequired");
      return next;
    }
    const account = parseAccountName(name);
    if (!account.ok) next.username = t(ISSUE_KEYS[account.issue]);
    if (!pass) next.password = t("auth.passwordRequired");
    else if (pass.length < PASSWORD_MIN) next.password = t("auth.passwordMin");
    else if (pass.length > PASSWORD_MAX) next.password = t("auth.passwordMax");
    return next;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setShowErrors(true);
    if (!isLogin && !registrationEnabled) {
      setFieldErrors({});
      setFormError(t("auth.registrationClosedError"));
      return;
    }

    const localErrors = validate();
    setFieldErrors(localErrors);
    if (localErrors.username || localErrors.password) return;

    setIsLoading(true);

    try {
      const res = await fetch(`/api/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as { error?: string; code?: string };

      if (!res.ok) {
        const code = data.code || "";
        if (code === "rate_limited" && !isLogin) {
          setFormError(t("auth.tooManyRegister"));
          return;
        }
        const message = data.code
          ? t(AUTH_CODE_KEYS[data.code] || "auth.somethingWrong")
          : mapAuthError(data.error || t("auth.somethingWrong"), t);
        if (USERNAME_CODES.has(code)) {
          setFieldErrors({ username: message });
          return;
        }
        if (code === "password_min" || code === "password_max") {
          setFieldErrors({ password: message });
          return;
        }
        setFormError(message);
        return;
      }

      router.push(nextPath || "/chat");
      router.refresh();
    } catch {
      setFormError(t("auth.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden overflow-y-auto text-[var(--home-fg)]">
      <AnimatedBackground />

      <div className="relative z-20 flex shrink-0 justify-end gap-1.5 px-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <LanguageToggle size="sm" />
        <ThemeToggle size="sm" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 animate-fade-up sm:pt-6">
        <div className="mb-5 text-center sm:mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-2 sm:gap-3">
            <Image
              src={sinamLogo}
              alt={t("common.brand")}
              width={48}
              height={48}
              className="h-11 w-11 rounded-full sm:h-12 sm:w-12"
              style={{ width: "auto", height: "auto" }}
              priority
            />
            <span className="text-sm font-semibold tracking-wide text-[var(--home-fg)]">
              {t("common.brand")}
            </span>
          </Link>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--home-fg)] sm:mt-5 sm:text-3xl">
            {isLogin ? t("auth.signInTitle") : t("auth.registerTitle")}
          </h1>
          <p className="mt-2 text-sm text-[var(--home-muted)]">
            {isLogin
              ? t("auth.signInSubtitle")
              : registrationEnabled
                ? t("auth.registerSubtitle")
                : t("auth.registerClosedSubtitle")}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:mt-4 sm:gap-2">
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <InfinityIcon size={12} /> {t("auth.chipUnlimited")}
            </span>
            <span className="chip hidden border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)] min-[380px]:inline-flex">
              <History size={12} /> {t("auth.chipHistory")}
            </span>
            <span className="chip border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
              <ShieldCheck size={12} /> {t("auth.chipPrivate")}
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-4 backdrop-blur-md sm:p-6"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <div>
            <label
              htmlFor="auth-username"
              className="block text-sm font-medium text-[var(--home-fg)]/80"
            >
              {t("auth.username")}
            </label>
            <input
              id="auth-username"
              value={username}
              onChange={(event) => {
                const next = event.target.value;
                setUsername(next);
                if (showErrors) {
                  setFieldErrors(validate(next, password));
                }
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={
                fieldErrors.username
                  ? usernameErrorId
                  : !isLogin
                    ? usernameHintId
                    : undefined
              }
              className={inputClass(Boolean(fieldErrors.username))}
              placeholder={t("auth.usernamePlaceholder")}
            />
            {fieldErrors.username ? (
              <FieldMessage id={usernameErrorId} message={fieldErrors.username} />
            ) : !isLogin ? (
              <p
                id={usernameHintId}
                className="mt-1.5 text-xs leading-relaxed text-[var(--home-muted)]"
              >
                {t("auth.usernameHint")}
              </p>
            ) : null}
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-[var(--home-fg)]/80"
              >
                {t("auth.password")}
              </label>
              {isLogin ? (
                <Link
                  href="/forgot-password"
                  className="shrink-0 text-sm text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
                >
                  {t("auth.forgotPassword")}
                </Link>
              ) : null}
            </div>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => {
                const next = event.target.value;
                setPassword(next);
                if (showErrors) {
                  setFieldErrors(validate(username, next));
                }
              }}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? 1 : PASSWORD_MIN}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? passwordErrorId : undefined
              }
              className={inputClass(Boolean(fieldErrors.password))}
              placeholder={isLogin ? "••••••••" : t("auth.passwordPlaceholderNew")}
            />
            {fieldErrors.password ? (
              <FieldMessage id={passwordErrorId} message={fieldErrors.password} />
            ) : null}
          </div>

          {formError ? (
            <div
              id={formErrorId}
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[var(--danger)]/18 bg-red-500/[0.08] px-3.5 py-3"
            >
              <CircleAlert
                size={16}
                className="mt-0.5 shrink-0 text-[var(--danger)]"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-[var(--danger)]">
                {formError}
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || (!isLogin && !registrationEnabled)}
            className="mt-6 min-h-11 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
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
