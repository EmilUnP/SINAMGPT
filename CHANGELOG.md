# Changelog

All notable changes to **SINAMGPT** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- See [docs/ROADMAP.md](./docs/ROADMAP.md) — **Next active track** / candidates / backlog.

## [1.16.0] — 2026-08-18

Public models catalog plus Gemma 4 26B and Llama 4 Scout / Maverick on the company box.

### Added
- **Public models guide** — `/models` is open without signing in (https://ai.sinam.az/models). Home has a Models link. Cards show Fast / Balanced / Strong / Voice, what you can send, when to use it, and one caveat.
- **Gemma 4 26B** — fleet tag `gemma4:26b` (display name, picker hint, Models card). Pull and Activate on the company box like the other Gemma 4 sizes.
- **Llama 4 Scout** — fleet tag `llama4:scout` (alias `llama4:16x17b`). Same Llama 4 vision family as Maverick, fewer parameters (109B MoE / 17B active vs 400B). No microphone.
- **Llama 4 Maverick** — fleet tag `llama4:maverick` (alias `llama4:128x17b`). Native text + image from the Ollama card (vision + tools). No microphone. Pull and Activate like the other fleet models.

### Changed
- **Gemma 4 inputs** — every Gemma 4 (E4B, 26B, 31B, and other Ollama Gemma 4 tags) is treated as Text + Image + Audio, matching the Ollama card (vision, tools, thinking, audio). 31B is no longer marked “no microphone”.

### Removed
- **Models guide extras** — `/models` no longer shows download size, the RTX 5090 fleet note, the text/image/mic limits paragraph, “Ollama also lists Functions”, or the how-to-pick lecture.

## [1.15.0] — 2026-08-18

Composer tools in the chat box, model picker next to the prompt, microphone-only voice, and company RTX 5090 tags.

### Added
- **Composer tools** — a **+** menu in the chat box (signed-in and guest): attach image, summarize, and translate. Unavailable image upload stays visible but grayed, with the reason. Guest menu includes a sign-in row. Voice is microphone-only.

### Changed
- **Model picker** — lives in the chat box as a compact pill (name + short hint in the menu), not in the header. Microphone stays on the right of the box when enabled.
- **Model lab** — suites match the current product: Russian cases, cross-language company knowledge, fewer duplicate EN/AZ twins. Quick 18 / Assist 20 / Guardrails 17. AZ/RU replies are scored on the expected language.
- **RTX 5090 fleet** — docs, setup, Models guide, and display names match the company Ollama tags: `gemma3:4b`, `gemma3:12b`, `gemma4:e4b`, `gemma4:31b`, `qwen3.5:9b`, `qwen3:32b`. Qwen 3.5 is treated as vision (not microphone). Qwen 3 32B stays text-only.
- **Reply language** — Azerbaijani prompts (including ASCII without ə) pin the model to AZ so small local models do not switch to English to “clarify”. The UI language is a hint when the prompt is short. Rewrite stays in the same language.

### Fixed
- **Knowledge citations** — a general question (for example “explain what AI is”) no longer injects About SINAM / YURDUM / Farabi and then shows them as “From: …”. Company notes attach only when the user’s words are about the company, or a document title/tag actually matches those words. Search-keyword expansion cannot invent product names the user did not mention.

### Removed
- **Audio file import** — dropped, pasted, or plus-menu audio files are gone. Voice is only the microphone (Admin → Microphone + an audio model). File import is images only.

## [1.14.1] — 2026-08-17

Security and performance hardening so the app stays snappy on a company PC.

### Security
- **Shared files** — a share link is required to open someone else’s images or voice clips. Having any share token on the chat is no longer enough.
- **Admin seed** — the first admin is created only when `ADMIN_PASSWORD` is set (min 10 characters, not the old example value).
- **Chat rate limit** — signed-in `/api/chat` is capped per user and IP (same idea as guest and the developer API).
- **Guest daily cap** — clearing cookies no longer resets the guest quota; the limit is also counted by IP for the UTC day.
- **Logout** — GET `/api/auth/logout` only clears a leftover/stale cookie. A valid session logs out via POST.
- **Headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` on every response. Markdown no longer loads remote images from model replies.

### Changed
- **Long chats** — the model and the UI load a recent window (history setting, hard cap 500) instead of every old message and image.
- **Sidebar** — conversation list and search return at most 100 chats.
- **Admin Overview / Live usage** — Overview skips the heavy usage table; LLM health is cached ~20s; Live usage pauses polling when the tab is hidden.

## [1.14.0] — 2026-08-17

Russian UI, admin gates for chat files/mic, and live usage that shows the exact prompt.

### Added
- **Russian UI** — the language picker is English / Azərbaycan / Русский. Chat, guest, auth, Admin, Models, Developer, and Dev lab have Russian copy. Dates follow `ru-RU`.
- **Chat input feature flags** — Admin → Settings → Features now also controls **File upload** (paperclip), **File import** (drag/drop and paste), and **Microphone**. All three start **off**. The composer hides those controls and the APIs reject the payloads until an admin turns them on. The model still has to support vision or audio.
- **Usage request detail** — Admin → Live usage: click a live or past row to see the exact payload sent to the model and the reply so far (attachments noted, not stored as raw bytes). Copy either pane. Live rows keep refreshing.

### Fixed
- **Microphone replies** — the clip was reaching Gemma 4, but the default “listen to this recording” prompt made E2B claim nothing was attached. Audio stays on native `/api/chat` (`images` + WAV, thinking off, `num_ctx` 8192) with an explicit “you can hear this” system line. The in-chat player no longer clips to 0:00.

## [1.13.0] — 2026-08-17

Voice and files in the composer: microphone (with a real device picker) and drag-and-drop.

### Added
- **Microphone audio** — on audio-capable models (Gemma 4 E2B/E4B and others Ollama flags), signed-in chat can record up to 30 seconds and send it as 16 kHz mono WAV. Playback stays on the message; shared chats can play it too.
- **Microphone picker** — the arrow next to the mic lists real hardware inputs (not Windows Default / Communications). Recording uses the mic you pick; a live level bar shows whether it is hearing you.
- **Drag and drop** — drop images (and audio files on audio models) onto the chat composer. Guest try-chat accepts dropped images the same way.

### Changed
- **Models guide** — each card has how-to-pick steps, use cases, and short pros / cons. Audio is something you can send when the model supports it; Video still is not.
- **Capability badges** — Text, Image, and Audio (microphone) are what you can send. Hover on Audio explains the 30-second mic limit.

### Removed
- **Model card specs** — `/models` no longer lists parameters, context, layers, sliding window, vocabulary, or encoder sizes.

## [1.12.0] — 2026-08-17

Clearer model picking: a Models guide, readable input badges, and no Fast / Smart toggle.

### Added
- **Models guide** — signed-in users can open `/models` for a short card per activated model (size, inputs, Default, when to use it). Open it from the chat header or sidebar.
- **How it works** — [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md): plain-language flow for managers and everyday users (chat path, knowledge, guardrails, data).

### Changed
- **Capability badges** — hover for a short explanation. Models show **inputs** (Text, Image, Audio, Video) plus **Functions** (can call extra functions; not used in chat yet). Light mode uses solid chips with a border so labels stay readable.
- **Cross-language search** — before knowledge lookup (and hard-block matching), a short local-model pass adds EN / AZ / RU keywords. A Russian question can still find an English or Azerbaijani note; greetings skip this step.
- **Smarter keyword RAG** — still no embeddings. Rare tokens (e.g. SESDA) rank above generic ones (SINAM); strong title/tag hits; phrase match in the body; skip always-include About/Contact when a specific doc already matches.

### Removed
- **Fast / Smart presets** — gone from chat, Admin settings, and the Models guide. Pick a model from the header picker; new chats use the admin default (or the last model you chose).

## [1.11.0] — 2026-08-17

Admin controls which product surfaces and which Ollama models employees can use. Runtime is Ollama-only for now.

### Added
- **Activate models** — a newly pulled Ollama model shows on Admin → Models as inactive. Users only see it after an admin clicks Activate.
- **On / Off toggles** — Admin settings switches use On/Off buttons instead of checkboxes (Features, guest chat, and the same control elsewhere).

### Changed
- **Ollama only** — chat, model sync, and health checks use Ollama. vLLM stays in the codebase but is not selectable until we turn it back on.

## [1.10.1] — 2026-08-17

Admin can turn product surfaces on or off from Settings. Developer API and Dev lab stay hidden until enabled.

### Added
- **Feature toggles** — Admin → Settings → Features. Developer API (`/developer`, `/api/v1`) and Dev lab (`/devlab`) start **off**: hidden in nav and blocked until an admin enables them. Same pattern can cover later surfaces.

## [1.10.0] — 2026-08-14

Vision models can take images, not only text. Mobile chrome and EN/AZ copy cover every page.

### Added
- **Vision / image chat** — multimodal models (Gemma 4, Gemma 3 4B+, LLaVA, Qwen-VL, and others flagged by Ollama `capabilities`) accept attached or pasted images in signed-in chat and guest try-chat. Caption is optional.
- **Capability badges** — model picker and Admin → Models show **Vision** and **Tools** (tools is display-only; no function-calling runtime yet)
- **Image attachments** — JPEG/PNG/WebP/GIF, up to 4 per signed-in message (2 for guests), 8 MB each; files live under `data/attachments/` and are served at `GET /api/attachments/[messageId]/[index]` (owner, or any logged-in user if the chat is shared)
- **API images** — `GET /api/v1/models` returns `vision` / `tools`; `POST /api/v1/generate` accepts optional `images` on messages (rejected on text-only models)

### Changed
- **Mobile / responsive UI** — wrapping headers, overflow More menu on small screens, safe-area insets, 16px composer (no iOS zoom), touch-visible pin/delete/rename
- **EN / AZ copy** — attach-image strings, auth error mapping, locale-aware dates and API status labels; leftover “Developer” in AZ is “Tərtibatçı”
- **Shared page chrome** — Admin, Model lab, Dev lab, and Developer use the same header; chat extra links collapse into More below `lg`

## [1.9.0] — 2026-08-14

Corporate API keys so other SINAM apps can call local models through SINAMGPT.

### Added
- **Corporate API keys** — signed-in users generate keys on `/developer`; other company apps call `GET /api/v1/models` and `POST /api/v1/generate` (custom JSON/SSE, Bearer `sinam_…`). Raw model proxy only (no knowledge, no guardrails). Secret shown once; hashed at rest.
- **Dev lab (`/devlab`)** — admin-only page for all keys, API request history, live streams, and gateway settings (enable, max keys, RPM, max chars, CORS origins)

## [1.8.0] — 2026-08-13

Model lab is a real test console: live chat of the run, scored results, and charts. Suites and RAG matching are sharper against the SINAM pack.

### Added
- **Lab Live tab** — prompts and replies stream in like chat while a suite runs
- **Lab Results tab** — pass rate, facts, citations, language/tone, latency min/median/max, fail reasons, cite/answer/refuse scores
- **Lab Charts tab** — accuracy, token (or char) speed, first-token vs total latency, and cumulative pass rate, filling in as cases finish

### Changed
- **Lab suites** — Quick (40), Assist (42), Guardrails (31). Workplace/Stress dropped; cases cover EN/AZ knowledge, writing tasks, and more refuse vectors
- **Lab scoring** — each case scores expected facts (hit/miss), accuracy %, language/tone, first-token time, and chars or tokens per second
- **`test:chat`** — hits the SINAM knowledge pack (about, contact, SESDA, Farabi, products) and guardrail refusals (salary, AZ passwords, jailbreak, secrets)
- **Keyword RAG** — AZ inflections (əməkdaşı↔əməkdaş), year/employee/product synonyms, specific docs ranked above always-include About/Contact, stronger “use these facts” inject (no URL-only answers)

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

[Unreleased]: https://github.com/EmilUnP/SINAMGPT/compare/v1.16.0...HEAD
[1.16.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.14.1...v1.15.0
[1.14.1]: https://github.com/EmilUnP/SINAMGPT/compare/v1.14.0...v1.14.1
[1.14.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.10.1...v1.11.0
[1.10.1]: https://github.com/EmilUnP/SINAMGPT/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/EmilUnP/SINAMGPT/compare/v1.7.0...v1.8.0
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
