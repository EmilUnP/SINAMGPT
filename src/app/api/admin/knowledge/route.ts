import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { clientIp, recordAuditEvent } from "@/lib/audit";
import {
  createKnowledgeDoc,
  getKnowledgeSettings,
  listKnowledgeDocs,
  reseedSinamKnowledge,
  setKnowledgeSettings,
  type KnowledgeCategory,
} from "@/lib/knowledge";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    docs: listKnowledgeDocs(),
    settings: getKnowledgeSettings(),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.enum(["company", "project", "product", "faq", "other"]),
  content: z.string().trim().min(10).max(20000),
  tags: z.string().max(500).optional(),
  project_id: z.string().trim().min(1).max(64).nullable().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  always_include: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const ip = clientIp(request);

  if (body?.action === "seed_sinam") {
    const replaceAll = Boolean(body.replaceAll);
    const overwriteExisting = Boolean(body.overwriteExisting);
    const result = reseedSinamKnowledge(replaceAll, overwriteExisting);
    recordAuditEvent({
      category: "knowledge",
      action: "knowledge.seed",
      actor: { id: admin.id, username: admin.username },
      summary: `${admin.username} reseeded SINAM knowledge`,
      meta: { replaceAll, overwriteExisting, ...result },
      ip,
    });
    return NextResponse.json({
      ...result,
      docs: listKnowledgeDocs(),
      settings: getKnowledgeSettings(),
    });
  }

  if (body?.action === "settings") {
    const settingsSchema = z.object({
      enabled: z.boolean().optional(),
      applyToGuests: z.boolean().optional(),
      applyToUsers: z.boolean().optional(),
      showCitations: z.boolean().optional(),
      maxDocs: z.number().int().min(1).max(10).optional(),
      maxChars: z.number().int().min(500).max(12000).optional(),
    });
    const parsed = settingsSchema.safeParse(body.settings ?? body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
        { status: 400 },
      );
    }
    const settings = setKnowledgeSettings(parsed.data);
    recordAuditEvent({
      category: "knowledge",
      action: "knowledge.settings",
      actor: { id: admin.id, username: admin.username },
      summary: `${admin.username} updated knowledge settings`,
      meta: { keys: Object.keys(parsed.data) },
      ip,
    });
    return NextResponse.json({ settings, docs: listKnowledgeDocs() });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const doc = createKnowledgeDoc({
    ...parsed.data,
    category: parsed.data.category as KnowledgeCategory,
  });

  recordAuditEvent({
    category: "knowledge",
    action: "knowledge.create",
    actor: { id: admin.id, username: admin.username },
    target: { type: "knowledge_doc", id: doc.id },
    summary: `${admin.username} created knowledge "${doc.title}"`,
    meta: { category: doc.category },
    ip,
  });

  return NextResponse.json({ doc }, { status: 201 });
}
