# vLLM deployment and migration

SINAMGPT now routes model inference through vLLM's OpenAI-compatible API. Ollama is no longer an active provider kind. The app can stay on Windows while inference runs on a Linux GPU server. The former tiny Transformers server and its misleading vLLM launcher have been replaced by official vLLM containers.

## 1. Start the GPU service

Use Linux with Docker Compose, a compatible NVIDIA driver, and NVIDIA Container Toolkit. Windows development requires Docker Desktop's Linux/WSL2 backend with GPU support; vLLM does not run natively on Windows.

```bash
cp .env.vllm.example .env.vllm
# Edit .env.vllm: set a private VLLM_API_KEY and choose your model/GPU profile.
docker compose --env-file .env.vllm -f docker-compose.vllm.yml up -d
docker compose --env-file .env.vllm -f docker-compose.vllm.yml logs -f vllm
```

On Windows, `start-vllm.bat` uses the same Compose file. Its first run creates `.env.vllm` if needed and asks you to fill it in. First boot downloads the image and model weights; wait for the service to become healthy. The image is pinned to `vllm/vllm-openai:v0.32.0`; validate your GPU driver against that image before deployment.

The supplied profile serves **Qwen/Qwen3-8B**, with 8,192 context tokens and up to 32 scheduled sequences. This is a starting configuration, not a measured capacity guarantee. Weights, KV cache, context length, and parallel sequences all consume VRAM. For an 8 GB laptop development GPU, start with `Qwen/Qwen3-1.7B`, context 4,096, and 4 sequences. Reduce the profile further if needed. Larger models and longer contexts may need quantized checkpoints or multiple GPUs. Stop old inference services yourself if their loaded models are occupying the same GPU.

The container binds to loopback by default. If the app is on another machine, set `VLLM_BIND_HOST` to the server's private LAN address, allow only the app host through the firewall, and use that address in Admin. Keep the inference service private: vLLM's API key does not protect every server endpoint. For deployments beyond a trusted private network, put authentication and access restrictions on a reverse proxy.

## 2. Connect the app

For a **new database**, set these in `.env.local` before starting the app:

```dotenv
VLLM_BASE_URL=http://127.0.0.1:8000
VLLM_API_KEY=your-private-server-key
VLLM_MAX_CONCURRENT=32
VLLM_TOOL_CALLING=1
DEFAULT_MODEL=vllm:Qwen/Qwen3-8B
```

For an **existing database**, the saved provider configuration wins over environment defaults. In **Admin → Providers → vllm**, set the URL, matching API key, concurrency limit, and tool-calling checkbox. Test the connection, then **Sync models**. In **Admin → Models**, activate the served model. Choose it in **Settings → Default model**. Both a root URL and a URL ending in `/v1` work.

Model ids in the app are qualified: `vllm:Qwen/Qwen3-8B`, or `gpu-2:Qwen/Qwen3-8B` for another provider. Requests to vLLM use its native id. Do not assume an Ollama tag identifies the same checkpoint in vLLM. The model selected by `--model` must be a supported Hugging Face checkpoint or local model path; `--served-model-name` can give it an explicit alias. Checkpoints are not converted by this app.

## 3. Tools and media

The Compose profile uses the Qwen3-compatible `hermes` tool parser, `qwen3` reasoning parser, and disables thinking by default through the chat template. Change these options when changing model families; remove parser options for a model that does not support them.

For function calls, enable **Tool calling configured** in the provider and sync models. The app also checks model family hints and its existing feature gates. Enable Internet search/tool features separately in Settings when required. A healthy `/v1/models` response proves connectivity, not that function calling is correctly configured. Verify a real tool-assisted chat in the app and inspect **Admin → Usage → Tools**.

Images use OpenAI `image_url` parts, and microphone WAV clips use `input_audio`. Your chosen model and server must support those inputs; text-only Qwen3 does not. Some audio models require vLLM audio dependencies or a separate runtime. Name-based capability badges are hints, so validate media with the exact deployed model. No embeddings or speech endpoint was added: the existing knowledge search remains keyword based.

## 4. Existing-data migration

At the first startup with this code, a one-time transaction:

- Creates the default `vllm` provider if missing; preserves an existing vLLM URL, key, concurrency and tool settings.
- Disables every legacy Ollama provider and its model rows, and removes fallbacks/default settings that reference them.
- Preserves accounts, conversations, messages, attachments, model names and usage history. Old conversations can be opened; select an active vLLM model to continue them.

Ollama providers cannot be re-added through the API or UI. Legacy model rows remain for history and are excluded from active catalogs. Old `OLLAMA_*` environment variables are ignored. Back up `data/` and retain your stable encryption secret before deploying to the company server. Rolling back code alone does not re-enable legacy providers; use the deployment backup for a complete rollback.

## 5. Parallel traffic and verification

The app holds one provider slot for the entire streaming generation. Stop/disconnect cancels the HTTP request and releases the slot; queued cancelled requests are removed. A full queue or expired wait produces a retryable diagnostic. No automatic retry happens after streaming starts, preventing duplicated answers.

| Setting | Default | Meaning |
| --- | --- | --- |
| Provider max concurrent | 32 for a new default provider | Generations admitted per Node process; 0 removes the app limit |
| `LLM_MAX_QUEUE` | 256 | Maximum waiting requests per provider when a limit is set |
| `LLM_QUEUE_TIMEOUT_MS` | 30000 | Maximum admission wait |
| `LLM_REQUEST_TIMEOUT_MS` | 180000 | Inference deadline after admission; helper/tool callers may use their own timeout |
| vLLM `--max-num-seqs` | 32 in this profile | Scheduler capacity; separate from the app limit |

Limits are per Node process, not distributed. For multiple app replicas, enforce aggregate admission at a gateway or shared queue and measure GPU capacity. Additional replicas of the **same** served model can be placed behind a private load balancer. Different base models generally need separate vLLM services/GPU allocations, added as providers. The app's fallback is failover, not load balancing, and requires a matching native model id in the synced fallback catalog.

```bash
npm test
npm run build
# With the app, provider, credentials and an activated model configured:
npm run test:vllm
# Direct engine load (uses VLLM_BASE_URL / VLLM_API_KEY from .env.local):
npm run test:vllm:load -- --concurrency 4 --requests 16
# Through the app's Developer API (enable it and set SINAMGPT_API_KEY):
npm run test:vllm:load -- --app --concurrency 8 --requests 32
```

The load test reports successes, failures, latency p50/p95, p95 time to first token and aggregate output tokens/second. `LOAD_TEST_MODEL` selects an exact model id; otherwise it chooses the first listed model. Run against a test deployment and increase concurrency gradually. Measure both engine and app paths with representative prompts; a serving-runtime change does not by itself establish answer accuracy or tool correctness.

## Official references

- [GPU installation and Windows/WSL requirements](https://docs.vllm.ai/en/latest/getting_started/installation/gpu/)
- [Docker deployment](https://docs.vllm.ai/en/latest/deployment/docker/)
- [Tool calling and model-specific parsers](https://docs.vllm.ai/en/latest/features/tool_calling/)
- [OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
- [vLLM releases](https://github.com/vllm-project/vllm/releases)
