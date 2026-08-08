import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, newId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { Conversation } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = getDb()
    .prepare(
      `SELECT id, user_id, title, model, created_at, updated_at
       FROM conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(user.id) as Conversation[];

  return NextResponse.json({ conversations });
}

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  model: z.string().trim().min(1).max(120),
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

    getDb()
      .prepare(
        `INSERT INTO conversations (id, user_id, title, model)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, user.id, title, model);

    const conversation = getDb()
      .prepare(
        `SELECT id, user_id, title, model, created_at, updated_at
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
