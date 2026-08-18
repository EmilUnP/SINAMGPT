import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  createKnowledgeDoc,
  getKnowledgeOverview,
  getKnowledgeSettings,
  listKnowledgeDocs,
  reseedSinamKnowledge,
  setKnowledgeSettings,
  type KnowledgeCategory,
} from "@/lib/knowledge";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const overview = new URL(request.url).searchParams.get("overview") === "1";
  if (overview) {
    return NextResponse.json({
      overview: getKnowledgeOverview(),
      settings: getKnowledgeSettings(),
    });
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

  if (body?.action === "seed_sinam") {
    const replaceAll = Boolean(body.replaceAll);
    const overwriteExisting = Boolean(body.overwriteExisting);
    const result = reseedSinamKnowledge(replaceAll, overwriteExisting);
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
      maxChars: z.number().int().min(500).max(5000).optional(),
    });
    const parsed = settingsSchema.safeParse(body.settings ?? body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
        { status: 400 },
      );
    }
    const settings = setKnowledgeSettings(parsed.data);
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

  return NextResponse.json({ doc }, { status: 201 });
}
