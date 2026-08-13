"use client";

import { useTranslations } from "@/components/LocaleProvider";

export const LoadingFallback = () => {
  const t = useTranslations();
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--home-muted)]">
      {t("common.loading")}
    </div>
  );
};
