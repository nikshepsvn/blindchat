"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { ModelPicker } from "@/components/ModelPicker";

function MemoryStatus({
  memoryMode,
  vaultPhase,
}: {
  memoryMode: "native" | "compat" | "off";
  vaultPhase: "loading" | "ready" | "error";
}) {
  let label: string;
  let color: string;
  let title: string;
  if (vaultPhase === "loading") {
    label = "memory: opening";
    color = "text-[var(--color-text-tertiary)]";
    title = "vault still opening";
  } else if (vaultPhase === "error") {
    label = "memory: error";
    color = "text-[var(--color-warn)]";
    title = "vault failed to open";
  } else if (memoryMode === "native") {
    label = "memory: native";
    color = "text-[var(--color-success)]";
    title = "native function calling — save/search/list/delete available";
  } else if (memoryMode === "compat") {
    label = "memory: compat";
    color = "text-[var(--color-accent)]";
    title = "marker protocol — save/search/list/delete via embedded JSON blocks (model doesn't natively support tools)";
  } else {
    label = "memory: off";
    color = "text-[var(--color-text-tertiary)]";
    title = "vault not available";
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-1 border border-[var(--color-border)] bg-[var(--color-input)] font-mono text-[10px] ${color}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

export function MessageInput({
  model,
  onModelChange,
  onSend,
  onStop,
  isStreaming,
  memoryMode,
  vaultPhase,
}: {
  model: string;
  onModelChange: (m: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  memoryMode: "native" | "compat" | "off";
  vaultPhase: "loading" | "ready" | "error";
}) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const text = value.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-elevated)]">
      <div className="max-w-[720px] mx-auto px-8 py-4">
        <div className="relative border border-[var(--color-border)] focus-within:border-[var(--color-accent-dim)] bg-[var(--color-input)] transition">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder="ask anything"
            rows={3}
            disabled={isStreaming}
            className="w-full bg-transparent px-4 py-3 pr-14 text-[14px] text-[var(--color-text-primary)] font-mono placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none thin-scroll disabled:opacity-60"
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="absolute bottom-3 right-3 h-9 w-9 grid place-items-center bg-[var(--color-warn)] hover:opacity-90 text-[var(--color-base)] font-bold transition"
              aria-label="stop"
            >
              ◼
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="absolute bottom-3 right-3 h-9 w-9 grid place-items-center bg-[var(--color-accent)] hover:bg-[var(--color-accent-bright)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)] text-[var(--color-base)] font-bold transition"
              aria-label="send"
            >
              ↑
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-2.5 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-2">
            <ModelPicker value={model} onChange={onModelChange} />
            <MemoryStatus
              memoryMode={memoryMode}
              vaultPhase={vaultPhase}
            />
          </div>
          <div>
            {isStreaming ? "streaming · ⎋ to stop" : "⏎ send · ⇧⏎ newline"}
          </div>
        </div>
      </div>
    </div>
  );
}
