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
import { matchFleetModel, type FleetId } from "@/lib/model-fleet";
import type { User } from "@/lib/types";
import type { MessageKey } from "@/messages";

type GuideModel = {
  name: string;
  display_name: string;
  size: number;
  vision: boolean;
  audio: boolean;
};

type Props = {
  user: User;
  models: GuideModel[];
  defaultModel: string;
};

type ProfileKind = "tiny" | "vision" | "strong" | "general";

const profileFor = (model: GuideModel): ProfileKind => {
  if (model.vision) return "vision";
  const gb = model.size / (1024 * 1024 * 1024);
  if (model.size > 0 && gb < 4) return "tiny";
  if (gb >= 20) return "strong";
  return "general";
};

const profileKeys = (kind: ProfileKind | FleetId) =>
  ({
    summary: `models.${kind}.summary`,
    use1: `models.${kind}.use1`,
    use2: `models.${kind}.use2`,
    use3: `models.${kind}.use3`,
    pro1: `models.${kind}.pro1`,
    pro2: `models.${kind}.pro2`,
    con1: `models.${kind}.con1`,
    con2: `models.${kind}.con2`,
  }) as const satisfies Record<string, MessageKey>;

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
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                {t("models.pickTitle")}
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--admin-fg)]">
                <li>{t("models.pick1")}</li>
                <li>{t("models.pick2")}</li>
                <li>{t("models.pick3")}</li>
                <li>{t("models.pick4")}</li>
              </ol>
            </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            {sorted.map((model) => {
              const isDefault = model.name === defaultModel;
              const title = model.display_name || model.name;
              const keys = profileKeys(
                matchFleetModel(model.name) ?? profileFor(model),
              );

              return (
                <article
                  key={model.name}
                  className="flex flex-col rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[var(--admin-fg)]">
                        {title}
                      </h2>
                      {title !== model.name ? (
                        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--admin-muted)]">
                          {model.name}
                        </p>
                      ) : null}
                    </div>
                    {isDefault ? (
                      <span className="status-pill status-info">
                        {t("models.presetDefault")}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-[var(--admin-fg)]">
                    {t(keys.summary)}
                  </p>

                  <dl className="mt-3 space-y-2 text-xs text-[var(--admin-muted)]">
                    <div>
                      <dt className="mb-1.5">{t("models.chatCanSend")}</dt>
                      <dd className="flex flex-wrap gap-1">
                        <ModelCapabilityBadges
                          showText
                          vision={model.vision}
                          audio={model.audio}
                        />
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                      {t("models.bestFor")}
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-[var(--admin-fg)]">
                      <li>{t(keys.use1)}</li>
                      <li>{t(keys.use2)}</li>
                      <li>{t(keys.use3)}</li>
                    </ul>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        {t("models.pros")}
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-[var(--admin-fg)]">
                        <li>{t(keys.pro1)}</li>
                        <li>{t(keys.pro2)}</li>
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                        {t("models.cons")}
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-[var(--admin-fg)]">
                        <li>{t(keys.con1)}</li>
                        <li>{t(keys.con2)}</li>
                      </ul>
                    </div>
                  </div>
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
