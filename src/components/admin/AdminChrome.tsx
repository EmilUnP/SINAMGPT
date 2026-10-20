"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";

export type AdminSubtab<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  count?: number | string;
};

/* Shared focus ring: every admin control shows the same keyboard affordance. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export const AdminPageHeader = ({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
}) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0 max-w-2xl">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)]">
          <Icon size={16} />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-[var(--admin-fg)]">
          {title}
        </h2>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--admin-muted)]">
        {description}
      </p>
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);

/** Title row at the top of a card section (tables, lists, charts). */
export const AdminSectionHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-3 border-b border-[var(--admin-border)] px-4 py-3 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-[var(--admin-fg)]">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--admin-muted)]">
          {description}
        </p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:justify-end">
        {actions}
      </div>
    ) : null}
  </div>
);

export const AdminSubtabs = <T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<AdminSubtab<T>>;
  active: T;
  onChange: (id: T) => void;
}) => (
  <div
    role="tablist"
    className="flex gap-1 overflow-x-auto border-b border-[var(--admin-border)] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {tabs.map(({ id, label, icon: Icon, count }) => {
      const isActive = active === id;
      return (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(id)}
          className={`-mb-px inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 py-2 text-center text-[13px] font-medium leading-tight transition sm:min-h-0 sm:flex-none sm:px-3 sm:py-2.5 sm:text-sm ${focusRing} ${
            isActive
              ? "border-[var(--accent)] text-[var(--admin-fg)]"
              : "border-transparent text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
          }`}
        >
          {Icon ? <Icon size={14} className="hidden shrink-0 sm:block" /> : null}
          <span>{label}</span>
          {count !== undefined ? (
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                isActive
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "bg-[var(--chip-info-bg)] text-[var(--admin-muted)]"
              }`}
            >
              {count}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
);

export const AdminStatGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
);

export const AdminStatCard = ({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "bad" | "info";
  icon?: LucideIcon;
}) => {
  const toneClass =
    tone === "ok"
      ? "text-[var(--status-ok-fg)]"
      : tone === "warn"
        ? "text-[var(--status-warn-fg)]"
        : tone === "bad"
          ? "text-[var(--status-bad-fg)]"
          : tone === "info"
            ? "text-[var(--accent)]"
            : "text-[var(--admin-fg)]";

  return (
    <div className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
          {label}
        </p>
        {Icon ? (
          <Icon size={14} className="mt-px shrink-0 text-[var(--accent)]" />
        ) : null}
      </div>
      <p
        className={`mt-1 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${toneClass}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-snug text-[var(--admin-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export const AdminPanelCard = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  /* overflow-clip (not hidden) keeps rounded corners without turning the
     card into a scroll container, so sticky save bars inside still stick. */
  <section
    className={`animate-fade-up overflow-clip rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] ${className}`}
  >
    {children}
  </section>
);

/** Bordered group of related fields inside a panel. */
export const AdminSection = ({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <div className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)]/60 p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[var(--admin-fg)]">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--admin-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

/** Label + control + hint. The label wraps the control, so clicks focus it. */
export const AdminField = ({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) => (
  <label className={`block min-w-0 ${className}`}>
    <span className="text-sm font-medium text-[var(--admin-fg)]">{label}</span>
    {children}
    {hint ? (
      <span className="mt-1.5 block text-xs leading-relaxed text-[var(--admin-muted)]">
        {hint}
      </span>
    ) : null}
  </label>
);

export const AdminHint = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3.5 py-3 text-sm leading-relaxed text-[var(--admin-muted)]">
    {children}
  </div>
);

/** Centered muted line for loading, empty and "nothing yet" states. */
export const AdminEmptyState = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <p
    className={`px-4 py-10 text-center text-sm text-[var(--admin-muted)] ${className}`}
  >
    {children}
  </p>
);

export const AdminToggleCard = ({
  checked,
  onChange,
  label,
  hint,
  emphasize,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  emphasize?: boolean;
}) => {
  const t = useTranslations();
  const segment = `touch-target rounded-full px-3 py-1 text-xs font-semibold capitalize whitespace-nowrap transition ${focusRing}`;
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
        emphasize
          ? "border-[var(--accent)]/25 bg-[var(--accent)]/[0.06]"
          : "border-[var(--admin-border)] bg-[var(--admin-surface-soft)]"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--admin-fg)]">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--admin-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
      <div
        role="group"
        aria-label={label}
        className="inline-flex shrink-0 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] p-0.5"
      >
        <button
          type="button"
          aria-pressed={!checked}
          onClick={() => onChange(false)}
          className={`${segment} ${
            !checked
              ? "bg-[var(--admin-muted)]/25 text-[var(--admin-fg)]"
              : "text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
          }`}
        >
          {t("admin.chrome.off")}
        </button>
        <button
          type="button"
          aria-pressed={checked}
          onClick={() => onChange(true)}
          className={`${segment} ${
            checked
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
          }`}
        >
          {t("admin.chrome.on")}
        </button>
      </div>
    </div>
  );
};

/** Search box with an icon; the placeholder doubles as its accessible name. */
export const AdminSearchInput = ({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) => (
  <div className={`relative ${className}`}>
    <Search
      size={14}
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]"
    />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${adminControlClass} w-full pl-8`}
    />
  </div>
);

/** "Rows [25]" page-size picker used under every paged table. */
export const AdminRowsSelect = <T extends number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) => {
  const t = useTranslations();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--admin-muted)]">
      {t("admin.chrome.rows")}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as T)}
        className={`${adminControlClass} w-auto pr-8`}
      >
        {options.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
};

export const AdminPager = ({
  page,
  totalPages,
  onPage,
  children,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  children?: ReactNode;
}) => {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs tabular-nums text-[var(--admin-muted)]">
          {t("admin.users.pageOf", { page, total: totalPages })}
        </p>
        {children}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          className={adminBtnGhost}
        >
          <ChevronLeft size={14} />
          {t("admin.chrome.prev")}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          className={adminBtnGhost}
        >
          {t("admin.chrome.next")}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

/**
 * Floating status messages. Admin pages are long, so a banner at the top of
 * the page is off-screen when you press Save at the bottom; these stay in
 * view. Success notes fade after a few seconds, errors wait to be closed.
 */
export const AdminToasts = ({
  notice,
  error,
  onDismissNotice,
  onDismissError,
}: {
  notice: string;
  error: string;
  onDismissNotice: () => void;
  onDismissError: () => void;
}) => {
  const t = useTranslations();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismissNotice, 4500);
    return () => window.clearTimeout(timer);
  }, [notice, onDismissNotice]);

  const item = (
    tone: "ok" | "bad",
    message: string,
    onClose: () => void,
  ) => (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg animate-fade-up ${
        tone === "ok"
          ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
          : "border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] text-[var(--status-bad-fg)]"
      }`}
    >
      {tone === "ok" ? (
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
      ) : (
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      )}
      <p className="min-w-0 flex-1 break-words leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("admin.chrome.close")}
        className={`touch-target -mr-1 shrink-0 rounded-md p-0.5 opacity-70 transition hover:opacity-100 ${focusRing}`}
      >
        <X size={14} />
      </button>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div role="alert" className="flex w-full max-w-md flex-col gap-2 empty:hidden">
        {error ? item("bad", error, onDismissError) : null}
      </div>
      <div role="status" className="flex w-full max-w-md flex-col gap-2 empty:hidden">
        {notice ? item("ok", notice, onDismissNotice) : null}
      </div>
    </div>
  );
};

export const adminFieldClass =
  "mt-1.5 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2.5 text-base text-[var(--admin-fg)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-[var(--admin-muted)]/45 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-60 sm:text-sm";

/** Compact input/select for toolbars, filters and table cells. */
export const adminControlClass =
  "h-11 min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 text-base text-[var(--admin-fg)] outline-none transition placeholder:text-[var(--admin-muted)]/45 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-60 sm:h-9 sm:text-sm";

export const adminBtnPrimary = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9 ${focusRing}`;

export const adminBtnGhost = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-3.5 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 ${focusRing}`;

export const adminBtnDanger = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--status-bad-border)] px-3.5 py-2 text-sm text-[var(--status-bad-fg)] transition hover:bg-[var(--status-bad-bg)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 ${focusRing}`;

/** Small row action (table cells, card footers). */
export const adminBtnRow = `inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-[var(--admin-border)] px-2.5 py-1 text-xs font-medium text-[var(--admin-fg)] transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-8 ${focusRing}`;

export const adminBtnRowDanger = `inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-[var(--status-bad-border)] px-2.5 py-1 text-xs font-medium text-[var(--status-bad-fg)] transition hover:bg-[var(--status-bad-bg)] disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-8 ${focusRing}`;
