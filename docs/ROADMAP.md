# SINAMGPT — Product roadmap

Living plan for features that make SINAMGPT more valuable as a **local company GPT**.  
Update status here as work lands. Pair with [CHANGELOG.md](../CHANGELOG.md) when shipping.

**Status key:** `planned` · `in progress` · `done` · `deferred`

**Shipped in [v1.1.0](../CHANGELOG.md#110--2026-08-09)** (2026-08-09): citations, projects, share links, Fast/Smart, rewrite shortcuts.  
**Hardening in [v1.2.0](../CHANGELOG.md#120--2026-08-09)** (2026-08-09): language/knowledge fix, project rename/delete + 5/user cap, share/UI polish, auth & guest security.

---

## Active track (chosen 2026-08-09 · shipped in v1.1.0)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Cited company answers** | `done` | Show which knowledge docs backed a reply; admin on/off in Knowledge settings |
| 2 | **Projects / folders** | `done` | Group chats by project; project-scoped knowledge |
| 3 | **Shareable internal link** | `done` | Share chat with logged-in colleagues on the LAN |
| 4 | **Fast vs smart + per-chat model** | `done` | Quick/deep presets; remember last model per chat |
| 5 | **Rewrite shortcuts** | `done` | One-click shorter / more formal / continue on last answer |

---

### 1. Cited company answers

**Goal:** Under assistant replies, show e.g. `From: SESDA overview · Company profile` when knowledge was used.

**Scope**
- Persist citation list on assistant messages (ids + titles)
- Stream/load citations into chat UI (logged-in + optional guest)
- Admin: Knowledge settings → **Show citations** toggle (default on)
- If knowledge disabled or no docs matched → no citation row

**Done when:** Toggle works; citations appear only when enabled and sources exist; survive reload of the conversation.

---

### 2. Projects / folders

**Goal:** Organize chats like work (e.g. SESDA, Internal portal) with optional project-specific knowledge.

**Scope**
- `projects` table; conversation belongs to a project (nullable = Inbox)
- Sidebar: project list + chats inside
- Knowledge docs can tag `project_id` or project tags; retrieval prefers that project’s docs
- Admin or user can create/rename/archive projects

**Done when:** User can create a project, move chats into it, and answers prefer that project’s knowledge.

---

### 3. Shareable internal link

**Goal:** “Share this chat” → link that another logged-in user on the same deployment can open (read-only first).

**Scope**
- Share token on conversation; `GET /share/[token]` or `/chat/shared/[token]`
- Auth required; no public/anonymous share
- Owner can revoke share
- Read-only view v1 (optional: allow continue later)

**Done when:** Owner shares, colleague opens while logged in, sees the thread; revoke works.

---

### 4. Fast vs smart + per-chat model

**Goal:** Clear speed/quality choice without digging into admin generation settings.

**Scope**
- UI: Fast / Smart (maps to configurable model ids in admin or env)
- Conversation already stores `model` — keep updating it when user switches
- Remember last Fast/Smart (or last model) in `localStorage` + per conversation

**Done when:** Switching Fast/Smart changes the model for the next reply and sticks for that chat.

---

### 5. Rewrite shortcuts

**Goal:** One-click improve last assistant message without retyping.

**Scope**
- Actions on last assistant bubble: **Shorter**, **More formal**, **Continue**
- Server mode e.g. `rewrite` with instruction; replaces or appends assistant message
- Works with streaming; respects knowledge/guardrails

**Done when:** Each action regenerates a useful variant of the last answer in-place.

---

## Future backlog (not started)

Ideas kept for later — not committed to a sprint.

| Idea | Why it matters |
|------|----------------|
| File / PDF → knowledge | Real company adoption |
| Chat modes (Ask SINAM / Work / Write) | Productized feel |
| Better RAG (chunk + local embeddings) | Sharper knowledge hits |
| Audit log | IT / compliance |
| Departments / knowledge visibility | Multi-team |
| Export chat (Markdown / PDF) | Manager handoffs |
| Backup button (`owngpt.db`) | Ops safety |
| Voice input | Quick questions |
| ⌘K command palette | Power users |
| First-login onboarding | Reduce confusion |

---

## How to update this doc

1. When starting a feature → set status to `in progress`.
2. When merged/usable → set to `done` and add a line under CHANGELOG **Unreleased** (promote into a version section on release).
3. When parking → `deferred` + one-line reason.
4. New big ideas go under **Future backlog** first; promote into **Active track** only when chosen.
