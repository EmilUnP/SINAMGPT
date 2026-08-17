# SINAMGPT

Local company GPT for [SINAM](https://sinam.net): login, ChatGPT-style chat, knowledge & guardrails, and saved history — all on your PC.

**Current version:** [1.10.0](./CHANGELOG.md#1100--2026-08-14) · [Versioning guide](./docs/VERSIONING.md) · [Roadmap](./docs/ROADMAP.md)

- **Local models** via [Ollama](https://ollama.com) and optional [vLLM](https://docs.vllm.ai/) (OpenAI-compatible) — can run in parallel
- **Vision models** — attach or paste images when the selected model is multimodal (Gemma 4, Gemma 3 4B+, LLaVA, Qwen-VL, …)
- **Login / register** (accounts stored locally)
- **Chat history** per user (SQLite in `data/owngpt.db`)
- **Streaming replies**, Fast/Smart presets, model picker (Vision / Tools badges), rewrite shortcuts
- **Projects** — up to 5 folders per user; project-scoped knowledge boost
- **Share chats** internally (logged-in colleagues, read-only `/share/…` links; shared images stay visible)
- **Cited answers** from the company knowledge base (admin on/off; guests too when knowledge applies)
- **English / Azərbaycan UI** — flag toggle on chat, auth, share, and Admin; choice remembered in the browser
- **Admin** — users, models (capability chips), live usage, knowledge, multi-layer guardrails (event log), theme-aware UI
- **Model lab** (`/lab`) — admin-only live `/api/chat` suites (Quick, Assist, Guardrails) with Live chat, Results, and Charts
- **Developer API** (`/developer`) — generate API keys; call local models from other company apps via `/api/v1/generate` (text and images)
- **Dev lab** (`/devlab`) — admin view of all keys, API usage, and gateway limits
- **Guest try-chat** on the home page (daily + burst limits; signed-in users unlimited; up to 2 images on vision models)

No third-party cloud LLM APIs. Traffic stays on your machine / LAN backends.

## Requirements

- Node.js 20+
- [Ollama](https://ollama.com/download) installed and running
- At least one pulled model (`ollama list`)

## Quick start

```bash
npm install
npm run setup
npm run dev
```

On Windows you can also double-click `start.bat` (restarts the app on port 3055).

Open [http://localhost:3055](http://localhost:3055)

1. **Home** (`/`) — try the model immediately (guest, limited, no saved history)
2. **Sign in / Register** — full chat with saved history
3. Admin account can open `/admin`, **Model lab** at `/lab`, and **Dev lab** at `/devlab`
4. Any signed-in user can open **Developer** at `/developer` for API keys

For production on the company machine:

```bash
npm run build
npm run start
```

## Ollama models (suggestions)

| Machine | Suggested models |
|--------|-------------------|
| Strong GPU (24GB+ VRAM) | `llama3.1:70b`, `qwen2.5:32b`, `gemma4:32b` (vision) |
| Mid GPU (8–16GB) | `llama3.1:8b`, `qwen2.5:14b`, `gemma3:12b` (vision) |
| Light / laptop | `gemma3:4b` (vision), `gemma3:1b` (text only) |

```bash
ollama pull gemma3:4b
ollama pull llama3.1:8b
```

## Admin

A high admin user is created automatically from `.env.local`:

| Variable | Default |
|----------|---------|
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | `AdminChangeMe123!` |

Sign in with that account → open **Admin panel** (or `/admin`).

There you can:

- See users, registration / last-active, chat usage
- **Live usage** — active AI generations, response speed (t/s), TTFT, history
- **Knowledge** — living company/project library (keyword RAG, EN / AZ / RU / TR); pack seed is a template; citations toggle
- **Guardrails** — living policy with On/Off item switches (applies to new chats immediately); built-in harm phrases; event log
- **Settings** — Fast/Smart model mapping, generation controls (temperature, max tokens, top-p)
- Enable / disable accounts and which models users can use (Vision / Tools chips show what each model can do)
- Set guest daily message limit (default **5**; logged-in users are **unlimited**)
- **Model lab** (`/lab`) — Quick (40) / Assist (42) / Guardrails (31) against the same `/api/chat` path employees use; **Live** streams the run like chat, **Results** scores facts/language/speed, **Charts** plot accuracy, tok/s, and latency
- **Dev lab** (`/devlab`) — all API keys, API request log, gateway on/off, RPM / key limits, CORS origins

## Config

Copy `.env.example` → `.env.local` (or run `npm run setup`):

| Variable | Meaning |
|----------|---------|
| `SESSION_SECRET` | Cookie signing secret (change for company use) |
| `LLM_BACKENDS` | `ollama`, `vllm`, or `ollama,vllm` (parallel discovery) |
| `OLLAMA_BASE_URL` | Default `http://127.0.0.1:11434` |
| `OLLAMA_KEEP_ALIVE` | Keep model loaded (`30m` default) for faster follow-ups |
| `VLLM_BASE_URL` | OpenAI-compatible vLLM URL (`http://127.0.0.1:8000`) |
| `VLLM_API_KEY` | Optional bearer token for vLLM |
| `DEFAULT_MODEL` | Preferred model name if installed |
| `ADMIN_USERNAME` | Seeded admin username |
| `ADMIN_PASSWORD` | Seeded admin password (change this) |
| `GUEST_DAILY_LIMIT` | Guest messages per day (admin can override) |
| `GUEST_MAX_MESSAGE_CHARS` | Max guest message length |

## Data

- SQLite DB: `data/owngpt.db`
- Tables include users, projects, conversations (share tokens), messages (optional image attachments), settings, models (`vision` / `tools`), usage events, knowledge docs, guardrail events
- Chat images: `data/attachments/{conversationId}/{messageId}/` (gitignored with `data/`)
- Delete `data/owngpt.db` to wipe all accounts and chats (also delete `data/attachments/` if you want stored images gone)
- Never commit `.env.local` or `data/` (already gitignored)
- Product direction: [docs/ROADMAP.md](./docs/ROADMAP.md)

## Deep chat test

With the app running (`npm run dev`) and at least one model available:

```bash
npm run test:chat
npm run test:chat -- --quick
```

Uses `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env.local` (or `TEST_USERNAME` / `TEST_PASSWORD`). Optional: `BASE_URL=http://127.0.0.1:3055`.

Checks login, models, streaming chat, English language drift, citations on SINAM knowledge (about, SESDA, Farabi, contact), guardrail refusals (salary, jailbreak, secrets), projects, share links, and rewrite.

Admins can also run live model checks in the UI at `/lab` (Quick / Assist / Guardrails — Live, Results, and Charts tabs).

## Corporate API keys

Other SINAM apps can call **local models through SINAMGPT** with a personal API key. This is a **raw model proxy** (no knowledge RAG, no guardrails). Chat in the UI is unchanged.

1. Sign in → **Developer** (`/developer`) → create a key (shown once)
2. Call:

```bash
curl -N http://localhost:3055/api/v1/generate \
  -H "Authorization: Bearer sinam_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma3:4b","stream":true,"messages":[{"role":"user","content":"Hello"}]}'
```

Vision example (model must report `vision: true`):

```bash
curl -N http://localhost:3055/api/v1/generate \
  -H "Authorization: Bearer sinam_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4:32b","stream":true,"messages":[{"role":"user","content":"What is in this image?","images":[{"mime":"image/jpeg","data":"<base64>"}]}]}'
```

- `GET /api/v1/models` — enabled models (`name`, `displayName`, `backend`, `vision`, `tools`)
- `POST /api/v1/generate` — `{ model, messages, stream }` → SSE (`token` / `done` / `error`) or JSON when `"stream": false`. Each message may include optional `images: [{ mime, data }]` (raw or data-URL base64) when the model supports vision.
- Limits, CORS origins, and a master on/off switch live in admin **Dev lab** (`/devlab`)
- Default: 5 keys/user, 30 requests/minute/key, 16000 prompt chars; empty CORS list means server-to-server only

## Releases & changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes and [docs/VERSIONING.md](./docs/VERSIONING.md) for how we bump versions and tag releases.

## Company use tips

- Run on one powerful PC; others can open `http://THAT-PC-IP:3055` on the LAN if firewall allows
- Change `SESSION_SECRET` and admin password before sharing
- Keep Ollama updated; pull the models your team needs
- This is intentionally simple — no departments, billing, or cloud sync (see roadmap for what’s next)

## Stack

Next.js · React · Tailwind · SQLite (`better-sqlite3`) · Ollama / vLLM · Zod

## License

Private / internal use for SINAM unless otherwise stated by the repository owner.
