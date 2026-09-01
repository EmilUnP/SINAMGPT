"use client";

import Link from "next/link";
import { FormEvent, useId, useState } from "react";
import { useTranslations } from "@/components/LocaleProvider";
import {
  AuthChrome,
  AuthFieldMessage,
  AuthFormError,
  authInputClass,
} from "@/components/auth/AuthChrome";
import { parseAccountName, type AccountNameIssue } from "@/lib/account-name";
import type { MessageKey } from "@/messages";

const ISSUE_KEYS: Record<AccountNameIssue, MessageKey> = {
  empty: "auth.usernameRequired",
  min: "auth.usernameMin",
  max: "auth.usernameMax",
  chars: "auth.usernameChars",
  email: "auth.usernameEmail",
};

const CODE_KEYS: Record<string, MessageKey> = {
  rate_limited: "auth.tooManyReset",
  username_required: "auth.usernameRequired",
  username_min: "auth.usernameMin",
  username_max: "auth.usernameMax",
  username_chars: "auth.usernameChars",
  username_email: "auth.usernameEmail",
  user_not_found: "auth.forgotUserNotFound",
  reset_no_email: "auth.forgotNoEmail",
  reset_failed: "auth.forgotSendFailed",
};

const USERNAME_CODES = new Set([
  "username_required",
  "username_min",
  "username_max",
  "username_chars",
  "username_email",
  "user_not_found",
  "reset_no_email",
]);

const isSafeResetUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      parsed.pathname === "/reset-password" &&
      Boolean(parsed.searchParams.get("token"))
    );
  } catch {
    return false;
  }
};

export const ForgotPasswordForm = () => {
  const t = useTranslations();
  const usernameErrorId = useId();
  const formErrorId = useId();
  const usernameHintId = useId();
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!username.trim()) {
      setUsernameError(t("auth.usernameRequired"));
      return;
    }
    const account = parseAccountName(username);
    if (!account.ok) {
      setUsernameError(t(ISSUE_KEYS[account.issue]));
      return;
    }
    setUsernameError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        resetUrl?: string;
      };
      if (!res.ok) {
        const message = data.code
          ? t(CODE_KEYS[data.code] || "auth.somethingWrong")
          : t("auth.forgotSendFailed");
        if (USERNAME_CODES.has(data.code || "")) {
          setUsernameError(message);
          return;
        }
        setFormError(message);
        return;
      }
      if (!data.resetUrl || !isSafeResetUrl(data.resetUrl)) {
        setFormError(t("auth.forgotSendFailed"));
        return;
      }
      setResetUrl(data.resetUrl);
    } catch {
      setFormError(t("auth.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const sent = Boolean(resetUrl);

  return (
    <AuthChrome
      title={sent ? t("auth.forgotSentTitle") : t("auth.forgotTitle")}
      subtitle={sent ? t("auth.forgotSent") : t("auth.forgotSubtitle")}
    >
      {sent ? (
        <div
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-4 text-center backdrop-blur-md sm:p-6"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <Link
            href={resetUrl}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400"
          >
            {t("auth.forgotOpenReset")}
          </Link>
          <Link
            href="/login"
            className="mt-5 inline-block text-sm text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
          >
            {t("auth.backToSignIn")}
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-4 backdrop-blur-md sm:p-6"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <div>
            <label
              htmlFor="forgot-username"
              className="block text-sm font-medium text-[var(--home-fg)]/80"
            >
              {t("auth.username")}
            </label>
            <input
              id="forgot-username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (usernameError) setUsernameError("");
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              aria-invalid={Boolean(usernameError)}
              aria-describedby={
                usernameError ? usernameErrorId : usernameHintId
              }
              className={authInputClass(Boolean(usernameError))}
              placeholder={t("auth.usernamePlaceholder")}
            />
            {usernameError ? (
              <AuthFieldMessage id={usernameErrorId} message={usernameError} />
            ) : (
              <p
                id={usernameHintId}
                className="mt-1.5 text-xs leading-relaxed text-[var(--home-muted)]"
              >
                {t("auth.forgotHint")}
              </p>
            )}
          </div>

          {formError ? (
            <AuthFormError id={formErrorId} message={formError} />
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 min-h-11 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t("auth.forgotSending") : t("auth.forgotSubmit")}
          </button>

          <p className="mt-5 text-center text-sm text-[var(--home-muted)]">
            <Link
              href="/login"
              className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
            >
              {t("auth.backToSignIn")}
            </Link>
          </p>
        </form>
      )}
    </AuthChrome>
  );
};
