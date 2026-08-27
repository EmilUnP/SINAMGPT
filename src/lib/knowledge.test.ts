import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw new Error("Unit knowledge ranking must not access SQLite");
  },
}));

import {
  DEFAULT_KNOWLEDGE_SETTINGS,
  rankKnowledgeDocs,
  type KnowledgeDoc,
} from "@/lib/knowledge";

const makeDoc = (
  id: string,
  overrides: Partial<KnowledgeDoc>,
): KnowledgeDoc => ({
  id,
  title: "Untitled",
  category: "other",
  content: "",
  tags: "",
  project_id: null,
  is_enabled: 1,
  priority: 50,
  always_include: 0,
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-01 00:00:00",
  ...overrides,
});

describe("rankKnowledgeDocs", () => {
  it("ranks a title and tag match above a body-only match", () => {
    const titleMatch = makeDoc("title", {
      title: "Vacation policy",
      tags: "leave, HR",
      content: "Request approval from your manager.",
      category: "faq",
    });
    const bodyMatch = makeDoc("body", {
      title: "Employee handbook",
      content: "The vacation policy explains annual leave.",
      category: "faq",
    });

    const ranked = rankKnowledgeDocs(
      [bodyMatch, titleMatch],
      "vacation policy",
      DEFAULT_KNOWLEDGE_SETTINGS,
      null,
      { originalQuery: "vacation policy", categoryHint: "faq" },
    );

    expect(ranked.map((doc) => doc.id)).toEqual(["title", "body"]);
  });

  it("does not inject an always-include company document into general chat", () => {
    const about = makeDoc("about", {
      title: "About SINAM",
      category: "company",
      content: "SINAM company information.",
      always_include: 1,
      priority: 100,
    });

    expect(
      rankKnowledgeDocs(
        [about],
        "what is artificial intelligence",
        DEFAULT_KNOWLEDGE_SETTINGS,
        null,
        { originalQuery: "what is artificial intelligence" },
      ),
    ).toEqual([]);
  });

  it("matches Azerbaijani knowledge using a multilingual query gloss", () => {
    const leave = makeDoc("leave", {
      title: "Məzuniyyət qaydaları",
      category: "faq",
      content: "Əməkdaş məzuniyyət üçün rəhbərə müraciət edir.",
      tags: "məzuniyyət, əməkdaş",
    });

    const ranked = rankKnowledgeDocs(
      [leave],
      "vacation leave məzuniyyət отпуск",
      DEFAULT_KNOWLEDGE_SETTINGS,
      null,
      { originalQuery: "vacation leave", categoryHint: "faq" },
    );

    expect(ranked[0]?.id).toBe("leave");
  });

  it("ignores disabled documents and disabled retrieval", () => {
    const disabled = makeDoc("disabled", {
      title: "Vacation policy",
      is_enabled: 0,
    });

    expect(
      rankKnowledgeDocs([disabled], "vacation policy"),
    ).toEqual([]);
    expect(
      rankKnowledgeDocs(
        [{ ...disabled, is_enabled: 1 }],
        "vacation policy",
        { ...DEFAULT_KNOWLEDGE_SETTINGS, enabled: false },
      ),
    ).toEqual([]);
  });
});
