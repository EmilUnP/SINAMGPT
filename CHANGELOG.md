# Changelog

All notable changes to **SINAMGPT** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Nothing queued yet — add notes here before the next release.

## [1.0.0] — 2026-08-08

First public release of SINAMGPT: a local company GPT for SINAM, powered by Ollama and SQLite.

### Added
- **Auth** — register, login, logout, and signed session cookies
- **Chat** — ChatGPT-style UI, streaming replies, model picker, new/delete conversations
- **History** — per-user conversations and messages stored in local SQLite (`data/owngpt.db`)
- **Guest mode** — try the model from the home page without an account (daily limit)
- **Admin panel** (`/admin`)
  - User management (enable/disable, activity)
  - Model enable/disable for Ollama installs
  - Guest limit and related settings
  - **Live usage** — active generations, tokens/sec, TTFT, history
  - **Knowledge** — company/project docs injected as lightweight RAG (EN / AZ / RU / TR aware)
  - **Guardrails** — persona, allowed/blocked topics, keywords, refusal text
- **Multi-language helpers** for knowledge matching and safety rules (EN / AZ / RU / TR)
- **Setup script** (`npm run setup`) and Windows helper (`start.bat`)
- **Docs** — README, this changelog, and versioning guide

### Security
- Passwords hashed with bcrypt
- Local-only AI via Ollama (no third-party cloud LLM APIs)
- Secrets and SQLite data stay out of git (`.env*`, `/data`)

[Unreleased]: https://github.com/EmilUnP/SINAMGPT/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/EmilUnP/SINAMGPT/releases/tag/v1.0.0
