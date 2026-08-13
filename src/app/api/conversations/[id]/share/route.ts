import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  createOrRotateShareToken,
  revokeShareToken,
} from "@/lib/share";

type Params = { params: Promise<{ id: string }> };

const getOwnedShareState = (id: string, userId: string) => {
  return getDb()
    .prepare(
      `SELECT id, share_token FROM conversations WHERE id = ? AND user_id = ?`,
    )
    .get(id, userId) as { id: string; share_token: string | null } | undefined;
};

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = getOwnedShareState(id, user.id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    share_token: row.share_token,
    shared: Boolean(row.share_token),
  });
}

/** Create or rotate share link (owner only). */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const before = getOwnedShareState(id, user.id);
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = createOrRotateShareToken(id, user.id);
  if (!token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    share_token: token,
    path: `/share/${token}`,
  });
}

/** Revoke share link (owner only). */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!getOwnedShareState(id, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  revokeShareToken(id, user.id);
  return NextResponse.json({ ok: true, shared: false });
}
