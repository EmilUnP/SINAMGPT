# SINAMGPT

Local company GPT for [SINAM](https://sinam.net): login, ChatGPT-style chat, knowledge & guardrails, and saved history — all on your Server.

**Current version:** [1.20.0](./CHANGELOG.md#1200--2026-09-08)

**New here?** Start with **[How it works](./docs/HOW-IT-WORKS.md)** — a short, plain-language guide for managers and everyday users (what happens when you send a message, how knowledge and safety work, where data lives).

| You need… | Open |
|-----------|------|
| How the product works (no install) | [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md) |
| Install, env vars, API examples | This README |
| Deploy app + API + vLLM on one GPU server | [docs/SERVER-DEPLOYMENT.md](./docs/SERVER-DEPLOYMENT.md) |
| Connect OpenCode or your own product | [docs/DEVELOPER-API.md](./docs/DEVELOPER-API.md) |
| What shipped vs what is next | [docs/ROADMAP.md](./docs/ROADMAP.md) |
| The v2.0 platform plan (more runtimes, more model types, search, files) | [docs/PLATFORM-ROADMAP.md](./docs/PLATFORM-ROADMAP.md) |
| What changed in each version | [CHANGELOG.md](./CHANGELOG.md) |
| How we number releases | [docs/VERSIONING.md](./docs/VERSIONING.md) |
| Original management concept | [docs/SINAMGPT-Concept-Plan.md](./docs/SINAMGPT-Concept-Plan.md) |

- **Local models** via **vLLM**, using its OpenAI-compatible API and continuous batching. Additional vLLM endpoints and OpenAI-compatible servers are managed in **Admin → Providers**. See [vLLM setup](./docs/VLLM-SETUP.md).
- **Vision models** — attach, paste, or drop images when the deployed model supports images and Admin enables File upload / File import. These features start **off**.
- **Audio models** — record up to 30 seconds from the microphone when the deployed model and vLLM installation support audio input. Admin → Features → Microphone starts **off**. The example Qwen3 deployment is text-only.
- **Login / register** with a username or work email (accounts stored locally). Password recovery is admin-assisted: Admin > Users creates a private one-hour reset link. Automated email delivery is not implemented.
- **Chat history** per user (SQLite in `data/owngpt.db`)
- **Streaming replies**, model picker in the chat box (Text / Image / Audio, plus Functions badges), **+** tools menu, rewrite shortcuts
- **Models guide** (`/models`) — public catalog of activated models (inputs, when to use, one caveat). Open it from home, the chat header, or the sidebar.
- **Projects** — up to 5 folders per user; project-scoped knowledge boost
- **Share chats** internally (logged-in colleagues, read-only `/share/…` links; shared images and voice clips stay visible)
- **Cited answers** from the company knowledge base (admin on/off; guests too when knowledge applies). Search uses the question as written **plus** EN / AZ / RU keywords, so a Russian question can still find an English or Azerbaijani note. General chat (for example “what is AI”) does not attach About SINAM / product pages as “From: …”
- **Internet search** — off until Admin → Settings → Features turns it on. Signed-in chat can then use `web_search` / `web_fetch` (DuckDuckGo HTML by default, optional SearXNG). Weather and news questions search even if the model claims it has no internet. Guest chat stays without search. Fetches are public HTTPS only (no LAN/metadata).
- **English / Azərbaycan / Русский UI** — flag toggle on chat, auth, share, and Admin; choice remembered in the browser. Replies follow the user’s language
- **Admin** — users, models (Activate before users can pick them), providers (vLLM / OpenAI-compatible; test, health, sync, fallback), live usage (chat + API, All / App / API filter; click a row for the prompt, reply, and **Tools** tab), knowledge, multi-layer guardrails, Settings → Features On/Off (including internet search)
- **Model lab** (`/lab`) — admin-only live `/api/chat` suites (Quick, Assist, Guardrails) with Live chat, Results, and Charts
- **Developer API** (`/developer`) — off until Admin → Settings → Features; then one key calls every activated model from other company apps (OpenAI-compatible `/api/v1/chat/completions`, plus `/api/v1/models`). Raw model pipe — **no** knowledge, **no** guardrails
- **Dev lab** (`/devlab`) — off until the same Features toggle; admin view of all keys, API usage, and gateway limits
- **Guest try-chat** on the home page (daily + burst limits; signed-in users unlimited; up to 2 images on vision models when File upload / File import is on)

No third-party cloud LLM APIs unless an admin adds a public URL and confirms that traffic may leave the building. Localhost and LAN stay the default.

## Requirements

- Node.js 22+
- A reachable official vLLM server on Linux or Docker/WSL2 with compatible GPU hardware
- A served model and its API key; see [vLLM setup](./docs/VLLM-SETUP.md)

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

## vLLM models and migration

Run official vLLM with the supplied `docker-compose.vllm.yml` and `.env.vllm.example`. The starting profile serves `Qwen/Qwen3-8B`; tune model size, context and concurrency for the actual GPU. Windows `start-vllm.bat` now launches the official container through Docker, not a Transformers imitation.

Existing Ollama providers and their model rows are disabled once on startup. Accounts, conversations and usage history are preserved. Configure **Admin → Providers → vllm**, test the connection, sync models, activate a model and select the default. Existing provider settings are kept in SQLite, so changing environment seed variables does not overwrite them.

Read **[docs/VLLM-SETUP.md](./docs/VLLM-SETUP.md)** for GPU setup, tools, model ids, migration, multiple servers and load testing.

## Admin

A high admin user is created on first start **only if** `ADMIN_PASSWORD` is set in `.env.local` (at least 10 characters, not the old example password):

| Variable | Notes |
|----------|--------|
| `ADMIN_USERNAME` | Defaults to `admin` |
| `ADMIN_PASSWORD` | Required to seed the admin account |

Sign in with that account → open **Admin panel** (or `/admin`).

There you can:

- See users, registration / last-active, chat usage
- **Live usage** — active AI generations, response speed (t/s), TTFT, history. **All / App / API** filter. Click a live or past row to inspect the exact prompt sent to the model and the reply. **Clear logs** wipes stored prompts/replies
- **Knowledge** — living company/project library. Keyword search (not embeddings yet) plus a short EN / AZ / RU keyword list from the same local model, so questions in one language can match notes in another; pack seed is a template; citations toggle (general chat does not cite About/product pages)
- **Guardrails** — living policy with On/Off item switches (applies to new chats immediately); built-in harm phrases; blocked phrases can also match via that same keyword list
- **Settings** — Features On/Off (Developer API, Dev lab, File upload, File import, Microphone — chat inputs start **off**), default model, generation controls (temperature, max tokens, top-p)
- Enable / disable accounts; **Activate** models on Admin → Models before users can pick them (Text / Image you can send; Audio requires a supported deployed model; Functions require a configured server parser)
- Set guest daily message limit (default **5**; logged-in users are **unlimited**)
- **Model lab** (`/lab`) — Quick (18) / Assist (20) / Guardrails (17) against the same `/api/chat` path employees use; **Live** streams the run like chat, **Results** scores facts/language/speed, **Charts** plot accuracy, tok/s, and latency
- **Dev lab** (`/devlab`) — all API keys, API request log, gateway on/off, RPM / key limits, CORS origins

## Config

Copy `.env.example` → `.env.local` (or run `npm run setup`):

| Variable | Meaning |
|----------|---------|
| `SESSION_SECRET` | Cookie signing secret. Also encrypts provider API keys unless `PROVIDER_KEY_SECRET` is set. Rotating this without a dedicated provider secret invalidates stored keys |
| `PROVIDER_KEY_SECRET` | Optional dedicated secret for provider API-key encryption. Prefer this so cookie rotation does not lock stored keys |
| `VLLM_BASE_URL` | Seeds `vllm` when missing; default `http://127.0.0.1:8000`. Existing installs use Admin → Providers |
| `VLLM_API_KEY` | Initial provider key, encrypted in SQLite; must match the server |
| `VLLM_MAX_CONCURRENT` | Initial full-generation limit, default 32 per app process |
| `VLLM_TOOL_CALLING` | Initial tool-parser confirmation; `1` only when configured on the server |
| `LLM_MAX_QUEUE` / `LLM_QUEUE_TIMEOUT_MS` | Waiting requests and wait timeout; defaults 256 / 30000 ms |
| `LLM_REQUEST_TIMEOUT_MS` | Inference timeout after admission; default 180000 ms |
| `DEFAULT_MODEL` | Optional qualified app model id, e.g. `vllm:Qwen/Qwen3-8B` |
| `ADMIN_USERNAME` | Seeded admin username |
| `ADMIN_PASSWORD` | Required to seed the admin account (min 10 characters) |
| `GUEST_DAILY_LIMIT` | Guest messages per day (admin can override) |
| `GUEST_MAX_MESSAGE_CHARS` | Max guest message length |
| `TRUST_PROXY` | Set `1` only behind a reverse proxy you control; otherwise forwarded client IPs are ignored |
| `APP_URL` | Optional public origin used in reset links, e.g. `http://localhost:3055` |

Additional runtimes (vLLM and other OpenAI-compatible servers) are managed in **Admin → Providers**. Extra runtimes stay off until an admin adds and enables a provider. Localhost and LAN addresses need no extra confirmation; a public or cloud URL requires an explicit “traffic may leave the building” acknowledgement. Provider API keys are encrypted with `PROVIDER_KEY_SECRET` (or `SESSION_SECRET` if that is unset) and are never returned by the Admin API.

The persistent job worker is designed for this project's single-process,
self-hosted Node deployment. It is not a distributed queue and must not be used
for serverless or horizontally scaled deployments without an external queue.
The job and tool-calling feature flags are off by default.

## Data

- SQLite DB: `data/owngpt.db`
- Tables include users, password reset tokens, projects, conversations (share tokens), messages (optional image/audio attachments), settings, models (`vision` / `tools` / `audio`), usage events (optional stored prompt + reply text), knowledge docs, guardrail events
- Chat images and voice clips: `data/attachments/{conversationId}/{messageId}/` (gitignored with `data/`)
- Delete `data/owngpt.db` to wipe all accounts and chats (also delete `data/attachments/` if you want stored files gone)
- Never commit `.env.local` or `data/` (already gitignored)
- How it works (plain language): [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md)
- Product direction: [docs/ROADMAP.md](./docs/ROADMAP.md)

## Tests

Unit tests are in `tests/`. They do not need a running model server:

```bash
npm test
```

Gated provider and long-job proofs: `npm run test:integration`.

With the app running, a simple end-to-end check (pages, login, forgot-password, every provider ping — inference is optional):

```bash
npm run test:smoke
```

With official vLLM connected and a model activated:

```bash
npm run test:vllm
npm run test:vllm:load -- --concurrency 4 --requests 16
```

The load test reports request success/failure, latency, time to first token and token throughput. Use `--app` with `SINAMGPT_API_KEY` to test through the app's Developer API and concurrency gate. See [deployment instructions](./docs/VLLM-SETUP.md).

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

Other SINAM apps can call **local models through SINAMGPT** with one personal API key — same idea as OpenRouter. This is a **raw model proxy** (no knowledge RAG, no guardrails). Chat in the UI is unchanged.

1. Admin → Settings → Features → enable **Developer API** (and **Dev lab** if you want the admin console)
2. Sign in → **Developer** (`/developer`) → create a key (shown once)
3. List models, then call any of them:

```bash
curl http://localhost:3055/api/v1/models \
  -H "Authorization: Bearer sinam_YOUR_KEY"
```

```bash
curl http://localhost:3055/api/v1/chat/completions \
  -H "Authorization: Bearer sinam_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma3:4b","messages":[{"role":"user","content":"Hello"}]}'
```

Python (OpenAI SDK):

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3055/api/v1", api_key="sinam_YOUR_KEY")
print(client.chat.completions.create(
    model="gemma3:4b",
    messages=[{"role": "user", "content": "Hello"}],
).choices[0].message.content)
```

Vision example (model must report `vision: true`):

```bash
curl http://localhost:3055/api/v1/chat/completions \
  -H "Authorization: Bearer sinam_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma3:12b","messages":[{"role":"user","content":[{"type":"text","text":"What is in this image?"},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,<base64>"}}]}]}'
```

- `GET /api/v1/models` — OpenAI-style `{ object, data }` list of activated models (`id`, `displayName`, `backend`, `vision`, `tools`, `audio`, `tts`, `video`). Same key works for every `id`.
- `POST /api/v1/chat/completions` — OpenAI-compatible `{ model, messages, stream }`. Omit `model` to use the admin default. Streaming uses standard `data: ...` / `data: [DONE]` chunks.
- `POST /api/v1/generate` — older custom JSON/SSE (`token` / `done` / `error`); still supported.
- Limits, CORS origins, and a master on/off switch live in admin **Dev lab** (`/devlab`) (feature must be on in Settings first)
- Default: 5 keys/user, 30 requests/minute/key, 16000 prompt chars; empty CORS list means server-to-server only

## Releases & changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes and [docs/VERSIONING.md](./docs/VERSIONING.md) for how we bump versions and tag releases. After a behavior change, also refresh [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md).

## Company use tips

- Share [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md) with managers and new users — it explains the flow without install steps
- Run on one powerful Server; others can open `http://THAT-PC-IP:3055` on the LAN if firewall allows
- Change `SESSION_SECRET` and admin password before sharing
- Pin and validate the vLLM container and model checkpoints your team needs
- This is intentionally simple — no departments, billing, or cloud sync (see roadmap for what’s next)

## Stack

Next.js · React · Tailwind · SQLite (`better-sqlite3`) · vLLM · Zod

## License

Private / internal use for SINAM unless otherwise stated by the repository owner.
