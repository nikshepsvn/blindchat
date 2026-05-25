// Minimal Venice client — OpenAI-compatible, streams via SSE.
// Runs entirely in the browser. In production the apiKey comes from
// IndexedDB (set during onboarding); in dev it's NEXT_PUBLIC_VENICE_API_KEY.

const VENICE_BASE = "https://api.venice.ai/api/v1";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string; // serialized JSON
};

export type VeniceMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type StreamOptions = {
  apiKey: string;
  model: string;
  messages: VeniceMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  /** Hard stop sequences — generation terminates as soon as any match. */
  stop?: string[];
  /** Reasoning effort for models that support it. "none" disables thinking. */
  reasoning_effort?: "none" | "low" | "medium" | "high";
  /** Max tokens to generate. Important for reasoning models. */
  max_tokens?: number;
};

export type TurnEvent =
  | { kind: "content"; delta: string }
  | { kind: "done"; content: string; toolCalls: ToolCall[]; finishReason: string };

/**
 * Run one turn of conversation. Yields content deltas as they stream, then a
 * final "done" event with any tool calls and the full content. The caller is
 * responsible for orchestrating the tool execution loop.
 */
// Hard ceiling on a single turn. Reasoning models (GLM, GPT-OSS) can sit on
// Venice's gateway for 60–90s; past that we'd rather fail with a useful
// message than hang the UI forever.
const TURN_TIMEOUT_MS = 90_000;

export async function* streamVeniceTurn({
  apiKey,
  model,
  messages,
  tools,
  signal,
  stop,
  reasoning_effort,
  max_tokens,
}: StreamOptions): AsyncGenerator<TurnEvent, void, unknown> {
  const body: Record<string, unknown> = { model, messages, stream: true };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (stop && stop.length > 0) body.stop = stop;
  if (reasoning_effort) body.reasoning_effort = reasoning_effort;
  if (typeof max_tokens === "number") body.max_tokens = max_tokens;

  // Combine the caller's abort signal with a per-turn timeout.
  const timeoutCtl = new AbortController();
  const timer = setTimeout(() => timeoutCtl.abort(), TURN_TIMEOUT_MS);
  const combinedSignal = signal
    ? anySignal([signal, timeoutCtl.signal])
    : timeoutCtl.signal;

  let res: Response;
  try {
    res = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (timeoutCtl.signal.aborted && (!signal || !signal.aborted)) {
      throw new Error(
        `${model} didn't respond in 90s. Try a faster model (Qwen3 30B A3B) or retry.`
      );
    }
    throw e;
  }

  if (!res.ok) {
    clearTimeout(timer);
    const txt = await res.text();
    if (res.status === 504) {
      throw new Error(
        `${model} timed out at Venice's gateway (504). Reasoning models are slow today — try Qwen3 30B A3B or retry.`
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Venice rejected your API key (HTTP ${res.status}). Update it in settings.`
      );
    }
    throw new Error(`Venice API ${res.status}: ${txt.slice(0, 200)}`);
  }
  if (!res.body) {
    clearTimeout(timer);
    throw new Error("Venice returned empty body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;
  let content = "";
  let finishReason = "stop";

  // Tool calls arrive in fragments — accumulate by index.
  const partials = new Map<number, { id?: string; name?: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") break;
      try {
        const json = JSON.parse(payload);
        const choice = json?.choices?.[0];
        if (!choice) continue;

        if (typeof choice.finish_reason === "string" && choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta ?? {};
        if (typeof delta.content === "string" && delta.content) {
          let text = delta.content;
          if (!started) {
            text = text.replace(/^\s+/, "");
            if (!text) continue;
            started = true;
          }
          content += text;
          yield { kind: "content", delta: text };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            const slot = partials.get(idx) ?? { args: "" };
            if (tc.id) slot.id = tc.id;
            const fn = tc.function ?? {};
            if (fn.name) slot.name = fn.name;
            if (typeof fn.arguments === "string") slot.args += fn.arguments;
            partials.set(idx, slot);
          }
        }
      } catch {
        // skip malformed
      }
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const [idx, slot] of [...partials.entries()].sort((a, b) => a[0] - b[0])) {
    if (!slot.id || !slot.name) continue;
    toolCalls.push({ id: slot.id, name: slot.name, arguments: slot.args });
    void idx;
  }

  clearTimeout(timer);
  yield { kind: "done", content, toolCalls, finishReason };
}

/** Combine multiple AbortSignals — aborts when any of them aborts. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctl.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => ctl.abort(s.reason), { once: true });
  }
  return ctl.signal;
}

// Note: key + model accessors live in lib/veniceKey.ts now (IndexedDB-backed,
// with NEXT_PUBLIC_VENICE_API_KEY as a dev fallback).

/**
 * Curated TEE + E2EE-capable Venice models.
 * Source: GET https://api.venice.ai/api/v1/models where
 * supportsTeeAttestation && supportsE2EE.
 * Last sync: 2026-05-25.
 */
export type VeniceTag =
  | "flagship"
  | "reasoning"
  | "code"
  | "vision"
  | "tools"
  | "long-ctx"
  | "uncensored"
  | "fast";

export type VeniceModel = {
  id: string;
  label: string;
  family: string;
  contextK: number;
  outPerMtok: number;
  inPerMtok: number;
  description: string;
  tags: VeniceTag[];
  /** Truth from Venice's `model_spec.capabilities.supportsFunctionCalling`. */
  supportsTools: boolean;
};

export const VENICE_PRIVATE_MODELS: VeniceModel[] = [
  {
    id: "e2ee-glm-4-7-p",
    label: "GLM 4.7",
    family: "GLM",
    contextK: 128,
    outPerMtok: 4.15,
    inPerMtok: 1.1,
    description: "Z.AI flagship — enhanced programming, stable multi-step reasoning.",
    tags: ["flagship", "reasoning", "code"],
    supportsTools: false,
  },
  {
    id: "e2ee-glm-5-1",
    label: "GLM 5.1",
    family: "GLM",
    contextK: 200,
    outPerMtok: 4.15,
    inPerMtok: 1.1,
    description: "Next-gen GLM with extended reasoning and longer context.",
    tags: ["flagship", "reasoning", "long-ctx"],
    supportsTools: false,
  },
  {
    id: "e2ee-qwen3-5-122b-a10b",
    label: "Qwen3.5 122B A10B",
    family: "Qwen",
    contextK: 128,
    outPerMtok: 4.0,
    inPerMtok: 0.5,
    description: "Largest open MoE on offer — reasoning, multimodal, tools.",
    tags: ["flagship", "reasoning", "vision", "tools"],
    supportsTools: true,
  },
  {
    id: "e2ee-qwen3-6-35b-a3b-uncensored-p",
    label: "Qwen3.6 35B Uncensored",
    family: "Qwen",
    contextK: 128,
    outPerMtok: 1.88,
    inPerMtok: 0.38,
    description: "Alibaba's MoE with 35B total / 3B active — uncensored variant.",
    tags: ["uncensored"],
    supportsTools: false,
  },
  {
    id: "e2ee-qwen3-6-35b-a3b",
    label: "Qwen3.6 35B FP8",
    family: "Qwen",
    contextK: 32,
    outPerMtok: 1.18,
    inPerMtok: 0.182,
    description: "Fast MoE — 3B active per token, reasoning + tools.",
    tags: ["reasoning", "code", "tools", "fast"],
    supportsTools: true,
  },
  {
    id: "e2ee-venice-uncensored-24b-p",
    label: "Venice Uncensored 1.1",
    family: "Venice",
    contextK: 32,
    outPerMtok: 1.15,
    inPerMtok: 0.25,
    description: "Venice's own uncensored 24B — strong general assistant.",
    tags: ["uncensored"],
    supportsTools: false,
  },
  {
    id: "e2ee-qwen3-vl-30b-a3b-p",
    label: "Qwen3 VL 30B",
    family: "Qwen",
    contextK: 128,
    outPerMtok: 0.9,
    inPerMtok: 0.25,
    description: "Multimodal — unifies text with image + video understanding.",
    tags: ["vision", "tools"],
    supportsTools: true,
  },
  {
    id: "e2ee-gemma-4-26b-a4b-uncensored-p",
    label: "Gemma 4 26B Uncensored",
    family: "Gemma",
    contextK: 64,
    outPerMtok: 0.88,
    inPerMtok: 0.19,
    description: "Google's Gemma 4 MoE — 25B total / 4B active, multimodal.",
    tags: ["uncensored"],
    supportsTools: false,
  },
  {
    id: "e2ee-qwen3-30b-a3b-p",
    label: "Qwen3 30B A3B",
    family: "Qwen",
    contextK: 256,
    outPerMtok: 0.69,
    inPerMtok: 0.19,
    description: "MoE with 30B total / 3B active, ultra-long 256k context.",
    tags: ["long-ctx", "tools"],
    supportsTools: true,
  },
  {
    id: "e2ee-gpt-oss-120b-p",
    label: "GPT OSS 120B",
    family: "GPT-OSS",
    contextK: 128,
    outPerMtok: 0.65,
    inPerMtok: 0.13,
    description: "OpenAI's open-weight 117B MoE — configurable reasoning depth.",
    tags: ["reasoning"],
    supportsTools: false,
  },
  {
    id: "e2ee-glm-4-7-flash-p",
    label: "GLM 4.7 Flash",
    family: "GLM",
    contextK: 198,
    outPerMtok: 0.55,
    inPerMtok: 0.13,
    description: "30B-class — agentic coding, long-horizon planning.",
    tags: ["reasoning", "code", "long-ctx", "fast"],
    supportsTools: false,
  },
  {
    id: "e2ee-gemma-3-27b-p",
    label: "Gemma 3 27B",
    family: "Gemma",
    contextK: 40,
    outPerMtok: 0.5,
    inPerMtok: 0.14,
    description: "Google's multimodal 27B — 140+ language understanding.",
    tags: ["vision"],
    supportsTools: false,
  },
  {
    id: "e2ee-gemma-4-31b",
    label: "Gemma 4 31B Instruct",
    family: "Gemma",
    contextK: 32,
    outPerMtok: 0.43,
    inPerMtok: 0.139,
    description: "Gemma 4 instruction-tuned dense model with reasoning.",
    tags: ["reasoning"],
    supportsTools: false,
  },
  {
    id: "e2ee-gpt-oss-20b-p",
    label: "GPT OSS 20B",
    family: "GPT-OSS",
    contextK: 128,
    outPerMtok: 0.19,
    inPerMtok: 0.05,
    description: "OpenAI's compact 21B MoE — 3.6B active, low-latency.",
    tags: ["reasoning", "fast"],
    supportsTools: false,
  },
  {
    id: "e2ee-qwen-2-5-7b-p",
    label: "Qwen 2.5 7B",
    family: "Qwen",
    contextK: 32,
    outPerMtok: 0.13,
    inPerMtok: 0.05,
    description: "Compact 7B — coding, math, 29+ languages. Quickest option.",
    tags: ["code", "fast"],
    supportsTools: false,
  },
];

export function findModel(id: string): VeniceModel | undefined {
  return VENICE_PRIVATE_MODELS.find((m) => m.id === id);
}
