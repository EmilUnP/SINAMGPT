import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import type { Conversation, KnowledgeCitation, Message } from "@/lib/types";

export type SharedConversation = Pick<
  Conversation,
  "id" | "title" | "model" | "created_at" | "updated_at"
> & {
  owner_username: string;
  share_token: string;
};

const newShareToken = () => randomBytes(18).toString("base64url");

export const createOrRotateShareToken = (
  conversationId: string,
  userId: string,
): string | null => {
  const owned = getDb()
    .prepare(`SELECT id FROM conversations WHERE id = ? AND user_id = ?`)
    .get(conversationId, userId) as { id: string } | undefined;
  if (!owned) return null;

  const token = newShareToken();
  getDb()
    .prepare(
      `UPDATE conversations
       SET share_token = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(token, conversationId, userId);

  return token;
};

export const revokeShareToken = (
  conversationId: string,
  userId: string,
): boolean => {
  const result = getDb()
    .prepare(
      `UPDATE conversations
       SET share_token = NULL, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(conversationId, userId);
  return result.changes > 0;
};

export const getSharedConversation = (
  token: string,
): SharedConversation | null => {
  const clean = token.trim();
  if (!clean || clean.length < 8 || clean.length > 80) return null;

  return (
    (getDb()
      .prepare(
        `SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                c.share_token, u.username AS owner_username
         FROM conversations c
         JOIN users u ON u.id = c.user_id
         WHERE c.share_token = ? AND u.is_active = 1`,
      )
      .get(clean) as SharedConversation | undefined) ?? null
  );
};

export const getSharedMessages = (conversationId: string): Message[] => {
  const rows = getDb()
    .prepare(
      `SELECT id, conversation_id, role, content, sources, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
    )
    .all(conversationId) as Array<Message & { sources: string | null }>;

  return rows.map((row) => {
    let sources: KnowledgeCitation[] | null = null;
    if (row.sources) {
      try {
        const parsed = JSON.parse(row.sources) as KnowledgeCitation[];
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
};
