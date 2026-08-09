import { BookMarked } from "lucide-react";
import type { KnowledgeCitation } from "@/lib/types";

type KnowledgeCitationsProps = {
  sources?: KnowledgeCitation[] | null;
  className?: string;
  /** Slightly softer style for guest / dark landing */
  tone?: "chat" | "home";
};

export const KnowledgeCitations = ({
  sources,
  className = "",
  tone = "chat",
}: KnowledgeCitationsProps) => {
  if (!sources?.length) return null;

  const titles = sources.map((s) => s.title).join(" · ");
  const isHome = tone === "home";

  return (
    <div
      className={`mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug ${
        isHome
          ? "text-[var(--home-faint)]"
          : "text-[var(--text-muted)]"
      } ${className}`}
      title={sources.map((s) => `${s.title} (${s.category})`).join("\n")}
    >
      <BookMarked
        size={12}
        className={`mt-0.5 shrink-0 ${
          isHome ? "text-[var(--home-muted)]" : "text-[var(--accent)]"
        }`}
      />
      <p>
        <span className="font-medium opacity-90">From:</span> {titles}
      </p>
    </div>
  );
};
