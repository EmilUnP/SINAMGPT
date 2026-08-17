"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";
import {
  AdminHint,
  AdminPanelCard,
  adminBtnPrimary,
} from "@/components/admin/AdminChrome";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { PageHeader } from "@/components/PageHeader";
import { useTranslations } from "@/components/LocaleProvider";
import { formatModelSize } from "@/lib/ui";
import type { User } from "@/lib/types";
import type { MessageKey } from "@/messages";

type GuideModel = {
  name: string;
  display_name: string;
  size: number;
  vision: boolean;
  tools: boolean;
  audio: boolean;
  video: boolean;
};

type Props = {
  user: User;
  models: GuideModel[];
  defaultModel: string;
};

const tipFor = (model: GuideModel): MessageKey => {
  if (model.vision && (model.audio || model.video)) {
    return "models.tipMultimodal";
  }
  if (model.vision) return "models.tipVision";
  const gb = model.size / (1024 * 1024 * 1024);
  if (model.size > 0 && gb < 4) return "models.tipFast";
  if (gb >= 20) return "models.tipStrong";
  return "models.tipGeneral";
};

export const ModelsGuide = ({
  user,
  models,
  defaultModel,
}: Props) => {
  const t = useTranslations();
  const sorted = [...models].sort((a, b) => {
    const rank = (name: string) => (name === defaultModel ? 0 : 1);
    const delta = rank(a.name) - rank(b.name);
    if (delta !== 0) return delta;
    return (a.display_name || a.name).localeCompare(b.display_name || b.name);
  });

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--admin-fg)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 10% 0%, rgba(37,99,235,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 10%, rgba(14,165,233,0.1), transparent 50%)",
        }}
      />
      <PageHeader
        backLabel={t("models.backToChat")}
        icon={Boxes}
        title={t("models.title")}
        badge={t("models.badge")}
        subtitle={`${user.username} · ${t("common.brand")}`}
      />

      <main className="safe-x relative z-10 mx-auto max-w-6xl space-y-5 px-3 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6">
        <AdminPanelCard>
          <div className="space-y-4 px-4 py-4">
            <p className="text-sm leading-relaxed text-[var(--admin-muted)]">
              {t("models.description")}
            </p>
            {sorted.length ? (
              <p className="text-xs font-medium text-[var(--admin-muted)]">
                {t("models.count", { n: sorted.length })}
              </p>
            ) : (
              <AdminHint>{t("models.empty")}</AdminHint>
            )}
          </div>
        </AdminPanelCard>

        {sorted.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((model) => {
              const isDefault = model.name === defaultModel;

              return (
                <article
                  key={model.name}
                  className="flex flex-col rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[var(--admin-fg)]">
                        {model.display_name || model.name}
                      </h2>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--admin-muted)]">
                        {model.name}
                      </p>
                    </div>
                    {isDefault ? (
                      <span className="status-pill status-info">
                        {t("models.presetDefault")}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-[var(--admin-fg)]">
                    {t(tipFor(model))}
                  </p>

                  <dl className="mt-3 space-y-2 text-xs text-[var(--admin-muted)]">
                    <div className="flex items-center justify-between gap-2">
                      <dt>{t("models.size")}</dt>
                      <dd className="font-medium text-[var(--admin-fg)]">
                        {formatModelSize(model.size)}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1.5">{t("models.inputs")}</dt>
                      <dd className="flex flex-wrap gap-1">
                        <ModelCapabilityBadges
                          showText
                          vision={model.vision}
                          audio={model.audio}
                          video={model.video}
                          tools={model.tools}
                        />
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Link href="/chat" className={adminBtnPrimary}>
            {t("models.openChat")}
          </Link>
        </div>
      </main>
    </div>
  );
};
