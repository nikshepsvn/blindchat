"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { openVault, type MemoryEntry } from "@/lib/vault";

export type VaultState =
  | { phase: "loading" }
  | { phase: "ready"; collectionId: string }
  | { phase: "error"; message: string };

/**
 * Opens the local BlindCache vault once and exposes the memory list plus a
 * refresh helper. Also polls every `pollMs` to pick up writes from other tabs
 * or background sources. Polling pauses when the document is hidden.
 */
export function useVault(pollMs = 20_000) {
  const [state, setState] = useState<VaultState>({ phase: "loading" });
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const openedRef = useRef(false);

  const refresh = useCallback(async (limit = 50) => {
    setRefreshing(true);
    try {
      const vault = await openVault();
      const list = await vault.list(limit);
      setMemories(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn("[blindcache] refresh failed:", msg);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial open + list.
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    (async () => {
      try {
        const vault = await openVault();
        setState({ phase: "ready", collectionId: vault.getCollectionId() });
        const list = await vault.list(50);
        setMemories(list);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error("[blindcache] open failed:", e);
        setState({ phase: "error", message: msg });
      }
    })();
  }, []);

  // Polling — only when vault is ready and tab is visible.
  useEffect(() => {
    if (state.phase !== "ready" || pollMs <= 0) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (cancelled) return;
      refresh().catch(() => {});
    }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [state.phase, pollMs, refresh]);

  const deleteOne = useCallback(
    async (id: string) => {
      const vault = await openVault();
      await vault.delete(id);
      // Optimistic update so the card disappears immediately; refresh
      // reconciles with the truth from nilDB.
      setMemories((curr) => curr.filter((m) => m.id !== id));
      refresh().catch(() => {});
    },
    [refresh]
  );

  const deleteAll = useCallback(
    async (onProgress?: (done: number, total: number) => void) => {
      const vault = await openVault();
      // Pull the full list (max page) — list() already caps to 50, so we
      // loop until empty in case there are more.
      let removed = 0;
      while (true) {
        const list = await vault.list(50);
        if (list.length === 0) break;
        const total = removed + list.length;
        for (const entry of list) {
          await vault.delete(entry.id);
          removed++;
          onProgress?.(removed, total);
        }
        // If we got fewer than 50, no more pages.
        if (list.length < 50) break;
      }
      setMemories([]);
      return removed;
    },
    []
  );

  return { state, memories, refresh, refreshing, deleteOne, deleteAll };
}
