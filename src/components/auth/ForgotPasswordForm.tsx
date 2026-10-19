"use client";

import Link from "next/link";
import { useTranslations } from "@/components/LocaleProvider";
import { AuthChrome } from "@/components/auth/AuthChrome";

export const ForgotPasswordForm = () => {
  const t = useTranslations();
  return (
    <AuthChrome title={t("auth.forgotTitle")} subtitle={t("auth.forgotContactAdmin")}>
      <div className="rounded-3xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-6 text-center">
        <Link href="/login" className="text-sm text-[var(--accent)] underline underline-offset-4">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    </AuthChrome>
  );
};
