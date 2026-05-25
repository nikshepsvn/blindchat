"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  listConversations,
  loadConversation,
  saveConversation,
  createConversation,
  deleteConversation,
  clearAllConversations,
  getActiveConversationId,
  setActiveConversation,
  type ConversationMeta,
} from "@/lib/conversation";
import type { Message } from "@/lib/mockData";

export function useConversations() {
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const lastSavedActive = useRef<string | null>(null);

  // Initial hydrate: load thread list + restore active conversation.
  useEffect(() => {
    (async () => {
      const list = await listConversations();
      let id = await getActiveConversationId();
      if (!id && list.length === 0) {
        // First-ever load: create an empty starter thread so the user has
        // something to type into.
        const meta = await createConversation();
        id = meta.id;
        setThreads([meta]);
        setMessages([]);
      } else if (!id && list.length > 0) {
        id = list[0]!.id;
        await setActiveConversation(id);
        setThreads(list);
        setMessages(await loadConversation(id));
      } else {
        setThreads(list);
        setMessages(id ? await loadConversation(id) : []);
      }
      setActiveIdState(id);
      lastSavedActive.current = id;
      setHydrated(true);
    })();
  }, []);

  const refreshThreads = useCallback(async () => {
    setThreads(await listConversations());
  }, []);

  const switchTo = useCallback(async (id: string) => {
    setActiveIdState(id);
    await setActiveConversation(id);
    setMessages(await loadConversation(id));
  }, []);

  const newChat = useCallback(async () => {
    const meta = await createConversation();
    setActiveIdState(meta.id);
    setMessages([]);
    await refreshThreads();
    return meta.id;
  }, [refreshThreads]);

  const deleteThread = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      await refreshThreads();
      // If we deleted the active one, hydrate freshly.
      if (id === activeId) {
        const newActive = await getActiveConversationId();
        if (newActive) {
          setActiveIdState(newActive);
          setMessages(await loadConversation(newActive));
        } else {
          const fresh = await createConversation();
          setActiveIdState(fresh.id);
          setMessages([]);
          await refreshThreads();
        }
      }
    },
    [activeId, refreshThreads]
  );

  // Persist messages on every change (debounced via React batching). Skip
  // until hydration completes so we don't write an empty array over the
  // restored data.
  useEffect(() => {
    if (!hydrated || !activeId) return;
    // No-op when nothing changed. Empty threads still get persisted so they
    // show up in the list.
    saveConversation(activeId, messages)
      .then(() => refreshThreads())
      .catch(() => {});
  }, [messages, activeId, hydrated, refreshThreads]);

  /** Wipe all conversations, then immediately mint a fresh empty one. */
  const clearAll = useCallback(async () => {
    await clearAllConversations();
    const fresh = await createConversation();
    setThreads([fresh]);
    setActiveIdState(fresh.id);
    setMessages([]);
  }, []);

  return {
    hydrated,
    threads,
    activeId,
    messages,
    setMessages,
    switchTo,
    newChat,
    deleteThread,
    clearAll,
  };
}
