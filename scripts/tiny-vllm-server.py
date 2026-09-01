#!/usr/bin/env python3
"""Tiny OpenAI-compatible /v1 server for SINAMGPT's vLLM provider.

Official vLLM does not install on this Windows machine (long paths / no Linux
wheels). SINAMGPT's vLLM adapter speaks /v1/models and /v1/chat/completions,
so this script serves that API with a freshly downloaded 135M instruct model.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import Lock

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import uvicorn

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HOME", str(ROOT / "data" / "hf-cache"))

MODEL_ID = os.environ.get("TINY_VLLM_MODEL", "HuggingFaceTB/SmolLM2-135M-Instruct")
HOST = os.environ.get("TINY_VLLM_HOST", "127.0.0.1")
PORT = int(os.environ.get("TINY_VLLM_PORT", "8000"))

print(f"Loading {MODEL_ID} (first run downloads ~270 MB)…", flush=True)
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
device = "cuda" if torch.cuda.is_available() else "cpu"
model = AutoModelForCausalLM.from_pretrained(MODEL_ID).to(device)
model.eval()
generate_lock = Lock()
print(f"Ready on http://{HOST}:{PORT}/v1  device={device}", flush=True)

app = FastAPI()


class ChatMessage(BaseModel):
    role: str
    content: str | list | None = ""


class ChatRequest(BaseModel):
    model: str = MODEL_ID
    messages: list[ChatMessage]
    stream: bool = False
    max_tokens: int = Field(default=80, ge=1, le=256)
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


def generate_text(messages: list[ChatMessage], max_tokens: int, temperature: float) -> str:
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
    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    with generate_lock, torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=temperature > 0,
            temperature=max(temperature, 0.01),
            pad_token_id=tokenizer.pad_token_id,
        )
    new_tokens = out[0, inputs["input_ids"].shape[-1] :]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


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
    text = generate_text(req.messages, req.max_tokens, req.temperature)
    if not req.stream:
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

    def chunks():
        payload = {
            "id": "chatcmpl-tiny",
            "object": "chat.completion.chunk",
            "choices": [
                {
                    "index": 0,
                    "delta": {"content": text},
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(payload)}\n\n"
        done = {
            "id": "chatcmpl-tiny",
            "object": "chat.completion.chunk",
            "choices": [
                {"index": 0, "delta": {}, "finish_reason": "stop"}
            ],
        }
        yield f"data: {json.dumps(done)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(chunks(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
