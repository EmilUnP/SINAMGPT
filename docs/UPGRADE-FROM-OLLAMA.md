# Upgrade a running Linux server from Ollama to vLLM

Use this when SINAMGPT already runs on a Linux GPU server with Ollama and you want the new vLLM version **without starting from zero**. Accounts, chats, projects, knowledge, settings and Developer API keys are kept. Users see roughly 15 minutes of downtime.

This guide keeps the app running the way it runs today (`npm run start` on the server) and only replaces Ollama with vLLM. Moving to the Docker + HTTPS stack in [SERVER-DEPLOYMENT.md](./SERVER-DEPLOYMENT.md) is a separate, later step. Change one thing at a time. When you do move, stop this guide's vLLM first: two vLLM engines cannot share one GPU.

## Read first: what changes

- **Models are downloaded again.** vLLM cannot use Ollama's model files: Ollama stores its own GGUF format, while vLLM loads Hugging Face checkpoints. vLLM downloads them by itself; Qwen3-8B is about 16 GB.
- **One model per GPU.** Ollama loaded and swapped many models on demand. vLLM keeps one model loaded and reserves about 90% of GPU memory. On one RTX 5090, users will see **one model** in the picker. Llama 4 Scout/Maverick do not fit.
- **Text only with Qwen3-8B.** Image and microphone input need a model that supports them; the app hides those inputs for a text-only model.
- **Old chats stay readable.** Old Ollama models are switched off (not deleted). Users continue old chats with the new model.
- **API integrations need the new model id.** Developer keys keep working, but a product that sends an old Ollama name such as `gemma3:4b` must switch to `vllm:Qwen/Qwen3-8B` (listed by `GET /api/v1/models`).
- **Data is safe if you keep two things:** the existing `data/` folder and the existing secrets in `.env.local` (`SESSION_SECRET`, and `PROVIDER_KEY_SECRET` if you have one). Do not add, remove or change secrets during the upgrade.

## Checklist

**Before the day**

- [ ] The new code is pushed to the Git remote the server pulls from.
- [ ] At least 50 GB free disk (vLLM image + model; Ollama models stay until the end).
- [ ] Node.js 22 or newer on the server.
- [ ] Docker, Docker Compose and the NVIDIA Container Toolkit work with the GPU.
- [ ] Port 8000 is free on the server.
- [ ] You know how the app is started (systemd, pm2 or a terminal) and its URL.
- [ ] Part A finished: vLLM image pulled and model downloaded.

**Switch (about 15 minutes)**

- [ ] App stopped, `data/` and `.env.local` backed up.
- [ ] Ollama stopped and its autostart disabled.
- [ ] vLLM started, healthy and answering a test request.
- [ ] New code pulled, installed and built.
- [ ] vLLM settings added to `.env.local`; app started.
- [ ] Admin: provider tested and synced, model activated, default model set.
- [ ] A new chat and an old chat both answer.

**After a few good days**

- [ ] Ollama models removed to free disk.

## Commands

Commands use `docker` without `sudo`; add `sudo` if your user is not in the `docker` group. Run them as the user that owns the app folder.

Set two variables in every terminal you use (change both values to yours):

```bash
export APP_DIR=/path/to/OwnGPT
export APP_URL=http://127.0.0.1:3055
```

### How the app is started

Find it:

```bash
systemctl list-units --type=service --all | grep -iE 'sinam|owngpt|next|node'
```

```bash
pm2 ls
```

Then use the matching commands wherever this guide says **stop the app** or **start the app**:

| The app runs with | Stop | Start |
| --- | --- | --- |
| systemd service `NAME` | `sudo systemctl stop NAME` | `sudo systemctl start NAME` |
| pm2 process `NAME` | `pm2 stop NAME` | `pm2 restart NAME` |
| a terminal / screen / tmux | Ctrl+C in that terminal | `cd "$APP_DIR" && npm run start` (add `-- -p 3055` if you used a port) |

Keep starting the app with `npm run start` from `$APP_DIR`. It prints `"next start" does not work with "output: standalone"`; that warning is expected and harmless. **Do not** switch to `node .next/standalone/server.js` in this setup: it looks for `data/` inside `.next/standalone` and would start with an empty database.

### Part A — Prepare (no downtime, Ollama keeps serving)

**A1. Check the server.**

```bash
node --version
```

```bash
nvidia-smi
```

```bash
docker compose version
```

```bash
docker run --rm --runtime=nvidia --gpus all ubuntu nvidia-smi
```

```bash
ss -ltnp | grep ':8000 ' || echo "port 8000 is free"
```

```bash
df -h "$HOME" /var/lib/docker
```

Node must be v22+; if it is older, install the current [Node.js LTS](https://nodejs.org/en/download) before Part B. The `docker run` command must print the same GPU table as `nvidia-smi`; if it fails, install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), run `sudo nvidia-ctk runtime configure --runtime=docker` and `sudo systemctl restart docker`, then try again.

**A2. Save the current version (for rollback) and fetch the new code.**

```bash
cd "$APP_DIR" && git status --short
```

This must print nothing. If it lists files, the server has local changes: save or commit them first.

```bash
cd "$APP_DIR" && git rev-parse HEAD > ~/sinamgpt-before-vllm.commit && git fetch origin
```

**A3. Create the vLLM folder.** vLLM gets its own folder, so app updates never restart or re-download it.

```bash
mkdir -p ~/sinamgpt-vllm && cd "$APP_DIR" && git show origin/main:docker-compose.vllm.yml > ~/sinamgpt-vllm/docker-compose.vllm.yml && git show origin/main:.env.vllm.example > ~/sinamgpt-vllm/.env.vllm
```

**A4. Configure vLLM for the 5090.** This sets a new private key, the 32k context and 8 parallel sequences.

```bash
cd ~/sinamgpt-vllm && sed -i "s/^VLLM_API_KEY=.*/VLLM_API_KEY=$(openssl rand -hex 32)/; s/^VLLM_MAX_MODEL_LEN=.*/VLLM_MAX_MODEL_LEN=32768/; s/^VLLM_MAX_NUM_SEQS=.*/VLLM_MAX_NUM_SEQS=8/" .env.vllm && chmod 600 .env.vllm
```

```bash
grep -E '^VLLM_(MODEL|MAX_MODEL_LEN|MAX_NUM_SEQS|TOOL_CALL_PARSER|BIND_HOST)=' ~/sinamgpt-vllm/.env.vllm
```

Expect `Qwen/Qwen3-8B`, `32768`, `8`, `hermes` and `127.0.0.1`. Back up `~/sinamgpt-vllm/.env.vllm` with your other secrets.

**A5. Download the image and the model in advance.** Users keep using Ollama meanwhile.

```bash
cd ~/sinamgpt-vllm && docker compose --env-file .env.vllm -f docker-compose.vllm.yml pull
```

```bash
cd ~/sinamgpt-vllm && docker compose --env-file .env.vllm -f docker-compose.vllm.yml run --rm --no-deps --entrypoint python3 vllm -c "from huggingface_hub import snapshot_download; print(snapshot_download('Qwen/Qwen3-8B'))"
```

The second command ends by printing a path under `/root/.cache/huggingface`. The files stay in a Docker volume for the real start.

### Part B — Switch (downtime starts)

**B1. Stop the app** (see the table above).

**B2. Back up the data and settings.**

```bash
cd "$APP_DIR" && BK=~/sinamgpt-backup-$(date +%Y%m%d-%H%M) && mkdir -p "$BK" && cp -a data .env.local "$BK"/ && chmod -R go-rwx "$BK" && echo "$BK" > ~/sinamgpt-last-backup && ls -la "$BK" "$BK/data"
```

**B3. Stop Ollama** so the GPU is free, and keep it from starting at boot.

```bash
sudo systemctl stop ollama && sudo systemctl disable ollama
```

```bash
nvidia-smi
```

No `ollama` process should hold GPU memory. If Ollama runs in Docker instead, use `docker stop ollama && docker update --restart=no ollama`.

**B4. Start vLLM and wait until it is ready** (usually 1–5 minutes with the model already downloaded).

```bash
cd ~/sinamgpt-vllm && docker compose --env-file .env.vllm -f docker-compose.vllm.yml up -d
```

```bash
until curl -sf http://127.0.0.1:8000/health > /dev/null; do echo "waiting for vLLM..."; sleep 10; done; echo "vLLM is ready"
```

If it is still waiting after 10 minutes, read the log:

```bash
cd ~/sinamgpt-vllm && docker compose --env-file .env.vllm -f docker-compose.vllm.yml logs --tail=100 vllm
```

- Not enough KV cache / `max_model_len` error: set `VLLM_MAX_MODEL_LEN=24576` (or `16384`) in `.env.vllm` and run the `up -d` command again.
- CUDA out of memory: something else still uses the GPU (check `nvidia-smi`).

**B5. Test vLLM directly.**

```bash
cd ~/sinamgpt-vllm && curl -s http://127.0.0.1:8000/v1/chat/completions -H "Authorization: Bearer $(grep '^VLLM_API_KEY=' .env.vllm | cut -d= -f2)" -H "Content-Type: application/json" -d '{"model":"Qwen/Qwen3-8B","messages":[{"role":"user","content":"Say hello in one short sentence."}],"max_tokens":40}'
```

The answer is JSON with a short greeting in `choices[0].message.content`.

**B6. Update and build the app.**

```bash
cd "$APP_DIR" && git pull --ff-only origin main
```

```bash
cd "$APP_DIR" && npm ci --include=dev && npm run build
```

**B7. Add the vLLM settings to `.env.local`.** The first command removes old copies of these lines (a key listed twice is read differently by different tools); the second appends the new values with the key from `.env.vllm`. Secrets are not touched.

```bash
cd "$APP_DIR" && sed -i -E '/^(VLLM_BASE_URL|VLLM_API_KEY|VLLM_TOOL_CALLING|VLLM_MAX_CONCURRENT|DEFAULT_MODEL)=/d' .env.local
```

```bash
cd "$APP_DIR" && printf '\n# vLLM (Ollama -> vLLM upgrade)\nVLLM_BASE_URL=http://127.0.0.1:8000\nVLLM_API_KEY=%s\nVLLM_TOOL_CALLING=1\nVLLM_MAX_CONCURRENT=8\nDEFAULT_MODEL=vllm:Qwen/Qwen3-8B\n' "$(grep '^VLLM_API_KEY=' ~/sinamgpt-vllm/.env.vllm | cut -d= -f2)" >> .env.local
```

```bash
cd "$APP_DIR" && diff "$(cat ~/sinamgpt-last-backup)/.env.local" .env.local
```

The diff must show only the new vLLM lines (and removed old `VLLM_*` / `DEFAULT_MODEL` lines, if you had any).

**B8. Start the app** (see the table) and check it answers:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$APP_URL/login"
```

Expect `200`. On this first start the app switches off the Ollama models and creates the `vllm` provider from `.env.local`.

### Part C — Admin setup (do it right away)

Chat does not work until a vLLM model is activated. In the browser, signed in as admin:

1. **Admin → Providers → vllm.** Check URL `http://127.0.0.1:8000`, that a key is saved, **Tool calling configured on this server** is on, and Max concurrent is `8`. Click **Test connection**, then **Sync models**. (If the server already had a `vllm` provider from an older setup, enter the URL and the key from `~/sinamgpt-vllm/.env.vllm` here.)
2. **Admin → Models.** **Activate** `vllm:Qwen/Qwen3-8B`. The old Ollama models show as inactive; leave them.
3. **Admin → Settings → Default model:** choose `vllm:Qwen/Qwen3-8B` and save.
4. Open **Chat**: start a new chat, then open an old chat and send a message with the new model.
5. Optional, for OpenCode and other products: **Admin → Settings → Features → Developer API** (and **Dev lab**) On. See [DEVELOPER-API.md](./DEVELOPER-API.md).

Downtime ends here.

### Part D — Verify

These scripts read `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env.local`. If the admin password was changed in the app, add `TEST_USERNAME=... TEST_PASSWORD=...` in front of each command.

```bash
cd "$APP_DIR" && BASE_URL="$APP_URL" npm run test:smoke
```

```bash
cd "$APP_DIR" && BASE_URL="$APP_URL" npm run test:vllm
```

With Developer API on, a user key can also run the tool-call check: `BASE_URL="$APP_URL" SINAMGPT_API_KEY=sinam_... TEST_API_MODEL=vllm:Qwen/Qwen3-8B npm run test:api`.

### Part E — Clean up (after a few good days)

Remove the Ollama models to free disk. Ollama only needs to run for the removal; idle, it does not load models onto the GPU.

```bash
sudo systemctl start ollama && ollama list
```

```bash
ollama rm MODEL_NAME
```

Repeat `ollama rm` for each listed model, then stop Ollama again:

```bash
sudo systemctl stop ollama
```

Keep the backup folder from B2 until you are sure you will not roll back.

## Rollback

Use this if the new version does not work and you need the old one back. Chats written after the upgrade stay in the `data-failed-*` folder; they are not merged back.

1. **Stop the app.**
2. Stop vLLM. Never add `-v`: that deletes the downloaded model.

```bash
cd ~/sinamgpt-vllm && docker compose --env-file .env.vllm -f docker-compose.vllm.yml down
```

3. Restore the data, settings and old code:

```bash
cd "$APP_DIR" && BK=$(cat ~/sinamgpt-last-backup) && mv data "data-failed-$(date +%Y%m%d-%H%M)" && cp -a "$BK/data" data && cp -a "$BK/.env.local" .env.local && git checkout "$(cat ~/sinamgpt-before-vllm.commit)"
```

```bash
cd "$APP_DIR" && npm ci --include=dev && npm run build
```

4. Start Ollama again and enable it at boot:

```bash
sudo systemctl enable --now ollama
```

5. **Start the app.** The checkout above leaves Git on a detached commit; run `git checkout main` before the next upgrade attempt.

## Questions

**Can vLLM use the models Ollama already downloaded?** Not reliably. vLLM's GGUF support is experimental and limited to some model families; the supported path is the Hugging Face checkpoint, which this guide downloads.

**Can we keep several models like before?** Each vLLM process serves one model and reserves its GPU memory up front. More models need more GPUs, or a careful split of one GPU between smaller models, each added in Admin → Providers. See [VLLM-SETUP.md](./VLLM-SETUP.md).

**Which model should we use?** Start with Qwen3-8B, the tested profile. Try larger or quantized models later, one change at a time, and measure with `npm run test:vllm` and the Model lab.
