import fs from "fs";
import path from "path";

const root = process.cwd();
const envLocal = path.join(root, ".env.local");
const envExample = path.join(root, ".env.example");
const dataDir = path.join(root, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log("Created data/ for SQLite database");
}

if (!fs.existsSync(envLocal) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envLocal);
  console.log("Created .env.local from .env.example — set SESSION_SECRET and ADMIN_PASSWORD");
} else if (fs.existsSync(envLocal)) {
  console.log(".env.local already exists");
}

console.log(`
SINAMGPT setup ready.

1) Start official vLLM on a Linux GPU host or Docker Desktop with WSL2:
   Copy .env.vllm.example to .env.vllm, set VLLM_API_KEY and choose your GPU profile.
   docker compose --env-file .env.vllm -f docker-compose.vllm.yml up -d
   Windows shortcut: start-vllm.bat
   Full instructions: docs/VLLM-SETUP.md

2) Set VLLM_BASE_URL and VLLM_API_KEY in .env.local before the first startup.
   Existing installs: edit the vllm provider in Admin > Providers instead.

3) Set ADMIN_USERNAME and a unique ADMIN_PASSWORD (min 10 characters) in .env.local

4) Start the app:
   npm run dev -- --port 3055

Open http://localhost:3055
- Normal users: register and chat
- Admin: sign in with ADMIN_* credentials → /admin
- Providers: Test connection, configure tool calling, Sync models.
- Models: Activate a served model, then choose the default in Settings.
`);
