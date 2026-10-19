import { describe, expect, it } from "vitest";
import { selectVisibleSources } from "@/components/chat/KnowledgeCitations";
import type { KnowledgeCitation } from "@/lib/types";

const doc = (n: number): KnowledgeCitation => ({
  id: `doc-${n}`,
  title: `Company doc ${n}`,
  category: "company",
});

const page = (n: number): KnowledgeCitation => ({
  id: `https://site${n}.example/x`,
  title: `Page ${n}`,
  category: "web",
  url: `https://site${n}.example/x`,
});

const kinds = (list: KnowledgeCitation[]) =>
  list.map((item) => (item.category === "web" ? "web" : "doc")).join(",");

describe("citation chip selection", () => {
  it("keeps web results visible when a knowledge pack would crowd them out", () => {
    // The real case: 5 company docs + 4 web hits. Sorting knowledge first and
    // taking the top 4 hid every source the answer was actually built from.
    const sources = [1, 2, 3, 4, 5].map(doc).concat([1, 2, 3, 4].map(page));
    const { visible, hiddenCount } = selectVisibleSources(sources, 4, false);
    expect(kinds(visible)).toBe("doc,doc,web,web");
    expect(hiddenCount).toBe(5);
  });

  it("gives every slot to knowledge when nothing came from the web", () => {
    const sources = [1, 2, 3, 4, 5, 6].map(doc);
    const { visible, hiddenCount } = selectVisibleSources(sources, 4, false);
    expect(kinds(visible)).toBe("doc,doc,doc,doc");
    expect(hiddenCount).toBe(2);
  });

  it("gives every slot to the web when there is no company knowledge", () => {
    const sources = [1, 2, 3, 4, 5].map(page);
    const { visible, hiddenCount } = selectVisibleSources(sources, 4, false);
    expect(kinds(visible)).toBe("web,web,web,web");
    expect(hiddenCount).toBe(1);
  });

  it("shows a single knowledge doc rather than dropping it for the web", () => {
    const sources = [doc(1), ...[1, 2, 3, 4, 5].map(page)];
    const { visible } = selectVisibleSources(sources, 4, false);
    expect(kinds(visible)).toBe("doc,web,web,web");
  });

  it("collapses nothing when everything already fits", () => {
    const sources = [doc(1), page(1)];
    const { visible, hiddenCount } = selectVisibleSources(sources, 4, false);
    expect(visible).toHaveLength(2);
    expect(hiddenCount).toBe(0);
  });

  it("reveals the full list once expanded, knowledge first", () => {
    const sources = [1, 2, 3].map(doc).concat([1, 2, 3].map(page));
    const { visible, hiddenCount } = selectVisibleSources(sources, 4, true);
    expect(kinds(visible)).toBe("doc,doc,doc,web,web,web");
    expect(hiddenCount).toBe(0);
  });
});
