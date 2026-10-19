# One-server deployment: app, developer API and RTX 5090

The app is the public entry point. Users sign in, create their own `sinam_...` key in Developer, and call activated models through `https://YOUR_DOMAIN/api/v1`. vLLM receives only the private provider key. OpenCode executes file edits and terminal commands on the user's computer and sends tool results back to the model through the app.

## Validation status (2026-10-20)

- 200 automated tests pass; 2 live integration tests are skipped without their opt-in environment. Gateway tests use an isolated SQLite database and simulated upstream HTTP responses, including tool cycles, revoked/disabled access, context errors and cancellation.
- TypeScript and ESLint pass. Compose YAML and local font assets pass static checks.
- The Google Fonts build dependency is removed. `npm run build` passes on Windows (Turbopack); the standalone output contains no local `data/` or `.env` files, starts with a fresh database, serves the login page and gates the API. Docker is unavailable locally, so the image build is unverified.
- Docker startup, certificates, real vLLM inference, actual OpenCode editing and 5090 throughput must be checked on the target Linux server using the acceptance steps below.

## Starting profile

`docker-compose.production.yml` runs one Next.js process, Caddy for HTTPS, and one vLLM service. Accounts, chats, API keys and usage live in the persistent `sinamgpt_app-data` volume. Model downloads and certificates have separate persistent volumes.

The supplied profile uses Qwen3-8B, a 32,768-token context (the model's native maximum, needed by coding clients such as OpenCode), 8 scheduled sequences and 8 app admission slots. This is an initial configuration for the single 5090, **not a measured capacity or coding-quality guarantee**. All running requests share one KV-cache pool, so a few long coding sessions can fill it; vLLM then makes the rest wait. If vLLM reports too little KV cache at startup, lower `VLLM_MAX_MODEL_LEN` to 24,576 or 16,384 and match the OpenCode `context` limit to it. Chat and coding share the same model and GPU. More simultaneous requests wait in a bounded queue. Start with one model; separate full models normally need separate vLLM services with carefully divided VRAM or additional GPUs. Do not launch two engines each reserving 90% of this GPU.

## Install and start on Linux

Prerequisites: a supported NVIDIA driver, Docker Engine, Docker Compose with GPU support, and NVIDIA Container Toolkit. Confirm `nvidia-smi` on the host and GPU visibility in Docker. Follow the [vLLM GPU installation guide](https://docs.vllm.ai/en/latest/getting_started/installation/gpu/) and [NVIDIA Container Toolkit instructions](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) for the server's distribution.

Clone this repository on the server, then:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Run separately for SESSION_SECRET, PROVIDER_KEY_SECRET and VLLM_API_KEY:
openssl rand -hex 32
```

Edit `.env.production`: set the domain, a strong admin password (minimum 10 characters), and three different random secrets. Keep the secrets stable. Changing SESSION_SECRET also invalidates existing Developer API keys because their hashes use that secret. Changing PROVIDER_KEY_SECRET prevents decrypting stored provider credentials. Existing installations must retain the secrets used for their existing data.

Point the domain's DNS to the server and allow inbound TCP 80/443 (UDP 443 is optional HTTP/3). Caddy obtains a certificate automatically. The app's port 3000 is internal to Docker; vLLM's port 8000 binds only to host loopback. Do not expose either directly. If a reverse proxy already owns ports 80/443, integrate the app with that proxy instead of running a second listener; preserve HTTPS, SSE streaming, client disconnect cancellation, and trusted forwarding headers.

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 vllm app proxy
```

The build needs access to npm; font files are bundled locally. First vLLM startup needs access to model downloads. The app can start while the model downloads. App health checks prove the web process responds, not that inference is ready. Wait for vLLM health and test a real request. This repository's Docker build and GPU profile still require acceptance on the target Linux server.

## Configure the product

1. Sign in with the seeded admin account. In **Admin > Providers > vllm**, verify URL `http://vllm:8000`, the private server key, tools enabled, and max concurrency 8. Test and sync models. Activate `vllm:Qwen/Qwen3-8B` and choose it as default.
2. Existing SQLite settings override environment seed values. When moving existing data from a host installation, explicitly update the provider URL, key and limits in Admin; `localhost` inside the app container does not refer to vLLM.
3. Enable **Developer API** and **Dev lab** in Admin > Settings > Features. The separate app tool-calling/search toggle governs the app's own tools; external clients supply and execute their own tools.
4. In Dev lab, confirm the gateway is enabled. The default is 5 keys/user, 30 requests/minute/key and 100,000 prompt characters. Coding histories and tool definitions count toward this character limit; 100,000 is sized for OpenCode on the 32k context. Existing installations still on the old 16,000 or 32,000 default are raised to 100,000 once on upgrade; any other value an admin set is kept. Character limits are **not token limits**; vLLM enforces the actual context window, including requested output.
5. Enable registration when inviting users, or keep it closed outside onboarding. Users register with a username or work email and sign in. These are local accounts; entering an email does not verify ownership or send mail.
6. Each user opens **Developer > API keys**, creates a named key, and copies it once. The same key accesses all activated models. Put keys in the calling application's server environment or a local developer tool, not in a public browser bundle.
7. Disabling a user blocks their keys and web session. Disabling/revoking a key blocks subsequent API calls. API traffic has per-key RPM limits; it does not have billing, per-user model ACLs or token quotas yet. App replicas cannot safely share the in-memory rate/concurrency controls; keep this deployment at one app process until distributed controls and storage are designed.

Password recovery is administrator-assisted. **Admin > Users > Reset password** creates a one-hour, single-use link for either username or email accounts. Verify the user and deliver it privately. Creating another link invalidates the previous one. The public forgot-password endpoint cannot issue or reveal tokens. Automated verified-email recovery remains future work.

## Connect OpenCode and other products

See [DEVELOPER-API.md](./DEVELOPER-API.md) for the copyable OpenCode configuration and protocol details. Developer > How to call also generates a configuration using the selected activated model. Use the **app's** `/api/v1` base URL and the user's **Developer key**, never the private vLLM key.

Admin API logs include submitted source text and tool results, with bounded storage per request. Treat those logs and backups as company data. The Developer API sends client messages directly to the model; the app's company knowledge and guardrails are not injected into this path.

## Acceptance checks on the actual server

From a machine with Node.js 22+ and this repository installed:

```bash
export BASE_URL=https://YOUR_DOMAIN
export SINAMGPT_API_KEY=sinam_YOUR_USER_KEY
export TEST_API_MODEL=vllm:Qwen/Qwen3-8B
npm run test:api
npm run test:vllm:load -- --app --concurrency 4 --requests 16
```

`test:api` checks invalid-key rejection, discovery, streamed and non-streamed function calls, exact arguments, returning a synthetic tool result, and the final answer. It never edits files or executes shell tools. It spends four real model requests. Respect the per-key RPM budget between load runs, or adjust the test key's shared gateway budget deliberately.

Then use OpenCode in a disposable small project: ask it to read a file, make a small edit, run the project's test command with your normal tool approval settings, and inspect the diff. Check Dev lab usage and GPU memory/latency. Compare actual coding correctness separately from request throughput. Increase concurrency gradually; longer context and larger models consume more memory and reduce capacity.

## Back up and update

Back up `.env.production` securely and the entire app data directory. For a consistent offline snapshot:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml stop app
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.production.yml cp app:/app/data ./backups/app-data
docker compose --env-file .env.production -f docker-compose.production.yml start app
```

Use a new destination for each backup. Stop the app before restoring data; restore the matching secrets and retain ownership for the container's `node` user (UID 1000). When importing existing host data into the named volume, copy the whole directory including attachments and SQLite files while both old and new app processes are stopped. Never overwrite a running database. `docker compose down -v` deletes persistent volumes and is not an update procedure.

After a backup, deploy reviewed code with `up -d --build`. SQLite migrations run on startup. Rollback may require the matching pre-upgrade data backup, not just the previous app image.
