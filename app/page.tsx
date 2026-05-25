"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatThread } from "@/components/ChatThread";
import { MemoryPanel } from "@/components/MemoryPanel";
import { MessageInput } from "@/components/MessageInput";
import { OnboardingProvider } from "@/components/Onboarding";
import { Setup } from "@/components/Setup";
import { Settings } from "@/components/Settings";
import { seedMessages, type Message } from "@/lib/mockData";
import { type VeniceMessage } from "@/lib/venice";
import { runMemoryTurn, memoryModeFor } from "@/lib/memoryWrapper";
import { useVault } from "@/lib/useVault";
import { useVeniceCreds } from "@/lib/useVeniceKey";
import { kvGet, kvSet, STORAGE_KEYS } from "@/lib/storage";
import {
  readConversation,
  writeConversation,
  clearConversation,
} from "@/lib/conversation";

const BASE_SYSTEM = `You are BlindChat — a private, terminal-styled assistant. Be concise and direct. Markdown bold uses **double asterisks**.`;

function shortTime(): string {
  return "just now";
}

export default function ChatPage() {
  const [hoveredIds, setHoveredIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>(seedMessages);
  const [convHydrated, setConvHydrated] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { state: vaultState, memories, refresh, refreshing } = useVault();
  const {
    state: credsState,
    setVeniceKey,
    setModel,
    reload: reloadCreds,
  } = useVeniceCreds();

  // Restore the prior conversation from IDB on mount.
  useEffect(() => {
    (async () => {
      const prior = await readConversation();
      if (prior.length > 0) setMessages(prior);
      setConvHydrated(true);
    })();
  }, []);

  // Persist on every message change (but not until hydrated, otherwise the
  // initial empty seed would wipe what's in IDB).
  useEffect(() => {
    if (!convHydrated) return;
    if (isStreaming) return; // don't churn IDB during a stream; save on finish
    if (messages.length === 0) {
      clearConversation().catch(() => {});
    } else {
      writeConversation(messages).catch(() => {});
    }
  }, [messages, convHydrated, isStreaming]);

  useEffect(() => {
    (async () => {
      const v = await kvGet<boolean | string>(STORAGE_KEYS.panelCollapsed);
      setPanelCollapsed(v === true || v === "1");
    })();
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((c) => {
      const next = !c;
      kvSet(STORAGE_KEYS.panelCollapsed, next).catch(() => {});
      return next;
    });
  }, []);

  // Two-click confirm: first click sets pending, second click within 4s
  // commits. Native confirm() blocks the page and we don't want that.
  const [newChatPending, setNewChatPending] = useState(false);
  const newChatTimer = useRef<number | null>(null);

  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    if (messages.length === 0) {
      // Nothing to clear — never need a confirm.
      return;
    }
    if (!newChatPending) {
      setNewChatPending(true);
      if (newChatTimer.current) window.clearTimeout(newChatTimer.current);
      newChatTimer.current = window.setTimeout(() => {
        setNewChatPending(false);
        newChatTimer.current = null;
      }, 4000);
      return;
    }
    // Confirmed.
    if (newChatTimer.current) {
      window.clearTimeout(newChatTimer.current);
      newChatTimer.current = null;
    }
    setNewChatPending(false);
    setMessages([]);
    setError(null);
    clearConversation().catch(() => {});
  }, [isStreaming, messages.length, newChatPending]);

  async function handleSend(text: string) {
    if (isStreaming) return;
    if (!credsState.veniceKey) {
      setError("Venice key missing — paste one in setup to send messages.");
      return;
    }
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

    const conversation: VeniceMessage[] = [
      ...messages.map<VeniceMessage>((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    const referencedMemoryIds: string[] = [];
    let mutated = false;

    try {
      for await (const ev of runMemoryTurn({
        apiKey: credsState.veniceKey,
        model: credsState.model,
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
      // ⌘N starts a new chat.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        handleNewChat();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel, handleNewChat]);

  const lastInjected =
    [...messages].reverse().find((m) => m.injectedMemoryIds)?.injectedMemoryIds ?? [];

  const mode = memoryModeFor(credsState.model, vaultState.phase === "ready");
  const needsSetup = credsState.ready && !credsState.veniceKey;

  return (
    <main className="h-screen w-screen flex bg-[var(--color-base)] overflow-hidden">
      <OnboardingProvider />
      {needsSetup && <Setup onComplete={setVeniceKey} />}
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onCredsChanged={reloadCreds}
      />
      <Sidebar
        vaultPhase={vaultState.phase}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={handleNewChat}
        hasMessages={messages.length > 0}
        newChatPending={newChatPending}
      />

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
          model={credsState.model}
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
