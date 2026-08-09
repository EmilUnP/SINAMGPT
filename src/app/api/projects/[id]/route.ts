import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = getProject(id);
  if (!project || (project.is_archived === 1 && user.role !== "admin")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  is_archived: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!getProject(id)) {
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

  const project = updateProject(id, parsed.data);
  return NextResponse.json({ project });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!getProject(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-archive for everyone; hard delete only admin
  if (user.role === "admin") {
    deleteProject(id);
    return NextResponse.json({ ok: true, deleted: true });
  }

  updateProject(id, { is_archived: true });
  return NextResponse.json({ ok: true, archived: true });
}
