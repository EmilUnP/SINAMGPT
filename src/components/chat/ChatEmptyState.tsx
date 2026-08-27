import Image from "next/image";
import sinamLogo from "@/assets/sinam_logo.png";
import type { useLocale } from "@/components/LocaleProvider";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatEmptyStateProps = {
  username: string;
  suggestions: Array<{ title: string; prompt: string }>;
  isDisabled: boolean;
  onSelect: (prompt: string) => void;
  t: Translate;
};

export const ChatEmptyState = ({
  username,
  suggestions,
  isDisabled,
  onSelect,
  t,
}: ChatEmptyStateProps) => (
  <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 py-6 text-center sm:px-6">
    <Image
      src={sinamLogo}
      alt={t("common.brand")}
      width={84}
      height={84}
      className="soft-rise h-[84px] w-[84px] rounded-full shadow-[0_12px_40px_rgba(37,99,235,0.18)]"
      style={{ width: "auto", height: "auto" }}
      priority
    />
    <p className="mt-5 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
      {t("chat.helloUser", { name: username })}
    </p>
    <p className="mt-3 max-w-md text-[var(--text-muted)]">
      {t("chat.signedInSub")}
    </p>
    <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      {suggestions.map((item, index) => (
        <button
          key={item.title}
          type="button"
          onClick={() => onSelect(item.prompt)}
          disabled={isDisabled}
          className="soft-rise rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-md disabled:opacity-50"
          style={{ animationDelay: `${0.05 * index}s` }}
        >
          <span className="block text-sm font-medium text-[var(--text)]">
            {item.title}
          </span>
          <span className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
            {item.prompt}
          </span>
        </button>
      ))}
    </div>
  </div>
);
