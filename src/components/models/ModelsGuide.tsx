"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";
import {
  AdminHint,
  adminBtnPrimary,
} from "@/components/admin/AdminChrome";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { PageHeader } from "@/components/PageHeader";
import { useTranslations } from "@/components/LocaleProvider";
import { matchFleetModel, type FleetId } from "@/lib/model-fleet";
import type { MessageKey } from "@/messages";

type GuideModel = {
  name: string;
  display_name: string;
  size: number;
  vision: boolean;
  audio: boolean;
  tts: boolean;
};

type Props = {
  signedIn: boolean;
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
    note: `models.${kind}.con1`,
  }) as const satisfies Record<string, MessageKey>;

const speedKey = (model: GuideModel): MessageKey => {
  const id = matchFleetModel(model.name);
  if (id === "gemma4-e4b") return "models.speedVoice";
  if (id === "gemma3-4b" || id === "qwen35-9b") return "models.speedFast";
  if (
    id === "gemma4-26b" ||
    id === "gemma4-31b" ||
    id === "llama4-scout" ||
    id === "llama4-maverick" ||
    id === "qwen3-32b"
  ) {
    return "models.speedStrong";
  }
  if (id === "gemma3-12b") return "models.speedBalanced";
  if (model.audio) return "models.speedVoice";
  const kind = profileFor(model);
  if (kind === "tiny") return "models.speedFast";
  if (kind === "strong") return "models.speedStrong";
  return "models.speedBalanced";
};

export const ModelsGuide = ({
  signedIn,
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
        backHref={signedIn ? "/chat" : "/"}
        backLabel={signedIn ? t("models.backToChat") : t("models.backHome")}
        icon={Boxes}
        title={t("models.title")}
        badge={t("models.badge")}
        subtitle={t("common.brand")}
        actions={
          <Link
            href={signedIn ? "/chat" : "/"}
            className={adminBtnPrimary}
          >
            {signedIn ? t("models.openChat") : t("models.tryChat")}
          </Link>
        }
      />

      <main className="safe-x relative z-10 mx-auto max-w-6xl space-y-6 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm leading-relaxed text-[var(--admin-muted)] sm:text-[15px]">
            {t("models.description")}
          </p>
          {!sorted.length ? <AdminHint>{t("models.empty")}</AdminHint> : null}
        </div>

        {sorted.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {sorted.map((model) => {
              const isDefault = model.name === defaultModel;
              const title = model.display_name || model.name;
              const kind = matchFleetModel(model.name) ?? profileFor(model);
              const keys = profileKeys(kind);

              return (
                <article
                  key={model.name}
                  className="flex flex-col rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold tracking-tight text-[var(--admin-fg)]">
                        {title}
                      </h2>
                      <p className="mt-1 text-xs font-medium text-[var(--admin-muted)]">
                        {t(speedKey(model))}
                      </p>
                    </div>
                    {isDefault ? (
                      <span className="status-pill status-info">
                        {t("models.presetDefault")}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    <ModelCapabilityBadges
                      showText
                      vision={model.vision}
                      audio={model.audio}
                      tts={model.tts}
                    />
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-[var(--admin-fg)]">
                    {t(keys.summary)}
                  </p>

                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                      {t("models.bestFor")}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--admin-fg)]">
                      <li className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                        {t(keys.use1)}
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                        {t(keys.use2)}
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                        {t(keys.use3)}
                      </li>
                    </ul>
                  </div>

                  <p className="mt-auto pt-4 text-xs leading-relaxed text-[var(--admin-muted)]">
                    {t(keys.note)}
                  </p>
                </article>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
};
