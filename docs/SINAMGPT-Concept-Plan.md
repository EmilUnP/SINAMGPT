# SINAMGPT — Conceptual Plan for Management

**Document type:** Concept / first presentation  
**Audience:** Managers & decision makers  
**Status:** Proposed plan (nothing assumed built)  
**Company context:** SINAM Ltd — internal productivity & knowledge assistant  
**Working name:** SINAMGPT  

Shipped product status (what is actually running) lives in [README.md](../README.md), [CHANGELOG.md](../CHANGELOG.md), and [ROADMAP.md](./ROADMAP.md). **Current release: v1.10.0.**  

---

## 1. Why this document exists

This is a **first-pass conceptual plan**. It describes what we *want* to build for SINAM employees: a private, company-owned AI chat that understands SINAM products and policies, stays on our infrastructure, and can be governed by admins.

It is **not** a delivery report, a technical design, or a claim that software already exists. Treat every capability below as a **planned direction** for discussion and approval.

---

## 2. One-sentence vision

> Give every SINAM employee a ChatGPT-like assistant that runs locally (or on company LAN), knows company context, follows safety rules we control, and never sends our prompts or documents to a third-party cloud LLM.

---

## 3. The problem we want to solve

| Today (typical) | Pain |
|-----------------|------|
| Public ChatGPT / cloud AI | Company questions leave the building; unclear data retention |
| Scattered docs / websites | People re-ask the same product and process questions |
| No shared “company brain” | Answers depend on who you ask and when they last updated a file |
| No internal AI policy layer | Hard to say what the assistant may / may not discuss |
| Generic tools | Not tuned for SESDA, Farabi, Biletim.az, GoMap, GoNav, Yurdum, portals, etc. |

**Goal:** one trusted internal place to ask work questions — with company facts, controlled access, and visible governance.

---

## 4. What we propose to build (concept)

### 4.1 Product idea

**SINAMGPT** — a local company GPT for employees:

- Looks and feels like modern chat (streaming answers, conversation history)
- Runs on a company machine / LAN models (e.g. Ollama and/or vLLM) — **no third-party cloud LLM APIs** as the default path
- Can be seeded with SINAM knowledge, then **kept current by admins** without rewriting the whole product
- Includes **guardrails** so unsafe or out-of-policy requests can be refused
- Includes an **Admin** area for users, models, knowledge, safety policy, and audit visibility

### 4.2 Design principles (non-negotiables for the plan)

1. **Local-first** — models and chat data stay under company control  
2. **Admin-owned content** — product facts and policy text should be editable from Admin, not only by code changes  
3. **Safe by default** — layered checks (keywords, jailbreak-style abuse, secrets/PII patterns) plus soft persona guidance  
4. **Multilingual workplace** — design for EN / AZ / RU / TR from day one  
5. **Useful for real work** — writing help, summaries, internal product Q&A — not a toy demo  
6. **Simple ops** — one company host, SQLite-style local storage, clear backup story later  

---

## 5. Who it is for

| Role | How they would use it |
|------|------------------------|
| **Employees** | Sign in, chat, save history, organize work into project folders, share a read-only link with colleagues |
| **Guests / try mode** | Optional limited try-chat on the landing page (no full history) to reduce friction |
| **Admins / operators** | Manage users & models, maintain knowledge library, tune guardrails, review usage and audit events |
| **Managers (you)** | Approve scope, risk posture, hardware, and rollout phases |

---

## 6. Planned capability map

Everything in this section is **planned scope**, grouped for discussion.

### A. Chat experience

- Streaming, ChatGPT-style conversations  
- Model picker + Fast / Smart presets (admin maps which models those mean)  
- Rewrite helpers (shorter / more formal / continue)  
- Light / dark / system theme  
- Per-user conversation history  

### B. Work organization

- Personal **project folders** (limited count per user) to group chats  
- Project-tagged knowledge that is preferred when chatting inside that project  
- Internal **share links** for logged-in colleagues (read-only; owner can revoke / rotate)  

### C. Company knowledge (the “SINAM brain”)

- Admin-managed library of company / product / FAQ documents  
- Lightweight retrieval so relevant facts are injected into answers when the question looks company-related  
- Optional **citations** (“From: …”) so employees can see which docs were used  
- Starter pack based on public SINAM materials (e.g. sinam.net themes) — then **living updates in Admin**  
- Seed actions planned as: add missing titles / refresh template titles / replace library (with clear warnings)  

### D. Guardrails & policy

- Soft policy: persona, allowed topics, refuse topics, extra rules (steers the model)  
- Hard checks: custom blocked keywords + built-in multilingual harm phrases, prompt-injection / jailbreak detection, secrets & PII patterns  
- Live **inspector** for admins to test a sample message and see why it was allowed or blocked  
- Event history for blocks / warnings  
- Quick-add suggestion chips for policy editing — stored as config, editable without a deploy  

### E. Admin & operations

- Users: enable/disable, registration / activity visibility  
- Models: which models employees may use  
- Live usage: active generations, rough speed metrics  
- Settings: generation knobs (temperature, max tokens, etc.), guest daily limits  
- **Audit trail** for important admin / auth / share / project actions (not every chat message)  

### F. Quality & trust

- Smoke-test suite against a running server (`test:chat` style) before wider rollout  
- Clear separation of **editable company content** vs **built-in safety engine**  

---

## 7. How it would look in the organization (story)

```text
Employee asks: “What is SESDA used for?”
        │
        ▼
┌───────────────────┐
│ Access & limits   │  signed-in / guest rules
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Guardrails        │  hard block if unsafe / out of policy
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Knowledge lookup  │  pull matching company docs (if company intent)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Local LLM         │  Ollama / vLLM on company machine or LAN
└─────────┬─────────┘
          ▼
   Answer (+ optional citation)
```

**Admin loop (ongoing, not one-time setup):**

1. Update knowledge entries when products change  
2. Tune policy chips / keywords when new workplace risks appear  
3. Review audit + guardrail events periodically  
4. Adjust Fast/Smart models as hardware allows  

---

## 8. Proposed delivery phases

Phasing is for **approval and planning**, not a commitment to dates until capacity is agreed.

| Phase | Theme | Outcomes to aim for |
|-------|--------|---------------------|
| **0 — Concept** | Align | This document; hardware & risk appetite; success criteria |
| **1 — Core chat** | Usefulness | Local models, login, streaming chat, history |
| **2 — Company value** | Adoption | Knowledge library + citations; projects; internal share |
| **3 — Safety & control** | Trust | Guardrails, inspector, events, admin policy editing |
| **4 — Ops maturity** | Scale inside SINAM | Audit trail, usage visibility, living Admin config, smoke tests |
| **5 — Next wave (candidates)** | Growth | PDF/file → knowledge; better RAG (embeddings); share → continue as copy; DB backup UX |

Phase 5 ideas are **candidates**, not promised in the first delivery.

---

## 9. What we are *not* proposing (at this stage)

To keep the first plan honest and focused:

- Not a public internet ChatGPT replacement for the world  
- Not sending company prompts to OpenAI / Anthropic / etc. as the primary path  
- Not full enterprise SSO / multi-tenant SaaS in phase 1  
- Not claiming embeddings / PDF upload / voice / department ACL until those phases are chosen  
- Not “set once forever” — company knowledge and policy are meant to be **living Admin work**  

---

## 10. Benefits we want managers to evaluate

| Benefit | Why it matters |
|---------|----------------|
| **Data stays closer to home** | Lower leakage risk vs random public AI use |
| **Consistent company answers** | One maintained knowledge library instead of hallway folklore |
| **Governable AI** | Policy + detectors + audit, not a black box on someone’s laptop |
| **Faster day-to-day work** | Drafting, summarizing, product FAQ in EN / AZ / RU / TR |
| **Lower long-term friction** | Marketing / product updates via Admin — not a full project redeploy for every fact change |
| **Fits SINAM product culture** | Can reflect SESDA, Farabi/SGRP, Biletim.az, maps/nav, Smart Village, portals |

---

## 11. Risks & open decisions

| Topic | Question for management |
|-------|-------------------------|
| **Hardware** | Which machine / GPU for models? Laptop demo vs dedicated host? |
| **Model size** | Fast small models vs smarter larger ones (VRAM trade-off) |
| **Access** | Employees only? Guest try mode on? Registration open or invite-only? |
| **Knowledge ownership** | Who updates product/FAQ docs weekly? |
| **Safety posture** | How strict on PII / secrets? Who reviews blocked events? |
| **Rollout** | Pilot team first, then wider SINAM? |
| **Backup** | Who is responsible for the local database and model host? |

---

## 12. Success criteria (draft — to agree)

We would consider the concept successful if, after a pilot:

1. Pilot users prefer SINAMGPT over pasting company questions into public AI for internal topics  
2. Admins can add/edit knowledge and policy without a developer deploy for routine content changes  
3. Unsafe / out-of-policy samples are blocked or refused in a testable inspector  
4. Answers about core SINAM products cite or clearly reflect maintained knowledge  
5. Ops can see who changed important settings (audit) and how the system is used (usage)  

---

## 13. Ask from managers (first meeting)

1. **Approve** exploring / building toward this local company GPT concept  
2. **Nominate** knowledge owners (products + HR/process FAQ)  
3. **Confirm** hardware / hosting assumption for phase 1  
4. **Choose** pilot group and risk posture (guest mode, registration, strict PII)  
5. **Agree** which phase is “must ship first” vs “nice later”  

---

## 14. Closing statement for the presentation

SINAMGPT is proposed as **SINAM’s own company assistant**: private by default, useful for real internal work, and controlled by people we trust — not as a one-off demo that freezes company facts into code.

If we build it, the operating model is simple:

- **Models** live on company infrastructure  
- **Facts & policy** live in Admin  
- **Safety & audit** stay visible  
- **Employees** get a single place to ask and work  

---

## Appendix A — Suggested slide outline (10–12 min)

1. Title & one-sentence vision  
2. Problem (public AI + scattered knowledge)  
3. Proposed product (SINAMGPT)  
4. Principles (local, admin-owned, safe, multilingual)  
5. User roles (employee / admin / manager)  
6. Capability map (chat → knowledge → guardrails → admin)  
7. End-to-end story diagram  
8. Phased plan  
9. Out of scope for now  
10. Risks & decisions needed  
11. Success criteria  
12. Ask / next step  

## Appendix B — Related internal docs (after approval)

These are engineering/product living docs and are **not** required for the first management conversation:

- Product roadmap (candidates & backlog)  
- Versioning & release notes (once implementation starts)  
- Technical README / setup (once a prototype exists)  

---

*End of conceptual plan — for discussion only.*
