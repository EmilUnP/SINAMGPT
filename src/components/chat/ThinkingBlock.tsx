"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";

type ThinkingBlockProps = {
  reasoning: string;
  /** The model is still thinking: no answer text and no tool step yet. */
  active: boolean;
  startedAt?: number;
  durationMs?: number;
};

/** The newest thought, so the live line changes as the model works. */
const lastThought = (text: string): string => {
  const lines = text.trim().split("\n").filter((line) => line.trim());
  const last = lines.at(-1)?.trim() ?? "";
  return last.length > 140 ? `…${last.slice(-140)}` : last;
};

/**
 * Reasoning models (Qwen 3, Gemma 4) think before they answer. The app used
 * to drop that text, so the screen stayed blank for many seconds and looked
 * stuck. Now the thinking shows live, then folds into "Thought for 6s" that
 * opens on click — the pattern ChatGPT and DeepSeek use.
 */
export const ThinkingBlock = ({
  reasoning,
  active,
  startedAt,
  durationMs,
}: ThinkingBlockProps) => {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => startedAt ?? 0);

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsed = durationMs ?? (startedAt ? Math.max(0, now - startedAt) : 0);
  const seconds = Math.max(1, Math.round(elapsed / 1000));

  if (active) {
    return (
      <div className="flex flex-col gap-1" aria-live="polite">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <Loader2 size={12} className="shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
          <span className="font-medium">{t("chat.thinking")}</span>
          <span className="tabular-nums opacity-70">{seconds}s</span>
        </div>
        <p className="truncate pl-[18px] text-[12px] italic text-[var(--text-muted)]">
          {lastThought(reasoning)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? t("chat.thinkingHide") : t("chat.thinkingShow")}
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <Brain size={12} className="shrink-0" aria-hidden="true" />
        <span>{t("chat.thoughtFor", { n: seconds })}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          {reasoning.trim()}
        </div>
      ) : null}
    </div>
  );
};
