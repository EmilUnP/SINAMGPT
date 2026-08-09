import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import {
  expandQueryTokens,
  looksLikeCompanyQuestion,
  normalizeMultilangText,
  tokenizeMultilang,
} from "@/lib/multilang";

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

/** Lightweight retrieval — multi-language keyword overlap + always-include (RAG-lite). */
export const retrieveKnowledge = (
  query: string,
  settings = getKnowledgeSettings(),
  projectId?: string | null,
): KnowledgeDoc[] => {
  if (!settings.enabled) return [];

  const docs = listKnowledgeDocs().filter((d) => d.is_enabled === 1);
  if (!docs.length) return [];

  const queryTokens = new Set(expandQueryTokens(query));
  const companyIntent = looksLikeCompanyQuestion(query);
  const activeProject = projectId?.trim() || null;

  const scored = docs.map((doc) => {
    // Whole-token match only (avoid "help" matching "helped")
    const titleTokens = new Set(tokenizeMultilang(doc.title));
    const tagTokens = new Set(tokenizeMultilang(doc.tags));
    const contentTokens = new Set(tokenizeMultilang(doc.content));
    let matchScore = 0;
    let strongHits = 0;

    for (const token of queryTokens) {
      if (token.length < 3) continue;
      if (titleTokens.has(token)) {
        matchScore += 4;
        strongHits += 1;
      }
      if (tagTokens.has(token)) {
        matchScore += 3;
        strongHits += 1;
      }
      if (contentTokens.has(token)) matchScore += 1;
    }

    if (
      companyIntent &&
      (doc.category === "company" || doc.category === "product")
    ) {
      matchScore += 5;
    }

    // Prefer project-scoped docs when chatting inside a project
    if (activeProject) {
      if (doc.project_id === activeProject) matchScore += 12;
      else if (doc.project_id && doc.project_id !== activeProject) {
        matchScore -= 4;
      }
    }

    // Pin always_include docs only for real company questions
    const alwaysEligible = doc.always_include === 1 && companyIntent;
    const hasMatch = strongHits > 0 || matchScore >= 4;

    // Priority is a tiny tiebreaker only (never enough to pass the threshold alone)
    let score = matchScore + doc.priority / 1000;
    if (alwaysEligible) score += 1000;

    return { doc, score, hasMatch, alwaysEligible };
  });

  const always = scored
    .filter((s) => s.alwaysEligible)
    .sort((a, b) => b.score - a.score);

  const rest = scored
    .filter((s) => !s.alwaysEligible && s.hasMatch && s.score >= 4)
    .sort((a, b) => b.score - a.score);

  const picked: KnowledgeDoc[] = [];
  const seen = new Set<string>();

  for (const row of [...always, ...rest]) {
    if (seen.has(row.doc.id)) continue;
    seen.add(row.doc.id);
    picked.push(row.doc);
    if (picked.length >= settings.maxDocs) break;
  }

  // Fallback company doc only for real company questions
  if (!picked.length && companyIntent) {
    const fallback = docs
      .filter((d) => d.category === "company")
      .sort((a, b) => b.priority - a.priority)[0];
    if (fallback) picked.push(fallback);
  }

  return picked;
};

export const resolveKnowledgeContext = (
  query: string,
  audience: "guest" | "user",
  projectId?: string | null,
): { block: string; sources: KnowledgeSource[]; showCitations: boolean } => {
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

  const docs = retrieveKnowledge(query, settings, projectId);
  if (!docs.length) {
    return { block: "", sources: [], showCitations: settings.showCitations };
  }

  const chunks: string[] = [
    "COMPANY KNOWLEDGE (trusted local facts — use when answering about SINAM / company / projects; do not invent facts beyond this):",
    "These notes are in English for storage only. Rewrite them into the REPLY LANGUAGE. Do not switch language because tags list Russian/Azerbaijani keywords. One language only — no parenthetical translations. Keep names, phones, emails, and URLs exact.",
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
export const buildKnowledgeBlock = (
  query: string,
  audience: "guest" | "user",
): string => resolveKnowledgeContext(query, audience).block;

export const SINAM_SEED_DOCS: Array<{
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string;
  priority: number;
  always_include: boolean;
}> = [
  {
    title: "About SINAM",
    category: "company",
    content: `SINAM Ltd (website: https://sinam.net) is an ICT company founded in 1994.
Tagline / focus: Enabling Digital Transformation — Innovate. Digitize. Automate.
SINAM drives transformation projects in government and private sectors using cutting-edge information and communication technologies (ICT).
For nearly two decades+ the company has helped clients improve governance, increase operational efficiency, and boost financial results.
Today SINAM is a Trans-Caspian market leader in e-Transformation and e-Government services, and has been instrumental in the region's informatization drive.`,
    tags: "sinam, company, about, ict, egovernment, transformation, şirkət, sirket, компания, haqqında, haqqinda",
    priority: 100,
    always_include: true,
  },
  {
    title: "SINAM contact & hours",
    category: "company",
    content: `Phone: +994 12 510 11 00
Email: office@sinam.net
Working hours: Monday–Friday, 09:00–18:00
Website: https://sinam.net`,
    tags: "contact, phone, email, office, hours, address, əlaqə, elaqe, kontakt, контакт, telefon, ünvan, unvan, iş saatı",
    priority: 90,
    always_include: true,
  },
  {
    title: "SINAM snapshot stats",
    category: "company",
    content: `Public snapshot from the company site:
- 30+ years in business (since 1994)
- 150+ employees
- Experience / reach referenced across many countries (site highlights 95+ countries and a large served population figure)
Use these as approximate marketing stats from sinam.net; for exact legal/financial figures, defer to official company materials.`,
    tags: "stats, history, employees, years, countries, işçilər, isciler, сотрудники, tarix",
    priority: 70,
    always_include: false,
  },
  {
    title: "Solutions focus",
    category: "product",
    content: `SINAM positions innovative digital solutions around:
- Digital transformation for government and private sector
- e-Government / e-Transformation services
- Digitization, automation, and optimization of operations
When users ask what SINAM does, explain ICT transformation, e-government, and enterprise digitization. For product deep-dives not listed in knowledge, point to https://sinam.net.`,
    tags: "solutions, products, egovernment, digitization, automation, həllər, heller, məhsul, mehsul, продукт, layihə, layihe",
    priority: 80,
    always_include: false,
  },
  {
    title: "SESDA Connect package",
    category: "product",
    content: `SESDA | Connect Package (from sinam.net):
- Plan example: One User — ₼20 / month (VAT included)
- Includes: Infrastructure, Online Training, Updates, Technical Support
If asked for more SESDA pricing tiers or technical specs not listed here, say current knowledge is limited and recommend contacting office@sinam.net.`,
    tags: "sesda, connect, pricing, package, subscription, qiymət, qiymet, цена, тариф, пакет",
    priority: 75,
    always_include: false,
  },
  {
    title: "SINAMGPT product note",
    category: "project",
    content: `SINAMGPT is SINAM's internal/local company AI chat assistant.
It runs on local models (Ollama) inside the company environment.
It uses admin-managed Company Knowledge (this pack) plus guardrails — not a public fine-tuned cloud model.
Employees can ask about company basics, drafting, summarizing, and general work help. Private chats stay on the local machine.`,
    tags: "sinamgpt, owngpt, ai, assistant, internal, project, köməkçi, komekci, ассистент",
    priority: 85,
    always_include: false,
  },
];

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

/** Insert official SINAM starter pack. replaceAll=true wipes existing docs first. */
export const reseedSinamKnowledge = (replaceAll = false) => {
  if (replaceAll) {
    getDb().prepare(`DELETE FROM knowledge_docs`).run();
    const result = seedSinamKnowledgeIfEmpty();
    return { ...result, mode: "replace" as const };
  }

  const existingTitles = new Set(
    (
      getDb().prepare(`SELECT title FROM knowledge_docs`).all() as Array<{
        title: string;
      }>
    ).map((r) => r.title.toLowerCase()),
  );

  let added = 0;
  const insert = getDb().prepare(
    `INSERT INTO knowledge_docs
     (id, title, category, content, tags, is_enabled, priority, always_include)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );

  for (const doc of SINAM_SEED_DOCS) {
    if (existingTitles.has(doc.title.toLowerCase())) continue;
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
    seeded: added > 0,
    count: added,
    mode: "merge" as const,
  };
};
