# SINAMGPT — Platform track (v1.18 → v2.0)

Expansion plan for turning SINAMGPT from a **local chat app** into a **local AI platform**:
many runtimes, many model types, internet search, and real file handling.

This is a **separate track** from [ROADMAP.md](./ROADMAP.md). That file stays the honest
record of what shipped release by release; this one is the multi-release arc those releases
will come from. When a phase here ships, record it there as usual.

Updated for **v1.19.1**, re-verified against the tree on **2026-08-30**.
Status key: `planned` · `in progress` · `done` · `deferred`.

> **This plan only ever had feature phases.** Two releases (v1.18.1, v1.19.1) have now shipped
> mobile, auth, security and performance work with no slot here. §1a fixes that: hardening is a
> **lane**, not a phase, and each remaining phase now carries its own security line.

---

## 1. Audit — the board after P0 + P1

Re-checked against the code, not the changelog. **All four original ❌ rows are cleared**, and
so is the lint gate that replaced them.

| Layer | State today | Verdict |
|-------|-------------|---------|
| Provider layer | SQLite registry, AES-256-GCM keys, free-text provider ids, Admin CRUD | ✅ **Seam open** *(was: welded shut)* |
| Long work | Persistent jobs, atomic claims, leases, recovery, cancel, SSE progress | ✅ **Solved** *(was: missing entirely)* |
| Tool calling | Validated, bounded, guarded loop — zero tools registered by design | ✅ **Ready** *(was: missing entirely)* |
| Unit tests | **110 passing across 19 files**, no Ollama or app DB needed | ✅ **Established** *(was: missing entirely)* |
| Model catalog | `models.kind` constrains all seven task types | ✅ **Task dimension added** |
| Chat client | 350-line orchestrator, 6 hooks, ~20 components | ✅ **Ready for new surfaces** |
| Auth & roles | Local accounts, bcrypt, signed cookie, middleware role gate, rate limits | ✅ Reuse as-is |
| Feature flags | Now **7** flags (`jobQueue`, `toolCalling` added), all default-off | ✅ Still exactly the right pattern |
| Admin console | Users, Activate gate, settings, usage, knowledge, guardrails, **providers** | ✅ Control surface for everything new |
| Streaming | SSE with keepalive, abort, token accounting — now also job progress | ✅ Reuse |
| Citations | `messages.sources` + the “From: …” UI | ✅ Ready-made surface for web results |
| Public API | OpenAI-compatible `/api/v1`, keys, limits, CORS, dev lab | ✅ Extend, don’t rebuild |
| Retrieval | Still keyword + IDF with the EN/AZ/RU gloss — no vectors yet | ⚠️ Scheduled — **P2a** |
| Usage telemetry | Still chat-shaped; `jobs` covers job state but not usage reporting | ⚠️ Fold into **P5** |
| Guardrails | Layered detectors; P0.6 added a guard pass over tool inputs **and** outputs | ⚠️ Extend with domain policy in **P3** |
| Guest chat client | `HomeTryChat.tsx` is 947 lines — the P0.4 split covered the signed-in app only | ⚠️ Carry-forward — **P6.4** |
| Lint gate | `npm run lint` runs clean; `npm test` → 110 passing, tree clean | ✅ **Green** |
| Browser hardening | CSP · COOP · CORP · nosniff · frame-ancestors none, on every page | ✅ **Added in v1.19.1** |
| SSRF defence | `provider-url.ts` blocks cloud metadata hosts incl. IPv4-mapped IPv6 | ✅ **Added — reusable by P3** |
| Proxy identity | `X-Forwarded-For` ignored unless `TRUST_PROXY=1` | ✅ **Added — makes P3 quotas real** |
| SQLite under load | busy_timeout, WAL checkpointing, larger cache, schema checked once per process | ✅ **Tuned in v1.19.1** |
| Tool runtime wiring | Loop is called from `chat/route.ts:276` behind a 3-way gate — **registry empty, so it has never executed** | ⚠️ **Prove it** — rank 1 |
| Chat route | `api/chat/route.ts` is 1,069 lines; next two ranked phases both land in it | ⚠️ Split during P3 — **F7** |

---

## 1a. The missing lane — hardening

Two releases have shipped that this roadmap had no slot for. The pattern is older than the
plan: **v1.2.0 Hardening · v1.14.1 Hardening · v1.19.1 Hardening**. The work keeps happening
because it needs to; the plan just never described it.

### What shipped off-plan

| Release | Work | Why it belongs here, not only in the changelog |
|---------|------|------------------------------------------------|
| **v1.19.1** (2026-08-30) | Provider metadata SSRF block · `TRUST_PROXY` for forwarded IPs · CSP/COOP/CORP on every page · production refuses the example `SESSION_SECRET` · SQLite busy-timeout, cache and once-per-process schema check · model picker served from SQLite | **Two of these sit on the critical path of the next two ranked phases.** 3 new test files, 97 → 110 tests. |
| **v1.18.1** (2026-08-28) | Username-or-email sign-in · field-level auth validation (EN/AZ/RU) · mobile pass over login, register, chat, Models, Developer, Lab | This was counted **inside P6**. Doing it early takes real weight out of the v2.0 release. |

### The structural fix

**Hardening is a lane, not a phase.** Adding a "P8 — Security" would be worse than useless:
every remaining phase *creates* its own attack surface, and that surface is cheapest to
handle inside the phase that creates it, not in a cleanup release afterwards.

- **P3** fetches remote pages a *model* chose → SSRF, prompt injection, quota abuse
- **P4a** parses untrusted binaries → zip bombs, XXE, formula injection, parser DoS
- **P5** serves bytes a provider returned → CSP, content-type confidence, storage limits

Each phase table below now carries that line explicitly, and the effort estimates include it.

### Three payoffs already banked

1. **`provider-url.ts` is what P3 needs on day one — with the policy inverted.**
   `isCloudMetadataHostname()` and `isPrivateOrLocalHostname()` are exported and tested. But
   the direction reverses: for an admin adding a provider, a LAN address is the *expected*
   case and a public URL needs an acknowledgement. For `web_fetch`, a **model-supplied LAN
   address is the attack** and a public URL is normal. Same primitives, opposite defaults —
   and getting that inversion wrong turns the search tool into an internal port scanner.
2. **`TRUST_PROXY` makes P3.7's per-user search quota enforceable.** A quota keyed on a
   spoofable header is not a quota.
3. **Schema-check-once removes per-query overhead from every read** — which matters most for
   P2a, the phase that will do thousands of chunk lookups per answer.

### One new finding — see F8

The v1.19.1 header set is solid and `connect-src 'self'` is exactly right for a LAN product.
Two things to know before P5: generated images must be served from your own origin or
`img-src` blocks them (that constraint points the right way — serve them yourself), and
`script-src` still carries `'unsafe-eval'`; worth checking whether the production build
actually needs it.

---

## 2. Diagnosis — what blocks each goal

*Original diagnosis, annotated with what Phase 0 resolved. Kept as a record of why the
plan is shaped the way it is.*

### Goal 1 — Universal, not Ollama-only · **resolved**

The abstraction folder (`src/lib/llm/`) was real and well-factored, but every entry point
routed back to one adapter, and provider config was a single env var with no credentials,
no second instance and no registry.

| Was | Now |
|-----|-----|
| `getEnabledBackends() → ["ollama"]` | ✅ reads `listEnabledProviderConfigs()` |
| `resolveModelBackend() → "ollama"` | ✅ resolves through the registry |
| `CHECK (backend IN ('ollama','vllm'))` | ✅ dropped — provider id is free text |
| single `OLLAMA_BASE_URL`, no credentials | ✅ `providers` table, AES-256-GCM keys |
| `isVllmEnabled() → false` | ✅ **removed** — OpenAI-compatible adapter is live |
| — | ✅ `ProviderKind` is `"ollama" \| "vllm" \| "openai"` |

### Goal 2 — Many model types · **classification resolved, models not built**

Every capability flag answered *“what can the chat model swallow?”*. Nothing expressed
*“this model’s output is a PNG”* or *“this model returns a vector”*. `models.kind` now
does, with all seven kinds constrained at the schema level and chat routes rejecting
non-chat models.

Still true, and still the work of P2a / P2b / P5:

- `src/lib/speak.ts` — TTS is `window.speechSynthesis`, i.e. the browser, not a model
- `src/lib/llm/ollama.ts` — STT is a WAV smuggled through the `images[]` array, plus an
  `AUDIO_SYSTEM` prompt talking the model out of claiming the file is missing
- Embeddings, reranking, image generation, video generation — not present

### Goal 3 — Internet search · **blocker removed**

A turn was one forward pass: `withSystemPrompt()` → `streamChat()` → done, with no
`tool_calls` handling anywhere. Search was never blocked by a missing search API — it was
blocked by the absence of the runtime primitive that search, file writing and image
generation share.

P0.6 built that primitive **and wired it into the chat route** — validated, bounded, guarded,
traced, gated. What remains is a search provider and two entries in `bootstrap.ts`.

⚠️ Because the registry is empty, the first gate is always false and **the loop has never run
in production.** Proving it is why search is now rank 1.

### Goal 4 — Files · **unchanged**

Five accepted mime types: four image formats plus `audio/wav` (30 s cap). No extraction,
no chunking, no generation, no editing. And retrieval is still keyword-only, so even
perfect extraction would land in a search engine that cannot match a paraphrase — which is
why **P2a still comes before P4a**, even though it no longer comes before P3.

---

## 3. Load-bearing risks

Not features — conditions that make every later feature cheaper or more expensive.

| # | Risk | Status |
|---|------|--------|
| **R1** | `ChatApp.tsx` is 2,477 lines | ✅ **Cleared** by P0.4 — now 350 lines. Partially recurs as `HomeTryChat.tsx` (947 lines) and `api/chat/route.ts` (1,069 lines) — see F4, F7. |
| **R2** | Long work has nowhere to run | ✅ **Cleared** by P0.3 — persistent jobs with leases, recovery, cancel and SSE progress. |
| **R3** | Nothing pure is under test | ✅ **Cleared** by P0.5 — 110 tests over capabilities, multilang, knowledge, guardrails, providers, jobs, chat helpers, tool adapters, routing. |
| **R4** | 32 GB cannot hold the whole roster | ⏳ **Open, unchanged.** Nothing in P0 loads a model. Chat + embed + STT + TTS fit; image gen does not. See §6. |

---

## 3a. Findings

F1, F2, F3, F5 are closed. **F4, F6 and F7 carry over unchanged** — v1.19.1 touched neither
the chat route nor the tool path. F8 comes out of the hardening work itself.

| # | Severity | Finding |
|---|----------|---------|
| **F1** | Fix now | ✅ **Cleared.** Lint runs clean. |
| **F2** | Decide | ✅ **Decided.** `PROVIDER_KEY_SECRET` preferred, `SESSION_SECRET` as fallback; rotation caveat documented in `.env.example` and README. |
| **F3** | Soon | ✅ **Cleared.** `npm run test:integration` runs the gated provider + long-job proofs. |
| **F5** | Minor | ✅ **Cleared.** `.env.example` matches the schema again. |
| **F4** | **Open** | **`HomeTryChat.tsx` is 947 lines** and still duplicates composer, streaming and model-picker logic that P0.4 extracted into shared hooks. Every phase in the queue widens the gap between it and the signed-in client. Scheduled as P6.4. |
| **F6** | **New · fix inside P3** | **Registering the first tool will silently kill streaming.** When `shouldUseToolRuntime()` opens, `chat/route.ts:276` calls `completeToolChat` — a *non-streaming* completion — then emits the whole answer as one token event. The first tool-using turn goes from words-appearing-live to a blank pause and a wall of text; on a local 32B that pause looks broken. Stream the final answer after the last tool call and send tool steps as their own SSE events. The encoder already exists in `tools/sse.ts`. |
| **F8** | **New · revisit at P5** | **The new CSP needs one deliberate revisit.** `img-src 'self' data: blob:` means generated images must be served from your own origin, not linked from the provider — serving them yourself is the better design anyway, so this constraint points the right way. Separately, `script-src` still carries `'unsafe-eval'`; worth checking whether the production build actually needs it, since dropping it is the single biggest tightening available in that header. |
| **F7** | **New · fold into P3** | **`api/chat/route.ts` is 1,069 lines** and is the integration point for the next two ranked phases — search steps, tool events, file context and citations all land in the same handler. This is R1 recurring one layer down. Split it during P3 while the diff is still small. |

---

## 4. The plan

Semver per [VERSIONING.md](./VERSIONING.md). Effort assumes one developer.
**Every phase ships behind a feature flag, default-off.**

### Build order (re-ranked 2026-08-28, after v1.19.0)

Phases are documented below in their original `P` numbering; **build them in this order**:

| Rank | Phase | Ships | Effort | Move | Why here |
|------|-------|-------|--------|------|----------|
| **1** | **P3 — Internet search** | v1.20 | ~1 wk *(was 1.5)* | ⬆ **from 3rd** | Cheapest remaining phase, most visible to users, and **the only way to prove the tool runtime** — which has shipped twice without ever executing (see below). |
| **2** | **P2a — Embeddings & rerank** | v1.21 | ~1.5 wk | ⬇ from 1st | Same work, better timing: upgrades company knowledge **and** the web snippets P3 just shipped, in one release. |
| **3** | **P4a — Understand files** | v1.22 | ~2 wk | — hold | Your own `ROADMAP.md` has called this the biggest adoption gap since v1.17. Genuinely needs P2a underneath. |
| **4** | **P2b — Speech** | v1.23 | ~1.5 wk *(was 2)* | ⬇ from 3rd | Cheaper now (Whisper/TTS speak the OpenAI protocol P1 already handles) — but it *improves* something that works, while search and files do not exist at all. |
| **5** | **P4b — Generate files** | v1.24 | ~2 wk | — hold | Tool definitions on a loop P3 will have proven. |
| **6** | **P5 — Image generation** | v1.25 | 2–3 wk | — hold | Every software prerequisite is in place. Blocked only on which GPU — see §6. |
| **7** | **P6 — One product (v2.0)** | v2.0 | ~3 wk | — hold | Lighter than scoped: v1.18.1 already did the mobile pass and auth rework counted here. |
| **8** | **P7 — Video** | — | ~2 wk | — defer | Unchanged. Still the phase to cut if anything must go. |

**Why search moved to the front — the decisive finding.** The tool loop is not sitting in a
folder waiting to be integrated. It is already called from `chat/route.ts:276`, gated on
three conditions, with the trace persisted. Two releases have shipped through that code
path with an empty registry, so the **first gate has always been false and the runtime has
never executed once in production**:

```ts
// tools/gate.ts — first condition is always false today
registeredTools.length > 0 &&
  modelSupportsTools(model) &&
  isFeatureEnabled("toolCalling")
```

A foundation already paid for whose shape is still unproven is exactly what to exercise
next, and registering `web_search` is the cheapest way to do it.

**Why the old ordering is safe to change.** The original argument was *“P2a → P3, P4a: build
search after reranking or you build it twice.”* That holds for **P4a**, which genuinely needs
chunking and vectors. It is weaker for **P3**: reranking improves the *ordering* of search
snippets, it does not make search work. Shipping search first and folding the old P3.4 into
P2a costs one small follow-up, not a rebuild — and delivers a working feature ~1.5 weeks
earlier.

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

### P1 — Any runtime · `v1.19` · **~1 week** (was 1–2) · **Goal 1** · `done`

**Smaller than scoped.** The registry, encrypted credentials and the Admin CRUD panel all
landed inside P0. What is left is adapter work plus operational controls.

| # | Item | Detail |
|---|------|--------|
| 1.1 | Un-park vLLM · `done` | Shared OpenAI-compatible adapter serves vLLM; parked `isVllmEnabled()` is gone. |
| 1.2 | Generic OpenAI adapter · `done` | `ProviderKind` is `"ollama" \| "vllm" \| "openai"`. vLLM is a labeled alias of the same client (LM Studio, llama.cpp server, TGI). |
| 1.3 | Admin → Providers · `done` | Kind picker, test-connection, per-row health, per-provider model sync, plus existing CRUD. |
| 1.4 | Routing & fallback · `done` | `fallback_id` retries once on connect failure; `max_concurrent` is an in-process semaphore (`0` = unlimited). |
| 1.5 | Keep the LAN promise honest · `done` | Hosted providers allowed only with `acknowledgeRemote` and a visible Admin warning. Localhost and RFC1918 stay quiet. |

**Exit:** a model on a second machine appears in the picker and answers.

### P2a — Embeddings & reranking · **RANK 2** · `v1.21` · ~1.5 weeks · **Goal 2**

**Highest return in the plan.** Cheapest phase, and it upgrades retrieval — which both
web search and file understanding depend on.

| # | Item | Detail |
|---|------|--------|
| 2a.1 | Embedding provider | Ollama’s embed endpoint = zero install; a dedicated inference server is faster under load. Model: **`bge-m3`** — genuinely multilingual, which an EN/AZ/RU product needs and English-only embedders cannot fake. |
| 2a.2 | Chunk store | `chunks` table (doc_id, ord, text, vector BLOB, token_count). Brute-force cosine is fine to ~50k chunks on this hardware; `sqlite-vec` is the upgrade path. |
| 2a.3 | Hybrid retrieval | **Keep the existing keyword scorer** — it catches exact product names vectors miss. Fuse keyword + vector ranks with RRF. |
| 2a.4 | Reranker, applied **twice** | `bge-reranker-v2-m3` over top-30 → final 4, across **knowledge hits and the web snippets from P3**. This is the old P3.4 landing here, and what makes citations *correct* rather than merely present. |
| 2a.5 | Backfill job | Existing knowledge docs chunk and embed through the P0 queue, with progress in Admin. |
| 2a.6 | Search quality panel | Admin sees which retriever fired, the scores, and ordering before/after rerank. |

**Exit:** a Russian question finds an Azerbaijani note *by meaning*, not by glossed keywords.

### P2b — Speech, done properly · **RANK 4** · `v1.23` · **~1.5 weeks** · **Goal 2**

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

### P3 — Internet search · **RANK 1 · next** · `v1.20` · **~1 week** · **Goal 3**

Cheap because P0.6 already happened *and is already wired into the chat route*: a search
provider plus two entries in `bootstrap.ts`, not an integration. Citations reuse
`messages.sources` and the existing “From: …” component.

| # | Item | Detail |
|---|------|--------|
| 3.1 | Search provider | SearXNG self-hosted fits the LAN posture — no key, no per-query cost, no third party sees employee queries. Keyed APIs stay an option for result quality. |
| 3.2 | Two tools · **runtime ready** | `web_search(query)` → ranked results. `web_fetch(url)` → readable extracted text with a hard size cap. Added to `bootstrap.ts`; schema validation, iteration cap and timeouts are already enforced by the registry. |
| 3.3 | **Fix the streaming path first** | See **F6**. The tool branch is non-streaming today. Stream the final answer after the last tool call and emit tool steps as their own SSE events (`tools/sse.ts`) **before** anything user-facing turns on. |
| 3.4 | **Block the model from fetching your LAN** · **helpers ready** | Reuse `isCloudMetadataHostname` and `isPrivateOrLocalHostname` from v1.19.1 — but **invert the policy**. For a provider, LAN is expected; for `web_fetch`, a model-supplied LAN address is the attack. Get this backwards and the search tool is an internal port scanner. |
| 3.5 | **Treat fetched pages as hostile** | A page the model reads is **data, never instructions**. The P0.6 output guard is the hook — add a domain allow/deny list in Admin and make sure fetched text cannot trigger another tool call unchecked. |
| 3.6 | Visible reasoning · **surface ready** | “Searching…” step in the stream, source chips under the answer, expandable “what I read” panel. |
| 3.7 | Admin controls · **quota enforceable** | On/off, provider, result count, fetch size cap, domain policy, per-user daily quota — which v1.19.1's `TRUST_PROXY` made actually enforceable. |
| 3.8 | **Split the chat route** | See **F7**. 1,069 lines, and the next two ranked phases both land in it. Do it here while the diff is still small. |
| ~~3.9~~ | ~~Reranked results~~ | **Moved to P2a.4** — reranking improves ordering, it does not make search work. |

**Exit:** a question about this week’s news is answered with clickable sources, **streaming the whole time**.

### P4 — Files in, files out · **RANK 3 (4a) + RANK 5 (4b)** · `v1.22`–`v1.24` · ~4 weeks · **Goal 4**

Two releases. Reading and writing documents are different problems with different failure
modes, and reading is worth shipping alone — it is already candidate #1 in `ROADMAP.md`.

| # | Item | Detail |
|---|------|--------|
| 4a.1 | Accept real documents | PDF, DOCX, XLSX, PPTX, CSV, TXT, MD, JSON, code. Per-type size caps and **magic-byte sniffing** — a declared mime type is a claim, not a fact. |
| 4a.2 | Extraction in the queue | Text from PDF/DOCX, cells from sheets, OCR fallback for scanned pages. Never inside the request. |
| 4a.3 | Two destinations, one choice | On upload the user picks **this chat only** or **add to company knowledge** (chunk + embed). That single decision is the whole feature’s UX. |
| 4a.4 | Cite the page | Answers point at *page 12* or *sheet “Q3”*, not just the filename. |
| 4a.5 | **Parse untrusted binaries defensively** | Every parser here is attack surface: zip-bomb caps on DOCX/XLSX, no external entity resolution, no formula evaluation, and extraction confined to the job worker so a malicious file cannot take a request thread with it. This is the **hardening lane** line for this phase — see §1a. |
| 4b.1 | Document tools | Create/edit Word, Excel, PowerPoint, PDF as registered tools, so the model can produce a file mid-conversation. |
| 4b.2 | **Edit by patch, not rewrite** | Extract → model emits a structured change → apply → keep the original as a version. A blind regeneration silently loses formatting and content nobody asked to change. |
| 4b.3 | Delivery | Download, re-attach to chat, or save into a project — with versions visible. |

**Exit:** “summarise this contract and give me the changes as a Word file” works end to end.

### P5 — Image generation & editing · **RANK 6** · `v1.25` · 2–3 weeks · **Goal 2**

Deliberately late — not because it is hard, but because it is the first phase gated on a
**hardware** decision rather than on code (see §6).

| # | Item | Detail |
|---|------|--------|
| 5.1 | One provider, many jobs | ComfyUI covers txt2img, img2img, inpainting, upscaling and control models through different workflows — one integration instead of four. |
| 5.2 | Model set | A fast model for drafts, a quality model for finals, plus an upscaler. Same Activate gate as chat models. |
| 5.3 | Two entry points | A registered **tool** so chat can generate in context, and a dedicated studio page for direct control of size, seed, steps. |
| 5.4 | Generated media as first-class | New attachment type, gallery view, visible parameters, re-run with edits, save to project. **Serve the bytes from your own origin** — see **F8**; the v1.19.1 CSP will not load them from the provider. This is the **hardening lane** line for this phase. |
| 5.5 | VRAM scheduling | A render waits for the chat model to unload rather than racing it. The OOM path is already handled in `formatOllamaError` — this stops it being reached. |

**Exit:** an image is generated from chat, refined once, and saved to a project.

### P6 — Make it feel like one product · **RANK 7** · `v2.0` · ~3 weeks · **Goal 2**

The *“in a clean way, improved UI/UX”* half of goal 2, as its own release. Six capabilities
bolted onto a chat window is a worse product than five in a coherent one.

| # | Item | Detail |
|---|------|--------|
| 6.1 | Task-first model picker | Ask what the user wants to *do*, then which model. The input-badge pill is already dense at 9 models and will not survive 20 across 7 kinds. |
| 6.2 | Jobs tray | One global view of what is running, progress, cancel. Required the moment anything outlives a reply. |
| 6.3 | Unified studio | Chat, images, transcription, documents behind one shell with a shared picker and history. |
| 6.4 | Fold in the guest client | Retire the duplicated composer / streaming / picker logic in `HomeTryChat.tsx` onto the shared hooks and components from P0.4. See F4. |
| 6.5 | Clear the standing backlog | Command palette, first-login onboarding, chat export, project archive — all already listed. Export is nearly free once 4b exists. |
| 6.6 | Accessibility & mobile pass | One deliberate sweep over the new surfaces, translated to all three languages at the same time. |

**Exit:** v2.0. A new employee understands the whole product without being told which page does what.

### P7 — Video generation · **RANK 8 · deferred** · ~2 weeks · **Goal 2**

Same ComfyUI provider as P5, so the code is a small increment. The **economics** are the
problem: on one card, a few seconds of video is minutes of exclusive GPU time and the
largest VRAM footprint here. Nothing else runs while it does.

**Recommendation:** build only after P5 proves the queue and scheduler hold, then ship
admin-only, behind a flag, queue depth 1 — a capability for occasional marketing assets,
not a daily-driver feature. **If the roadmap must shed a phase, this is the one.**

---

## 5. Why this order

Three of the four chains are now **spent** — the foundation they described is built. They
are kept because they explain why the remaining phases are as cheap as they are.

| Chain | Status | Reason |
|-------|--------|--------|
| `P0 → everything` | ✅ spent | Six items, all landed, none rebuilt. The bet was that building foundations inside the first feature that needs them produces crooked foundations. **P1 shrinking by a week is the payoff arriving early.** |
| `P0.6 → P3, P4b, P5` | ✅ spent | One validated, bounded, guarded loop now exists with an empty registry. Web search, document writing and image-from-chat are each a tool definition rather than an integration. |
| `P0.3 → P2a, P4a, P5, P7` | ✅ spent | The queue had the most hidden depth — leases, atomic claims, stale recovery, reconnectable progress. Discovering that inside an image feature would have been expensive. |
| `P2a → P4a` | ⏳ live | **Narrowed.** File Q&A genuinely needs chunking and vectors — extraction without them lands documents in a keyword engine that cannot match a paraphrase. This half of the chain still holds. |
| ~~`P2a → P3`~~ | ✂️ **cut** | **Retired on 2026-08-28.** Reranking improves the *ordering* of search snippets; it does not make search work. Treating it as a hard prerequisite delayed a working feature by ~1.5 weeks for a quality gain that P2a delivers one release later anyway (now P2a.4). |
| `P3 → P4b` | ⏳ **new** | Search is now the proving ground for the tool loop. Registering document-writing tools on a runtime that has never executed is the weaker ordering — after P3, it never has to happen. |

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

Re-dated after the re-rank. One is now blocking, one is closed, two sit where they were.

| # | Decision | Blocks |
|---|----------|--------|
| 1 | ⚠️ **Self-hosted search, or a commercial search API?** **Now blocking** — search is rank 1. Self-hosted (SearXNG) keeps every employee query inside the building and matches the README. A commercial API returns better results and sends each query to a third party. A policy call, not a technical one, and it wants an answer this week. | **Rank 1 — next** |
| 2 | **How large does the knowledge base actually get?** Under ~50k chunks, vectors in SQLite with brute-force cosine are fine and add no dependency. Well beyond that wants a real vector index. Changes P2a’s storage design and nothing else. | Rank 2 |
| 3 | **Second GPU machine, or unload-and-swap on the one we have?** A second box makes image/video routine and costs money; swapping is free and pauses chat during renders. Four ranks away — and P1 already made either answer a form in Admin, complete with a fallback provider and a concurrency limit. | Rank 6, rank 8 |
| — | ✅ **Are hosted models allowed at all, ever?** **Closed in v1.19.0** — settled in code rather than in a meeting. Hosted endpoints work, but a remote URL requires an explicit “traffic may leave the building” acknowledgement (`provider-url.ts`); localhost and RFC1918 stay quiet. Possible, deliberate, and visible in the audit trail. | *closed* |

---

## How to use this doc

0. **Hardening releases** — a `.1` release that is pure security/performance does **not** need
   a phase here. Record it in `CHANGELOG.md` and `ROADMAP.md` as usual, then add a row to
   §1a **only if** it changes what a later phase has to build. That is the whole point of
   §1a: the lane is visible, but it does not fight the phase numbering.
1. **Starting a phase** — mark it `in progress` here, and move its headline item into
   **Next active track** in [ROADMAP.md](./ROADMAP.md).
2. **Shipping a phase** — mark `done` here, add a `CHANGELOG.md` entry, and record the
   release row in [ROADMAP.md](./ROADMAP.md) as normal. The two files stay in sync at
   release boundaries, not continuously.
3. **Dropping a phase** — `deferred` plus one line of reason. P7 starts there by default.
