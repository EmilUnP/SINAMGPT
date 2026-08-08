# SINAMGPT

Local company GPT for [SINAM](https://sinam.net): login, ChatGPT-style chat, knowledge & guardrails, and saved history — all on your PC.

**Current version:** [1.0.0](./CHANGELOG.md) · [Versioning guide](./docs/VERSIONING.md)

- **Local models** via [Ollama](https://ollama.com) and optional [vLLM](https://docs.vllm.ai/) (OpenAI-compatible) — can run in parallel
- **Login / register** (accounts stored locally)
- **Chat history** per user (SQLite in `data/owngpt.db`)
- **Streaming replies**, model picker, new/delete chats
- **Admin** — users, models, live usage, knowledge base, guardrails
- **Guest try-chat** on the home page (daily limit; signed-in users unlimited)

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

On Windows you can also double-click `start.bat` (restarts the app on port 3000).

Open [http://localhost:3000](http://localhost:3000)

1. **Home** (`/`) — try the model immediately (guest, limited, no saved history)
2. **Sign in / Register** — full chat with saved history
3. Admin account can open `/admin`

For production on the company machine:

```bash
npm run build
npm run start
```

## Ollama models (suggestions)

| Machine | Suggested models |
|--------|-------------------|
| Strong GPU (24GB+ VRAM) | `llama3.1:70b`, `qwen2.5:32b`, `gemma3:27b` |
| Mid GPU (8–16GB) | `llama3.1:8b`, `qwen2.5:14b`, `gemma3:12b` |
| Light / laptop | `gemma3:4b`, `gemma3:1b` |

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
- **Knowledge** — company/project facts injected like lightweight RAG (EN / AZ / RU / TR aware)
- **Guardrails** — what the AI can/can’t say, blocked keywords, refusal text
- Enable / disable accounts
- Enable / disable which Ollama models users can use
- Set guest daily message limit (default **5**; logged-in users are **unlimited**)

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
- Tables include users, conversations, messages, settings, models, usage events, knowledge docs
- Delete `data/owngpt.db` to wipe all accounts and chats
- Never commit `.env.local` or `data/` (already gitignored)

## Releases & changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes and [docs/VERSIONING.md](./docs/VERSIONING.md) for how we bump versions and tag releases.

## Company use tips

- Run on one powerful PC; others can open `http://THAT-PC-IP:3000` on the LAN if firewall allows
- Change `SESSION_SECRET` and admin password before sharing
- Keep Ollama updated; pull the models your team needs
- This is intentionally simple — no teams, billing, or cloud sync

## Stack

Next.js · React · Tailwind · SQLite (`better-sqlite3`) · Ollama / vLLM · Zod

## License

Private / internal use for SINAM unless otherwise stated by the repository owner.
