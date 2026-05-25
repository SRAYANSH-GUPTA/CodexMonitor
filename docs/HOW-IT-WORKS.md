# Cross-Provider Context Handoff — How It Works

## What It Does

Lets one AI agent (e.g. Codex) work on a task, snapshot its progress into a structured JSON file, then hand off to a different AI agent (e.g. Gemini) which picks up exactly where it left off — without replaying the full conversation.

---

## Core Idea

Instead of replaying raw conversation history, you maintain a **ContextSnapshot** that tracks:
- The task goal
- Plan items and their status (pending / in_progress / done)
- Files created/modified with summaries
- Key decisions and rationale
- Last 3 turns verbatim
- Compressed summary of older turns (merged by an LLM)

After every agent turn, you call a **summarizer** (cheap LLM call) to update the snapshot. On handoff, you convert the snapshot into a prose briefing via `buildHandoffPrompt()` and feed that as the new agent's first message.

---

## Files to Copy

| File | Purpose |
|------|---------|
| `src/context-store.ts` | ContextSnapshot type, CRUD, `buildHandoffPrompt()` |
| `src/summarizer.ts` | Calls Gemini after each turn to update the snapshot |

---

## Step-by-Step

### 1. Install deps

```bash
npm install @google/genai tiktoken
npm install -D tsx typescript @types/node
```

### 2. Copy `context-store.ts` and `summarizer.ts` into your project

No changes needed unless you want to rename fields.

### 3. Set your Gemini API key

```bash
export GEMINI_API_KEY=your_key_here
```

Get a key from [aistudio.google.com](https://aistudio.google.com) — must be created in AI Studio directly, not Google Cloud Console, or `generateContent` will 403.

### 4. Create a snapshot at session start

```ts
import { create, startSession, save } from "./context-store.ts";

let snap = create("Your task goal here", process.cwd());
snap = startSession(snap, "session-1", "codex"); // or "gemini"
await save(snap, ".context-store/snapshot.json");
```

### 5. After each agent turn, call the summarizer

```ts
import { summarize } from "./summarizer.ts";
import type { Turn } from "./context-store.ts";

const turn: Turn = {
  sessionId: "session-1",
  role: "assistant",
  content: "the assistant's response text",
  toolCalls: [{ name: "write_file", args: { path: "foo.ts", content: "..." } }],
  tokensIn: 1000,
  tokensOut: 400,
};

const result = await summarize(snap, turn, turnIndex);
snap = result.snapshot;
await save(snap, ".context-store/snapshot.json");
```

### 6. On handoff to a new agent/session

```ts
import { load, buildHandoffPrompt, startSession } from "./context-store.ts";

let snap = await load(".context-store/snapshot.json");
snap = startSession(snap, "session-2", "gemini");

const handoffPrompt = buildHandoffPrompt(snap, "Your next instruction here");
// Feed handoffPrompt as the first user message to the new agent
```

### 7. Continue tracking turns in the new session — same as step 5

---

## The ContextSnapshot Shape

```ts
{
  taskGoal: string,
  plan: { id, description, status }[],
  fileManifest: { path, hash, summary, lastModifiedBy }[],
  decisions: { decision, rationale, timestamp }[],
  recentTurns: Turn[],        // last 3 only
  compressedSummary: string,  // older turns merged here
  metadata: { cwd, sessionsInvolved, createdAt, lastUpdated }
}
```

---

## How `buildHandoffPrompt` Works

Converts the snapshot into readable prose with sections:
1. Task Goal
2. Plan Status (checklist with ✅/🔄/⬜)
3. Files in Play (path + summary)
4. Key Decisions
5. Prior Context (compressed)
6. Last 3 Turns verbatim
7. "Your Job Now" — the new user message

The receiving agent reads this as a single rich message and has full context.

---

## Key Constraints

- **Summarizer model**: `gemini-2.5-flash` — cheap, fast, structured JSON output
- **Token budget**: snapshot stays small (~300-500 tok) vs full replay (can be 10k+)
- **Rate limit**: free tier is ~10 RPM, summarizer has a 6s gap built in
- **Snapshot is append-only**: plan items are never deleted, only status-updated
- **recentTurns cap**: always 3 max; older ones are merged into `compressedSummary`
