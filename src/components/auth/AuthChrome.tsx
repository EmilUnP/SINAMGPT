"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CircleAlert, History, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export const authInputClass = (invalid: boolean): string =>
  `mt-1.5 w-full rounded-2xl border bg-[var(--composer-bg)] px-4 py-3 text-base text-[var(--home-input)] outline-none transition placeholder:text-[var(--home-placeholder)] sm:text-[15px] ${
    invalid
      ? "border-[var(--danger)]/45 focus:border-[var(--danger)] focus:ring-4 focus:ring-red-500/15"
      : "border-[var(--home-card-border)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--ring)]"
  }`;

export const AuthFieldMessage = ({
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

export const AuthFormError = ({
  id,
  message,
}: {
  id: string;
  message: string;
}) => (
  <div
    id={id}
    role="alert"
    className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[var(--danger)]/18 bg-red-500/[0.08] px-3.5 py-3"
  >
    <CircleAlert
      size={16}
      className="mt-0.5 shrink-0 text-[var(--danger)]"
      aria-hidden
    />
    <p className="text-sm leading-relaxed text-[var(--danger)]">{message}</p>
  </div>
);

type AuthChromeProps = {
  title: string;
  subtitle: string;
  showChips?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

export const AuthChrome = ({
  title,
  subtitle,
  showChips = false,
  children,
  footer,
}: AuthChromeProps) => {
  const t = useTranslations();

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
            {title}
          </h1>
          <p className="mt-2 text-sm text-[var(--home-muted)]">{subtitle}</p>
          {showChips ? (
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
          ) : null}
        </div>

        {children}
        {footer}
      </div>
    </div>
  );
};
