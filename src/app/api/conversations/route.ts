import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, newId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Conversation } from "@/lib/types";

const CONVERSATION_SELECT = `id, user_id, title, model, project_id, is_pinned, created_at, updated_at`;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const projectId = (searchParams.get("projectId") || "").trim();

  const db = getDb();
  let conversations: Conversation[];

  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const sql = `
      SELECT DISTINCT c.id, c.user_id, c.title, c.model, c.project_id,
             c.is_pinned, c.created_at, c.updated_at
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ?
        ${projectId ? "AND c.project_id = ?" : ""}
        AND (
          c.title LIKE ? COLLATE NOCASE
          OR c.model LIKE ? COLLATE NOCASE
          OR m.content LIKE ? COLLATE NOCASE
        )
      ORDER BY c.is_pinned DESC, c.updated_at DESC
    `;
    conversations = (
      projectId
        ? db.prepare(sql).all(user.id, projectId, like, like, like)
        : db.prepare(sql).all(user.id, like, like, like)
    ) as Conversation[];
  } else if (projectId) {
    conversations = db
      .prepare(
        `SELECT ${CONVERSATION_SELECT}
         FROM conversations
         WHERE user_id = ? AND project_id = ?
         ORDER BY is_pinned DESC, updated_at DESC`,
      )
      .all(user.id, projectId) as Conversation[];
  } else {
    conversations = db
      .prepare(
        `SELECT ${CONVERSATION_SELECT}
         FROM conversations
         WHERE user_id = ?
         ORDER BY is_pinned DESC, updated_at DESC`,
      )
      .all(user.id) as Conversation[];
  }

  return NextResponse.json({ conversations });
}

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  model: z.string().trim().min(1).max(120),
  projectId: z.string().trim().min(1).max(64).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const id = newId();
    const title = parsed.data.title || "New chat";
    const model = parsed.data.model;
    const projectId = parsed.data.projectId ?? null;

    getDb()
      .prepare(
        `INSERT INTO conversations (id, user_id, title, model, project_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, user.id, title, model, projectId);

    const conversation = getDb()
      .prepare(
        `SELECT ${CONVERSATION_SELECT}
         FROM conversations WHERE id = ?`,
      )
      .get(id) as Conversation;

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("create conversation error", error);
    return NextResponse.json(
      { error: "Could not create conversation" },
      { status: 500 },
    );
  }
}
