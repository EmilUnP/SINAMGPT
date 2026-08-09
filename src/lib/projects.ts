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

export const getProject = (id: string): Project | null => {
  return (
    (getDb()
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(id) as Project | undefined) ?? null
  );
};

export const createProject = (input: {
  name: string;
  description?: string;
  createdBy?: string | null;
}): Project => {
  const id = newId();
  const name = input.name.trim().slice(0, 80);
  const description = (input.description ?? "").trim().slice(0, 400);

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, description, created_by)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, name, description, input.createdBy ?? null);

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
    db.prepare(`UPDATE conversations SET project_id = NULL WHERE project_id = ?`).run(
      id,
    );
    db.prepare(
      `UPDATE knowledge_docs SET project_id = NULL WHERE project_id = ?`,
    ).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  tx();
};
