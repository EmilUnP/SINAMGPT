import { Worker } from "node:worker_threads";
import { decodeEntities, extractTitle, htmlToText } from "./extract";

/**
 * Main-content extraction for fetched pages.
 *
 * The old path stripped every tag and kept the first N characters, so a small
 * model mostly read menus ("English Français … Home Login Sign up") and never
 * reached the forecast table. Defuddle — the extractor behind Obsidian Web
 * Clipper — finds the article body and returns Markdown with headings, lists
 * and tables intact. It beat Mozilla Readability on our weather pages, where
 * Readability dropped the forecast text entirely.
 *
 * Defuddle costs 0.4–0.9 s of CPU per page. On the request thread that stalls
 * every other user's token stream while one person searches, so it runs in a
 * small worker pool and falls back to the request thread only if a worker
 * cannot start.
 */

export type ReadablePage = {
  title: string;
  text: string;
  /** ISO date the page says it was published or updated, when it says. */
  published?: string;
  method: "defuddle" | "basic";
};

type RawExtraction = {
  title: string;
  content: string;
  published: string;
};

/** Below this, Defuddle probably missed the body (SPA shell, cookie wall). */
const MIN_USEFUL_CHARS = 200;
/** Extraction time for one page once a worker has it. */
const JOB_TIMEOUT_MS = 8_000;
/**
 * Longest a page waits for a free, booted worker. The first boot after a
 * server start can take many seconds on Windows (antivirus scans the freshly
 * loaded modules); pages that wait longer use the basic extractor instead.
 */
const QUEUE_TIMEOUT_MS = 12_000;
const POOL_SIZE = 2;
/** Parsing cost grows with size; pages past this are mostly scripts anyway. */
const MAX_PARSE_CHARS = 1_500_000;

/**
 * Plain CommonJS source so the worker needs no bundler support: it imports
 * the two packages from node_modules at runtime (resolved from the app's
 * working directory, which is the project root in dev and /app in the
 * standalone image). Both are `serverExternalPackages`, so Next traces them
 * into the standalone output through the inline fallback's import below.
 */
const WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const ready = Promise.all([import("linkedom"), import("defuddle/node")]);
ready.then(
  () => parentPort.postMessage({ ready: true }),
  (error) => parentPort.postMessage({ ready: false, error: String((error && error.message) || error) }),
);
parentPort.on("message", async (job) => {
  try {
    const [{ parseHTML }, { Defuddle }] = await ready;
    const { document } = parseHTML(job.html);
    const result = await Defuddle(document, job.url, { markdown: true, useAsync: false });
    parentPort.postMessage({ id: job.id, ok: true, value: {
      title: String(result.title || ""),
      content: String(result.content || ""),
      published: String(result.published || ""),
    } });
  } catch (error) {
    parentPort.postMessage({ id: job.id, ok: false, error: String((error && error.message) || error) });
  }
});
`;

type Job = {
  id: number;
  html: string;
  url: string;
  resolve: (value: RawExtraction) => void;
  reject: (error: Error) => void;
  waitTimer: NodeJS.Timeout | null;
};

type Slot = {
  worker: Worker;
  /** True once the worker has loaded linkedom and Defuddle. */
  ready: boolean;
  job: Job | null;
  timer: NodeJS.Timeout | null;
};

type WorkerMessage =
  | { ready: boolean; error?: string }
  | { id: number; ok: boolean; value?: RawExtraction; error?: string };

class ReaderPool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  /** Set once a worker cannot load its modules; every later page runs inline. */
  broken = false;

  run(html: string, url: string): Promise<RawExtraction> {
    return new Promise((resolve, reject) => {
      const job: Job = { id: this.nextId++, html, url, resolve, reject, waitTimer: null };
      job.waitTimer = setTimeout(() => {
        this.queue = this.queue.filter((item) => item !== job);
        reject(new Error("Page reader busy"));
      }, QUEUE_TIMEOUT_MS);
      this.queue.push(job);
      this.pump();
    });
  }

  private spawn(): void {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
    } catch {
      this.broken = true;
      return;
    }
    worker.unref();
    const slot: Slot = { worker, ready: false, job: null, timer: null };
    worker.on("message", (message: WorkerMessage) => {
      if ("ready" in message) {
        if (message.ready) {
          slot.ready = true;
        } else {
          // Missing module or sandbox: the runtime cannot host a reader.
          this.broken = true;
          this.drop(slot);
        }
        this.pump();
        return;
      }
      const job = slot.job;
      if (!job || job.id !== message.id) return;
      this.finish(slot);
      if (message.ok && message.value) job.resolve(message.value);
      else job.reject(new Error(message.error || "Page extraction failed"));
      this.pump();
    });
    const fail = (error: Error) => {
      if (!slot.ready) this.broken = true;
      const job = slot.job;
      this.drop(slot);
      job?.reject(error);
      this.pump();
    };
    worker.on("error", (error) => fail(error instanceof Error ? error : new Error(String(error))));
    worker.on("exit", (code) => {
      if (this.slots.includes(slot)) fail(new Error(`Page reader exited (${code})`));
    });
    this.slots.push(slot);
  }

  private finish(slot: Slot) {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.job = null;
  }

  private drop(slot: Slot) {
    this.finish(slot);
    this.slots = this.slots.filter((item) => item !== slot);
    void slot.worker.terminate().catch(() => undefined);
  }

  private pump(): void {
    if (this.broken) {
      // Hand queued pages back so the caller can extract them inline.
      for (const job of this.queue.splice(0)) {
        if (job.waitTimer) clearTimeout(job.waitTimer);
        job.reject(new Error("Page reader unavailable"));
      }
      return;
    }
    // Boot workers up to the pool size while pages are waiting.
    while (this.queue.length > this.slots.filter((slot) => !slot.job).length && this.slots.length < POOL_SIZE) {
      this.spawn();
      if (this.broken) {
        this.pump();
        return;
      }
    }
    while (this.queue.length) {
      const slot = this.slots.find((item) => item.ready && !item.job);
      if (!slot) return;
      const job = this.queue.shift()!;
      if (job.waitTimer) clearTimeout(job.waitTimer);
      slot.job = job;
      // A pathological page can spin the parser; kill that worker, not the app.
      slot.timer = setTimeout(() => {
        this.drop(slot);
        job.reject(new Error("Page extraction timed out"));
        this.pump();
      }, JOB_TIMEOUT_MS);
      slot.worker.postMessage({ id: job.id, html: job.html, url: job.url });
    }
  }
}

let pool: ReaderPool | null = null;

const workersAllowed = (): boolean =>
  !process.env.VITEST && process.env.SEARCH_READER_INLINE !== "1";

const extractInline = async (html: string, url: string): Promise<RawExtraction> => {
  const [{ parseHTML }, { Defuddle }] = await Promise.all([
    import("linkedom"),
    import("defuddle/node"),
  ]);
  const { document } = parseHTML(html);
  const result = await Defuddle(document as unknown as Document, url, {
    markdown: true,
    useAsync: false,
  });
  return {
    title: String(result.title || ""),
    content: String(result.content || ""),
    published: String(result.published || ""),
  };
};

const extractRaw = async (html: string, url: string): Promise<RawExtraction> => {
  if (workersAllowed()) {
    pool ??= new ReaderPool();
    if (!pool.broken) {
      try {
        return await pool.run(html, url);
      } catch (error) {
        // A timeout or a busy pool must not move the work onto the request
        // thread; the caller falls back to the cheap extractor instead.
        if (!pool.broken) throw error;
      }
    }
  }
  return extractInline(html, url);
};

/**
 * Markdown is the right shape for the model (headings, lists, tables) but
 * link targets and image URLs are pure token cost — a weather page's forecast
 * is buried under `![Partly cloudy](https://static…svg "Partly cloudy")`.
 * Keep the text, drop the plumbing.
 */
export const cleanMarkdown = (markdown: string): string => {
  const text = markdown
    // Images, including linked images: ![alt](src "title")
    .replace(/!\[[^\]]*\]\((?:[^()\s]|\([^()]*\))*(?:\s+"[^"]*")?\)/g, " ")
    // Links keep their text: [text](href "title"), text may hold [brackets]
    .replace(
      /\[((?:[^[\]]|\[[^\]]*\])*)\]\((?:[^()\s]|\([^()]*\))*(?:\s+"[^"]*")?\)/g,
      "$1",
    )
    // Footnote markers [^2] and their definitions
    .replace(/^\[\^[^\]]+\]:.*$/gm, "")
    .replace(/\[\^[^\]]+\]/g, "")
    // Leftover inline HTML
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    // Markdown escapes such as \- and \[
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1");

  const lines: string[] = [];
  let blank = false;
  for (const raw of decodeEntities(text).split("\n")) {
    const line = raw.replace(/[ \t ]+/g, " ").trim();
    // Lines that are only punctuation are what an emptied link leaves behind.
    if (!line || /^[\s\-–—|*•·.,:;]+$/.test(line)) {
      blank = lines.length > 0;
      continue;
    }
    if (blank) lines.push("");
    blank = false;
    lines.push(line);
  }
  return lines.join("\n").trim();
};

const isoDate = (value: string): string | undefined => {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10);
};

/** Readable text of an HTML page; never throws — falls back to tag stripping. */
export const readHtmlPage = async (
  html: string,
  url: string,
  maxChars: number,
): Promise<ReadablePage> => {
  const source = html.length > MAX_PARSE_CHARS ? html.slice(0, MAX_PARSE_CHARS) : html;
  const basicTitle = extractTitle(source);
  try {
    const raw = await extractRaw(source, url);
    const text = cleanMarkdown(raw.content);
    if (text.length >= MIN_USEFUL_CHARS) {
      return {
        title: (raw.title || basicTitle).slice(0, 200),
        text: text.slice(0, maxChars),
        published: isoDate(raw.published),
        method: "defuddle",
      };
    }
  } catch {
    // Fall through to the basic extractor.
  }
  return {
    title: basicTitle,
    text: htmlToText(source, maxChars),
    method: "basic",
  };
};
