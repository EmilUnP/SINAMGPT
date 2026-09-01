@echo off
cd /d "%~dp0"
echo Starting tiny vLLM-compatible server on http://127.0.0.1:8000
echo First run downloads HuggingFaceTB/SmolLM2-135M-Instruct (~270 MB).
echo Official vLLM is not used: it does not install on this Windows PC.
python scripts\tiny-vllm-server.py
