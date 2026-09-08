"use client";

import { BookMarked } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";
import type { KnowledgeCitation } from "@/lib/types";

type KnowledgeCitationsProps = {
  sources?: KnowledgeCitation[] | null;
  className?: string;
  /** Slightly softer style for guest / dark landing */
  tone?: "chat" | "home";
};

const safeHttpUrl = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
};

export const KnowledgeCitations = ({
  sources,
  className = "",
  tone = "chat",
}: KnowledgeCitationsProps) => {
  const t = useTranslations();
  if (!sources?.length) return null;

  const isHome = tone === "home";
  const linkClass = isHome
    ? "underline decoration-[var(--home-faint)] underline-offset-2 hover:text-[var(--home-muted)]"
    : "underline decoration-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)]";

  return (
    <div
      className={`mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug ${
        isHome
          ? "text-[var(--home-faint)]"
          : "text-[var(--text-muted)]"
      } ${className}`}
      title={sources
        .map((s) => `${s.title}${s.url ? ` (${s.url})` : ` (${s.category})`}`)
        .join("\n")}
    >
      <BookMarked
        size={12}
        className={`mt-0.5 shrink-0 ${
          isHome ? "text-[var(--home-muted)]" : "text-[var(--accent)]"
        }`}
      />
      <p>
        <span className="font-medium opacity-90">{t("common.from")}</span>{" "}
        {sources.map((source, index) => {
          const href = safeHttpUrl(source.url);
          return (
            <span key={`${source.id}-${index}`}>
              {index > 0 ? " · " : null}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {source.title}
                </a>
              ) : (
                source.title
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
};
