"use client";

import { AlertCircle, Check, Globe, Loader2 } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";
import type { ToolActivity } from "./chat-types";

type SearchActivityProps = {
  steps?: ToolActivity[] | null;
  /** Show the answer skeleton once every step is done but no text has arrived. */
  awaitingAnswer?: boolean;
};

const StepIcon = ({ status }: { status: ToolActivity["status"] }) => {
  if (status === "running") {
    return (
      <Loader2
        size={12}
        className="shrink-0 animate-spin text-[var(--accent)]"
        aria-hidden="true"
      />
    );
  }
  if (status === "failed") {
    return (
      <AlertCircle size={12} className="shrink-0 text-[var(--danger,#dc2626)]" aria-hidden="true" />
    );
  }
  return <Check size={12} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />;
};

export const SearchActivity = ({
  steps,
  awaitingAnswer = false,
}: SearchActivityProps) => {
  const t = useTranslations();
  if (!steps?.length) return null;

  return (
    <>
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2.5"
        aria-live="polite"
      >
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
        <Globe size={11} className="shrink-0" aria-hidden="true" />
        <span>{t("chat.searchActivity")}</span>
      </div>

      <ol className="mt-2 flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={step.callId} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--text)]">
              <StepIcon status={step.status} />
              <span className="shrink-0">
                {step.stage === "reading" || step.toolName === "web_fetch"
                  ? t("chat.stepReading")
                  : t("chat.stepSearching")}
              </span>
              {step.label ? (
                <span className="truncate text-[var(--text-muted)]" title={step.label}>
                  “{step.label}”
                </span>
              ) : null}
            </div>

            {step.sites?.length ? (
              <ul className="flex flex-wrap gap-1 pl-[18px]">
                {step.sites.map((site) => (
                  <li
                    key={site}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-[2px] text-[10px] leading-none text-[var(--text-muted)]"
                  >
                    {site}
                  </li>
                ))}
              </ul>
            ) : step.status === "running" ? (
              // Placeholder rows so the block does not jump when sites land.
              <div className="flex gap-1 pl-[18px]" aria-hidden="true">
                <span className="skeleton-chip w-20" />
                <span className="skeleton-chip w-16" />
                <span className="skeleton-chip w-24" />
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      </div>

      {/* Below the box, where the answer itself will appear — inside it would
          read as part of the search rather than the reply being drafted. */}
      {awaitingAnswer ? (
        <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
          <span className="skeleton-line w-full" />
          <span className="skeleton-line w-[85%]" />
          <span className="skeleton-line w-[60%]" />
        </div>
      ) : null}
    </>
  );
};
