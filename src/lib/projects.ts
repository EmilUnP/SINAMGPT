import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";

export type Project = {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

/** Soft cap so the sidebar stays usable. */
export const MAX_PROJECTS_PER_USER = 5;

const newId = () => randomBytes(12).toString("hex");

export const listProjects = (includeArchived = false): Project[] => {
  if (includeArchived) {
    return getDb()
      .prepare(
        `SELECT * FROM projects
         ORDER BY is_archived ASC, name COLLATE NOCASE ASC`,
      )
      .all() as Project[];
  }
  return getDb()
    .prepare(
      `SELECT * FROM projects
       WHERE is_archived = 0
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all() as Project[];
};

export const listProjectsForUser = (userId: string): Project[] => {
  return getDb()
    .prepare(
      `SELECT * FROM projects
       WHERE created_by = ? AND is_archived = 0
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(userId) as Project[];
};

export const countUserProjects = (userId: string): number => {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM projects
       WHERE created_by = ? AND is_archived = 0`,
    )
    .get(userId) as { c: number };
  return row.c;
};

export const getProject = (id: string): Project | null => {
  return (
    (getDb()
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(id) as Project | undefined) ?? null
  );
};

export const userCanManageProject = (
  project: Project,
  userId: string,
  role: string,
): boolean => {
  if (role === "admin") return true;
  return project.created_by === userId;
};

/**
 * Ensure a project_id is safe to attach to the caller's chat / knowledge scope.
 * Admins may attach any active project; users only their own.
 */
export const assertAssignableProject = (
  projectId: string | null | undefined,
  userId: string,
  role: string,
): { ok: true; projectId: string | null } | { ok: false; error: string } => {
  if (projectId == null || projectId === "") {
    return { ok: true, projectId: null };
  }
  const project = getProject(projectId);
  if (!project || project.is_archived === 1) {
    return { ok: false, error: "Project not found" };
  }
  if (!userCanManageProject(project, userId, role)) {
    return { ok: false, error: "You cannot use this project" };
  }
  return { ok: true, projectId: project.id };
};

export const createProject = (input: {
  name: string;
  description?: string;
  createdBy: string;
}): Project => {
  const id = newId();
  const name = input.name.trim().slice(0, 80);
  const description = (input.description ?? "").trim().slice(0, 400);

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, description, created_by)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, name, description, input.createdBy);

  return getProject(id)!;
};

export const updateProject = (
  id: string,
  patch: {
    name?: string;
    description?: string;
    is_archived?: boolean;
  },
): Project | null => {
  const existing = getProject(id);
  if (!existing) return null;

  const name =
    patch.name !== undefined
      ? patch.name.trim().slice(0, 80)
      : existing.name;
  const description =
    patch.description !== undefined
      ? patch.description.trim().slice(0, 400)
      : existing.description;
  const isArchived =
    patch.is_archived === undefined
      ? existing.is_archived
      : patch.is_archived
        ? 1
        : 0;

  if (!name) return existing;

  getDb()
    .prepare(
      `UPDATE projects
       SET name = ?, description = ?, is_archived = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(name, description, isArchived, id);

  return getProject(id);
};

export const deleteProject = (id: string) => {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE conversations SET project_id = NULL WHERE project_id = ?`,
    ).run(id);
    db.prepare(
      `UPDATE knowledge_docs SET project_id = NULL WHERE project_id = ?`,
    ).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  tx();
};
