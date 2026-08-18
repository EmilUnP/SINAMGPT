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
OwnGPT setup ready.

1) Make sure Ollama is running:
   ollama serve

2) Pull the company RTX 5090 fleet (activate each in Admin → Models):
   ollama pull gemma3:4b
   ollama pull gemma3:12b
   ollama pull gemma4:e4b
   ollama pull gemma4:26b
   ollama pull gemma4:31b
   ollama pull llama4:scout
   ollama pull llama4:maverick
   ollama pull qwen3.5:9b
   ollama pull qwen3:32b

3) Set ADMIN_USERNAME and a unique ADMIN_PASSWORD (min 10 characters) in .env.local

4) Start the app:
   npm run dev

Open http://localhost:3055
- Normal users: register and chat
- Admin: sign in with ADMIN_* credentials → /admin
`);
