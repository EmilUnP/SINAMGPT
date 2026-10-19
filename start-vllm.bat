@echo off
setlocal
cd /d "%~dp0"
where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is required. Use Docker Desktop with WSL2 and NVIDIA GPU support,
  echo or run the compose command on your Linux GPU server. See docs\VLLM-SETUP.md.
  exit /b 1
)
if not exist .env.vllm (
  copy .env.vllm.example .env.vllm >nul
  echo Created .env.vllm. Set VLLM_API_KEY and choose a model for your GPU, then run again.
  exit /b 1
)
echo Starting official vLLM. The first run downloads the image and model weights.
docker compose --env-file .env.vllm -f docker-compose.vllm.yml up -d
if errorlevel 1 exit /b 1
echo Service started. Check readiness with:
echo docker compose --env-file .env.vllm -f docker-compose.vllm.yml logs -f vllm
endlocal
