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
    content: `SINAM Ltd (website: https://sinam.net) is an ICT company founded in 1994 in Azerbaijan.
Tagline / focus: Enabling Digital Transformation — Innovate. Digitize. Automate. / Our Innovative Solutions — Inspire. Optimize. Transform.
SINAM drives transformation projects in government and private sectors using cutting-edge ICT.
It helps clients improve governance, increase operational efficiency, and boost financial results.
Today SINAM is a Trans-Caspian market leader in e-Transformation and e-Government services and has been instrumental in the region's informatization drive.
Public site: https://sinam.net (EN solutions catalog: https://sinam.net/en/solutions).`,
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
    content: `Public snapshot from sinam.net:
- 30+ years in business (since 1994)
- 150+ employees
- Site highlights reach across 95+ countries and a large served-population figure
Use as approximate marketing stats; for exact legal/financial figures, defer to official company materials or office@sinam.net.`,
    tags: "stats, history, employees, years, countries, işçilər, isciler, сотрудники, tarix",
    priority: 70,
    always_include: false,
  },
  {
    title: "SINAM solutions catalog",
    category: "product",
    content: `SINAM publishes a wide solutions portfolio on https://sinam.net/en/solutions, including (non-exhaustive):
- Document & workflow: SESDA (Electronic Document Management), Electronic Signature, Electronic Archive
- Government / finance: Farabi / SGRP (Government Resources Planning), Budget Information Management, Treasury Information Management, Integrated Tax Administration, National Pension Fund systems, Customs declarations
- Maps & mobility: GoMap.az / GoMap.ge (GIS map database), GoNav.Az (online navigator), YURDUM (AR/AI geo guide), Fleet Management, FreeFields
- Citizen services: Biletim.az bus ticketing, Electronic Visa, e-Governance & Public Service Center, E-Prescription
- Platforms: SINAM ERP, Education Management System, IoT Management Platform, Smart Village, Data Warehouse & analytics, Instant / mass payment systems, Video Conference, SPBX VoIP, network infrastructure
When users ask “what products does SINAM have?”, summarize categories and name flagship products (SESDA, Farabi, Biletim, GoMap/GoNav, Yurdum). For deep specs not listed here, point to the matching sinam.net solutions page or office@sinam.net.`,
    tags: "solutions, products, catalog, portfolio, egovernment, digitization, həllər, heller, məhsul, mehsul, продукт, layihə, layihe, projects",
    priority: 88,
    always_include: false,
  },
  {
    title: "SESDA document management",
    category: "product",
    content: `SESDA is SINAM’s Electronic Document Management / document workflow platform (also called SINAM Document Workflow System).
Source: https://sinam.net/en/solutions/electronic-document-management-system
What it does:
- Full document lifecycle: create, register, approve, e-sign, execute, monitor, archive
- Incoming / outgoing / internal docs and interagency electronic exchange
- Integrations with government/corporate systems (examples cited on site: RSD, MyGov, NHAIS, and others)
- Full-text search, filtering, analytics/reporting (incl. Excel export; Form 1 / Form 2 statistical reports)
- Role-based access, electronic signatures, audit logs, full document history
- Flexible for government institutions, large enterprises, and smaller orgs
Notable clients / case mentions on the site (periods as published): Central Bank of Azerbaijan, National Archive, Ministry of Agriculture, Ministry of Health, Ministry of Energy, ASAN (State Agency for Service to Citizens and Social Innovations).
SESDA | Connect Package (public pricing example): One User — ₼20 / month (VAT included) — Infrastructure, Online Training, Updates, Technical Support.
For extra pricing tiers or deployment details not listed here, contact office@sinam.net.`,
    tags: "sesda, document, workflow, edms, edm, e-sign, connect, qiymət, qiymet, цена, sənəd, sened, документ, документооборот",
    priority: 92,
    always_include: false,
  },
  {
    title: "Farabi government resources planning",
    category: "product",
    content: `Farabi refers to SINAM’s Government Resources Planning (SGRP) solution and related FARABI Data Center work.
Source: https://sinam.net/en/solutions/farabi
What it is:
- Integrated web application to plan, register, control, and analyze organizational work processes
- Scalable for e-Government and usable by public or private organizations of various sizes
Case study (from sinam.net): Financial and Accounting Reporting Application for Budgetary Institutions
- Client: Ministry of Finance of the Republic of Azerbaijan (2012–ongoing as published)
- Modern report submission for ~4,000 users across budget offices in ministries, higher education, and other state agencies
- Mentions Oracle BI platform, record management, FARABI Data Center
When users say “Farabi”, explain SGRP / government resource & financial reporting context — do not invent unrelated product features.`,
    tags: "farabi, farabı, sgrp, government resources planning, ministry of finance, budget, reporting, фараби, maliyyə, maliyye",
    priority: 90,
    always_include: false,
  },
  {
    title: "Biletim.az bus ticketing",
    category: "product",
    content: `Biletim.az is SINAM’s Bus Ticketing System for intercity, inter-district, and international bus trips.
Source: https://sinam.net/en/solutions/biletim · public portal: https://biletim.az
Capabilities (from SINAM site):
- Online and offline ticket purchase with QR codes
- Seat selection from the bus schedule
- Sales from any bus station; quick refunds
- Track bus location on the map
- Web portal + iOS/Android apps; cash at counter or online debit card
- Dispatcher can check online tickets in the platform app; tickets via email/portal; board by showing QR to the driver
Case study: Azerbaijan Land Transport Agency / Ministry of Transport and Digital Development (2022)
- Daily ticket sales cited for 405 routes to 39 cities
- Board without a physical paper ticket
Public launch notes (government media, Dec 2022): tickets sold up to ~10 days ahead; app on App Store / Google Play.`,
    tags: "biletim, biletim.az, bus, ticket, ticketing, ayna, transport, avtobus, bilet, билет, билетим",
    priority: 90,
    always_include: false,
  },
  {
    title: "GoMap.az and GoMap.ge",
    category: "product",
    content: `GoMap.az (and GoMap.ge) is SINAM’s interactive geographic information / map portal covering Azerbaijan and Georgia.
Source: https://sinam.net/en/solutions/geo-information-systems
What it provides:
- Interactive map: administrative divisions, settlements, buildings, postal indexes, road networks
- Points of interest: hotels, restaurants, organizations, shops, and other establishments
- Optimal route planning, text search, client-server data exchange in multiple formats
- API GoMap.az for integrations
Case context published with Ministry for Culture of Azerbaijan (2008–2010): tourism/landmarks promotion and resource monitoring.
GoMap’s electronic map database also powers the GoNav.Az online navigator.`,
    tags: "gomap, gomap.az, gomap.ge, gis, map, xəritə, xerite, карта, geo, navigation map",
    priority: 90,
    always_include: false,
  },
  {
    title: "GoNav.Az online navigator",
    category: "product",
    content: `GoNav.Az is SINAM’s online navigator for Azerbaijan (and travel into Georgia).
Source: https://sinam.net/en/solutions/gonav
Key points:
- Browser-based — usable from tablet/phone without a separate install (as described on the site)
- Map data comes from the GoMap.Az electronic map database (Azerbaijan + Georgia), with roads/streets and traffic regulations
- Single-line search for objects, cities, villages, new and old addresses
- Optimal routing for car and on foot; considers traffic rules and congestion
- Client mention: Ministry of Digital Development and Transport of Azerbaijan
Related products: GoMap (map DB), YURDUM (AR/AI guide), Fleet Management.`,
    tags: "gonav, gonav.az, navigator, navigation, routing, go map, naviqator, навигатор, yol",
    priority: 88,
    always_include: false,
  },
  {
    title: "YURDUM navigation and smart village",
    category: "product",
    content: `YURDUM is SINAM’s geo / guide solution using Augmented Reality, AI, and object recognition (machine learning).
Source: https://sinam.net/en/solutions/yurdum
Use cases:
- Digital guides for residents and visitors covering infrastructure, tourist sites, and cultural landmarks
- “Smart Village” ICT components — detailed village electronic maps, points of interest, graphic recognition via ML, AR mobile app
Case study published: Ministry of Agriculture of Azerbaijan (2021–2024) — Building ICT components for the Smart Village.
Related: GoMap / GoNav for country-scale maps and routing.`,
    tags: "yurdum, yurd, smart village, ar, augmented reality, ai, kənd, kend, деревня, tourism, guide",
    priority: 85,
    always_include: false,
  },
  {
    title: "Other flagship SINAM platforms",
    category: "product",
    content: `Additional SINAM platforms commonly referenced on https://sinam.net/en/solutions (summaries — not full specs):
- SINAM Enterprise Resource Planning (ERP) — enterprise planning/operations suite
- Electronic Visa System — e-visa processing for government
- Education Management System — education-sector digitization
- SINAM IoT Management Platform & Smart Village Management Platform — connected devices / rural digitalization
- E-Prescription System — electronic prescriptions
- e-Governance & Public Service Center — citizen-facing public services
- Data Warehouse and Analytical Reporting — analytics
- Instant Payment System / Automated Mass Payments — payment rails
- Treasury / Budget / Tax / Pension / Customs systems — specialized government finance & border systems
- FreeFields mobile app, Fleet Management, Video Conference Management, Veterinary Service Monitoring
- SPBX VoIP telephony and network infrastructure solutions
If a user asks about a named product not detailed elsewhere in knowledge, give this high-level placement and link them to https://sinam.net/en/solutions or office@sinam.net — do not invent feature lists.`,
    tags: "erp, evisa, education, iot, smart village, e-prescription, asan, payments, treasury, tax, customs, freefields, fleet, voip",
    priority: 72,
    always_include: false,
  },
  {
    title: "SINAMGPT product note",
    category: "project",
    content: `SINAMGPT is SINAM's internal/local company AI chat assistant.
It runs on local models (Ollama / optional vLLM) inside the company environment.
It uses admin-managed Company Knowledge (this pack) plus guardrails — not a public fine-tuned cloud model.
Employees can ask about SINAM products (SESDA, Farabi, Biletim, GoMap, GoNav, Yurdum, etc.), drafting, summarizing, and general work help. Private chats stay on the local machine.`,
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

  // Retire older seed titles replaced by richer pack entries
  const deprecatedTitles = ["Solutions focus", "SESDA Connect package"];
  const del = getDb().prepare(
    `DELETE FROM knowledge_docs WHERE title = ? COLLATE NOCASE`,
  );
  for (const title of deprecatedTitles) del.run(title);

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
