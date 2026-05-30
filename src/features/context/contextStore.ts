// Cross-provider context handoff — snapshot storage and prompt builder.
// Follows the spec in docs/HOW-IT-WORKS.md.

const MAX_RECENT_TURNS = 3;
const STORAGE_PREFIX = "hopper.context";
const PENDING_HANDOFF_PREFIX = "hopper.pendingHandoff";

export type TurnRecord = {
  userText: string;
  assistantText: string;
  provider: string;
  timestamp: number;
};

export type ThreadContext = {
  workspaceId: string;
  threadId: string;
  /** Goal derived from the first user message */
  goal: string;
  recentTurns: TurnRecord[];
  /** Plain-text summary of turns beyond the MAX_RECENT_TURNS window */
  compressedSummary: string;
  createdAt: number;
  lastUpdated: number;
};

// ── Storage ────────────────────────────────────────────────────────────────

function contextKey(workspaceId: string, threadId: string): string {
  return `${STORAGE_PREFIX}.${workspaceId}.${threadId}`;
}

function pendingKey(workspaceId: string): string {
  return `${PENDING_HANDOFF_PREFIX}.${workspaceId}`;
}

export function saveThreadContext(ctx: ThreadContext): void {
  try {
    window.localStorage.setItem(contextKey(ctx.workspaceId, ctx.threadId), JSON.stringify(ctx));
  } catch {
    // localStorage quota errors are non-fatal
  }
}

export function loadThreadContext(
  workspaceId: string,
  threadId: string,
): ThreadContext | null {
  try {
    const raw = window.localStorage.getItem(contextKey(workspaceId, threadId));
    if (!raw) return null;
    return JSON.parse(raw) as ThreadContext;
  } catch {
    return null;
  }
}

export function createThreadContext(
  workspaceId: string,
  threadId: string,
  goal: string,
): ThreadContext {
  return {
    workspaceId,
    threadId,
    goal,
    recentTurns: [],
    compressedSummary: "",
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
}

/**
 * Append a completed turn to the context.
 * Keeps at most MAX_RECENT_TURNS verbatim; older turns are merged into
 * compressedSummary as a simple text digest (no LLM call needed).
 */
export function appendTurn(ctx: ThreadContext, turn: TurnRecord): ThreadContext {
  const next = { ...ctx, recentTurns: [...ctx.recentTurns, turn], lastUpdated: Date.now() };
  if (next.recentTurns.length > MAX_RECENT_TURNS) {
    const overflow = next.recentTurns.slice(0, next.recentTurns.length - MAX_RECENT_TURNS);
    const digest = overflow
      .map(
        (t) =>
          `[${new Date(t.timestamp).toISOString()}] (${t.provider})\n` +
          `User: ${t.userText.slice(0, 300)}${t.userText.length > 300 ? "…" : ""}\n` +
          `Assistant: ${t.assistantText.slice(0, 300)}${t.assistantText.length > 300 ? "…" : ""}`,
      )
      .join("\n\n");
    next.compressedSummary = ctx.compressedSummary
      ? `${ctx.compressedSummary}\n\n${digest}`
      : digest;
    next.recentTurns = next.recentTurns.slice(-MAX_RECENT_TURNS);
  }
  return next;
}

// ── Pending handoff ────────────────────────────────────────────────────────

export function savePendingHandoff(workspaceId: string, prompt: string): void {
  try {
    window.localStorage.setItem(pendingKey(workspaceId), prompt);
  } catch {
    // ignore
  }
}

export function consumePendingHandoff(workspaceId: string): string | null {
  try {
    const key = pendingKey(workspaceId);
    const val = window.localStorage.getItem(key);
    if (val) window.localStorage.removeItem(key);
    return val;
  } catch {
    return null;
  }
}

// ── Prompt builder ─────────────────────────────────────────────────────────

/**
 * Converts a ThreadContext into a structured prose briefing for the
 * receiving agent, following the spec in HOW-IT-WORKS.md.
 */
export function buildHandoffPrompt(
  ctx: ThreadContext,
  nextProvider: string,
  nextInstruction?: string,
): string {
  const lines: string[] = [
    "## Context Handoff",
    "",
    `You are continuing work originally started by a different AI agent (${nextProvider === ctx.recentTurns[ctx.recentTurns.length - 1]?.provider ? "same provider, new session" : `switched from ${ctx.recentTurns[ctx.recentTurns.length - 1]?.provider ?? "unknown"} to ${nextProvider}`}).`,
    "Read the context below and pick up exactly where things left off.",
    "",
    "### Task Goal",
    ctx.goal || "(no explicit goal recorded)",
    "",
  ];

  if (ctx.compressedSummary) {
    lines.push("### Prior Context (compressed)", "", ctx.compressedSummary, "");
  }

  if (ctx.recentTurns.length > 0) {
    lines.push("### Recent Turns (verbatim, oldest → newest)", "");
    for (const t of ctx.recentTurns) {
      lines.push(
        `**[${new Date(t.timestamp).toLocaleString()}] Provider: ${t.provider}**`,
        `> User: ${t.userText}`,
        `> Assistant: ${t.assistantText}`,
        "",
      );
    }
  }

  if (nextInstruction) {
    lines.push("### Your Job Now", "", nextInstruction, "");
  }

  lines.push(
    "---",
    "_End of handoff context. Continue naturally from this point._",
  );

  return lines.join("\n");
}
