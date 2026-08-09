import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { clientIp, recordAuditEvent } from "@/lib/audit";
import {
  deleteKnowledgeDoc,
  getKnowledgeDoc,
  updateKnowledgeDoc,
} from "@/lib/knowledge";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  category: z.enum(["company", "project", "product", "faq", "other"]).optional(),
  content: z.string().trim().min(10).max(20000).optional(),
  tags: z.string().max(500).optional(),
  project_id: z.string().trim().min(1).max(64).nullable().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  always_include: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!getKnowledgeDoc(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const doc = updateKnowledgeDoc(id, parsed.data);
  if (doc) {
    recordAuditEvent({
      category: "knowledge",
      action: "knowledge.update",
      actor: { id: admin.id, username: admin.username },
      target: { type: "knowledge_doc", id: doc.id },
      summary: `${admin.username} updated knowledge "${doc.title}"`,
      meta: { keys: Object.keys(parsed.data) },
      ip: clientIp(request),
    });
  }
  return NextResponse.json({ doc });
}

export async function DELETE(request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = getKnowledgeDoc(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  deleteKnowledgeDoc(id);
  recordAuditEvent({
    category: "knowledge",
    action: "knowledge.delete",
    actor: { id: admin.id, username: admin.username },
    target: { type: "knowledge_doc", id },
    summary: `${admin.username} deleted knowledge "${existing.title}"`,
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}
