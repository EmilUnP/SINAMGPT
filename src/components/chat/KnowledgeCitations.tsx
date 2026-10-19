"use client";

import { useState } from "react";
import { BookMarked, Globe } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";
import type { KnowledgeCitation } from "@/lib/types";

type KnowledgeCitationsProps = {
  sources?: KnowledgeCitation[] | null;
  className?: string;
  /** Slightly softer style for guest / dark landing */
  tone?: "chat" | "home";
};

/** How many chips show before the rest collapse behind "+N". */
const VISIBLE_LIMIT = 4;

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

/**
 * `wikipedia.org` reads faster than "Elçin Əliyev – Vikipediya", and it makes a
 * junk result obvious at a glance — the full title stays in the tooltip.
 */
const domainOf = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

/**
 * Deterministic hue per domain. Remote favicons are not an option — the CSP
 * allows images from 'self' only, and fetching them would leak every source
 * domain to a third party.
 */
const hueOf = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
};

const monogramOf = (domain: string): string =>
  (domain.replace(/^[^a-z0-9]+/i, "")[0] ?? "?").toUpperCase();

/**
 * Company knowledge is listed first — it is the authoritative source, and
 * mixing it inline with web results made an internal doc look like a search
 * hit. But when web results exist they must keep some visible slots: a company
 * pack easily contributes five docs, and a plain knowledge-first sort would
 * push every web result behind "+N", hiding exactly the evidence a reader
 * wants on a search-backed answer.
 */
export const selectVisibleSources = (
  sources: KnowledgeCitation[],
  limit: number,
  expanded: boolean,
): {
  ordered: KnowledgeCitation[];
  visible: KnowledgeCitation[];
  hiddenCount: number;
} => {
  const knowledge = sources.filter((source) => source.category !== "web");
  const web = sources.filter((source) => source.category === "web");
  const ordered = [...knowledge, ...web];

  if (expanded || ordered.length <= limit) {
    return { ordered, visible: ordered, hiddenCount: 0 };
  }

  const knowledgeShown = web.length
    ? Math.min(knowledge.length, Math.max(1, Math.floor(limit / 2)))
    : Math.min(knowledge.length, limit);
  const visible = [
    ...knowledge.slice(0, knowledgeShown),
    ...web.slice(0, limit - knowledgeShown),
  ];
  return { ordered, visible, hiddenCount: ordered.length - visible.length };
};

export const KnowledgeCitations = ({
  sources,
  className = "",
  tone = "chat",
}: KnowledgeCitationsProps) => {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);

  if (!sources?.length) return null;

  const isHome = tone === "home";

  const { ordered, visible, hiddenCount } = selectVisibleSources(
    sources,
    VISIBLE_LIMIT,
    expanded,
  );

  const mutedClass = isHome ? "text-[var(--home-faint)]" : "text-[var(--text-muted)]";
  const chipClass = isHome
    ? "border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)] hover:border-[var(--home-muted)]"
    : "border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text)] hover:border-[var(--accent)]";

  return (
    <div className={`mt-2 flex flex-col gap-1.5 ${className}`}>
      <div
        className={`flex items-center gap-1.5 text-[11px] font-medium tracking-wide ${mutedClass}`}
      >
        <Globe size={11} className="shrink-0" aria-hidden="true" />
        <span>{t("common.sources")}</span>
        <span className="opacity-60">{ordered.length}</span>
      </div>

      <ul className="flex flex-wrap items-center gap-1.5">
        {visible.map((source, index) => {
          const href = safeHttpUrl(source.url);
          const isWeb = source.category === "web";
          const domain = href ? domainOf(href) : "";
          const label = isWeb && domain ? domain : source.title;
          const hint = href ? `${source.title}\n${href}` : source.title;

          const body = (
            <>
              {isWeb && domain ? (
                <span
                  aria-hidden="true"
                  className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] text-[8px] font-bold text-white"
                  style={{
                    backgroundColor: `hsl(${hueOf(domain)} 55% 45%)`,
                  }}
                >
                  {monogramOf(domain)}
                </span>
              ) : (
                <BookMarked
                  size={11}
                  className="shrink-0 text-[var(--accent)]"
                  aria-hidden="true"
                />
              )}
              <span className="max-w-[170px] truncate">{label}</span>
            </>
          );

          const shared =
            "flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

          return (
            <li key={`${source.id}-${index}`}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={hint}
                  className={`${shared} ${chipClass}`}
                >
                  {body}
                </a>
              ) : (
                <span title={hint} className={`${shared} ${chipClass} cursor-default`}>
                  {body}
                </span>
              )}
            </li>
          );
        })}

        {hiddenCount > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              className={`rounded-full border border-dashed px-2 py-[3px] text-[11px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                isHome
                  ? "border-[var(--home-chip-border)] text-[var(--home-faint)] hover:text-[var(--home-muted)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
              }`}
            >
              {t("common.sourcesMore", { n: hiddenCount })}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
};
