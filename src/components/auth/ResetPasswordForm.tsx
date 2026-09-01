"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";
import {
  AuthChrome,
  AuthFieldMessage,
  AuthFormError,
  authInputClass,
} from "@/components/auth/AuthChrome";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/account-name";
import type { MessageKey } from "@/messages";

const CODE_KEYS: Record<string, MessageKey> = {
  rate_limited: "auth.tooManyReset",
  password_min: "auth.passwordMin",
  password_max: "auth.passwordMax",
  reset_invalid: "auth.resetInvalid",
  reset_failed: "auth.couldNotReset",
};

export const ResetPasswordForm = () => {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const passwordErrorId = useId();
  const confirmErrorId = useId();
  const formErrorId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    const nextPasswordError = !password
      ? t("auth.passwordRequired")
      : password.length < PASSWORD_MIN
        ? t("auth.passwordMin")
        : password.length > PASSWORD_MAX
          ? t("auth.passwordMax")
          : "";
    const nextConfirmError =
      password !== confirm ? t("auth.resetMismatch") : "";
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextPasswordError || nextConfirmError) return;
    if (!token) {
      setFormError(t("auth.resetInvalid"));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        const message = data.code
          ? t(CODE_KEYS[data.code] || "auth.somethingWrong")
          : t("auth.couldNotReset");
        if (data.code === "password_min" || data.code === "password_max") {
          setPasswordError(message);
          return;
        }
        setFormError(message);
        return;
      }
      setDone(true);
    } catch {
      setFormError(t("auth.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthChrome
        title={t("auth.resetTitle")}
        subtitle={t("auth.resetInvalid")}
      >
        <div
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-4 text-center backdrop-blur-md sm:p-6"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <Link
            href="/forgot-password"
            className="text-sm text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
          >
            {t("auth.forgotPassword")}
          </Link>
        </div>
      </AuthChrome>
    );
  }

  return (
    <AuthChrome
      title={t("auth.resetTitle")}
      subtitle={done ? t("auth.resetSuccess") : t("auth.resetSubtitle")}
    >
      {done ? (
        <div
          className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-4 backdrop-blur-md sm:p-6"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-emerald-600"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-[var(--home-fg)]">
              {t("auth.resetSuccess")}
            </p>
          </div>
          <p className="mt-5 text-center text-sm text-[var(--home-muted)]">
            <Link
              href="/login"
              className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-4 hover:opacity-90"
            >
              {t("auth.signIn")}
            </Link>
          </p>
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
              htmlFor="reset-password"
              className="block text-sm font-medium text-[var(--home-fg)]/80"
            >
              {t("auth.newPassword")}
            </label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (passwordError) setPasswordError("");
              }}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              className={authInputClass(Boolean(passwordError))}
              placeholder={t("auth.passwordPlaceholderNew")}
            />
            {passwordError ? (
              <AuthFieldMessage id={passwordErrorId} message={passwordError} />
            ) : null}
          </div>

          <div className="mt-4">
            <label
              htmlFor="reset-confirm"
              className="block text-sm font-medium text-[var(--home-fg)]/80"
            >
              {t("auth.confirmPassword")}
            </label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                if (confirmError) setConfirmError("");
              }}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              aria-invalid={Boolean(confirmError)}
              aria-describedby={confirmError ? confirmErrorId : undefined}
              className={authInputClass(Boolean(confirmError))}
              placeholder={t("auth.passwordPlaceholderNew")}
            />
            {confirmError ? (
              <AuthFieldMessage id={confirmErrorId} message={confirmError} />
            ) : null}
          </div>

          {formError ? (
            <AuthFormError id={formErrorId} message={formError} />
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 min-h-11 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t("auth.resetUpdating") : t("auth.resetSubmit")}
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
