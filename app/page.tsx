"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatThread } from "@/components/ChatThread";
import { MemoryPanel } from "@/components/MemoryPanel";
import { MessageInput } from "@/components/MessageInput";
import { OnboardingProvider } from "@/components/Onboarding";
import { seedMessages, type Message } from "@/lib/mockData";
import { getVeniceKey, getVeniceModel, type VeniceMessage } from "@/lib/venice";
import { runMemoryTurn, memoryModeFor } from "@/lib/memoryWrapper";
import { useVault } from "@/lib/useVault";

const BASE_SYSTEM = `You are BlindChat — a private, terminal-styled assistant. Be concise and direct. Markdown bold uses **double asterisks**.`;

const PANEL_COLLAPSED_KEY = "bc_memory_panel_collapsed_v1";

function shortTime(): string {
  return "just now";
}

export default function ChatPage() {
  const [hoveredIds, setHoveredIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>(seedMessages);
  const [model, setModel] = useState(getVeniceModel());
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { state: vaultState, memories, refresh, refreshing } = useVault();

  useEffect(() => {
    try {
      setPanelCollapsed(localStorage.getItem(PANEL_COLLAPSED_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(PANEL_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  async function handleSend(text: string) {
    if (isStreaming) return;
    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: shortTime(),
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: shortTime(),
      streaming: true,
      toolEvents: [],
    };

    setMessages((curr) => [...curr, userMsg, assistantMsg]);
    setIsStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    const apiKey = (() => {
      try {
        return getVeniceKey();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    })();
    if (!apiKey) {
      setIsStreaming(false);
      return;
    }

    const conversation: VeniceMessage[] = [
      ...messages.map<VeniceMessage>((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    const referencedMemoryIds: string[] = [];
    let mutated = false;

    try {
      for await (const ev of runMemoryTurn({
        apiKey,
        model,
        baseSystem: BASE_SYSTEM,
        conversation,
        signal: ac.signal,
        vaultReady: vaultState.phase === "ready",
      })) {
        if (ev.kind === "content") {
          setMessages((curr) =>
            curr.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + ev.delta }
                : m
            )
          );
        } else {
          for (const id of ev.entryIds) referencedMemoryIds.push(id);
          if (ev.name === "save_memory" || ev.name === "delete_memory") {
            mutated = mutated || ev.ok;
          }
          setMessages((curr) =>
            curr.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolEvents: [
                      ...(m.toolEvents ?? []),
                      { name: ev.name, summary: ev.summary, ok: ev.ok },
                    ],
                  }
                : m
            )
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((curr) =>
        curr.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `(error: ${msg})` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setMessages((curr) =>
        curr.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                streaming: false,
                injectedMemoryIds:
                  referencedMemoryIds.length > 0 ? referencedMemoryIds : undefined,
              }
            : m
        )
      );
      if (mutated || referencedMemoryIds.length > 0) {
        refresh().catch(() => {});
      }
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      // ⌘\ toggles the memory panel (⌘. collides with model picker on Mac).
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        togglePanel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  const lastInjected =
    [...messages].reverse().find((m) => m.injectedMemoryIds)?.injectedMemoryIds ?? [];

  const mode = memoryModeFor(model, vaultState.phase === "ready");

  return (
    <main className="h-screen w-screen flex bg-[var(--color-base)] overflow-hidden">
      <OnboardingProvider />
      <Sidebar vaultPhase={vaultState.phase} />

      <section className="flex-1 flex flex-col min-w-0">
        <ChatThread
          messages={messages}
          selectedMemoryIds={hoveredIds}
          onHoverMemoryIds={setHoveredIds}
        />
        {error && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-elevated)] px-8 py-2 font-mono text-[11px] text-[var(--color-warn)]">
            {error}
          </div>
        )}
        <MessageInput
          model={model}
          onModelChange={setModel}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          memoryMode={mode}
          vaultPhase={vaultState.phase}
        />
      </section>

      <MemoryPanel
        memories={memories}
        injectedIds={lastInjected}
        hoveredIds={hoveredIds}
        vaultState={vaultState}
        collapsed={panelCollapsed}
        onToggleCollapsed={togglePanel}
        onRefresh={refresh}
        refreshing={refreshing}
      />
    </main>
  );
}
