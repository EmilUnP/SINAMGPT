import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, recordAuditEvent } from "@/lib/audit";
import {
  deleteProject,
  getProject,
  updateProject,
  userCanManageProject,
} from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = getProject(id);
  if (!project || project.is_archived === 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userCanManageProject(project, user.id, user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ project });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = getProject(id);
  if (!existing || existing.is_archived === 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userCanManageProject(existing, user.id, user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  if (project) {
    recordAuditEvent({
      category: "project",
      action: "project.rename",
      actor: { id: user.id, username: user.username },
      target: { type: "project", id: project.id },
      summary: `${user.username} updated project "${project.name}"`,
      meta: { keys: Object.keys(parsed.data) },
      ip: clientIp(request),
    });
  }
  return NextResponse.json({ project });
}

/** Hard-delete: chats move back to “no project”. Owner or admin. */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = getProject(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!userCanManageProject(existing, user.id, user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  deleteProject(id);
  recordAuditEvent({
    category: "project",
    action: "project.delete",
    actor: { id: user.id, username: user.username },
    target: { type: "project", id },
    summary: `${user.username} deleted project "${existing.name}"`,
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, deleted: true });
}
