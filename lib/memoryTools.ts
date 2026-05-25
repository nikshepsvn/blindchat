// Tool-calling layer that lets the LLM read and write the vault.
//
// Four tools: save_memory, search_memory, list_recent_memories, delete_memory.
// Definitions are sent to tool-capable Venice models; the LLM emits tool_calls
// in its response stream, we execute them locally against the vault, and feed
// the results back. Everything stays in the browser.

import { openVault, type MemoryEntry } from "@/lib/vault";
import type { ToolDef } from "@/lib/venice";

export const MEMORY_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Save a durable fact or preference about the user to long-term encrypted memory. " +
        "Use ONLY for info worth remembering across sessions: stated preferences, ongoing " +
        "projects, important facts, decisions. Do NOT save every utterance.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The fact to remember, written in third person. Be concise and specific.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "1-4 lowercase keyword tags for retrieval (e.g., ['preferences', 'work']).",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memory",
      description:
        "Search the user's encrypted memory vault by meaning. Call this whenever the user's " +
        "message could benefit from prior context — references to past projects, stated " +
        "preferences, ongoing work, or anything the user might have told you before.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language search query. Embedded and matched semantically.",
          },
          limit: {
            type: "integer",
            description: "Max number of memories to return (default 3, max 10).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_memories",
      description:
        "List the N most recently saved memories, newest first. Use when the user asks " +
        "what you remember, what you know about them, or wants to see recent activity.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Max number to return (default 10, max 50).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_memory",
      description:
        "Permanently delete a memory by its id. Use when the user explicitly asks you to " +
        "forget, delete, or remove a specific memory. Always confirm what was deleted.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The exact memory id (usually a UUID surfaced by search_memory or list_recent_memories).",
          },
        },
        required: ["id"],
      },
    },
  },
];

export type ToolResult = {
  ok: boolean;
  content: string;
  /** New / referenced memory entries — used to highlight in the side panel. */
  entries?: MemoryEntry[];
  /** True if the vault list/state should be re-read after this call. */
  mutated?: boolean;
};

export async function executeMemoryTool(
  name: string,
  argsJson: string
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return { ok: false, content: "error: tool arguments were not valid JSON" };
  }

  try {
    const vault = await openVault();

    if (name === "save_memory") {
      const content = String(args.content ?? "").trim();
      if (!content) return { ok: false, content: "error: content is required" };
      const tags = Array.isArray(args.tags)
        ? (args.tags as unknown[]).map(String).slice(0, 4)
        : undefined;
      const entry = await vault.append({ content, tags, source: "blindchat" });
      return {
        ok: true,
        content: `saved id=${entry.id} tags=[${entry.tags.join(", ")}]`,
        entries: [entry],
        mutated: true,
      };
    }

    if (name === "search_memory") {
      const query = String(args.query ?? "").trim();
      if (!query) return { ok: false, content: "error: query is required" };
      const limit = clampInt(args.limit, 3, 1, 10);
      const res = await vault.search({ semantic: query, limit });
      if (res.entries.length === 0) {
        return { ok: true, content: "(no relevant memories)", entries: [] };
      }
      return {
        ok: true,
        content: renderEntries(res.entries),
        entries: res.entries,
      };
    }

    if (name === "list_recent_memories") {
      const limit = clampInt(args.limit, 10, 1, 50);
      const list = await vault.list(limit);
      if (list.length === 0) {
        return { ok: true, content: "(vault is empty)", entries: [] };
      }
      return {
        ok: true,
        content: renderEntries(list),
        entries: list,
      };
    }

    if (name === "delete_memory") {
      const id = String(args.id ?? "").trim();
      if (!id) return { ok: false, content: "error: id is required" };
      const removed = await vault.delete(id);
      return {
        ok: removed > 0,
        content: removed > 0 ? `deleted id=${id}` : `no memory found with id=${id}`,
        mutated: removed > 0,
      };
    }

    return { ok: false, content: `error: unknown tool "${name}"` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[blindcache] tool ${name} failed:`, e);
    return { ok: false, content: `error: ${msg}` };
  }
}

function clampInt(raw: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), lo), hi);
}

function renderEntries(entries: MemoryEntry[]): string {
  return entries
    .map((e, i) => {
      const score = e.score !== undefined ? ` score=${e.score.toFixed(2)}` : "";
      const tags = e.tags.length > 0 ? `[${e.tags.join(", ")}]` : `[${e.scope}]`;
      return `${i + 1}. id=${e.id} ${tags}${score} :: ${e.content}`;
    })
    .join("\n");
}
