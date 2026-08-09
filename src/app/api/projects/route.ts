import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, recordAuditEvent } from "@/lib/audit";
import {
  MAX_PROJECTS_PER_USER,
  countUserProjects,
  createProject,
  listProjects,
  listProjectsForUser,
} from "@/lib/projects";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";

  // Admins may list every project (e.g. knowledge tagging); users see only theirs.
  const projects =
    all && user.role === "admin"
      ? listProjects(false)
      : listProjectsForUser(user.id);

  const count = countUserProjects(user.id);

  return NextResponse.json({
    projects,
    limit: MAX_PROJECTS_PER_USER,
    count,
    remaining: Math.max(0, MAX_PROJECTS_PER_USER - count),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const count = countUserProjects(user.id);
  if (count >= MAX_PROJECTS_PER_USER) {
    return NextResponse.json(
      {
        error: `You can create up to ${MAX_PROJECTS_PER_USER} projects. Delete one to add another.`,
        limit: MAX_PROJECTS_PER_USER,
        count,
      },
      { status: 400 },
    );
  }

  const project = createProject({
    name: parsed.data.name,
    description: parsed.data.description,
    createdBy: user.id,
  });

  recordAuditEvent({
    category: "project",
    action: "project.create",
    actor: { id: user.id, username: user.username },
    target: { type: "project", id: project.id },
    summary: `${user.username} created project "${project.name}"`,
    ip: clientIp(request),
  });

  return NextResponse.json(
    {
      project,
      limit: MAX_PROJECTS_PER_USER,
      count: count + 1,
      remaining: Math.max(0, MAX_PROJECTS_PER_USER - count - 1),
    },
    { status: 201 },
  );
}
