# SINAMGPT — Platform track (v1.18 → v2.0)

Expansion plan for turning SINAMGPT from a **local chat app** into a **local AI platform**:
many runtimes, many model types, internet search, and real file handling.

This is a **separate track** from [ROADMAP.md](./ROADMAP.md). That file stays the honest
record of what shipped release by release; this one is the multi-release arc those releases
will come from. When a phase here ships, record it there as usual.

Updated for **v1.18.0**. Status key: `planned` · `in progress` · `done` · `deferred`.

---

## 1. Audit — what 17 releases actually bought us

Most of the codebase is reusable as-is. The expansion does not need a rewrite.

| Layer | What is there | Verdict |
|-------|---------------|---------|
| Auth & roles | Local accounts, bcrypt, signed cookie, middleware role gate, rate limits | **Reuse as-is** |
| Feature flags | `feature_flags` in `app_settings`, 5 flags, default-off, admin toggles | **Exactly the right pattern** — every new capability ships behind one |
| Admin console | Users, model Activate gate, settings, live usage, knowledge, guardrails | **Control surface for everything new** |
| Streaming | SSE with keepalive, abort on disconnect, token accounting | **Reuse for job progress** |
| Citations | `messages.sources` + the “From: …” UI | **Ready-made surface for web results** |
| Public API | OpenAI-compatible `/api/v1`, keys, limits, CORS, dev lab | **Extend, don’t rebuild** |
| Model catalog | `models` table with `vision / tools / audio / video` booleans | ⚠️ Needs a **task** dimension |
| Retrieval | Keyword + IDF with an EN/AZ/RU query gloss — no vectors | ⚠️ Keep it, **add** a second retriever |
| Usage telemetry | `usage_events` shaped around prompt chars, TTFT, tokens/sec | ⚠️ Cannot describe a render job |
| Guardrails | Layered detectors over user input, DB-editable policy | ⚠️ Must also cover **tool output** |
| Provider layer | `getEnabledBackends()` returns literal `["ollama"]`; vLLM adapter is dead code | ❌ Seam exists, welded shut |
| Long work | Everything request-scoped; no queue, no job records, no worker | ❌ Missing entirely |
| Tool calling | One forward pass per turn; `tools` flag is display-only | ❌ Missing entirely |
| Unit tests | `scripts/deep-chat-test.mjs` + `/lab` suites only | ❌ Missing entirely |

---

## 2. Diagnosis — what blocks each goal

### Goal 1 — Universal, not Ollama-only

The abstraction folder (`src/lib/llm/`) is real and well-factored, but every entry point
routes back to one adapter. The vLLM adapter is ~90 % complete and permanently off.

```
src/lib/llm/index.ts   getEnabledBackends()  → ["ollama"]
src/lib/llm/index.ts   resolveModelBackend() → "ollama"
src/lib/llm/vllm.ts    isVllmEnabled()       → false
src/lib/db.ts          CHECK (backend IN ('ollama','vllm'))
```

Provider config is a single env var (`OLLAMA_BASE_URL`) — no credentials, no second
instance, no registry.

### Goal 2 — Many model types

Every capability flag answers *“what can the chat model swallow?”*. Nothing expresses
*“this model’s output is a PNG”* or *“this model returns a vector”*.

- `src/lib/llm/types.ts` — `{ vision, tools, audio, tts, video }`, all input-shaped
- `src/lib/speak.ts` — TTS is `window.speechSynthesis`, i.e. the browser, not a model
- `src/lib/llm/ollama.ts` — STT is a WAV smuggled through the `images[]` array, plus an
  `AUDIO_SYSTEM` prompt talking the model out of claiming the file is missing
- Embeddings, reranking, image generation, video generation — not present

### Goal 3 — Internet search

A turn is one forward pass: `withSystemPrompt()` → `streamChat()` → done. No `tool_calls`
handling in any adapter. Search is not blocked by a missing search API — it is blocked by
the absence of the runtime primitive that search, file writing and image generation share.

### Goal 4 — Files

Five accepted mime types: four image formats plus `audio/wav` (30 s cap). No extraction,
no chunking, no generation, no editing. And retrieval is keyword-only, so even perfect
extraction would land in a search engine that cannot match a paraphrase.

---

## 3. Load-bearing risks

Not features — conditions that make every later feature cheaper or more expensive.

| # | Risk | Why it compounds |
|---|------|------------------|
| **R1** | `ChatApp.tsx` is **2,477 lines** | About to receive file cards, image galleries, video players, tool traces and a search panel. Splitting costs days now, ~10× that after four surfaces tangle into it. |
| **R2** | Long work has nowhere to run | Image gen 5–30 s, video minutes, embedding a 300-page PDF minutes. The last two commits both fought `maxDuration` on the chat route. Raising the ceiling does not fix the shape. |
| **R3** | Nothing pure is under test | `capabilities`, `multilang`, `knowledge` scoring and `guardrail-engine` are pure functions with real logic and zero unit tests. |
| **R4** | 32 GB cannot hold the whole roster | Chat + embed + STT + TTS fit. Image gen does not fit alongside a 32B chat model. See §6. |

---

## 4. The plan

Semver per [VERSIONING.md](./VERSIONING.md). Effort assumes one developer; phases after P0
can overlap. **Every phase ships behind a feature flag, default-off**, like the existing five.

### P0 — Open the seams · `v1.18` · 3–4 weeks · nothing user-visible · `done`

Pure enablement. Five of six items are prerequisites for two or more later phases.

| # | Item | Detail |
|---|------|--------|
| 0.1 | Provider registry · `done` | `providers` table replaces the hardcoded backend list; API keys use AES-256-GCM at rest, `models.backend` is a free-form provider id, and the existing Ollama URL seeds `ollama` once. vLLM remains parked for P1. |
| 0.2 | Task kinds on models · `done` | `models.kind` classifies chat, image, video, STT, TTS, embedding, and rerank models; only chat models enter chat routes and pickers. Existing rows migrate safely to chat. |
| 0.3 | Job queue · `done` | Persistent owner-scoped jobs use atomic SQLite claims, one in-process worker, leases/recovery, cancellation, bounded progress, and reconnectable SSE. The internal demo API is off by default. |
| 0.4 | Split `ChatApp.tsx` · `done` | Chat state and rendering now live in focused typed hooks, pure helpers, and components. `ChatApp.tsx` is a 350-line orchestrator with the existing client root and behavior preserved. |
| 0.5 | Unit test harness · `done` | Vitest covers `capabilities`, `multilang`, pure knowledge ranking, and `guardrail-engine` without Ollama or SQLite. |
| 0.6 | Tool runtime · `done` | Strict Ajv schemas, bounded execution, abort/timeout handling, local guard checks over inputs and outputs, and redacted persisted traces. It ships behind a default-off flag with zero tools registered. |

**Exit:** a second provider can be added from Admin, a job can run for four minutes, and a
tool can be registered in one file.

### P1 — Any runtime · `v1.19` · 1–2 weeks · **Goal 1**

Cheap now because `vllm.ts` already translates OpenAI streaming chunks into the Ollama
NDJSON shape the chat route expects.

| # | Item | Detail |
|---|------|--------|
| 1.1 | Un-park vLLM | Flip `isVllmEnabled`, route through the registry, verify streaming translation against a live server. |
| 1.2 | Generic OpenAI adapter | One adapter covers vLLM, LM Studio, llama.cpp server, TGI, LocalAI, and any hosted endpoint speaking the same protocol. Per-provider auth, model list, health ping. |
| 1.3 | Admin → Providers | Add, test connection, enable, sync models. Each provider reports its own health beside its own model list. |
| 1.4 | Routing & fallback | `provider:model` addressing, fallback chain when a provider is down, per-provider concurrency limits. |
| 1.5 | Keep the LAN promise honest | Hosted providers possible but **off by default**, with an explicit warning at add-time that traffic leaves the building. The README claim stays true unless an admin deliberately changes it. |

**Exit:** a model on a second machine appears in the picker and answers.

### P2a — Embeddings & reranking · `v1.20` · ~1.5 weeks · **Goal 2**

**Highest return in the plan.** Cheapest phase, and it upgrades retrieval — which both
web search and file understanding depend on.

| # | Item | Detail |
|---|------|--------|
| 2a.1 | Embedding provider | Ollama’s embed endpoint = zero install; a dedicated inference server is faster under load. Model: **`bge-m3`** — genuinely multilingual, which an EN/AZ/RU product needs and English-only embedders cannot fake. |
| 2a.2 | Chunk store | `chunks` table (doc_id, ord, text, vector BLOB, token_count). Brute-force cosine is fine to ~50k chunks on this hardware; `sqlite-vec` is the upgrade path. |
| 2a.3 | Hybrid retrieval | **Keep the existing keyword scorer** — it catches exact product names vectors miss. Fuse keyword + vector ranks with RRF. |
| 2a.4 | Reranker | `bge-reranker-v2-m3` over top-30 → final 4. This is what makes citations *correct*, not merely present. |
| 2a.5 | Backfill job | Existing knowledge docs chunk and embed through the P0 queue, with progress in Admin. |
| 2a.6 | Search quality panel | Admin sees which retriever fired, the scores, and ordering before/after rerank. |

**Exit:** a Russian question finds an Azerbaijani note *by meaning*, not by glossed keywords.

### P2b — Speech, done properly · `v1.21` · ~2 weeks · **Goal 2**

This phase **removes** code: the WAV-through-`images[]` trick and `AUDIO_SYSTEM` both
disappear once transcription is its own model.

| # | Item | Detail |
|---|------|--------|
| 2b.1 | Real STT | Whisper as a proper provider. Lifts the 30 s cap, accepts uploaded audio files, works with **every** chat model instead of only Gemma 4. |
| 2b.2 | Real TTS | Piper (speed) / Kokoro (quality) / XTTS (cloning, if ever wanted). Replaces the browser engine so every listener hears the same voice. |
| 2b.3 | Check Azerbaijani early | EN and RU voices are well covered; **AZ is the thin one**. Test it in week one, keep the browser engine as the AZ fallback — do not discover this at the end. |
| 2b.4 | Streaming playback | Speak sentence one while the rest generates, so Listen feels instant on long replies. |

**Exit:** a five-minute recording transcribes on a text-only model, and Listen no longer
depends on the visitor’s browser.

### P3 — Internet search · `v1.22` · ~1.5 weeks · **Goal 3**

Cheap because P0.6 already happened: two tool definitions plus a safety policy, not an
integration. Citations reuse `messages.sources` and the existing “From: …” component.

| # | Item | Detail |
|---|------|--------|
| 3.1 | Search provider | SearXNG self-hosted fits the LAN posture — no key, no per-query cost, no third party sees employee queries. Keyed APIs stay an option for result quality. |
| 3.2 | Two tools | `web_search(query)` → ranked results. `web_fetch(url)` → readable extracted text with a hard size cap. |
| 3.3 | **Treat fetched pages as hostile** | A page the model reads is **data, never instructions**. Delimit it, run the existing guardrail detectors over it, never let fetched text trigger another tool call unchecked, keep a domain allow/deny list in Admin. The one place where skipping the work has a real security cost. |
| 3.4 | Reranked results | Feed snippets through the P2a reranker before they reach the model. Fewer, better sources beat ten mediocre ones. |
| 3.5 | Visible reasoning | “Searching…” step in the stream, source chips under the answer, expandable “what I read” panel. |
| 3.6 | Admin controls | On/off, provider, result count, fetch size cap, domain policy, per-user daily quota. |

**Exit:** a question about this week’s news is answered with links a manager can click and verify.

### P4 — Files in, files out · `v1.23`–`v1.24` · ~4 weeks · **Goal 4**

Two releases. Reading and writing documents are different problems with different failure
modes, and reading is worth shipping alone — it is already candidate #1 in `ROADMAP.md`.

| # | Item | Detail |
|---|------|--------|
| 4a.1 | Accept real documents | PDF, DOCX, XLSX, PPTX, CSV, TXT, MD, JSON, code. Per-type size caps and **magic-byte sniffing** — a declared mime type is a claim, not a fact. |
| 4a.2 | Extraction in the queue | Text from PDF/DOCX, cells from sheets, OCR fallback for scanned pages. Never inside the request. |
| 4a.3 | Two destinations, one choice | On upload the user picks **this chat only** or **add to company knowledge** (chunk + embed). That single decision is the whole feature’s UX. |
| 4a.4 | Cite the page | Answers point at *page 12* or *sheet “Q3”*, not just the filename. |
| 4b.1 | Document tools | Create/edit Word, Excel, PowerPoint, PDF as registered tools, so the model can produce a file mid-conversation. |
| 4b.2 | **Edit by patch, not rewrite** | Extract → model emits a structured change → apply → keep the original as a version. A blind regeneration silently loses formatting and content nobody asked to change. |
| 4b.3 | Delivery | Download, re-attach to chat, or save into a project — with versions visible. |

**Exit:** “summarise this contract and give me the changes as a Word file” works end to end.

### P5 — Image generation & editing · `v1.25` · 2–3 weeks · **Goal 2**

Deliberately late — not because it is hard, but because it is the first phase gated on a
**hardware** decision rather than on code (see §6).

| # | Item | Detail |
|---|------|--------|
| 5.1 | One provider, many jobs | ComfyUI covers txt2img, img2img, inpainting, upscaling and control models through different workflows — one integration instead of four. |
| 5.2 | Model set | A fast model for drafts, a quality model for finals, plus an upscaler. Same Activate gate as chat models. |
| 5.3 | Two entry points | A registered **tool** so chat can generate in context, and a dedicated studio page for direct control of size, seed, steps. |
| 5.4 | Generated media as first-class | New attachment type, gallery view, visible parameters, re-run with edits, save to project. |
| 5.5 | VRAM scheduling | A render waits for the chat model to unload rather than racing it. The OOM path is already handled in `formatOllamaError` — this stops it being reached. |

**Exit:** an image is generated from chat, refined once, and saved to a project.

### P6 — Make it feel like one product · `v2.0` · ~3 weeks · **Goal 2**

The *“in a clean way, improved UI/UX”* half of goal 2, as its own release. Six capabilities
bolted onto a chat window is a worse product than five in a coherent one.

| # | Item | Detail |
|---|------|--------|
| 6.1 | Task-first model picker | Ask what the user wants to *do*, then which model. The input-badge pill is already dense at 9 models and will not survive 20 across 7 kinds. |
| 6.2 | Jobs tray | One global view of what is running, progress, cancel. Required the moment anything outlives a reply. |
| 6.3 | Unified studio | Chat, images, transcription, documents behind one shell with a shared picker and history. |
| 6.4 | Clear the standing backlog | Command palette, first-login onboarding, chat export, project archive — all already listed. Export is nearly free once 4b exists. |
| 6.5 | Accessibility & mobile pass | One deliberate sweep over the new surfaces, translated to all three languages at the same time. |

**Exit:** v2.0. A new employee understands the whole product without being told which page does what.

### P7 — Video generation · `deferred` · ~2 weeks · **Goal 2**

Same ComfyUI provider as P5, so the code is a small increment. The **economics** are the
problem: on one card, a few seconds of video is minutes of exclusive GPU time and the
largest VRAM footprint here. Nothing else runs while it does.

**Recommendation:** build only after P5 proves the queue and scheduler hold, then ship
admin-only, behind a flag, queue depth 1 — a capability for occasional marketing assets,
not a daily-driver feature. **If the roadmap must shed a phase, this is the one.**

---

## 5. Why this order

| Chain | Reason |
|-------|--------|
| `P0 → everything` | Five of six foundation items are prerequisites for 2+ later phases. Building them inside the first feature that needs them means building them crookedly, then rebuilding. |
| `P0.6 → P3, P4b, P5` | Web search, document writing and image-from-chat are the same shape: the model asks, something runs, the result returns. One loop + three tool definitions, instead of three bespoke integrations. |
| `P2a → P3, P4a` | Embeddings/reranking are the cheapest phase and raise the ceiling on both web results and file Q&A. Done afterwards, search gets built twice. |
| `P0.3 → P2a, P4a, P5, P7` | The queue lets a render, transcription or 300-page ingest outlive an HTTP request. Every media phase is blocked on it. |

---

## 6. Hardware — what fits on the 5090

Approximate steady-state VRAM on a 32 GB card.

| Scenario | Residency | Fits? |
|----------|-----------|-------|
| Chat 32B (q4) + embed + STT + TTS | ~20 + 2 + 1.2 + 0.4 = **23.6 GB** | ✅ 8.4 GB free |
| …plus image generation (~8 GB) | **31.6 GB** | ❌ no working headroom |

**Phases 0–4 need no new hardware.** Chat, retrieval, transcription and speech coexist with
room to spare, and a smaller chat model widens the margin further.

**Image generation is the break point**, with two answers:

1. **Unload the chat model while a render runs** — free, but chat stalls for the duration.
2. **Put generation on a second machine** — which P1’s provider registry already makes a
   *configuration* change rather than a code change.

Video (P7) needs the second machine outright.

---

## 7. Open decisions

None of these block starting. Each is cheaper to answer now than mid-build.

| # | Decision | Blocks |
|---|----------|--------|
| 1 | **Second GPU machine, or unload-and-swap on the one we have?** A second box makes image/video routine and costs money; swapping is free and pauses chat during renders. P1 makes either a settings change — but the answer cannot wait past P5. | P5, P7 |
| 2 | **Self-hosted search or a commercial search API?** Self-hosted keeps every employee query inside the building and matches the README. A commercial API returns better results and sends each query to a third party. Policy call, not technical. | P3 |
| 3 | **Are hosted models allowed at all, ever?** “No third-party cloud APIs” is currently a property of the *code*. After P1 it becomes a property of the *configuration*. If it must stay absolute, it gets enforced in the provider registry rather than left to admin discipline. | P1 |
| 4 | **How large does the knowledge base actually get?** Under ~50k chunks, vectors in SQLite with brute-force cosine are fine and add no dependency. Well beyond that wants a real vector index. Changes P2a’s storage design and nothing else. | P2a |

---

## How to use this doc

1. **Starting a phase** — mark it `in progress` here, and move its headline item into
   **Next active track** in [ROADMAP.md](./ROADMAP.md).
2. **Shipping a phase** — mark `done` here, add a `CHANGELOG.md` entry, and record the
   release row in [ROADMAP.md](./ROADMAP.md) as normal. The two files stay in sync at
   release boundaries, not continuously.
3. **Dropping a phase** — `deferred` plus one line of reason. P7 starts there by default.
