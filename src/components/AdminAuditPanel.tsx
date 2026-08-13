"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, ScrollText } from "lucide-react";
import {
  AdminPageHeader,
  AdminPanelCard,
  adminBtnGhost,
} from "@/components/AdminChrome";
import { useLocale } from "@/components/LocaleProvider";
import type { AuditEventRow } from "@/lib/audit";

type AdminAuditPanelProps = {
  onError: (message: string) => void;
};

const formatDate = (value: string, locale: string) => {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "az" ? "az-AZ" : "en-US");
};

const categoryTone = (category: string) => {
  switch (category) {
    case "auth":
      return "admin-tag admin-tag-auth";
    case "admin":
      return "admin-tag admin-tag-admin";
    case "share":
      return "admin-tag admin-tag-share";
    case "project":
      return "admin-tag admin-tag-project";
    case "knowledge":
      return "admin-tag admin-tag-knowledge";
    case "settings":
      return "admin-tag admin-tag-settings";
    case "models":
      return "admin-tag admin-tag-models";
    case "guardrails":
      return "admin-tag admin-tag-guardrails";
    case "guardrail":
      return "admin-tag admin-tag-guardrail";
    default:
      return "admin-tag admin-tag-neutral";
  }
};

export const AdminAuditPanel = ({ onError }: AdminAuditPanelProps) => {
  const { locale, t } = useLocale();
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [category, setCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const FILTERS: Array<{ id: string; label: string }> = [
    { id: "all", label: t("admin.audit.all") },
    { id: "admin", label: t("admin.audit.admin") },
    { id: "auth", label: t("admin.audit.auth") },
    { id: "share", label: t("admin.audit.share") },
    { id: "project", label: t("admin.audit.projects") },
    { id: "knowledge", label: t("admin.audit.knowledge") },
    { id: "settings", label: t("admin.audit.settings") },
    { id: "models", label: t("admin.audit.models") },
    { id: "guardrails", label: t("admin.audit.guardrailsCfg") },
    { id: "guardrail", label: t("admin.audit.guardrailHits") },
  ];

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (category && category !== "all") params.set("category", category);
      const res = await fetch(`/api/admin/audit?${params}`);
      const data = (await res.json()) as {
        events?: AuditEventRow[];
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || t("admin.audit.failedLoad"));
        return;
      }
      setEvents(data.events || []);
    } catch {
      onError(t("admin.audit.networkLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [category, onError, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <AdminPanelCard>
      <div className="space-y-4 px-4 py-4">
        <AdminPageHeader
          icon={ScrollText}
          title={t("admin.audit.title")}
          description={t("admin.audit.description")}
          actions={
            <button type="button" onClick={() => void load()} className={adminBtnGhost}>
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              {t("admin.chrome.refresh")}
            </button>
          }
        />

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategory(f.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                category === f.id
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--admin-surface-soft)] text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[36rem] overflow-y-auto border-t border-[var(--admin-border)]">
        {isLoading && events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
            {t("admin.audit.loading")}
          </p>
        ) : events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
            {t("admin.audit.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--admin-border)]">
            {events.map((ev) => {
              const isOpen = expandedId === ev.id;
              let meta: unknown = null;
              try {
                meta = JSON.parse(ev.meta_json || "{}");
              } catch {
                meta = ev.meta_json;
              }
              const hasMeta =
                meta &&
                typeof meta === "object" &&
                Object.keys(meta as object).length > 0;

              return (
                <li key={ev.id} className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={categoryTone(ev.category)}>
                      {ev.category}
                    </span>
                    <span className="font-mono text-[var(--admin-fg)]">
                      {ev.action}
                    </span>
                    <span className="text-[var(--admin-muted)]">
                      {ev.actor_username || "—"}
                    </span>
                    <span className="text-[var(--admin-muted)]">
                      {formatDate(ev.created_at, locale)}
                    </span>
                    {ev.ip ? (
                      <span className="text-[var(--admin-muted)]">· {ev.ip}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-medium text-[var(--admin-fg)]">
                    {ev.summary}
                  </p>
                  {ev.target_type ? (
                    <p className="mt-0.5 text-[var(--admin-muted)]">
                      {ev.target_type}
                      {ev.target_id ? `: ${ev.target_id}` : ""}
                    </p>
                  ) : null}
                  {hasMeta ? (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : ev.id)}
                      className="mt-1 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                    >
                      {isOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      Details
                    </button>
                  ) : null}
                  {isOpen && hasMeta ? (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] p-2 text-[10px] text-[var(--admin-muted)]">
                      {JSON.stringify(meta, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminPanelCard>
  );
};
