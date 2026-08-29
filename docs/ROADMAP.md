# SINAMGPT — Product roadmap

Living plan for features that make SINAMGPT more valuable as a **local company GPT**.  
Pair with [CHANGELOG.md](../CHANGELOG.md) when shipping. Keep this file honest: status here should match the code.

For a **plain-language** picture of chat, knowledge, and safety (managers / everyday users), see [HOW-IT-WORKS.md](./HOW-IT-WORKS.md).

For the **multi-release expansion arc** — more runtimes than Ollama, image / speech / embedding models, internet search, and file understanding — see [PLATFORM-ROADMAP.md](./PLATFORM-ROADMAP.md). That track feeds this file: phases land here as releases when they ship.

**Status key:** `planned` · `in progress` · `done` · `deferred`

**Current release:** [v1.19.1](../CHANGELOG.md#1191--2026-08-30) (see [README](../README.md)).

---

## Product today

What operators and users can rely on in the current tree (**v1.19.1**):

| Area | Reality |
|------|---------|
| **Language** | English / Azərbaycan / Русский UI (flag toggle); knowledge + guardrails policy seeds in Azerbaijani; replies follow the user’s language (ASCII Azerbaijani counts; UI language is a hint on short prompts) |
| **Chat** | Streaming replies, model picker **in the chat box** (input badges + short hints), plus-menu tools (attach image, summarize, translate), rewrite, theme; **Models guide** at `/models` is public. The picker uses the last activated catalog if a provider is briefly down. Image attach/drop stays **off** until Admin → File upload / File import **and** a vision model. Voice is **microphone** (Admin → Microphone + an audio/STT model) as a voice-message bubble, and **Listen** on replies when the selected model has Audio or Speak (TTS). Slow models keep the stream alive until the first token. No Fast/Smart toggle — pick a model in the composer |
| **History** | Per-user conversations in SQLite (`data/owngpt.db`); image and voice files under `data/attachments/` |
| **Projects** | Up to **5 folders per user**; rename/delete; chats can sit in a project or **All chats**; project-tagged knowledge is boosted |
| **Share** | Read-only `/share/[token]` for **logged-in** colleagues (including images and voice clips); owner can revoke or rotate (“New link”) |
| **Knowledge** | Living Admin library. Still **keyword search** (not embeddings). Query-side EN / AZ / RU keyword gloss so a question in one language can hit notes in another; IDF + strong title/tag hits; skip generic About/Contact when a specific doc already matches; **no citations on general chat** (only when the question is about the company or a title/tag actually matches); pack seed add-missing / refresh / replace |
| **Guardrails** | Living policy with On/Off item switches (apply immediately); layered detectors; built-in harm phrases; blocked phrases can also match via the same query gloss; Admin Overview / Policy / Detectors |
| **Auth / guest** | Local accounts with **username or work email**; field-level validation on register; login/register rate limits; signed-in chat burst limits; guest daily cap (cookie + IP) + burst; guest vision up to 2 images when File upload / File import is on; admin middleware by session role |
| **LLM** | Provider registry for Ollama, vLLM, and OpenAI-compatible servers; Admin → Providers for kind, test, health, model sync, fallback, and concurrency. Hosted URLs need a remote-traffic acknowledgement. Models have task kinds, and only chat models enter chat routes. New pulls stay inactive until Admin → Models → Activate |
| **Quality check** | `npm run test:chat` CLI smoke suite; admin **Model lab** at `/lab` — Quick (18) / Assist (20) / Guardrails (17); Live chat, Results scores, Charts |
| **Admin usage** | Live usage auto-refresh for chat **and** developer API calls (API rows tagged **API**); **All / App / API** filter; click a row for the prompt and reply; **Clear logs** |
| **API gateway** | Off by default. Admin → Settings → Features On/Off turns on `/developer` keys. One key calls every activated model via OpenAI-compatible `/api/v1/chat/completions` and `/api/v1/models` (custom `/api/v1/generate` still works). Admin **Dev lab** at `/devlab` |

---

## Next active track

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| P3 | **Internet search** | `planned` | Re-ranked to first on 2026-08-28: cheapest remaining phase, and the only thing that proves the tool runtime — which is wired into the chat route but has never executed. See [PLATFORM-ROADMAP.md](./PLATFORM-ROADMAP.md) §4 |
| P2a | **Embeddings & reranking** | `planned` | Now second. Hybrid keyword + vector retrieval, plus reranking over both knowledge hits and P3’s web snippets |

### Candidates (suggested order)

| Priority | Idea | Why next |
|----------|------|----------|
| 1 | **File / PDF → knowledge** | Biggest adoption gap vs typing docs by hand |
| 2 | **Better RAG** (chunk + local embeddings) | Sharper hits than keyword scoring |
| 3 | **Share → continue as copy** | Colleagues can fork a shared thread into their own chat |
| 4 | **Ops: backup `owngpt.db`** | One-click safety for the company machine |

---

## Future backlog (not started)

Ideas kept for later — not a commitment.

| Idea | Why it matters |
|------|----------------|
| Chat modes (Ask SINAM / Work / Write) | Productized feel |
| Departments / knowledge visibility | Multi-team beyond personal projects |
| Export chat (Markdown / PDF) | Manager handoffs |
| ⌘K command palette | Power users |
| First-login onboarding | Reduce confusion |
| Project archive (soft-delete) | Schema has `is_archived`; UI today **hard-deletes** and untags knowledge |

---

## Shipped history

Closed tracks — keep for context; do not re-open unless regressing.

### v1.19.1 — Hardening (2026-08-30)

| Feature | Status | Notes |
|---------|--------|-------|
| Model picker from SQLite | `done` | Last activated catalog stays visible if a provider is briefly down |
| Proxy IP trust | `done` | Forwarded client IPs used only when `TRUST_PROXY=1` |
| Browser + provider hardening | `done` | CSP/COOP/CORP headers; metadata URL block; example `SESSION_SECRET` rejected in production |

### v1.19.0 — Any runtime (2026-08-28)

| Feature | Status | Notes |
|---------|--------|-------|
| OpenAI-compatible providers | `done` | vLLM, LM Studio, llama.cpp, TGI share one adapter |
| Admin provider ops | `done` | Kind, test, health, sync, fallback, max concurrent |
| LAN by default | `done` | Hosted URLs need a “traffic leaves the building” acknowledgement |
| Provider key secret | `done` | `PROVIDER_KEY_SECRET` preferred; `SESSION_SECRET` still works |

### v1.18.1 — Mobile chat & email login (2026-08-28)

| Feature | Status | Notes |
|---------|--------|-------|
| Username or email | `done` | Register and sign in with a short name or work email |
| Auth field errors | `done` | Invalid email, password length, taken name, and similar show under the field (EN / AZ / RU) |
| Mobile user surfaces | `done` | Login, register, chat, Models, Developer, and Lab fit small phones |

### v1.18.0 — Open the seams (2026-08-27)

| Feature | Status | Notes |
|---------|--------|-------|
| Provider registry and Admin management | `done` | Free-form provider ids, encrypted keys, protected defaults, and LAN-safe URL validation |
| Model task kinds | `done` | Chat/image/video/STT/TTS/embedding/rerank classification with chat-only routing |
| Persistent jobs | `done` | Single-process SQLite queue, owner APIs, cancellation, leases, recovery, and SSE progress; off by default |
| Chat decomposition | `done` | Focused components/hooks and tested pure helpers; one preserved client state root |
| Secure tool runtime | `done` | Strict validated/guarded loop and redacted traces; zero registered tools and off by default |

### v1.17.0 — OpenAI-compatible API & Live usage (2026-08-25)

| Feature | Status | Notes |
|---------|--------|-------|
| OpenAI-compatible `/api/v1/chat/completions` | `done` | One key, all activated models; OpenAI SDK `base_url` = `/api/v1` |
| `GET /api/v1/models` catalog | `done` | OpenAI `{ object, data }` plus capability flags; Developer Models tab + snippets |
| Admin Live usage includes API | `done` | Same list as chat; **All / App / API** filter; aborted rows have a reason |
| Clear usage logs | `done` | Admin → Live usage wipes chat + API request history |
| Voice notes + Listen | `done` | Mic clips look like voice messages; Listen on Audio/Speak models |
| Slow-model SSE keepalive | `done` | Stream opens immediately so Llama 4 Scout does not look dead while evaluating |

### v1.16.0 — Public models guide & fleet expansion (2026-08-18)

| Feature | Status | Notes |
|---------|--------|-------|
| Public Models guide | `done` | `/models` open without sign-in; home Models link; Fast / Balanced / Strong / Voice cards |
| Gemma 4 26B | `done` | Fleet tag `gemma4:26b`; Pull and Activate like the other Gemma 4 sizes |
| Llama 4 Scout | `done` | Fleet tag `llama4:scout` (alias `llama4:16x17b`); text + images; no microphone; lighter than Maverick |
| Llama 4 Maverick | `done` | Fleet tag `llama4:maverick` (alias `llama4:128x17b`); text + images; no microphone |
| Gemma 4 audio | `done` | Every Gemma 4 (E4B / 26B / 31B) is Text + Image + Audio; 31B is no longer “no microphone” |
| Models guide extras | `removed` | No download size, RTX 5090 note, limits paragraph, Functions lecture, or how-to-pick steps |

### v1.15.0 — Composer tools & fleet tags (2026-08-18)

| Feature | Status | Notes |
|---------|--------|-------|
| Composer **+** menu | `done` | Attach image, summarize, translate; grayed image upload when off; guest sign-in row |
| Model picker in chat box | `done` | Compact pill (name + hint); no longer in the header |
| Audio file import | `removed` | Voice is microphone only; file import is images only |
| Model lab suites | `done` | Quick 18 / Assist 20 / Guardrails 17; AZ/RU language scoring |
| RTX 5090 fleet tags | `done` | `gemma3:4b` / `12b`, `gemma4:e4b` / `31b`, `qwen3.5:9b`, `qwen3:32b` |
| Reply language pin | `done` | ASCII Azerbaijani stays AZ; UI language is a hint on short prompts |
| Knowledge citations | `done` | General chat no longer cites About/YURDUM/Farabi; inject only on company intent or a real title/tag hit |

### v1.14.1 — Hardening (2026-08-17)

| Feature | Status | Notes |
|---------|--------|-------|
| Shared attachments | `done` | Non-owners need the share token on `/api/attachments` |
| Admin seed | `done` | No default `AdminChangeMe123!` password |
| Chat / guest limits | `done` | Signed-in chat RPM; guest daily cap also by IP |
| Admin polling | `done` | Cached LLM ping; usage tab pauses when hidden |

### v1.14.0 — Russian UI, chat input flags & usage detail (2026-08-17)

| Feature | Status | Notes |
|---------|--------|-------|
| Russian UI | `done` | Flag toggle EN / AZ / RU; full product copy; `ru-RU` dates |
| Chat input feature flags | `done` | File upload, File import, Microphone start **off** in Admin → Settings → Features |
| Usage request detail | `done` | Click a live or past usage row for the exact prompt and reply |
| Microphone replies | `done` | Native `/api/chat` WAV path; player duration no longer 0:00 |

### v1.13.0 — Voice, mic picker & drag-and-drop (2026-08-17)

| Feature | Status | Notes |
|---------|--------|-------|
| Microphone audio | `done` | Audio models; 16 kHz mono WAV, 30s; playback in chat and shared links |
| Microphone picker | `done` | Hardware devices only; recording uses the selected mic |
| Drag and drop | `done` | Images on vision models; audio files on audio models; guest images too |
| Models guide cards | `done` | How-to-pick, use cases, pros/cons; Audio is sendable; card spec block removed |

### v1.12.0 — Models guide & clearer picker (2026-08-17)

| Feature | Status | Notes |
|---------|--------|-------|
| Models guide `/models` | `done` | Size, inputs, Default, when to use; header + sidebar |
| Capability badges | `done` | Text / Image you can send; Audio follows Ollama tags; Functions display-only |
| Cross-language keyword search | `done` | Query gloss EN / AZ / RU before RAG and hard-block match |
| Fast / Smart presets | `removed` | Header picker + admin default only |

### v1.11.0 — Admin control of models & surfaces (2026-08-17)

| Feature | Status | Notes |
|---------|--------|-------|
| Activate models | `done` | New Ollama pulls appear on Admin → Models inactive until Activate |
| Ollama-only runtime | `done` | vLLM adapter kept in repo, not selectable |
| Settings On/Off toggles | `done` | Features, guest, and other admin switches use On/Off buttons |

### v1.10.1 — Feature toggles (2026-08-17)

| Feature | Status | Notes |
|---------|--------|-------|
| Feature flags (Settings) | `done` | Developer API + Dev lab off until Admin → Settings → Features; chat inputs added in v1.14.0 |

### v1.10.0 — Vision chat & mobile polish (2026-08-14)

| Feature | Status | Notes |
|---------|--------|-------|
| Image chat on vision models | `done` | Attach/paste JPEG/PNG/WebP/GIF; Ollama `images` + vLLM `image_url` |
| Capability badges | `done` | Inputs + Functions on picker and Admin → Models; Functions is display-only |
| Attachment storage | `done` | `data/attachments/`; owner or shared-chat access via `/api/attachments` |
| API images | `done` | `/api/v1/models` `vision`/`tools`; `/api/v1/generate` optional `images` |
| Mobile / EN-AZ chrome | `done` | Overflow More menu, safe-area, 16px composer, attach-image copy |

### v1.9.0 — Corporate API gateway (2026-08-14)

| Feature | Status | Notes |
|---------|--------|-------|
| API keys `/developer` | `done` | Users create/revoke keys; secret shown once; hashed at rest |
| `GET /api/v1/models` + `POST /api/v1/generate` | `done` | Custom JSON/SSE; raw model proxy (no RAG, no guardrails) |
| OpenAI-compatible `/api/v1/chat/completions` | `done` | One key, all activated models; OpenAI SDK `base_url` |
| Dev lab `/devlab` | `done` | Admin keys, request log, RPM/CORS/gateway settings |

### v1.8.0 — Lab console (2026-08-13)

| Feature | Status | Notes |
|---------|--------|-------|
| Lab Live / Results / Charts | `done` | Streaming chat of the run; scored facts/language/speed; accuracy, tok/s, latency charts |
| Lab suites | `done` | Quick 40, Assist 42, Guardrails 31; Stress dropped |
| Keyword RAG | `done` | AZ inflections, product/year synonyms, specific-doc ranking |

### v1.1.0 — Company productivity (2026-08-09)

| Feature | Status | Notes |
|---------|--------|-------|
| Cited company answers | `done` | `From: …` sources; Admin → Knowledge → Citations |
| Projects / folders | `done` | Group chats; project-scoped knowledge boost |
| Shareable internal link | `done` | Logged-in, read-only `/share/[token]` |
| Fast vs Smart + per-chat model | `done` | Admin → Settings maps Fast/Smart models |
| Rewrite shortcuts | `done` | Shorter / More formal / Continue |
| Theme + multi-backend LLM | `done` | Light/dark/system; Ollama + vLLM |

### v1.2.0 — Hardening (2026-08-09)

| Feature | Status | Notes |
|---------|--------|-------|
| Language / knowledge fix | `done` | No RU drift on English greetings; company-intent gate for inject |
| Projects polish | `done` | Rename/delete; **5/user**; own folders only; project IDOR checks |
| Share / mobile UX | `done` | Portaled share menu; Fast/Smart row on small screens; rotate confirm |
| Auth & guest security | `done` | Rate limits; unified login errors; guest Zod/burst/refund; safe markdown links |

### v1.3.0 — Safety tooling (2026-08-09)

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-layer guardrails | `done` | Keywords, injection, secrets, PII (+ optional strict PII) |
| Live inspector + events | `done` | Admin sees what ran / matched / decision; `guardrail_events` |
| Deep chat test | `done` | `npm run test:chat` (+ `--quick`) |
| Synonym matching fix | `done` | Whole-token expansion (no `hell` inside `hello`) |

### v1.4.0 — Ops & admin UX (2026-08-09)

| Feature | Status | Notes |
|---------|--------|-------|
| Wider audit trail | `done` | `audit_events` + Admin → Audit (merges guardrail hits) |
| Admin chrome / subtabs | `done` | Cleaner nav; shared headers, stats, subtabs |
| Richer Knowledge admin | `done` | Overview stats, Library, Settings |
| Richer Guardrails admin | `done` | Overview, Policy, Detectors, Inspector |

### v1.4.1 — Living Admin config (2026-08-09)

| Feature | Status | Notes |
|---------|--------|-------|
| Safe knowledge seed | `done` | Add-missing by default; optional refresh/replace |
| Editable policy chips | `done` | Quick-add suggestions stored in DB + Admin editor |
| Editable vs built-in clarity | `done` | Company content stays Admin-owned; built-in harm phrases stay in code |

### v1.7.0 — Model lab (2026-08-13)

| Feature | Status | Notes |
|---------|--------|-------|
| Model lab `/lab` | `done` | Admin-only; real `/api/chat` suites (Quick, Assist, Guardrails) |
| UI folder split | `done` | Admin, lab, chat, auth, share components separated |

### v1.6.0 — Policy switches & slimmer Admin (2026-08-13)

| Feature | Status | Notes |
|---------|--------|-------|
| Policy On/Off switches | `done` | Topics, keywords, snippets apply to new chats on click |
| Inspector removed | `done` | Dry-run tab and inspect API gone; chat blocking unchanged |
| Audit removed | `done` | Admin tab, API, and event logging gone |
| Stale cookie page 500 | `done` | Pages bounce through logout instead of deleting cookies while rendering |

### v1.5.0 — EN / AZ product language (2026-08-13)

| Feature | Status | Notes |
|---------|--------|-------|
| EN / AZ UI | `done` | Flag toggle; chat, auth, share, Admin |
| AZ knowledge seed | `done` | SINAM pack in `src/lib/seeds/knowledge.ts` |
| AZ guardrails policy seed | `done` | Persona/topics/chips in `src/lib/seeds/guardrails.ts`; unmodified EN DB rows migrate |
| Guardrails auto-seed | `done` | Policy JSON written to `app_settings` on first init |
| Stale session after DB wipe | `done` | Cookie cleared so `/chat` no longer 307-loops |

### v1.4.2 — Release pipeline repair (2026-08-12)

| Feature | Status | Notes |
|---------|--------|-------|
| Green production build | `done` | Register page prerender fixed; `npm run build` succeeds |
| Green lint gate | `done` | React 19 hook violations cleared; `npm run lint` passes |
| Complete release tags | `done` | `v1.1.0`–`v1.4.1` backfilled; changelog compare links resolve |

Details and compare links: [CHANGELOG.md](../CHANGELOG.md).

---

## How to update this doc

1. **Starting work** — move a candidate into **Next active track**, status `in progress`.
2. **Shipped** — status `done`; add a line under CHANGELOG **Unreleased**; on release, add a row under **Shipped history** and refresh **Product today**.
3. **Parking** — `deferred` + one-line reason.
4. **New ideas** — **Future backlog** first; promote to **Candidates** or **Next active track** only when chosen.
5. Do not describe archive, embeddings, PDF upload, or public share as done unless the code ships them.
