import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { AdminUserRow } from "@/lib/types";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = getDb()
    .prepare(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.is_active,
        u.created_at,
        u.last_active_at,
        COUNT(DISTINCT c.id) AS conversation_count,
        COUNT(m.id) AS message_count,
        SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) AS user_message_count
      FROM users u
      LEFT JOIN conversations c ON c.user_id = u.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `,
    )
    .all() as AdminUserRow[];

  const totals = getDb()
    .prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = 1) AS active_users,
        (SELECT COUNT(*) FROM conversations) AS total_conversations,
        (SELECT COUNT(*) FROM messages) AS total_messages,
        (SELECT COUNT(*) FROM messages WHERE role = 'user') AS total_user_messages
    `,
    )
    .get() as {
    total_users: number;
    active_users: number;
    total_conversations: number;
    total_messages: number;
    total_user_messages: number;
  };

  return NextResponse.json({ users, totals });
}
