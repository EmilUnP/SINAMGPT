import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { listGuardrailEvents } from "@/lib/guardrail-engine";
import { clientIp } from "@/lib/rate-limit";

export type AuditCategory =
  | "admin"
  | "auth"
  | "chat"
  | "project"
  | "share"
  | "knowledge"
  | "settings"
  | "models"
  | "guardrails"
  | "guardrail";

export type AuditActor = {
  id?: string | null;
  username?: string | null;
};

export type AuditTarget = {
  type?: string;
  id?: string;
};

export type AuditEventRow = {
  id: string;
  category: string;
  action: string;
  actor_user_id: string | null;
  actor_username: string;
  target_type: string;
  target_id: string;
  summary: string;
  meta_json: string;
  ip: string;
  created_at: string;
  source: "audit" | "guardrail";
};

const newId = () => randomBytes(16).toString("hex");

export { clientIp };

export const recordAuditEvent = (input: {
  category: Exclude<AuditCategory, "guardrail">;
  action: string;
  actor?: AuditActor | null;
  target?: AuditTarget | null;
  summary: string;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}): void => {
  try {
    const metaJson = JSON.stringify(input.meta ?? {}).slice(0, 4000);
    getDb()
      .prepare(
        `INSERT INTO audit_events
         (id, category, action, actor_user_id, actor_username,
          target_type, target_id, summary, meta_json, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        input.category,
        input.action.slice(0, 80),
        input.actor?.id ?? null,
        (input.actor?.username || "").slice(0, 120),
        (input.target?.type || "").slice(0, 80),
        (input.target?.id || "").slice(0, 120),
        input.summary.slice(0, 500),
        metaJson,
        (input.ip || "").slice(0, 80),
      );
  } catch (err) {
    console.error("[OwnGPT] audit log failed:", err);
  }
};

export const listAuditEvents = (input?: {
  limit?: number;
  category?: string | null;
}): AuditEventRow[] => {
  const limit = Math.max(1, Math.min(200, Math.floor(input?.limit ?? 80)));
  const category = (input?.category || "").trim().toLowerCase();

  if (category && category !== "all" && category !== "guardrail") {
    const rows = getDb()
      .prepare(
        `SELECT id, category, action, actor_user_id, actor_username,
                target_type, target_id, summary, meta_json, ip, created_at
         FROM audit_events
         WHERE category = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(category, limit) as Array<Omit<AuditEventRow, "source">>;

    return rows.map((row) => ({ ...row, source: "audit" as const }));
  }

  if (category === "guardrail") {
    return listGuardrailEvents(limit).map((ev) => ({
      id: `gr_${ev.id}`,
      category: "guardrail",
      action: ev.decision,
      actor_user_id: ev.user_id,
      actor_username: ev.username,
      target_type: "prompt",
      target_id: "",
      summary: ev.summary,
      meta_json: JSON.stringify({
        audience: ev.audience,
        prompt_preview: ev.prompt_preview,
        findings: (() => {
          try {
            return JSON.parse(ev.findings_json || "[]");
          } catch {
            return [];
          }
        })(),
      }).slice(0, 4000),
      ip: "",
      created_at: ev.created_at,
      source: "guardrail" as const,
    }));
  }

  // Merge audit + guardrail for "all"
  const auditLimit = Math.max(1, Math.ceil(limit * 0.75));
  const guardLimit = Math.max(1, Math.ceil(limit * 0.5));

  const auditRows = getDb()
    .prepare(
      `SELECT id, category, action, actor_user_id, actor_username,
              target_type, target_id, summary, meta_json, ip, created_at
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(auditLimit) as Array<Omit<AuditEventRow, "source">>;

  const guardRows = listGuardrailEvents(guardLimit).map((ev) => ({
    id: `gr_${ev.id}`,
    category: "guardrail",
    action: ev.decision,
    actor_user_id: ev.user_id,
    actor_username: ev.username,
    target_type: "prompt",
    target_id: "",
    summary: ev.summary,
    meta_json: JSON.stringify({
      audience: ev.audience,
      prompt_preview: ev.prompt_preview,
    }).slice(0, 4000),
    ip: "",
    created_at: ev.created_at,
    source: "guardrail" as const,
  }));

  return [...auditRows.map((row) => ({ ...row, source: "audit" as const })), ...guardRows]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
};
