# SINAMGPT

Local company GPT for [SINAM](https://sinam.net): login, ChatGPT-style chat, knowledge & guardrails, and saved history — all on your PC.

**Current version:** [1.14.1](./CHANGELOG.md#1141--2026-08-17)

**New here?** Start with **[How it works](./docs/HOW-IT-WORKS.md)** — a short, plain-language guide for managers and everyday users (what happens when you send a message, how knowledge and safety work, where data lives).

| You need… | Open |
|-----------|------|
| How the product works (no install) | [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md) |
| Install, env vars, API examples | This README |
| What shipped vs what is next | [docs/ROADMAP.md](./docs/ROADMAP.md) |
| What changed in each version | [CHANGELOG.md](./CHANGELOG.md) |
| How we number releases | [docs/VERSIONING.md](./docs/VERSIONING.md) |
| Original management concept | [docs/SINAMGPT-Concept-Plan.md](./docs/SINAMGPT-Concept-Plan.md) |

- **Local models** via [Ollama](https://ollama.com) — company RTX 5090 fleet: `gemma3:4b`, `gemma3:12b`, `gemma4:e4b`, `gemma4:31b`, `qwen3.5:9b`, `qwen3:32b`
- **Vision models** — attach, paste, or drop images when the selected model is multimodal **and** Admin has turned on File upload / File import (on this box: Gemma 3 4B / 12B, Gemma 4 E4B / 31B, Qwen 3.5 9B). Qwen 3 32B is text-only. Those Features start **off**.
- **Audio models** — record from the microphone (pick the device on laptops) or drop a short audio file; up to 30 seconds. Needs an audio-capable model **and** Admin → Features → Microphone / File import (also start **off**). On this box: Gemma 4 E4B yes, Gemma 4 31B / Gemma 3 / Qwen no
- **Login / register** (accounts stored locally)
- **Chat history** per user (SQLite in `data/owngpt.db`)
- **Streaming replies**, model picker (Text / Image / Audio, plus Ollama Functions tags), rewrite shortcuts
- **Models guide** (`/models`) — signed-in users see activated models with size, inputs, use cases, and short pros / cons. Open it from the chat header or sidebar.
- **Projects** — up to 5 folders per user; project-scoped knowledge boost
- **Share chats** internally (logged-in colleagues, read-only `/share/…` links; shared images and voice clips stay visible)
- **Cited answers** from the company knowledge base (admin on/off; guests too when knowledge applies). Search uses the question as written **plus** EN / AZ / RU keywords, so a Russian question can still find an English or Azerbaijani note
- **English / Azərbaycan / Русский UI** — flag toggle on chat, auth, share, and Admin; choice remembered in the browser. Replies follow the user’s language
- **Admin** — users, models (Activate before users can pick them), live usage (click a row for the exact prompt and reply), knowledge, multi-layer guardrails, Settings → Features On/Off
- **Model lab** (`/lab`) — admin-only live `/api/chat` suites (Quick, Assist, Guardrails) with Live chat, Results, and Charts
- **Developer API** (`/developer`) — off until Admin → Settings → Features; then users can generate keys and call `/api/v1/generate` from other company apps (text and images). Raw model pipe — **no** knowledge, **no** guardrails
- **Dev lab** (`/devlab`) — off until the same Features toggle; admin view of all keys, API usage, and gateway limits
- **Guest try-chat** on the home page (daily + burst limits; signed-in users unlimited; up to 2 images on vision models when File upload / File import is on)

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
3. Admin account can open `/admin` and **Model lab** at `/lab`. **Dev lab** (`/devlab`) is off until enabled in Admin → Settings → Features
4. **Developer** (`/developer`) API keys are off until that same Features toggle is on

For production on the company machine:

```bash
npm run build
npm run start
```

## Ollama models (company RTX 5090)

These tags are what the company GPU box actually has. After deploy, **Activate** each one under Admin → Models. Default is `gemma3:4b`.

| Tag | Role |
|-----|------|
| `gemma3:4b` | Fast default. Text + images. No microphone. |
| `gemma3:12b` | Stronger Gemma 3. Text + images. No microphone. |
| `gemma4:e4b` | Gemma 4 small. Text + images + microphone (30s). |
| `gemma4:31b` | Largest Gemma. Text + images. **No** microphone. |
| `qwen3.5:9b` | Fast Qwen. Native images. No microphone (Ollama may list video; chat cannot send it). |
| `qwen3:32b` | Strongest text. No images, no microphone. |

```bash
ollama pull gemma3:4b
ollama pull gemma3:12b
ollama pull gemma4:e4b
ollama pull gemma4:31b
ollama pull qwen3.5:9b
ollama pull qwen3:32b
```

## Admin

A high admin user is created on first start **only if** `ADMIN_PASSWORD` is set in `.env.local` (at least 10 characters, not the old example password):

| Variable | Notes |
|----------|--------|
| `ADMIN_USERNAME` | Defaults to `admin` |
| `ADMIN_PASSWORD` | Required to seed the admin account |

Sign in with that account → open **Admin panel** (or `/admin`).

There you can:

- See users, registration / last-active, chat usage
- **Live usage** — active AI generations, response speed (t/s), TTFT, history. Click a live or past row to inspect the exact prompt sent to the model and the reply
- **Knowledge** — living company/project library. Keyword search (not embeddings yet) plus a short EN / AZ / RU keyword list from the same local model, so questions in one language can match notes in another; pack seed is a template; citations toggle
- **Guardrails** — living policy with On/Off item switches (applies to new chats immediately); built-in harm phrases; blocked phrases can also match via that same keyword list
- **Settings** — Features On/Off (Developer API, Dev lab, File upload, File import, Microphone — chat inputs start **off**), default model, generation controls (temperature, max tokens, top-p)
- Enable / disable accounts; **Activate** models on Admin → Models before users can pick them (Text / Image you can send; Audio follows Ollama; Functions not used in chat)
- Set guest daily message limit (default **5**; logged-in users are **unlimited**)
- **Model lab** (`/lab`) — Quick (18) / Assist (20) / Guardrails (17) against the same `/api/chat` path employees use; **Live** streams the run like chat, **Results** scores facts/language/speed, **Charts** plot accuracy, tok/s, and latency
- **Dev lab** (`/devlab`) — all API keys, API request log, gateway on/off, RPM / key limits, CORS origins

## Config

Copy `.env.example` → `.env.local` (or run `npm run setup`):

| Variable | Meaning |
|----------|---------|
| `SESSION_SECRET` | Cookie signing secret (change for company use) |
| `OLLAMA_BASE_URL` | Default `http://127.0.0.1:11434` |
| `OLLAMA_KEEP_ALIVE` | Keep model loaded (`30m` default) for faster follow-ups |
| `DEFAULT_MODEL` | Preferred Ollama model name if installed |
| `ADMIN_USERNAME` | Seeded admin username |
| `ADMIN_PASSWORD` | Required to seed the admin account (min 10 characters) |
| `GUEST_DAILY_LIMIT` | Guest messages per day (admin can override) |
| `GUEST_MAX_MESSAGE_CHARS` | Max guest message length |

## Data

- SQLite DB: `data/owngpt.db`
- Tables include users, projects, conversations (share tokens), messages (optional image/audio attachments), settings, models (`vision` / `tools` / `audio`), usage events (optional stored prompt + reply text), knowledge docs, guardrail events
- Chat images and voice clips: `data/attachments/{conversationId}/{messageId}/` (gitignored with `data/`)
- Delete `data/owngpt.db` to wipe all accounts and chats (also delete `data/attachments/` if you want stored files gone)
- Never commit `.env.local` or `data/` (already gitignored)
- How it works (plain language): [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md)
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

1. Admin → Settings → Features → enable **Developer API** (and **Dev lab** if you want the admin console)
2. Sign in → **Developer** (`/developer`) → create a key (shown once)
3. Call:

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
  -d '{"model":"gemma3:12b","stream":true,"messages":[{"role":"user","content":"What is in this image?","images":[{"mime":"image/jpeg","data":"<base64>"}]}]}'
```

- `GET /api/v1/models` — enabled models (`name`, `displayName`, `backend`, `vision`, `tools`)
- `POST /api/v1/generate` — `{ model, messages, stream }` → SSE (`token` / `done` / `error`) or JSON when `"stream": false`. Each message may include optional `images: [{ mime, data }]` (raw or data-URL base64) when the model supports vision.
- Limits, CORS origins, and a master on/off switch live in admin **Dev lab** (`/devlab`) (feature must be on in Settings first)
- Default: 5 keys/user, 30 requests/minute/key, 16000 prompt chars; empty CORS list means server-to-server only

## Releases & changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes and [docs/VERSIONING.md](./docs/VERSIONING.md) for how we bump versions and tag releases. After a behavior change, also refresh [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md).

## Company use tips

- Share [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md) with managers and new users — it explains the flow without install steps
- Run on one powerful PC; others can open `http://THAT-PC-IP:3055` on the LAN if firewall allows
- Change `SESSION_SECRET` and admin password before sharing
- Keep Ollama updated; pull the models your team needs
- This is intentionally simple — no departments, billing, or cloud sync (see roadmap for what’s next)

## Stack

Next.js · React · Tailwind · SQLite (`better-sqlite3`) · Ollama · Zod

## License

Private / internal use for SINAM unless otherwise stated by the repository owner.
