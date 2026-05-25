# Survey: Cross-Provider Context Handoff Prototype

## A. Codex app-server Protocol

### Spawning the process

```typescript
import { spawn } from "child_process";

const child = spawn("codex", ["app-server"], {
  cwd: "/path/to/working/dir",  // sets the session cwd
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});
```

The cwd is fixed at spawn time — all threads in this process will use it.
Stdin/stdout/stderr are all piped.

### Wire format

**Newline-delimited JSON (NDJSON).** One JSON object per line, no length
prefix, no HTTP. Read with `readline` or `createInterface`:

```typescript
import { createInterface } from "readline";

const rl = createInterface({ input: child.stdout! });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  // dispatch on msg
});
```

Write by serializing to JSON and appending `\n`:

```typescript
function send(obj: object) {
  child.stdin!.write(JSON.stringify(obj) + "\n");
}
```

### Message types

| Direction | Shape | Description |
|-----------|-------|-------------|
| client → server | `{ id, method, params }` | Request (expects response) |
| client → server | `{ method, params? }` | Notification (no response) |
| client → server | `{ id, result }` | Response to a server request |
| server → client | `{ id, result }` or `{ id, error }` | Response to a client request |
| server → client | `{ method, params }` | Notification / event (no id) |
| server → client | `{ id, method, params }` | Server-initiated request (requires response) |

IDs are auto-incrementing integers starting at 1.

### Initialize handshake

```typescript
// Step 1 — send initialize request
send({
  id: nextId(),
  method: "initialize",
  params: {
    clientInfo: { name: "context-handoff", title: "Context Handoff", version: "0.1.0" },
    capabilities: { experimentalApi: true },
  },
});

// Step 2 — await { id, result: { ... } } response (timeout: 15s)

// Step 3 — send initialized notification
send({ method: "initialized" });

// Server then emits: { method: "codex/connected", params: { workspaceId: "..." } }
// Save workspaceId — required for all subsequent calls.
```

### Starting a session

```typescript
// Start a new thread (session). cwd comes from spawn-time.
send({ id: nextId(), method: "thread/start", params: { workspaceId } });
// Response: { id, result: { thread: { id, cwd, ... } } }
// Save threadId.

// Subscribe to live events for this thread
send({ id: nextId(), method: "thread/liveSubscribe", params: { workspaceId, threadId } });
```

### Sending a user message

```typescript
send({
  id: nextId(),
  method: "turn/sendUserMessage",
  params: {
    workspaceId,
    threadId,
    text: "Your message here",
    model: null,       // null = use account default
    effort: null,
    serviceTier: null,
    accessMode: null,
    images: [],
    appMentions: [],
    collaborationMode: null,
  },
});
```

### Key event types

Events arrive as notifications: `{ method, params }` (no `id`).

| Method | When | Key params |
|--------|------|------------|
| `codex/connected` | After initialized | `workspaceId` |
| `thread/started` | Thread created | `thread.id`, `thread.cwd` |
| `thread/live_attached` | liveSubscribe confirmed | `threadId` |
| `item/started` | An item begins streaming | `threadId`, `item` object |
| `item/completed` | An item finishes | `threadId`, `item` object |
| `thread/live_detached` | Subscription ended | `threadId` |
| `account/rateLimits/updated` | Limits changed | rate limit payload |
| `codex/stderr` | Server stderr line | `message` |
| `codex/parseError` | Server sent bad JSON | raw content |

**About `item` events:** Codex streams content via `item/started` +
`item/completed`. The `item` object contains a `type` field (e.g.
`"message"`, `"tool_call"`, `"tool_result"`, `"reasoning"`) and `content`.
Text streaming may arrive as intermediate `item/delta` or similar events
between started/completed — **this needs empirical verification** by
running `codex app-server` and logging all raw output.

**Approval requests:** The server can send a message with both `id` and
`method` — this is a server-initiated request requiring a response. In
test-repo mode we auto-approve:

```typescript
if (msg.id !== undefined && msg.method !== undefined) {
  // Server is asking for approval
  send({ id: msg.id, result: { approved: true } });
}
```

### Rate limits

```typescript
send({ id: nextId(), method: "account/rateLimits/read", params: { workspaceId } });
// Response: { id, result: { ... rate limit data ... } }
```

### Shutdown

There is no `shutdown` RPC. Close cleanly by:

1. Sending `turn/interrupt` if a turn is in progress
2. Closing stdin: `child.stdin!.end()`
3. Waiting for the process to exit (with a timeout, then `child.kill()`)

```typescript
async function shutdown() {
  child.stdin!.end();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}
```

---

## B. Gemini 2.5 Flash via `@google/genai`

### Important: package name changed

The brief references `@google/generative-ai` but this package was
**deprecated November 30, 2025**. The current unified SDK is:

```
@google/genai  (v2.3.0 as of this survey)
```

Use this instead. It has a different API surface.

### Current model name

`gemini-2.5-flash` — confirmed current. This is the correct model ID.

### Installation

```bash
pnpm add @google/genai tiktoken
```

### Basic usage with system instruction

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "User message here",
  config: {
    systemInstruction: "You are a coding assistant...",
    temperature: 0.2,
  },
});
console.log(response.text);
```

All config (systemInstruction, tools, responseFormat, temperature) goes
inside the `config` object — not at the top level.

### Function calling

```typescript
import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";

const tools = [{
  functionDeclarations: [{
    name: "read_file",
    description: "Read the contents of a file",
    parametersJsonSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from cwd" },
      },
      required: ["path"],
    },
  }],
}];

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: messages,   // array of { role, parts } objects
  config: {
    systemInstruction: "...",
    tools,
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
    },
  },
});

// Check for tool calls
const calls = response.functionCalls;  // array or undefined
```

### Structured JSON output

```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: prompt,
  config: {
    responseFormat: {
      text: {
        mimeType: "application/json",
        schema: { /* JSON Schema object */ },
      },
    },
  },
});
const parsed = JSON.parse(response.text);
```

### Streaming

```typescript
const stream = await ai.models.generateContentStream({
  model: "gemini-2.5-flash",
  contents: messages,
  config: { systemInstruction: "..." },
});

for await (const chunk of stream) {
  process.stdout.write(chunk.text ?? "");
}
```

### Token usage

```typescript
const response = await ai.models.generateContent({ ... });
const usage = response.usageMetadata;
// { promptTokenCount, candidatesTokenCount, totalTokenCount,
//   thoughtsTokenCount, cachedContentTokenCount }
```

### Free tier limits (Gemini 2.5 Flash, as of May 2026)

| Limit | Value |
|-------|-------|
| RPM (requests/min) | 10 |
| TPM (tokens/min) | 250,000 |
| RPD (requests/day) | 250 |

> **Note:** These are known to change. Verify at https://aistudio.google.com/rate-limit
> before running long sessions. With 250 RPD and the summarizer calling
> Gemini after every Codex turn, we get ~50 Phase A runs before hitting
> the daily ceiling.

---

## C. Gemini as a Coding Agent

### Minimal tool set

Five tools are sufficient for a coding agent scoped to a single repo:

#### `read_file`
```json
{
  "name": "read_file",
  "description": "Read the full contents of a file. Path is relative to the working directory.",
  "parametersJsonSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Relative file path" }
    },
    "required": ["path"]
  }
}
```

#### `write_file`
```json
{
  "name": "write_file",
  "description": "Write or overwrite a file with the given content. Creates parent directories as needed.",
  "parametersJsonSchema": {
    "type": "object",
    "properties": {
      "path":    { "type": "string", "description": "Relative file path" },
      "content": { "type": "string", "description": "Full file content to write" }
    },
    "required": ["path", "content"]
  }
}
```

#### `list_dir`
```json
{
  "name": "list_dir",
  "description": "List files and directories at the given path (non-recursive).",
  "parametersJsonSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Relative directory path (default: '.')" }
    },
    "required": []
  }
}
```

#### `run_shell`
```json
{
  "name": "run_shell",
  "description": "Run a whitelisted shell command in the working directory. Returns stdout + stderr combined.",
  "parametersJsonSchema": {
    "type": "object",
    "properties": {
      "cmd": { "type": "string", "description": "Command to run" }
    },
    "required": ["cmd"]
  }
}
```

Shell command whitelist (anything else is rejected):
```
npm install, npm test, npm run *, node *, npx *, ls, cat, git status, git diff, git log
```

#### `git_status`
```json
{
  "name": "git_status",
  "description": "Returns the output of `git status --short` in the working directory.",
  "parametersJsonSchema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```

### Agent loop

The Gemini agent loop runs entirely client-side. Gemini itself has no
access to the filesystem — we execute tool calls and feed results back:

```
1. Build messages array: system instruction + chat history + new user message
2. Call generateContent with tools defined
3. If response.functionCalls is non-empty:
   a. For each function call:
      - Execute the tool locally (read_file / write_file / etc.)
      - Emit a tool_call TurnEvent
      - Emit a tool_result TurnEvent
   b. Append assistant message (with function calls) to history
   c. Append tool results as a "tool" role message to history
   d. Go to step 2
4. If no function calls: emit assistant_complete TurnEvent, loop ends
```

History entry format for function results (role `"tool"`):
```typescript
{
  role: "tool",
  parts: [
    {
      functionResponse: {
        name: "read_file",
        response: { result: "<file contents>" },
      },
    },
  ],
}
```

Streaming and function calling are mutually exclusive in a single call —
use `generateContent` (non-streaming) for the agentic loop, and emit
`assistant_delta` events by chunking the final text response for log
consistency.

---

## Recommendation

**Proceed with the implementation as described in the brief, with two changes:**

1. **Use `@google/genai` instead of `@google/generative-ai`** — the old
   package is end-of-life. The API shape is similar but `config` nesting
   and `responseFormat` differ. Update `package.json` accordingly.

2. **Log all raw Codex stdout during the first test run** — the exact
   event payload structure for `item/started`/`item/completed` (and
   whether streaming deltas exist) is not fully documented. Build
   `codex-runner.ts` with a `--raw` debug flag that dumps every line
   before parsing, so we can map the real event types in one session
   and update the TurnEvent mapping accordingly.

Everything else in the brief's design is sound. The NDJSON framing,
the thread/start + liveSubscribe pattern, the Gemini agent loop, and
the structured JSON summarizer are all straightforward to implement
given the above findings.
