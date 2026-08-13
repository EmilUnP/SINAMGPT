# SINAMGPT — Product roadmap

Living plan for features that make SINAMGPT more valuable as a **local company GPT**.  
Pair with [CHANGELOG.md](../CHANGELOG.md) when shipping. Keep this file honest: status here should match the code.

**Status key:** `planned` · `in progress` · `done` · `deferred`

**Current release:** [v1.5.0](../CHANGELOG.md#150--2026-08-13) (see [README](../README.md)).

---

## Product today (v1.5.0)

What operators and users can rely on right now:

| Area | Reality |
|------|---------|
| **Language** | English / Azərbaycan UI (flag toggle); knowledge + guardrails policy seeds in Azerbaijani |
| **Chat** | Streaming replies, model picker, Fast/Smart presets, rewrite (shorter / more formal / continue), theme (light/dark/system) |
| **History** | Per-user conversations in SQLite (`data/owngpt.db`) |
| **Projects** | Up to **5 folders per user**; rename/delete; chats can sit in a project or **All chats**; project-tagged knowledge is boosted |
| **Share** | Read-only `/share/[token]` for **logged-in** colleagues; owner can revoke or rotate (“New link”) |
| **Knowledge** | Living Admin library (keyword RAG, EN / AZ / RU / TR); pack seed add-missing / refresh / replace; citations; corpus stats |
| **Guardrails** | Living policy + layered detectors; DB-backed quick-add chips; built-in harm phrases stay in code; Admin Overview / Policy / Detectors / Inspector |
| **Audit** | Admin → **Audit** trail for admin mutations, auth outcomes, share/project ops; merges recent guardrail hits |
| **Auth / guest** | Local accounts; login/register rate limits; guest daily + burst limits; admin middleware by session role |
| **LLM** | Ollama and optional vLLM in parallel (`LLM_BACKENDS`) |
| **Quality check** | `npm run test:chat` smoke suite against a running server |

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
| Voice input | Quick questions |
| ⌘K command palette | Power users |
| First-login onboarding | Reduce confusion |
| Project archive (soft-delete) | Schema has `is_archived`; UI today **hard-deletes** and untags knowledge |

---

## Shipped history

Closed tracks — keep for context; do not re-open unless regressing.

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
