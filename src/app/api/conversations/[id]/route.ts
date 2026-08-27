import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteConversationAttachments, hydrateUiMessage } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertAssignableProject } from "@/lib/projects";
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
      `SELECT * FROM (
         SELECT id, conversation_id, role, content, sources, attachments, tool_trace, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 500
       )
       ORDER BY created_at ASC`,
    )
    .all(id) as Array<
    Message & {
      sources: string | null;
      attachments?: string | null;
      tool_trace?: string | null;
    }
  >;

  const messages: Message[] = rows.map((row) => hydrateUiMessage(row));

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
  let projectId = conversation.project_id;
  if (parsed.data.project_id !== undefined) {
    const projectCheck = assertAssignableProject(
      parsed.data.project_id,
      user.id,
      user.role,
    );
    if (!projectCheck.ok) {
      return NextResponse.json({ error: projectCheck.error }, { status: 403 });
    }
    projectId = projectCheck.projectId;
  }

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

  deleteConversationAttachments(id);
  getDb().prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
