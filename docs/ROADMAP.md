# SINAMGPT — Product roadmap

Living plan for features that make SINAMGPT more valuable as a **local company GPT**.  
Pair with [CHANGELOG.md](../CHANGELOG.md) when shipping. Keep this file honest: status here should match the code.

For a **plain-language** picture of chat, knowledge, and safety (managers / everyday users), see [HOW-IT-WORKS.md](./HOW-IT-WORKS.md).

**Status key:** `planned` · `in progress` · `done` · `deferred`

**Current release:** [v1.14.1](../CHANGELOG.md#1141--2026-08-17) (see [README](../README.md)).

---

## Product today

What operators and users can rely on in the current tree (**v1.14.1**):

| Area | Reality |
|------|---------|
| **Language** | English / Azərbaycan / Русский UI (flag toggle); knowledge + guardrails policy seeds in Azerbaijani; replies follow the user’s language |
| **Chat** | Streaming replies, model picker (input badges), rewrite, theme; **Models guide** at `/models`. Image attach/drop and microphone exist but stay **off** until Admin → Settings → Features (File upload, File import, Microphone) **and** the model supports vision/audio. No Fast/Smart toggle — pick a model in the header |
| **History** | Per-user conversations in SQLite (`data/owngpt.db`); image and voice files under `data/attachments/` |
| **Projects** | Up to **5 folders per user**; rename/delete; chats can sit in a project or **All chats**; project-tagged knowledge is boosted |
| **Share** | Read-only `/share/[token]` for **logged-in** colleagues (including images and voice clips); owner can revoke or rotate (“New link”) |
| **Knowledge** | Living Admin library. Still **keyword search** (not embeddings). Query-side EN / AZ / RU keyword gloss so a question in one language can hit notes in another; IDF + strong title/tag hits; skip generic About/Contact when a specific doc already matches; citations; pack seed add-missing / refresh / replace |
| **Guardrails** | Living policy with On/Off item switches (apply immediately); layered detectors; built-in harm phrases; blocked phrases can also match via the same query gloss; Admin Overview / Policy / Detectors |
| **Auth / guest** | Local accounts; login/register rate limits; signed-in chat burst limits; guest daily cap (cookie + IP) + burst; guest vision up to 2 images when File upload / File import is on; admin middleware by session role |
| **LLM** | Ollama only (`OLLAMA_BASE_URL`). Company RTX 5090 fleet: `gemma3:4b` / `12b`, `gemma4:e4b` / `31b`, `qwen3.5:9b`, `qwen3:32b`. New pulls stay inactive until Admin → Models → Activate |
| **Quality check** | `npm run test:chat` CLI smoke suite; admin **Model lab** at `/lab` — Quick (18) / Assist (20) / Guardrails (17); Live chat, Results scores, Charts |
| **Admin usage** | Live usage auto-refresh; click a live or past row for the exact prompt sent to the model and the reply (attachments noted, not stored as raw bytes) |
| **API gateway** | Off by default. Admin → Settings → Features On/Off turns on `/developer` keys, `/api/v1/generate`, and admin **Dev lab** at `/devlab` |

---

## Next active track

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| — | *(none chosen)* | — | Promote from candidates when you start work |

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
