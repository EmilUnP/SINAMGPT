#!/usr/bin/env python3
"""Tiny OpenAI-compatible /v1 server for SINAMGPT's vLLM provider.

Not official vLLM. Speaks /v1 so Admin → Providers → vLLM can use it.
Streams tokens as they are generated (the first version waited for the full
reply, which made a 135M model feel slow).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import Lock, Thread

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
import torch
import uvicorn

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HOME", str(ROOT / "data" / "hf-cache"))

MODEL_ID = os.environ.get("TINY_VLLM_MODEL", "HuggingFaceTB/SmolLM2-135M-Instruct")
HOST = os.environ.get("TINY_VLLM_HOST", "127.0.0.1")
PORT = int(os.environ.get("TINY_VLLM_PORT", "8000"))

print(f"Loading {MODEL_ID}…", flush=True)
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=dtype).to(device)
model.eval()
generate_lock = Lock()
print(f"Ready on http://{HOST}:{PORT}/v1  device={device} dtype={dtype}", flush=True)

app = FastAPI()


class ChatMessage(BaseModel):
    role: str
    content: str | list | None = ""


class ChatRequest(BaseModel):
    model: str = MODEL_ID
    messages: list[ChatMessage]
    stream: bool = False
    max_tokens: int = Field(default=64, ge=1, le=512)
    temperature: float = 0.2


def as_text(content: str | list | None) -> str:
    if isinstance(content, str):
        return content
    if not content:
        return ""
    parts = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            parts.append(str(item.get("text") or ""))
        elif isinstance(item, str):
            parts.append(item)
    return "\n".join(parts)


def build_inputs(messages: list[ChatMessage]):
    chat = [
        {"role": message.role, "content": as_text(message.content)}
        for message in messages
        if message.role in {"system", "user", "assistant"}
    ]
    prompt = tokenizer.apply_chat_template(
        chat,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(prompt, return_tensors="pt")
    prompt_tokens = int(inputs["input_ids"].shape[-1])
    return inputs.to(device), prompt_tokens


def generate_kwargs(inputs, max_tokens: int, temperature: float, streamer=None):
    kwargs = {
        **inputs,
        "max_new_tokens": max_tokens,
        "do_sample": False,
        "pad_token_id": tokenizer.pad_token_id,
        "eos_token_id": tokenizer.eos_token_id,
        "use_cache": True,
    }
    if streamer is not None:
        kwargs["streamer"] = streamer
    return kwargs


@app.get("/v1/models")
def list_models() -> dict:
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_ID,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "local",
            }
        ],
    }


@app.post("/v1/chat/completions")
def chat(req: ChatRequest):
    started = time.perf_counter()
    inputs, prompt_tokens = build_inputs(req.messages)

    if not req.stream:
        with generate_lock, torch.no_grad():
            out = model.generate(**generate_kwargs(inputs, req.max_tokens, req.temperature))
        new_tokens = out[0, inputs["input_ids"].shape[-1] :]
        text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        ms = int((time.perf_counter() - started) * 1000)
        print(
            f"[gen] prompt={prompt_tokens} new={int(new_tokens.shape[-1])} {ms}ms",
            flush=True,
        )
        return {
            "id": "chatcmpl-tiny",
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop",
                }
            ],
        }

    streamer = TextIteratorStreamer(
        tokenizer,
        skip_prompt=True,
        skip_special_tokens=True,
    )

    def run_generate():
        with generate_lock, torch.no_grad():
            model.generate(
                **generate_kwargs(inputs, req.max_tokens, req.temperature, streamer),
            )

    Thread(target=run_generate, daemon=True).start()

    def chunks():
        first = True
        new_tokens = 0
        for piece in streamer:
            if not piece:
                continue
            new_tokens += 1
            if first:
                print(
                    f"[ttft] prompt={prompt_tokens} {int((time.perf_counter() - started) * 1000)}ms",
                    flush=True,
                )
                first = False
            payload = {
                "id": "chatcmpl-tiny",
                "object": "chat.completion.chunk",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": piece},
                        "finish_reason": None,
                    }
                ],
            }
            yield f"data: {json.dumps(payload)}\n\n"
        done = {
            "id": "chatcmpl-tiny",
            "object": "chat.completion.chunk",
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        yield f"data: {json.dumps(done)}\n\n"
        yield "data: [DONE]\n\n"
        print(
            f"[gen] prompt={prompt_tokens} pieces={new_tokens} {int((time.perf_counter() - started) * 1000)}ms",
            flush=True,
        )

    return StreamingResponse(chunks(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
