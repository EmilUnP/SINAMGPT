import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const target = getDb()
    .prepare(
      `SELECT id, username, role, is_active, created_at, last_active_at
       FROM users WHERE id = ?`,
    )
    .get(id) as User | undefined;

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (parsed.data.is_active !== undefined) {
    if (target.id === admin.id) {
      return NextResponse.json(
        { error: "You cannot disable your own admin account" },
        { status: 400 },
      );
    }

    if (target.role === "admin" && parsed.data.is_active === false) {
      const adminCount = getDb()
        .prepare(
          `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1`,
        )
        .get() as { count: number };

      if (adminCount.count <= 1) {
        return NextResponse.json(
          { error: "Cannot disable the last active admin" },
          { status: 400 },
        );
      }
    }

    getDb()
      .prepare(`UPDATE users SET is_active = ? WHERE id = ?`)
      .run(parsed.data.is_active ? 1 : 0, id);
  }

  const updated = getDb()
    .prepare(
      `SELECT id, username, role, is_active, created_at, last_active_at
       FROM users WHERE id = ?`,
    )
    .get(id) as User;

  return NextResponse.json({ user: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const target = getDb()
    .prepare(`SELECT id, role FROM users WHERE id = ?`)
    .get(id) as { id: string; role: string } | undefined;

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "admin") {
    const adminCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
      .get() as { count: number };

    if (adminCount.count <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last admin" },
        { status: 400 },
      );
    }
  }

  getDb().prepare(`DELETE FROM users WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
