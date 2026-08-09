"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AdminSubtab<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  count?: number | string;
};

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
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)]">
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
    className="flex flex-wrap gap-1 border-b border-[var(--admin-border)]"
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
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            isActive
              ? "border-[var(--accent)] text-[var(--admin-fg)]"
              : "border-transparent text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
          }`}
        >
          {Icon ? <Icon size={14} /> : null}
          {label}
          {count !== undefined ? (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
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
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
);

export const AdminStatCard = ({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "bad" | "info";
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
    <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3.5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
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
  <section
    className={`animate-fade-up overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] ${className}`}
  >
    {children}
  </section>
);

export const AdminHint = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3.5 py-3 text-sm leading-relaxed text-[var(--admin-muted)]">
    {children}
  </div>
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
  hint: string;
  emphasize?: boolean;
}) => (
  <label
    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
      emphasize
        ? "border-[var(--accent)]/25 bg-[var(--accent)]/[0.06]"
        : "border-[var(--admin-border)] bg-[var(--admin-surface-soft)]"
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-1"
    />
    <span>
      <span className="block text-sm font-medium text-[var(--admin-fg)]">
        {label}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--admin-muted)]">
        {hint}
      </span>
    </span>
  </label>
);

export const adminFieldClass =
  "mt-1.5 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-[var(--admin-muted)]/45 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

export const adminBtnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";

export const adminBtnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-3.5 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)] disabled:opacity-60";
