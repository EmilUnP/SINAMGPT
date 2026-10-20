/**
 * Query-focused passage selection.
 *
 * A page can be 40 000 characters; the model gets ~1 500 per source. Taking
 * the first 1 500 meant the intro and the menu, never the paragraph that
 * answers the question. Open WebUI and Perplexica solve this by chunking and
 * ranking with embeddings; BM25 over the same chunks gets most of that with
 * no embedding model to host, and it works across languages because it only
 * compares words.
 */

const STOPWORDS = new Set(
  [
    // en
    "the", "and", "for", "are", "was", "with", "that", "this", "from", "what",
    "who", "how", "when", "where", "which", "about", "into", "your", "you",
    "today", "now", "latest", "news", "is", "of", "in", "on", "to", "a", "an",
    // az
    "və", "ve", "bu", "bir", "ilə", "ile", "üçün", "ucun", "nə", "ne", "kim",
    "necə", "nece", "haqqında", "haqqinda", "olan", "olur", "gün", "gun",
    // ru
    "и", "в", "на", "что", "кто", "как", "это", "для", "по", "из", "о", "об",
    "сегодня", "какая", "какой",
  ],
);

/** Unicode-aware words; numbers stay, one-letter noise goes. */
export const searchTokens = (value: string): string[] =>
  value
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));

/**
 * Crude stemming by prefix. Azerbaijani and Russian inflect heavily
 * ("Sumqayıtda", "Sumqayıtın"; "погода", "погоды"), so exact matching misses
 * most hits. Six characters keeps "sumqay" and "погод" without merging
 * unrelated short words.
 */
const stem = (token: string): string => (token.length > 6 ? token.slice(0, 6) : token);

export const searchStems = (value: string): string[] => searchTokens(value).map(stem);

const TARGET_BLOCK = 450;

const isTableLine = (line: string): boolean => line.trimStart().startsWith("|");
const isHeading = (value: string): boolean => /^#{1,6}\s[^\n]*$/.test(value);

/** Long tables split by rows, each piece with the header rows repeated. */
const splitTable = (table: string, target: number): string[] => {
  const rows = table.split("\n");
  const header = rows.slice(0, 2).join("\n");
  const pieces: string[] = [];
  let chunk: string[] = [];
  for (const row of rows.slice(2)) {
    chunk.push(row);
    if (header.length + chunk.join("\n").length > target) {
      pieces.push(`${header}\n${chunk.join("\n")}`);
      chunk = [];
    }
  }
  if (chunk.length) pieces.push(`${header}\n${chunk.join("\n")}`);
  return pieces;
};

/** Long prose cut on sentence ends near the target size. */
const splitProse = (paragraph: string, target: number): string[] => {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > target * 1.5) {
    const window = rest.slice(0, Math.floor(target * 1.3));
    const cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("\n"),
    );
    const at = cut > target * 0.5 ? cut + 1 : target;
    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at);
  }
  if (rest.trim()) pieces.push(rest.trim());
  return pieces;
};

/**
 * Small blocks that each say one thing. A heading always opens a new block
 * and stays with the text under it; short paragraphs of one section are
 * merged up to the target; long tables are split by rows with their header
 * repeated, so a forecast row is never separated from its column names.
 */
export const splitIntoBlocks = (text: string, target = TARGET_BLOCK): string[] => {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inTable = false;
  const flush = () => {
    const joined = current.join("\n").trim();
    if (joined) paragraphs.push(joined);
    current = [];
  };
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (isHeading(line.trim())) {
      flush();
      paragraphs.push(line.trim());
      continue;
    }
    const table = isTableLine(line);
    if (table !== inTable) {
      flush();
      inTable = table;
    }
    current.push(line);
  }
  flush();

  const blocks: string[] = [];
  let pending = "";
  const emit = () => {
    if (pending.trim()) blocks.push(pending.trim());
    pending = "";
  };
  for (const paragraph of paragraphs) {
    if (isHeading(paragraph)) {
      emit();
      pending = paragraph;
      continue;
    }
    const pieces =
      paragraph.length <= target * 1.5
        ? [paragraph]
        : isTableLine(paragraph)
          ? splitTable(paragraph, target)
          : splitProse(paragraph, target);
    for (const piece of pieces) {
      // A heading waiting for its text always takes the next piece.
      if (pending && !isHeading(pending) && pending.length + piece.length + 1 > target) emit();
      pending = pending ? `${pending}\n${piece}` : piece;
    }
  }
  emit();
  return blocks;
};

const K1 = 1.2;
/**
 * Weak length normalisation. The usual 0.75 lets a three-word heading that
 * repeats the city name ("### Sumqayit Location map") outrank the paragraph
 * that actually holds the forecast.
 */
const B = 0.3;
/** Shorter than this is a caption or a menu item, not an answer. */
const MIN_RANKED_BLOCK = 40;
/** A best block that does not fit is cut to the space left, if at least this much. */
const MIN_PARTIAL = 150;
/** Share of the budget kept for the page opening. */
const LEAD_SHARE = 0.4;

/** BM25 score of each block against the query stems. */
const scoreBlocks = (blocks: string[], queryStems: string[]): number[] => {
  const docs = blocks.map((block) => searchStems(block));
  const avgLen = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const terms = [...new Set(queryStems)];
  return docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / Math.max(1, avgLen)));
    }
    return score;
  });
};

/**
 * The page opening plus the best-matching blocks of `text`, within `budget`
 * characters and in page order. After Defuddle the opening is usually the
 * main content (a lede, a definition, "forecast issued 9 am"), while
 * leftovers that repeat the query words — "weather stations near X",
 * "places near X" — sit at the end; so the lead is kept and BM25 fills the
 * rest. Skipped stretches are marked "…" so the model can tell the excerpt
 * is not continuous.
 */
export const selectPassages = (
  text: string,
  queries: string[],
  budget: number,
): string => {
  const clean = text.trim();
  if (clean.length <= budget) return clean;
  const blocks = splitIntoBlocks(clean);
  // An oversized opening block is trimmed rather than allowed to eat the budget.
  if (blocks[0] && blocks[0].length > budget / 2) {
    blocks[0] = `${blocks[0].slice(0, Math.floor(budget / 2)).trimEnd()} …`;
  }
  const queryStems = queries.flatMap(searchStems);
  const scores = scoreBlocks(blocks, queryStems);

  const chosen = new Set<number>([0]);
  let used = blocks[0]?.length ?? 0;
  for (let index = 1; index < blocks.length; index += 1) {
    const size = blocks[index]!.length;
    if (used + size > budget * LEAD_SHARE) break;
    chosen.add(index);
    used += size;
  }

  const order = blocks
    .map((_, index) => index)
    .filter(
      (index) =>
        !chosen.has(index) &&
        scores[index]! > 0 &&
        blocks[index]!.length >= MIN_RANKED_BLOCK,
    )
    .sort((a, b) => scores[b]! - scores[a]! || a - b);
  for (const index of order) {
    const size = blocks[index]!.length;
    if (used + size > budget) {
      const room = budget - used - 4;
      if (room >= MIN_PARTIAL) {
        // The best remaining match is worth a cut version more than nothing.
        blocks[index] = `${blocks[index]!.slice(0, room).trimEnd()} …`;
        chosen.add(index);
        used += blocks[index]!.length;
      }
      continue;
    }
    chosen.add(index);
    used += size;
  }
  // Nothing matched (a page in a language the queries do not share): the
  // continuation of the page is the best remaining guess.
  for (let index = 0; index < blocks.length && !order.length; index += 1) {
    const size = blocks[index]!.length;
    if (chosen.has(index)) continue;
    if (used + size > budget) break;
    chosen.add(index);
    used += size;
  }

  const parts: string[] = [];
  let last = -1;
  for (const index of [...chosen].sort((a, b) => a - b)) {
    if (last >= 0 && index !== last + 1) parts.push("…");
    parts.push(blocks[index]!);
    last = index;
  }
  return parts.join("\n\n").slice(0, budget);
};
