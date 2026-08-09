"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, ScrollText } from "lucide-react";
import {
  AdminPageHeader,
  AdminPanelCard,
  adminBtnGhost,
} from "@/components/AdminChrome";
import type { AuditEventRow } from "@/lib/audit";

type AdminAuditPanelProps = {
  onError: (message: string) => void;
};

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin" },
  { id: "auth", label: "Auth" },
  { id: "share", label: "Share" },
  { id: "project", label: "Projects" },
  { id: "knowledge", label: "Knowledge" },
  { id: "settings", label: "Settings" },
  { id: "models", label: "Models" },
  { id: "guardrails", label: "Guardrails cfg" },
  { id: "guardrail", label: "Guardrail hits" },
];

const formatDate = (value: string) => {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [category, setCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        onError(data.error || "Failed to load audit trail");
        return;
      }
      setEvents(data.events || []);
    } catch {
      onError("Network error loading audit trail");
    } finally {
      setIsLoading(false);
    }
  }, [category, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminPanelCard>
      <div className="space-y-4 px-4 py-4">
        <AdminPageHeader
          icon={ScrollText}
          title="Audit trail"
          description="Admin changes, auth outcomes, share/project ops, and guardrail hits — not every chat message (see Live usage for generations)."
          actions={
            <button type="button" onClick={() => void load()} className={adminBtnGhost}>
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              Refresh
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
            Loading audit events…
          </p>
        ) : events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
            No events yet for this filter.
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
                      {formatDate(ev.created_at)}
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
