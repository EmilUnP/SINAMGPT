# Changelog

All notable changes to **SINAMGPT** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- See [docs/ROADMAP.md](./docs/ROADMAP.md) — **Next active track** / candidates / backlog.

## [1.7.0] — 2026-08-13

Admin Model lab plus a cleaner split of the app UI.

### Added
- **Model lab (`/lab`)** — admin-only test page (not an Admin tab) that runs real `/api/chat` suites: Quick, Workplace, and Stress (latency + refuse checks)

### Changed
- **App UI layout** — Admin, Model lab, chat, auth, and share screens live in their own component folders (same idea as the existing `/api/admin` split)

## [1.6.0] — 2026-08-13

Admin policy UX: Guardrails items are explicit On/Off switches, and unused Admin surfaces are gone.

### Added
- **Policy item switches** — allowed topics, refuse topics, keywords, and persona/extra snippets show **On / Off**. Clicking saves immediately and applies to new chats. Save changes is only for the text boxes (persona, refusal, extra rules)

### Fixed
- **Stale session on Admin/chat pages** — a leftover cookie after a DB wipe no longer 500s the page (`Cookies can only be modified in a Server Action or Route Handler`); the page now clears it via logout and sends you to login

### Removed
- **Guardrails Inspector** — the dry-run test tab and its admin inspect API (live chat blocking is unchanged)
- **Admin Audit** — the Audit tab, `/api/admin/audit`, and audit event logging

## [1.5.0] — 2026-08-13

Language release: the product UI is English / Azərbaycan, and company seeds (knowledge + guardrails policy) ship in Azerbaijani.

### Added
- **EN / AZ interface** — language toggle with flag icons on chat, auth, share, and Admin; remembered in the browser (`owngpt-locale`)
- **Full Admin i18n** — Overview, Usage, Users, Models, Knowledge, Guardrails (including Policy / Detectors / Inspector), Audit, and Settings
- **Azerbaijani knowledge seed pack** — SINAM starter docs live in `src/lib/seeds/knowledge.ts`
- **Azerbaijani guardrails policy seed** — persona, topics, extra rules, and quick-add chips in `src/lib/seeds/guardrails.ts`

### Changed
- **Seeds live in their own files** — knowledge and guardrails defaults are no longer hardcoded inside the library modules
- **Guardrails persist on first init** — policy JSON and quick-add chips are written to `app_settings` like other settings (no empty Admin until you click Save)

### Fixed
- **DB wipe login loop** — a leftover session cookie after deleting `data/` no longer 307-loops `/chat`
- **Unmodified English policy** — existing DBs still on the old English persona/topics/chips are migrated to the Azerbaijani defaults (custom edits are left as-is)

## [1.4.2] — 2026-08-12

Patch: repair the release pipeline. The production build was failing and the lint gate was red, so neither could vouch for a release.

### Fixed
- **Production build** — the register page failed to prerender and aborted `npm run build`; a deploy could not be produced from `main`
- **Lint gate** — cleared 15 React 19 hook errors and 3 warnings so `npm run lint` passes and can gate a release again
- **Release tags** — `v1.1.0` through `v1.4.1` were released but never tagged, leaving every changelog compare link below pointing at a tag that did not exist; the tags now match the commits that shipped them

### Changed
- **Default port is now 3055** (was 3000) — `start.bat`, the setup script and the smoke test all follow; open <http://localhost:3055> after starting
- **Theme** — light/dark/system now reads the OS setting and the saved choice directly rather than copying them into component state after load, removing an extra render on every page open; the pre-load theme flash guard is unchanged
- **Admin → Users / Knowledge** — changing a search or filter resets to page 1 in the same update as the filter itself, instead of one render later

## [1.4.1] — 2026-08-09

Patch: treat Knowledge and Guardrails as living Admin config so company content can change without a code deploy.

### Changed
- **Living Admin config** — Knowledge pack seed defaults to add-missing only (optional refresh/replace); Guardrails Policy quick-add chips persist in DB and are editable from Admin; clearer editable-vs-built-in labels so company content does not require a code deploy

## [1.4.0] — 2026-08-09

Ops & admin UX release: wider audit trail plus a cleaner, more informative Admin panel (especially Knowledge and Guardrails).

### Added
- **Wider audit trail** — `audit_events` for admin mutations, auth outcomes, share/project ops; Admin → **Audit** tab merges recent guardrail hits (not every chat message)

### Changed
- **Admin UI** — quieter top nav; shared page chrome (headers, subtabs, stat cards); clearer light-mode contrast
- **Knowledge admin** — Overview / Library / Settings subtabs with corpus stats, category coverage, and clearer retrieval settings
- **Guardrails admin** — Overview / Policy / Detectors / Inspector subtabs with coverage stats, top matched rules, and side-by-side inspector + events
- **Richer Policy editor** — topic/keyword chips, company-relevant suggestions, soft-vs-hard guidance, live “what the model sees” prompt preview
- **Richer SINAM knowledge pack** — Farabi (SGRP), Biletim.az, GoMap/GoNav, SESDA, Yurdum, solutions catalog (seed template; Admin owns day-to-day edits)
- **Settings admin** — Access / Chat & models / Generation subtabs with grouped section cards (replaces the long flat form)

## [1.3.0] — 2026-08-09

Safety & quality tooling release: multi-layer guardrails with a live inspection report, plus a runnable deep chat smoke suite.

### Added
- **Deep chat test** — `npm run test:chat` smoke suite against a running server (stream, language, projects, share, rewrite)
- **Powerful guardrails engine** — layered detectors (keywords + de-obfuscation, prompt-injection/jailbreak, secrets, PII patterns) with Admin **Live inspector** (what ran / what matched / decision) and **event history**

### Fixed
- **Knowledge synonym false positives** — whole-token synonym expansion (e.g. `hell` no longer matches inside `hello`)

## [1.2.0] — 2026-08-09

Hardening and polish release: language/knowledge fixes, project management, share UI stacking, auth/guest security, and mobile chat header UX.

### Fixed
- **English chats answering in Russian** — knowledge no longer injects on every greeting (priority alone no longer matches); reply language is pinned from the latest user message
- **Share menu under chat bubbles** — share dialog is portaled above the message stack
- **Rewrite/regenerate error recovery** — failed rewrite reloads the conversation so the previous answer is not lost in the UI
- **DB schema migration** — older SQLite DBs pick up `project_id` / `share_token` / related columns reliably (including after HMR)

### Security
- **Project IDOR** — chats can only be assigned to projects the user owns (or admin)
- **Auth throttling** — login/register rate limits; disabled accounts no longer distinguishable from bad passwords
- **Guest hardening** — Zod max on message size, per-IP burst limit, refund quota when the LLM fails to start
- **Markdown links** — only `http(s)` / `mailto` / relative URLs; external links open safely
- **Admin middleware** — non-admin sessions with a role claim are redirected away from `/admin`

### Changed
- **Projects** — rename + delete in the sidebar; max **5 projects per user**; each user only sees their own folders
- **Chat header** — Fast/Smart + model on a second row for mobile; share “New link” asks before rotating

## [1.1.0] — 2026-08-09

Company-GPT productivity release: citations, projects, internal share links, Fast/Smart presets, and rewrite shortcuts — plus theme and multi-backend LLM work.

### Added
- **Cited company answers** — assistant replies can show `From: …` knowledge sources; toggle in Admin → Knowledge → Citations (see [docs/ROADMAP.md](./docs/ROADMAP.md))
- **Projects / folders** — group chats by project; project-scoped knowledge boost; Admin can tag knowledge docs to a project
- **Shareable internal link** — owner can share a chat; colleagues must be logged in; read-only `/share/[token]`; revoke anytime
- **Fast / Smart model presets** — chat toggle + Admin → Settings model mapping; last choice remembered in localStorage and per conversation
- **Rewrite shortcuts** — Shorter / More formal / Continue on the last assistant reply
- **Theme** — light / dark / system preference with a clean header toggle; remembered in the browser, no flash on load. Chat sidebar, home, auth, and admin all follow the same mode (no mixed light chat + dark sidebar).
- **Multi-backend LLM** — Ollama and vLLM can run in parallel (`LLM_BACKENDS=ollama,vllm`); models sync from both, chat routes by backend, admin health shows each server
- **Generation controls** — temperature, max tokens, and top-p apply to both backends (Admin → Settings)
- **Ollama keep-alive** — `OLLAMA_KEEP_ALIVE` keeps weights warm for faster follow-up turns

### Fixed
- **Single-language replies** — system prompt no longer nudges the model into ugly dual-language answers with English in parentheses; ambiguous short greetings default to English

## [1.0.0] — 2026-08-08

First public release of SINAMGPT: a local company GPT for SINAM, powered by Ollama and SQLite.

### Added
- **Auth** — register, login, logout, and signed session cookies
- **Chat** — ChatGPT-style UI, streaming replies, model picker, new/delete conversations
- **History** — per-user conversations and messages stored in local SQLite (`data/owngpt.db`)
- **Guest mode** — try the model from the home page without an account (daily limit)
- **Admin panel** (`/admin`)
  - User management (enable/disable, activity)
  - Model enable/disable for Ollama installs
  - Guest limit and related settings
  - **Live usage** — active generations, tokens/sec, TTFT, history
  - **Knowledge** — company/project docs injected as lightweight RAG (EN / AZ / RU / TR aware)
  - **Guardrails** — persona, allowed/blocked topics, keywords, refusal text
- **Multi-language helpers** for knowledge matching and safety rules (EN / AZ / RU / TR)
- **Setup script** (`npm run setup`) and Windows helper (`start.bat`)
- **Docs** — README, this changelog, and versioning guide

### Security
- Passwords hashed with bcrypt
- Local-only AI via Ollama (no third-party cloud LLM APIs)
- Secrets and SQLite data stay out of git (`.env*`, `/data`)

[Unreleased]: https://github.com/EmilUnP/SINAMGPT/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.4.2...v1.5.0
[1.4.2]: https://github.com/EmilUnP/SINAMGPT/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/EmilUnP/SINAMGPT/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/EmilUnP/SINAMGPT/releases/tag/v1.0.0
