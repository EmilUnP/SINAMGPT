"use client";

import Link from "next/link";
import { useTranslations } from "@/components/LocaleProvider";

export const ShareUnavailable = () => {
  const t = useTranslations();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg)] px-6 text-center text-[var(--text)]">
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
