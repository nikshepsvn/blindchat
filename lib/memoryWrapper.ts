"use client";

// Memory orchestration adapter. Picks the right protocol based on the model:
//   - Qwen3 (supportsTools): native OpenAI-style function calling.
//   - Everything else: marker protocol — [[SAVE]] / [[SEARCH]] / [[LIST]] /
//     [[DELETE]] blocks embedded in the response text. We stream-filter the
//     markers out of the visible reply, parse them after the stream ends, then
//     execute against the vault. SEARCH/LIST trigger one follow-up turn with
//     the results fed back as a <search-result>/<list-result> block.
//
// One AsyncGenerator surface for both paths. handleSend doesn't care.

import {
  streamVeniceTurn,
  findModel,
  type VeniceMessage,
} from "@/lib/venice";
import { MEMORY_TOOLS, executeMemoryTool, type ToolResult } from "@/lib/memoryTools";

const MAX_ROUNDS = 4;

const MARKER_PROMPT = `You have access to an encrypted memory vault for this user. Use these markers at the END of any reply to interact with it. They are silently parsed and removed — the user does NOT see them.

[[SAVE]]
{"content": "fact in third person", "tags": ["topic"]}
[[/SAVE]]

[[SEARCH]]
{"query": "what to look up", "limit": 3}
[[/SEARCH]]

[[LIST]]
{"limit": 10}
[[/LIST]]

[[DELETE]]
{"id": "memory-id-from-prior-search"}
[[/DELETE]]

Rules:
- ALWAYS write a normal user-facing reply BEFORE any marker.
- Use SAVE for durable facts only (preferences, projects, decisions). Do not save every utterance.
- Use SEARCH when the user references past context.
- Use LIST when the user asks what you remember about them.
- Use DELETE only when the user explicitly asks to forget something.
- Output raw JSON inside markers — no markdown fences, no commentary.
- If you see a <search-result>, <list-result>, or <tool-result> block in this conversation, USE THOSE FACTS. Do NOT emit another query marker for the same topic — answer directly. If a result block starts with "ERROR:", tell the user the operation FAILED and quote the error.`;

const NATIVE_PROMPT = `You have four memory tools backed by an encrypted vault: save_memory, search_memory, list_recent_memories, delete_memory.

Rules:
- If the user asks to remember/save/note something, you MUST call save_memory. Never just reply "Saved." without the actual tool call.
- If the user references past info, call search_memory first.
- If the user asks what you know about them, call list_recent_memories.
- Don't save every utterance — only durable facts.
- After a successful tool call, briefly confirm in plain text (e.g., "Saved.").
- If the tool result starts with "ERROR:" — the operation FAILED. Tell the user honestly that the save/search/etc did not work, and quote the error message. Do NOT say "Saved." or pretend it worked.`;

export type MemoryMode = "native" | "compat" | "off";

export function memoryModeFor(modelId: string, vaultReady: boolean): MemoryMode {
  if (!vaultReady) return "off";
  const m = findModel(modelId);
  return m?.supportsTools ? "native" : "compat";
}

export type MemoryToolEvent = {
  kind: "tool";
  name: string;
  summary: string;
  ok: boolean;
  entryIds: string[];
};

export type MemoryContentEvent = { kind: "content"; delta: string };

export type MemoryEvent = MemoryContentEvent | MemoryToolEvent;

export type RunOptions = {
  apiKey: string;
  model: string;
  /** Caller's base system prompt — appended with our memory instructions. */
  baseSystem: string;
  /** Prior conversation (without system message; we add it). */
  conversation: VeniceMessage[];
  signal?: AbortSignal;
  vaultReady: boolean;
};

export async function* runMemoryTurn(
  opts: RunOptions
): AsyncGenerator<MemoryEvent, void, unknown> {
  const mode = memoryModeFor(opts.model, opts.vaultReady);
  if (mode === "native") {
    yield* runNative(opts);
  } else if (mode === "compat") {
    yield* runCompat(opts);
  } else {
    yield* runPlain(opts);
  }
}

// ── Plain pass-through (vault unavailable) ─────────────────────────────────

async function* runPlain(opts: RunOptions): AsyncGenerator<MemoryEvent> {
  const history: VeniceMessage[] = [
    { role: "system", content: opts.baseSystem },
    ...opts.conversation,
  ];
  for await (const ev of streamVeniceTurn({
    apiKey: opts.apiKey,
    model: opts.model,
    messages: history,
    signal: opts.signal,
  })) {
    if (ev.kind === "content") yield { kind: "content", delta: ev.delta };
  }
}

// ── Native tool-calling path (Qwen3) ───────────────────────────────────────

async function* runNative(opts: RunOptions): AsyncGenerator<MemoryEvent> {
  const history: VeniceMessage[] = [
    { role: "system", content: `${opts.baseSystem}\n\n${NATIVE_PROMPT}` },
    ...opts.conversation,
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let turnContent = "";
    let toolCalls: { id: string; name: string; arguments: string }[] = [];

    for await (const ev of streamVeniceTurn({
      apiKey: opts.apiKey,
      model: opts.model,
      messages: history,
      tools: MEMORY_TOOLS,
      signal: opts.signal,
    })) {
      if (ev.kind === "content") {
        turnContent += ev.delta;
        yield { kind: "content", delta: ev.delta };
      } else {
        toolCalls = ev.toolCalls;
      }
    }

    if (toolCalls.length === 0) return;

    history.push({
      role: "assistant",
      content: turnContent.length > 0 ? turnContent : null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of toolCalls) {
      const result = await executeMemoryTool(tc.name, tc.arguments);
      history.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.content,
      });
      yield {
        kind: "tool",
        name: tc.name,
        ok: result.ok,
        summary: summarizeToolCall(tc.name, tc.arguments, result),
        entryIds: result.entries?.map((e) => e.id) ?? [],
      };
    }
  }
}

// ── Marker-protocol path (everything else) ─────────────────────────────────

const QUERY_STOPS = ["[[SEARCH]]", "[[LIST]]"];

async function* runCompat(opts: RunOptions): AsyncGenerator<MemoryEvent> {
  const history: VeniceMessage[] = [
    { role: "system", content: `${opts.baseSystem}\n\n${MARKER_PROMPT}` },
    ...opts.conversation,
  ];

  let queriedAlready = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const filter = new MarkerFilter();
    let raw = "";

    for await (const ev of streamVeniceTurn({
      apiKey: opts.apiKey,
      model: opts.model,
      messages: history,
      // Reasoning models burn tokens in <think>; skip for compat path.
      reasoning_effort: "none",
      max_tokens: 4000,
      // After we've fed a result block back, stop the model from re-querying.
      stop: queriedAlready ? QUERY_STOPS : undefined,
      signal: opts.signal,
    })) {
      if (ev.kind === "content") {
        raw += ev.delta;
        const visible = filter.feed(ev.delta);
        if (visible) yield { kind: "content", delta: visible };
      }
    }
    const tail = filter.flush();
    if (tail) yield { kind: "content", delta: tail };

    const blocks = parseAllMarkers(raw);
    if (blocks.length === 0) return;

    // Execute every block. Track:
    //   - queries (need a follow-up turn so the model can use the results)
    //   - failures (need a follow-up so the model can tell the user it
    //     actually failed instead of claiming success)
    const queryResults: { kind: "search" | "list"; label: string; content: string }[] = [];
    const failures: { kind: string; label: string; content: string }[] = [];
    let didQuery = false;
    let anyFailure = false;

    for (const b of blocks) {
      const result = await execBlock(b);
      yield {
        kind: "tool",
        name: blockToolName(b.kind),
        ok: result.ok,
        summary: summarizeBlock(b, result),
        entryIds: result.entries?.map((e) => e.id) ?? [],
      };
      if (!result.ok) {
        anyFailure = true;
        const label =
          b.kind === "SAVE"
            ? String(b.args.content ?? "").slice(0, 60)
            : b.kind === "DELETE"
            ? String(b.args.id ?? "")
            : b.kind === "SEARCH"
            ? String(b.args.query ?? "")
            : "(recent)";
        failures.push({ kind: b.kind, label, content: result.content });
      }
      if (b.kind === "SEARCH" || b.kind === "LIST") {
        didQuery = true;
        if (result.ok) {
          const label =
            b.kind === "SEARCH" ? String(b.args.query ?? "") : "(recent)";
          queryResults.push({
            kind: b.kind === "SEARCH" ? "search" : "list",
            label,
            content: result.content,
          });
        }
      }
    }

    // Skip the second turn if everything succeeded and there were no queries
    // — the model's turn-1 text is the final answer (fast path for saves).
    if (!didQuery && !anyFailure) return;
    if (queriedAlready) return; // safety: one follow-up round per turn

    // Also short-circuit when the only thing left is empty query results.
    const anyQueryHits = queryResults.some(
      (r) => r.content && !r.content.startsWith("(")
    );
    if (!anyQueryHits && !anyFailure) return;

    queriedAlready = true;

    // Push the assistant's visible reply + a tool-result block describing
    // what happened. Failures get their own block so the model has to
    // correct its earlier guess.
    const visibleOnly = stripMarkers(raw).trim() || "Let me check.";
    history.push({ role: "assistant", content: visibleOnly });

    const blockParts: string[] = [];
    for (const r of queryResults) {
      blockParts.push(
        `<${r.kind}-result query="${escapeAttr(r.label)}">\n${r.content}\n</${r.kind}-result>`
      );
    }
    for (const f of failures) {
      blockParts.push(
        `<tool-result tool="${f.kind.toLowerCase()}" status="error" target="${escapeAttr(f.label)}">\n${f.content}\n</tool-result>`
      );
    }
    const instruction = anyFailure
      ? `Your previous reply already went to the user, but at least one operation FAILED. Now write a SHORT correction: tell the user the operation did not succeed and quote the error from the tool-result block. Do not emit another marker.`
      : `Now answer my original question using ONLY these facts. Do not emit another query marker.`;
    history.push({
      role: "user",
      content: `${blockParts.join("\n\n")}\n\n${instruction}`,
    });
  }
}

// ── Marker parser + streaming filter ───────────────────────────────────────

type Block = {
  kind: "SAVE" | "SEARCH" | "LIST" | "DELETE";
  body: string;
  args: Record<string, unknown>;
};

const MARKER_KINDS = ["SAVE", "SEARCH", "LIST", "DELETE"] as const;
const OPEN_RE = /\[\[(SAVE|SEARCH|LIST|DELETE)\]\]/;
const CLOSE_RE = /\[\[\/(SAVE|SEARCH|LIST|DELETE)\]\]/;

function parseAllMarkers(text: string): Block[] {
  const blocks: Block[] = [];
  for (const kind of MARKER_KINDS) {
    const re = new RegExp(`\\[\\[${kind}\\]\\]\\s*([\\s\\S]*?)\\s*\\[\\[/${kind}\\]\\]`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const body = m[1] ?? "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(body);
      } catch {
        // skip malformed
        continue;
      }
      blocks.push({ kind, body, args });
    }
  }
  return blocks;
}

function stripMarkers(text: string): string {
  let out = text;
  for (const kind of MARKER_KINDS) {
    const re = new RegExp(`\\[\\[${kind}\\]\\][\\s\\S]*?\\[\\[/${kind}\\]\\]`, "g");
    out = out.replace(re, "");
  }
  return out;
}

const OPEN_MARKERS = ["[[SAVE]]", "[[SEARCH]]", "[[LIST]]", "[[DELETE]]"];
const CLOSE_MARKERS = ["[[/SAVE]]", "[[/SEARCH]]", "[[/LIST]]", "[[/DELETE]]"];
const MAX_MARKER_LEN = Math.max(
  ...OPEN_MARKERS.map((m) => m.length),
  ...CLOSE_MARKERS.map((m) => m.length)
);

/**
 * Find the leftmost suffix-start position whose tail matches a prefix of any
 * marker in `markers`. If no suffix matches, returns buffer.length (hold
 * nothing). This is the key to streaming-safe marker detection: when the
 * model emits `[` followed by another `[` in two separate deltas, we must
 * hold from the FIRST bracket, not the second.
 */
function findPartialMarkerStart(buffer: string, markers: string[]): number {
  for (let len = Math.min(MAX_MARKER_LEN, buffer.length); len >= 1; len--) {
    const tail = buffer.slice(buffer.length - len);
    if (markers.some((m) => m.startsWith(tail))) {
      return buffer.length - len;
    }
  }
  return buffer.length;
}

/** Streaming marker filter — emit safe characters, hold partial markers. */
class MarkerFilter {
  private buffer = "";
  private inMarker = false;

  feed(delta: string): string {
    this.buffer += delta;
    let visible = "";

    // Drain every complete open/close marker the buffer contains.
    let progress = true;
    while (progress) {
      progress = false;
      if (this.inMarker) {
        const c = CLOSE_RE.exec(this.buffer);
        if (c) {
          // Drop everything up to and including the close (it's marker body).
          this.buffer = this.buffer.slice(c.index + c[0].length);
          this.inMarker = false;
          progress = true;
        }
      } else {
        const o = OPEN_RE.exec(this.buffer);
        if (o) {
          // Anything before the open is plain text — emit it.
          visible += this.buffer.slice(0, o.index);
          this.buffer = this.buffer.slice(o.index + o[0].length);
          this.inMarker = true;
          progress = true;
        }
      }
    }

    // After draining, decide what's safe to release vs hold.
    if (this.inMarker) {
      // Inside a marker. Marker body is invisible — drop it BUT keep any tail
      // that could be the start of a close marker.
      const cut = findPartialMarkerStart(this.buffer, CLOSE_MARKERS);
      this.buffer = this.buffer.slice(cut);
    } else {
      // Outside any marker. Emit everything except a tail that might be the
      // beginning of an open marker.
      const cut = findPartialMarkerStart(this.buffer, OPEN_MARKERS);
      visible += this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
    }
    return visible;
  }

  flush(): string {
    if (this.inMarker) {
      // eslint-disable-next-line no-console
      console.warn("[memoryWrapper] stream ended mid-marker; dropping tail");
      this.buffer = "";
      this.inMarker = false;
      return "";
    }
    const out = this.buffer;
    this.buffer = "";
    return out;
  }
}

// ── Execution helpers ──────────────────────────────────────────────────────

async function execBlock(b: Block): Promise<ToolResult> {
  const argsJson = JSON.stringify(b.args);
  if (b.kind === "SAVE") return executeMemoryTool("save_memory", argsJson);
  if (b.kind === "SEARCH") return executeMemoryTool("search_memory", argsJson);
  if (b.kind === "LIST") return executeMemoryTool("list_recent_memories", argsJson);
  if (b.kind === "DELETE") return executeMemoryTool("delete_memory", argsJson);
  return { ok: false, content: `unknown marker ${b.kind}` };
}

function blockToolName(kind: Block["kind"]): string {
  switch (kind) {
    case "SAVE":   return "save_memory";
    case "SEARCH": return "search_memory";
    case "LIST":   return "list_recent_memories";
    case "DELETE": return "delete_memory";
  }
}

function summarizeBlock(b: Block, result: ToolResult): string {
  // For failures, surface the actual error message — "save failed" alone
  // taught us nothing.
  if (!result.ok) {
    const reason = result.content.replace(/^ERROR:\s*\w+\s+FAILED\.\s*/, "").slice(0, 80);
    return `${b.kind.toLowerCase()} failed · ${reason}`;
  }
  if (b.kind === "SAVE") {
    const preview = String(b.args.content ?? "").slice(0, 50);
    return `saved · "${preview}${preview.length >= 50 ? "…" : ""}"`;
  }
  if (b.kind === "SEARCH") {
    const q = String(b.args.query ?? "").slice(0, 40);
    const hits = result.entries?.length ?? 0;
    return `searched "${q}" · ${hits} hit${hits === 1 ? "" : "s"}`;
  }
  if (b.kind === "LIST") {
    const hits = result.entries?.length ?? 0;
    return `listed ${hits} recent`;
  }
  if (b.kind === "DELETE") {
    const id = String(b.args.id ?? "").slice(0, 8);
    return `deleted id=${id}…`;
  }
  return b.kind;
}

function summarizeToolCall(
  name: string,
  argsJson: string,
  result: ToolResult
): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    /* ignore */
  }
  // Surface the actual error so the user sees what went wrong, not just "failed".
  if (!result.ok) {
    const reason = result.content.replace(/^ERROR:\s*\w+\s+FAILED\.\s*/, "").slice(0, 80);
    return `${name.replace("_memory", "").replace("_recent_memories", " recent")} failed · ${reason}`;
  }
  if (name === "save_memory") {
    const preview = String(args.content ?? "").slice(0, 50);
    return `saved · "${preview}${preview.length >= 50 ? "…" : ""}"`;
  }
  if (name === "search_memory") {
    const q = String(args.query ?? "").slice(0, 40);
    const hits = result.entries?.length ?? 0;
    return `searched "${q}" · ${hits} hit${hits === 1 ? "" : "s"}`;
  }
  if (name === "list_recent_memories") {
    const hits = result.entries?.length ?? 0;
    return `listed ${hits} recent`;
  }
  if (name === "delete_memory") {
    const id = String(args.id ?? "").slice(0, 8);
    return `deleted id=${id}…`;
  }
  return name;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '\\"').slice(0, 200);
}
