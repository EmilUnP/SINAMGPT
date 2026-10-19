# Use SINAMGPT from products and OpenCode

Create a key in **Developer > API keys** after the administrator enables Developer API and activates a model. Key creation returns the full secret once. The database stores its hash, not its plaintext. Requests use `Authorization: Bearer sinam_...` (or `X-Api-Key`).

| Setting | Value |
| --- | --- |
| Base URL | `https://YOUR_DOMAIN/api/v1` |
| Discover model IDs | `GET /api/v1/models` |
| Chat and coding tool calls | `POST /api/v1/chat/completions` |
| Example model ID | `vllm:Qwen/Qwen3-8B` — use the actual ID from discovery |
| Key | Your user's Developer key, not the vLLM provider key |

## OpenCode v1

Save as `opencode.json` in your project (or merge into an existing config):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "sinam/vllm:Qwen/Qwen3-8B",
  "provider": {
    "sinam": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "SINAMGPT",
      "options": {
        "baseURL": "https://YOUR_DOMAIN/api/v1",
        "apiKey": "{env:SINAMGPT_API_KEY}"
      },
      "models": {
        "vllm:Qwen/Qwen3-8B": {
          "name": "Qwen3 8B",
          "tool_call": true,
          "limit": { "context": 32768, "output": 4096 }
        }
      }
    }
  }
}
```

Set the key in the terminal that starts OpenCode:

```bash
export SINAMGPT_API_KEY=sinam_YOUR_KEY
opencode
```

PowerShell: `$env:SINAMGPT_API_KEY = 'sinam_YOUR_KEY'`. Alternatively, remove `options.apiKey`, run `/connect`, choose Other and enter provider ID `sinam` plus your key. Select the model with `/models`.

The context must match **your running server's** `--max-model-len`, not the model's advertised maximum. The production example uses 32,768 (Developer > How to call generates that by default); the standalone vLLM example defaults to 16,384, so lower `context` if you use it. OpenCode sends its instructions and every tool definition with each request, which takes a large share of the context before your files. Output of 4,096 tokens leaves room for whole-file edits; the gateway accepts up to 8,192.

The gateway's prompt budget (Dev lab, default 100,000 characters) is sized for that 32k context. If you lower the server context, the budget does not need to change: vLLM rejects an oversized prompt with HTTP 400, which OpenCode reports.

Use `@ai-sdk/openai-compatible` for Chat Completions. The gateway does not implement `/responses` or Anthropic's `/messages`. OpenCode v2 uses a different configuration shape (`providers` / `package` / `settings`); follow its [v2 custom-provider guide](https://opencode.ai/v2/docs/providers) with the same app base URL, key, model ID and actual context limit. The generated Developer UI snippet currently targets v1.

## Supported chat contract

- Text/system/developer messages, assistant `tool_calls` with nullable content, and `role: "tool"` results linked by `tool_call_id`. Developer instructions map to the model's system role.
- Function tool definitions, optional strict flag, auto/none/required/named `tool_choice`, and `parallel_tool_calls`. The gateway transports calls; the client validates and executes tools under its own permissions.
- Streaming indexed tool-call fragments with IDs, names and JSON argument strings. Non-streaming requests reassemble interleaved parallel calls. Finish reasons (`stop`, `length`, `tool_calls`, etc.) are preserved.
- Usage totals; `stream_options.include_usage` adds a final SSE event with an empty choices array, followed by `[DONE]`. Consumers must handle empty choices.
- Temperature, top-p, max tokens, stop sequences, seed, presence/frequency penalties, text/JSON object/JSON schema response formats. Support for structured outputs and strict schemas also depends on the upstream model/runtime.
- Vision data URLs for models enabled for images. Remote image URLs are rejected.

One completion choice per request (`n=1`), at most 512 messages and 128 function tools. Admin's configurable total character budget covers text, historical tool arguments, tool definitions and response schemas. vLLM separately enforces tokens. Legacy `functions` / `function_call`, multiple choices and unsupported tool types are rejected. This is a Chat Completions subset, not the entire OpenAI API.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 401 | Correct user key; key not revoked/disabled; user active |
| 403 | Developer API feature enabled; requested model activated |
| 400 tool configuration | vLLM started with matching parser; provider tools enabled; catalog refreshed |
| 400 prompt/context | Dev lab character budget and actual server context; reduce history/output or increase tested server context |
| 429 | Per-key RPM budget or upstream limit; respect `Retry-After` when supplied |
| 503 | Gateway disabled, admission queue full/timed out, or upstream unavailable |
| 502 | Upstream failure or provider credential/configuration error |
| Chat works, edits do not | Choose a model with native tool support; use the Chat Completions adapter; inspect returned tool calls and client tool permissions |
| Browser app blocked | Configure allowed CORS origins in Dev lab; keep production secrets on your backend |

Use `npm run test:api` against a running deployment to test the tool round trip. See [SERVER-DEPLOYMENT.md](./SERVER-DEPLOYMENT.md) for setup and load checks. Protocol compatibility does not guarantee a model will make correct code edits; evaluate your actual tasks before wider rollout.

References: [OpenCode custom providers](https://opencode.ai/docs/providers/), [OpenCode configuration schema](https://opencode.ai/config.json), [vLLM tool calling](https://docs.vllm.ai/en/latest/features/tool_calling/).
