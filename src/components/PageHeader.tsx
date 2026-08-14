"use client";

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTranslations } from "@/components/LocaleProvider";

export type PageHeaderLink = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

type PageHeaderProps = {
  backHref?: string;
  backLabel: string;
  icon: LucideIcon;
  title: string;
  badge?: string;
  subtitle?: string;
  links?: PageHeaderLink[];
  actions?: ReactNode;
  maxWidthClass?: string;
};

export const PageHeader = ({
  backHref = "/chat",
  backLabel,
  icon: Icon,
  title,
  badge,
  subtitle,
  links = [],
  actions,
  maxWidthClass = "max-w-6xl",
}: PageHeaderProps) => {
  const t = useTranslations();

  return (
    <header className="page-chrome relative z-10 border-b border-[var(--admin-border)] bg-[var(--bg-elevated)]/90 backdrop-blur-md">
      <div
        className={`mx-auto flex ${maxWidthClass} flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:py-4`}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href={backHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
            aria-label={backLabel}
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Image
              src={sinamLogo}
              alt={t("common.brand")}
              width={32}
              height={32}
              className="hidden h-8 w-8 shrink-0 rounded-full sm:block"
              style={{ width: "auto", height: "auto" }}
              priority
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon
                  size={16}
                  className="hidden shrink-0 text-[var(--accent)] sm:inline"
                />
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {title}
                </h1>
                {badge ? (
                  <span className="status-pill status-info hidden sm:inline-flex">
                    {badge}
                  </span>
                ) : null}
              </div>
              {subtitle ? (
                <p className="mt-0.5 hidden truncate text-xs text-[var(--admin-muted)] sm:block">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <LanguageToggle size="sm" />
          <ThemeToggle size="sm" />
          {links.map(({ href, label, icon: LinkIcon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-2.5 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)] sm:px-3"
            >
              {LinkIcon ? <LinkIcon size={14} /> : null}
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
          {actions}
        </div>
      </div>
    </header>
  );
};
