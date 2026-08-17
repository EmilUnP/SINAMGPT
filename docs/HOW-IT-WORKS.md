# How SINAMGPT works

**Who this is for:** managers, operators, and anyone who wants a plain picture of the product — not a setup guide.

**Audience:** people, not only engineers  
**Length:** about 10 minutes  
**Current product:** v1.14.0

If you only need “what should we buy / approve?”, start here.  
If you need to **install** it, use [README.md](../README.md).  
If you need **what we might build next**, use [ROADMAP.md](./ROADMAP.md).  
The original **idea on paper** is [SINAMGPT-Concept-Plan.md](./SINAMGPT-Concept-Plan.md).

---

## 1. What it is (one minute)

SINAMGPT is SINAM’s **internal ChatGPT-style assistant**. Employees sign in, ask work questions, and get answers that can use **company notes** we control.

Three promises:

1. **It stays with us.** Models run on the company machine (Ollama). We do not send chats to ChatGPT, Gemini, or other public clouds.
2. **Admins own the facts and the rules.** Product text and “do not answer this” policy live in Admin, not only in code.
3. **It answers in the user’s language.** The screen is English / Azərbaycan / Русский. Questions in Turkish still get a reply in that language when possible.

---

## 2. Who uses it

| Person | What they do |
|--------|----------------|
| **Guest** | Tries chat on the home page. Limited messages per day. History is **not** saved. |
| **Employee** | Signs in. Unlimited chat, saved history, projects (folders), share a read-only link with colleagues who are also signed in. Open **Models** to compare size and inputs. |
| **Admin** | Turns models on, edits knowledge, sets guardrails, watches usage (including the exact prompt), can run Model lab. Turns on Developer API, file upload, file import, and microphone only when the company wants those surfaces. |
| **Manager** | Decides hardware, who may use it, and whether company docs are accurate. Does not need to know the code. |

---

## 3. What happens when someone sends a message

This is the same path for signed-in chat and for guest try-chat.

```text
You type a question (any language)  + optional image or short voice clip
        │
        ▼
┌─────────────────────┐
│ 1. Safety check     │  Block obvious harm, jailbreaks, secrets, blocked phrases
└──────────┬──────────┘
           │ allowed
           ▼
┌─────────────────────┐
│ 2. Understand query │  Keep your words + add EN / AZ / RU search keywords
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. Find company notes│  Simple search in Admin knowledge (not a giant Google index)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. Local model      │  Ollama writes the answer, streaming on screen
└──────────┬──────────┘
           ▼
   Reply in your language
   + “From: …” citations when notes were used
```

**If step 1 blocks:** the model never runs. The user sees the refusal text admins configured.

**If step 3 finds nothing:** the model still answers like a normal assistant. It should not invent SINAM numbers or products that are not in the notes.

**Images:** only if **two** things are true: the **selected model** can see pictures (Gemma 4, Gemma 3 4B+, LLaVA, …), **and** an admin has turned on **File upload** (paperclip) and/or **File import** (paste / drop) in Admin → Settings → Features. Those switches start **off**. Text-only models stay text-only.

**Voice:** only if the model lists **Audio** (for example Gemma 4 E2B / E4B, not the 31B dense card) **and** an admin has turned on **Microphone** and/or **File import**. Clips are at most **30 seconds**. Video cannot be sent. Pick the model in the chat header; **Models** explains size and inputs.

---

## 4. How company knowledge works (simple)

We do **not** yet use “embeddings” (vector search). We use a **smart keyword search**:

1. Take the question as written.
2. Ask the same local model for a **short keyword list** in English, Azerbaijani, and Russian.  
   Example: Russian `какой у нас отпуск?` also becomes `leave, vacation` / `məzuniyyət`.
3. Search titles, tags, and text of Admin documents.
4. Prefer **rare, specific** words (SESDA) over generic ones (SINAM).
5. If a specific document already matches well, skip dumping the generic “About SINAM” page on top.

That is why a question in Russian can still find an English or Azerbaijani note. We **translate the question for search**. We do **not** translate the whole library on every request.

Admins keep the library in **Admin → Knowledge**. Citations under a reply (“From: …”) show which notes were used. Guests can get the same notes if Admin left knowledge on for guests.

**Honest limit:** this is still keyword search. A very vague question, or a fact that is not in the library, will miss. The next big upgrade (on the roadmap) is file/PDF upload and stronger search.

---

## 5. How safety (guardrails) works

Two layers:

| Layer | What it does | Who edits it |
|-------|----------------|--------------|
| **Hard blocks** | Keywords, jailbreak patterns, secrets/PII-style scans. Match → **no model call**. | Admin → Guardrails, plus built-in harm phrases in the product |
| **Soft policy** | Persona, allowed/refused topics. The model is *asked* to follow this. | Admin → Guardrails (On/Off per item) |

The same keyword translation used for knowledge also helps **hard blocks**. A blocked phrase stored in Azerbaijani can still catch the same idea asked in Russian, when the keyword step works.

Safety applies in every language. Switching language is not a bypass.

---

## 6. Where data lives

Everything is on the company PC (or the LAN host):

| What | Where |
|------|--------|
| Accounts, chats, knowledge, settings | `data/owngpt.db` (SQLite) |
| Chat images and voice clips | `data/attachments/` |
| Models | Ollama on that machine |
| Passwords | Hashed (not stored as plain text) |
| API keys (if enabled) | Secret shown **once**; only a hash is saved |

Nothing here is a cloud inbox. Backup = copy the `data/` folder (and keep Ollama models separately). There is no one-click backup button yet.

---

## 7. What admins actually control

You do not need engineering to run day-to-day:

- **Users** — enable / disable accounts  
- **Models** — a newly pulled Ollama model is **inactive** until Admin clicks **Activate**  
- **Knowledge** — add, edit, seed/replace the SINAM starter pack  
- **Guardrails** — On/Off switches; apply to new chats immediately  
- **Guest** — daily limit; can turn guest chat off  
- **Features** — start **off** until you need them: Developer API, Dev lab, File upload, File import, Microphone  
- **Live usage** — click a generation to see the exact prompt sent to the model and the reply  
- **Model lab** (`/lab`) — run the same chat path employees use and see pass rate / speed  

Developer API (`/api/v1/generate`), when on, is a **raw model pipe**: no knowledge, no guardrails. Use it for other apps, not as a replacement for employee chat.

---

## 8. What we do not claim

Say this clearly to the business:

- We do **not** send prompts to a third-party LLM by default.  
- We do **not** have departments, billing, or public internet share links. Share links work only for **logged-in** colleagues.  
- We do **not** automatically read PDFs into knowledge yet (you paste or type docs in Admin).  
- Vision is **not** every model — only those marked as image-capable, and only after Admin turns on File upload / File import.  
- Voice is **not** every model — only those marked as audio-capable, and only after Admin turns on Microphone / File import. Video still cannot be sent.  
- **Functions** on a model badge means the model *could* call extra functions; SINAMGPT **does not run that yet**.

---

## 9. A story you can retell

> An employee asks in Russian: “What is SESDA?”  
> Safety allows it.  
> Search adds English/AZ keywords, finds the SESDA note (even if that note is in Azerbaijani).  
> The local model answers **in Russian**, with a “From: SESDA …” line.  
> Numbers and product names come from that note, not from the public internet.

That is the product in one paragraph.

---

## 10. Related docs

| Doc | Use it when |
|-----|-------------|
| This file | Explaining SINAMGPT to people |
| [README.md](../README.md) | Install, env vars, API curl |
| [ROADMAP.md](./ROADMAP.md) | What is shipped vs next |
| [CHANGELOG.md](../CHANGELOG.md) | What changed in each version |
| [VERSIONING.md](./VERSIONING.md) | How we number releases |
| [SINAMGPT-Concept-Plan.md](./SINAMGPT-Concept-Plan.md) | Original management concept (not a live status report) |
