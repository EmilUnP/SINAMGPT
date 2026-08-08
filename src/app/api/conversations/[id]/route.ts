import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Conversation, Message } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const getOwnedConversation = (id: string, userId: string) => {
  return getDb()
    .prepare(
      `SELECT id, user_id, title, model, created_at, updated_at
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

  const messages = getDb()
    .prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
    )
    .all(id) as Message[];

  return NextResponse.json({ conversation, messages });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
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

  getDb()
    .prepare(
      `UPDATE conversations
       SET title = ?, model = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(title, model, id);

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
