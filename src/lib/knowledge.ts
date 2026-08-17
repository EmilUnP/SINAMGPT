import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import {
  expandQueryTokens,
  looksLikeCompanyQuestion,
  MULTILANG_STOP_WORDS,
  tokenizeMultilang,
  tokensAlign,
} from "@/lib/multilang";
import { glossUserQuery, retrievalQuery } from "@/lib/query-gloss";
import {
  DEPRECATED_KNOWLEDGE_TITLES,
  SINAM_SEED_DOCS,
} from "@/lib/seeds/knowledge";

export { SINAM_SEED_DOCS } from "@/lib/seeds/knowledge";

const SETTINGS_KEY = "knowledge_settings";

export type KnowledgeCategory =
  | "company"
  | "project"
  | "product"
  | "faq"
  | "other";

export type KnowledgeDoc = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string;
  project_id: string | null;
  is_enabled: number;
  priority: number;
  always_include: number;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSettings = {
  enabled: boolean;
  applyToGuests: boolean;
  applyToUsers: boolean;
  /** Show “From: …” under replies that used knowledge */
  showCitations: boolean;
  maxDocs: number;
  maxChars: number;
};

/** Lightweight citation shown under assistant replies */
export type KnowledgeSource = {
  id: string;
  title: string;
  category: KnowledgeCategory;
};

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
  enabled: true,
  applyToGuests: true,
  applyToUsers: true,
  showCitations: true,
  maxDocs: 4,
  maxChars: 4500,
};

const newId = () => randomBytes(12).toString("hex");

const getSettingRaw = (key: string) => {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value;
};

export const getKnowledgeSettings = (): KnowledgeSettings => {
  const raw = getSettingRaw(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_KNOWLEDGE_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<KnowledgeSettings>;
    return {
      ...DEFAULT_KNOWLEDGE_SETTINGS,
      ...parsed,
      maxDocs: Math.max(1, Math.min(10, Number(parsed.maxDocs) || 4)),
      maxChars: Math.max(500, Math.min(12000, Number(parsed.maxChars) || 4500)),
    };
  } catch {
    return { ...DEFAULT_KNOWLEDGE_SETTINGS };
  }
};

export const setKnowledgeSettings = (
  next: Partial<KnowledgeSettings>,
): KnowledgeSettings => {
  const merged = {
    ...getKnowledgeSettings(),
    ...next,
  };
  merged.maxDocs = Math.max(1, Math.min(10, Math.floor(merged.maxDocs)));
  merged.maxChars = Math.max(500, Math.min(12000, Math.floor(merged.maxChars)));

  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify(merged));

  return merged;
};

export const listKnowledgeDocs = (): KnowledgeDoc[] => {
  seedSinamKnowledgeIfEmpty();
  return getDb()
    .prepare(
      `SELECT * FROM knowledge_docs
       ORDER BY priority DESC, updated_at DESC`,
    )
    .all() as KnowledgeDoc[];
};

export const getKnowledgeDoc = (id: string): KnowledgeDoc | null => {
  return (
    (getDb()
      .prepare(`SELECT * FROM knowledge_docs WHERE id = ?`)
      .get(id) as KnowledgeDoc | undefined) ?? null
  );
};

export const createKnowledgeDoc = (input: {
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags?: string;
  project_id?: string | null;
  priority?: number;
  always_include?: boolean;
  is_enabled?: boolean;
}): KnowledgeDoc => {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO knowledge_docs
       (id, title, category, content, tags, project_id, is_enabled, priority, always_include)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title.trim().slice(0, 160),
      input.category,
      input.content.trim().slice(0, 20000),
      (input.tags ?? "").trim().slice(0, 500),
      input.project_id?.trim() || null,
      input.is_enabled === false ? 0 : 1,
      Math.max(0, Math.min(100, input.priority ?? 50)),
      input.always_include ? 1 : 0,
    );
  return getKnowledgeDoc(id)!;
};

export const updateKnowledgeDoc = (
  id: string,
  input: Partial<{
    title: string;
    category: KnowledgeCategory;
    content: string;
    tags: string;
    project_id: string | null;
    priority: number;
    always_include: boolean;
    is_enabled: boolean;
  }>,
): KnowledgeDoc | null => {
  const current = getKnowledgeDoc(id);
  if (!current) return null;

  const nextProjectId =
    input.project_id === undefined
      ? current.project_id
      : input.project_id?.trim() || null;

  getDb()
    .prepare(
      `UPDATE knowledge_docs SET
        title = ?,
        category = ?,
        content = ?,
        tags = ?,
        project_id = ?,
        priority = ?,
        always_include = ?,
        is_enabled = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      (input.title ?? current.title).trim().slice(0, 160),
      input.category ?? current.category,
      (input.content ?? current.content).trim().slice(0, 20000),
      (input.tags ?? current.tags).trim().slice(0, 500),
      nextProjectId,
      Math.max(0, Math.min(100, input.priority ?? current.priority)),
      input.always_include === undefined
        ? current.always_include
        : input.always_include
          ? 1
          : 0,
      input.is_enabled === undefined
        ? current.is_enabled
        : input.is_enabled
          ? 1
          : 0,
      id,
    );

  return getKnowledgeDoc(id);
};

export const deleteKnowledgeDoc = (id: string) => {
  getDb().prepare(`DELETE FROM knowledge_docs WHERE id = ?`).run(id);
};

/** Lightweight retrieval — multi-language keyword overlap + always-include (RAG-lite).
 * Pass a query already unioned with EN/AZ/RU gloss terms (see glossUserQuery). */
export const retrieveKnowledge = (
  query: string,
  settings = getKnowledgeSettings(),
  projectId?: string | null,
  opts?: { categoryHint?: KnowledgeCategory | "none" | null },
): KnowledgeDoc[] => {
  if (!settings.enabled) return [];

  const docs = listKnowledgeDocs().filter((d) => d.is_enabled === 1);
  if (!docs.length) return [];

  const queryTokens = expandQueryTokens(query).filter(
    (token) => token.length >= 3 && !MULTILANG_STOP_WORDS.has(token),
  );
  const queryTokenSet = new Set(queryTokens);
  const companyIntent = looksLikeCompanyQuestion(query);
  const activeProject = projectId?.trim() || null;
  const categoryHint =
    opts?.categoryHint && opts.categoryHint !== "none"
      ? opts.categoryHint
      : null;
  const wantsContact =
    /\b(contact|əlaqə|elaqe|kontakt|телефон|phone|email|office|офис|ünvan|unvan|hours|saat)\b/i.test(
      query,
    );

  const tokenHit = (haystack: Set<string>, token: string) => {
    if (haystack.has(token)) return true;
    if (token.length < 4) return false;
    for (const item of haystack) {
      if (tokensAlign(token, item)) return true;
    }
    return false;
  };

  const docFields = docs.map((doc) => {
    const titleTokens = new Set(tokenizeMultilang(doc.title));
    const tagTokens = new Set(tokenizeMultilang(doc.tags));
    const contentTokens = new Set(tokenizeMultilang(doc.content));
    const all = new Set([...titleTokens, ...tagTokens, ...contentTokens]);
    return {
      doc,
      titleTokens,
      tagTokens,
      contentTokens,
      all,
      titleNorm: ` ${[...titleTokens].join(" ")} `,
      contentNorm: ` ${normalizeForPhrase(doc.content)} `,
      tagNorm: ` ${[...tagTokens].join(" ")} `,
    };
  });

  const df = new Map<string, number>();
  for (const token of queryTokenSet) {
    let n = 0;
    for (const row of docFields) {
      if (tokenHit(row.all, token)) n += 1;
    }
    df.set(token, n);
  }
  const idf = (token: string): number => {
    const n = df.get(token) ?? 0;
    if (n <= 0) return 1;
    return Math.log(1 + docs.length / n);
  };

  const scored = docFields.map((row) => {
    const { doc, titleTokens, tagTokens, contentTokens, titleNorm, contentNorm, tagNorm } =
      row;
    let matchScore = 0;
    const strongTokens = new Set<string>();
    const contentOnly = new Set<string>();

    for (const token of queryTokenSet) {
      const weight = idf(token);
      const inTitle = tokenHit(titleTokens, token);
      const inTags = tokenHit(tagTokens, token);
      const inContent = tokenHit(contentTokens, token);
      if (inTitle) {
        matchScore += 6 * weight;
        strongTokens.add(token);
      }
      if (inTags) {
        matchScore += 4 * weight;
        strongTokens.add(token);
      }
      if (inContent) {
        matchScore += 2 * weight;
        if (!inTitle && !inTags) contentOnly.add(token);
      }
    }

    const queryWords = [...queryTokenSet].filter((t) => t.length >= 4);
    for (let i = 0; i < queryWords.length - 1; i += 1) {
      const phrase = ` ${queryWords[i]} ${queryWords[i + 1]} `;
      if (titleNorm.includes(phrase)) {
        matchScore += 10;
        strongTokens.add(queryWords[i]);
      } else if (tagNorm.includes(phrase) || contentNorm.includes(phrase)) {
        matchScore += 6;
        strongTokens.add(queryWords[i]);
      }
    }

    const coverage =
      queryTokenSet.size > 0 ? strongTokens.size / queryTokenSet.size : 0;
    matchScore += coverage * 8;

    if (categoryHint && doc.category === categoryHint) {
      matchScore += 4;
    }
    if (wantsContact && /contact|əlaqə|elaqe|phone|email|hours|saat/i.test(
      `${doc.title} ${doc.tags}`,
    )) {
      matchScore += 6;
    }

    if (
      companyIntent &&
      (doc.category === "company" || doc.category === "product")
    ) {
      matchScore += 2;
    }

    if (activeProject) {
      if (doc.project_id === activeProject) matchScore += 12;
      else if (doc.project_id && doc.project_id !== activeProject) {
        matchScore -= 4;
      }
    }

    const strongHits = strongTokens.size;
    const alwaysEligible = doc.always_include === 1 && companyIntent;
    const hasMatch = strongHits > 0 || matchScore >= 8;
    const score = matchScore + doc.priority / 1000 + (alwaysEligible ? 1 : 0);

    return {
      doc,
      score,
      hasMatch,
      alwaysEligible,
      strongHits,
      contentOnly: contentOnly.size,
    };
  });

  const specific = scored
    .filter((s) => s.hasMatch && s.strongHits > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.strongHits - a.strongHits || a.contentOnly - b.contentOnly,
    );

  const always = scored
    .filter((s) => s.alwaysEligible)
    .sort((a, b) => b.score - a.score);

  const weak = scored
    .filter((s) => s.hasMatch && s.strongHits === 0 && s.score >= 8)
    .sort((a, b) => b.score - a.score);

  const picked: KnowledgeDoc[] = [];
  const seen = new Set<string>();
  const take = (rows: typeof scored) => {
    for (const row of rows) {
      if (seen.has(row.doc.id)) continue;
      seen.add(row.doc.id);
      picked.push(row.doc);
      if (picked.length >= settings.maxDocs) return;
    }
  };

  take(specific);
  const bestSpecific = specific[0];
  const specificIsStrong = Boolean(
    bestSpecific && (bestSpecific.strongHits >= 2 || bestSpecific.score >= 14),
  );
  if (!specificIsStrong) {
    take(always);
  }
  take(weak);

  if (!picked.length && companyIntent) {
    const fallback = docs
      .filter((d) => d.category === "company")
      .sort((a, b) => b.priority - a.priority)[0];
    if (fallback) picked.push(fallback);
  }

  return picked;
};

const normalizeForPhrase = (value: string): string =>
  tokenizeMultilang(value, 2).join(" ");

export const resolveKnowledgeContext = async (
  query: string,
  audience: "guest" | "user",
  projectId?: string | null,
  opts?: { model?: string },
): Promise<{ block: string; sources: KnowledgeSource[]; showCitations: boolean }> => {
  const settings = getKnowledgeSettings();
  if (!settings.enabled) {
    return { block: "", sources: [], showCitations: false };
  }
  if (audience === "guest" && !settings.applyToGuests) {
    return { block: "", sources: [], showCitations: false };
  }
  if (audience === "user" && !settings.applyToUsers) {
    return { block: "", sources: [], showCitations: false };
  }

  const gloss = await glossUserQuery(query, { model: opts?.model });
  const docs = retrieveKnowledge(
    retrievalQuery(query, gloss),
    settings,
    projectId,
    { categoryHint: gloss.category },
  );
  if (!docs.length) {
    return { block: "", sources: [], showCitations: settings.showCitations };
  }

  const chunks: string[] = [
    "COMPANY KNOWLEDGE (trusted local facts — the sections below are ordered by relevance to this question):",
    "HOW TO USE THEM:",
    "- Answer from these notes. Prefer the first / most specific section over generic About/Contact.",
    "- Put concrete facts in the reply: years, headcount, phones, emails, product names (SESDA, Farabi, Biletim, GoMap, GoNav, YURDUM).",
    "- Never answer with only a URL or a single markdown link.",
    "- Rewrite into the REPLY LANGUAGE. One language only — no parenthetical translations. Keep names, phones, emails, and URLs exact.",
    "- Do not invent numbers or products that are not in the notes.",
    "If the user is not asking about the company, ignore this block and answer normally.",
  ];

  const usedDocs: KnowledgeDoc[] = [];
  let used = chunks.join("\n").length;
  for (const doc of docs) {
    const piece = `\n### ${doc.title} [${doc.category}]\n${doc.content.trim()}`;
    if (used + piece.length > settings.maxChars) break;
    chunks.push(piece);
    usedDocs.push(doc);
    used += piece.length;
  }

  chunks.push(
    "\nIf the user asks something not covered above, say (in their language) that you don't have that internal detail yet and suggest contacting office@sinam.net or checking https://sinam.net.",
  );

  const sources: KnowledgeSource[] = usedDocs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
  }));

  return {
    block: chunks.join("\n"),
    sources,
    showCitations: settings.showCitations,
  };
};

/** @deprecated Prefer resolveKnowledgeContext — kept for simple string callers */
export const buildKnowledgeBlock = async (
  query: string,
  audience: "guest" | "user",
): Promise<string> => (await resolveKnowledgeContext(query, audience)).block;

export const seedSinamKnowledgeIfEmpty = () => {
  const count = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM knowledge_docs`)
    .get() as { c: number };

  if (count.c > 0) return { seeded: false, count: count.c };

  const insert = getDb().prepare(
    `INSERT INTO knowledge_docs
     (id, title, category, content, tags, is_enabled, priority, always_include)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );

  const tx = getDb().transaction(() => {
    for (const doc of SINAM_SEED_DOCS) {
      insert.run(
        newId(),
        doc.title,
        doc.category,
        doc.content,
        doc.tags,
        doc.priority,
        doc.always_include ? 1 : 0,
      );
    }
  });
  tx();

  if (!getSettingRaw(SETTINGS_KEY)) {
    setKnowledgeSettings(DEFAULT_KNOWLEDGE_SETTINGS);
  }

  return { seeded: true, count: SINAM_SEED_DOCS.length };
};

/**
 * Insert official SINAM starter pack.
 * - replaceAll: wipe library then seed
 * - overwriteExisting: update matching titles from template (admin edits lost)
 * - default: only add missing titles (never overwrite admin edits)
 */
export const reseedSinamKnowledge = (
  replaceAll = false,
  overwriteExisting = false,
) => {
  if (replaceAll) {
    getDb().prepare(`DELETE FROM knowledge_docs`).run();
    const result = seedSinamKnowledgeIfEmpty();
    return { ...result, updated: 0, mode: "replace" as const };
  }

  const del = getDb().prepare(
    `DELETE FROM knowledge_docs WHERE title = ? COLLATE NOCASE`,
  );
  for (const title of DEPRECATED_KNOWLEDGE_TITLES) del.run(title);

  const existingByTitle = new Map(
    (
      getDb()
        .prepare(`SELECT id, title FROM knowledge_docs`)
        .all() as Array<{ id: string; title: string }>
    ).map((r) => [r.title.toLowerCase(), r.id]),
  );

  let added = 0;
  let updated = 0;
  const insert = getDb().prepare(
    `INSERT INTO knowledge_docs
     (id, title, category, content, tags, is_enabled, priority, always_include)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const update = getDb().prepare(
    `UPDATE knowledge_docs
     SET category = ?, content = ?, tags = ?, priority = ?, always_include = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  );

  for (const doc of SINAM_SEED_DOCS) {
    const existingId = existingByTitle.get(doc.title.toLowerCase());
    if (existingId) {
      if (!overwriteExisting) continue;
      update.run(
        doc.category,
        doc.content,
        doc.tags,
        doc.priority,
        doc.always_include ? 1 : 0,
        existingId,
      );
      updated += 1;
      continue;
    }
    insert.run(
      newId(),
      doc.title,
      doc.category,
      doc.content,
      doc.tags,
      doc.priority,
      doc.always_include ? 1 : 0,
    );
    added += 1;
  }

  if (!getSettingRaw(SETTINGS_KEY)) {
    setKnowledgeSettings(DEFAULT_KNOWLEDGE_SETTINGS);
  }

  return {
    seeded: added > 0 || updated > 0,
    count: added,
    updated,
    mode: overwriteExisting ? ("refresh" as const) : ("merge" as const),
  };
};
