"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export const ShareUnavailable = () => {
  const t = useTranslations();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg)] px-6 text-center text-[var(--text)]">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top,0px))] z-20 flex items-center gap-1.5">
        <LanguageToggle size="sm" />
        <ThemeToggle size="sm" />
      </div>
      <h1 className="text-xl font-semibold">{t("share.unavailableTitle")}</h1>
      <p className="max-w-sm text-sm text-[var(--text-muted)]">
        {t("share.unavailableBody")}
      </p>
      <Link
        href="/chat"
        className="mt-2 text-sm text-[var(--accent)] hover:underline"
      >
        {t("share.backToChat")}
      </Link>
    </div>
  );
};
