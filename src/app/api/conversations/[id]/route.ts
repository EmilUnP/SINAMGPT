import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Conversation, Message } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const CONVERSATION_SELECT = `id, user_id, title, model, project_id, share_token, is_pinned, created_at, updated_at`;

const getOwnedConversation = (id: string, userId: string) => {
  return getDb()
    .prepare(
      `SELECT ${CONVERSATION_SELECT}
       FROM conversations WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as Conversation | undefined;
};

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = getOwnedConversation(id, user.id);

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = getDb()
    .prepare(
      `SELECT id, conversation_id, role, content, sources, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
    )
    .all(id) as Array<
    Message & { sources: string | null }
  >;

  const messages: Message[] = rows.map((row) => {
    let sources: Message["sources"] = null;
    if (row.sources) {
      try {
        const parsed = JSON.parse(row.sources) as Message["sources"];
        if (Array.isArray(parsed) && parsed.length) sources = parsed;
      } catch {
        sources = null;
      }
    }
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
      sources,
    };
  });

  return NextResponse.json({ conversation, messages });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  is_pinned: z.boolean().optional(),
  project_id: z.string().trim().min(1).max(64).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = getOwnedConversation(id, user.id);

  if (!conversation) {
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

  const title = parsed.data.title ?? conversation.title;
  const model = parsed.data.model ?? conversation.model;
  const isPinned =
    parsed.data.is_pinned === undefined
      ? conversation.is_pinned
      : parsed.data.is_pinned
        ? 1
        : 0;
  const projectId =
    parsed.data.project_id === undefined
      ? conversation.project_id
      : parsed.data.project_id;

  getDb()
    .prepare(
      `UPDATE conversations
       SET title = ?, model = ?, is_pinned = ?, project_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(title, model, isPinned, projectId, id);

  const updated = getOwnedConversation(id, user.id);
  return NextResponse.json({ conversation: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = getOwnedConversation(id, user.id);

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  getDb().prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
