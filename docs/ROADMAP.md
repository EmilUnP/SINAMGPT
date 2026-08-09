# SINAMGPT — Product roadmap

Living plan for features that make SINAMGPT more valuable as a **local company GPT**.  
Pair with [CHANGELOG.md](../CHANGELOG.md) when shipping. Keep this file honest: status here should match the code.

**Status key:** `planned` · `in progress` · `done` · `deferred`

**Current release:** [v1.3.0](../CHANGELOG.md#130--2026-08-09) (see [README](../README.md)).

---

## Product today (v1.3.0)

What operators and users can rely on right now:

| Area | Reality |
|------|---------|
| **Chat** | Streaming replies, model picker, Fast/Smart presets, rewrite (shorter / more formal / continue), theme (light/dark/system) |
| **History** | Per-user conversations in SQLite (`data/owngpt.db`) |
| **Projects** | Up to **5 folders per user**; rename/delete; chats can sit in a project or **All chats**; project-tagged knowledge is boosted |
| **Share** | Read-only `/share/[token]` for **logged-in** colleagues; owner can revoke or rotate (“New link”) |
| **Knowledge** | Lightweight keyword RAG (EN / AZ / RU / TR); citations under answers when Admin → Knowledge → Citations is on (incl. guests when knowledge applies) |
| **Guardrails** | Layered hard checks (keywords + de-obfuscation, prompt-injection, secrets, PII) + soft persona/topics; Admin **Live inspector** + **event history** |
| **Auth / guest** | Local accounts; login/register rate limits; guest daily + burst limits; admin middleware by session role |
| **LLM** | Ollama and optional vLLM in parallel (`LLM_BACKENDS`) |
| **Quality check** | `npm run test:chat` smoke suite against a running server |

---

## Next active track

No sprint is committed yet. Pick items from **Candidates** below, move them into this table, and set status to `in progress`.

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
| 5 | **Wider audit trail** | Extend beyond `guardrail_events` to admin/chat actions |

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

Details and compare links: [CHANGELOG.md](../CHANGELOG.md).

---

## How to update this doc

1. **Starting work** — move a candidate into **Next active track**, status `in progress`.
2. **Shipped** — status `done`; add a line under CHANGELOG **Unreleased**; on release, add a row under **Shipped history** and refresh **Product today**.
3. **Parking** — `deferred` + one-line reason.
4. **New ideas** — **Future backlog** first; promote to **Candidates** or **Next active track** only when chosen.
5. Do not describe archive, embeddings, PDF upload, or public share as done unless the code ships them.
