"use client";

import { useEffect, useState, useCallback } from "react";
import {
  readVeniceKey,
  saveVeniceKey,
  deleteVeniceKey,
  readVeniceModel,
  saveVeniceModel,
} from "@/lib/veniceKey";

export type CredsState = {
  /** Initial async load completed? */
  ready: boolean;
  /** Venice key resolved from IDB/env, or null if user hasn't set one yet. */
  veniceKey: string | null;
  /** Selected model id. */
  model: string;
};

/**
 * Provides Venice credentials (key + selected model) to the app. The key is
 * persisted to IndexedDB; the model is persisted there too so user choices
 * survive reloads.
 */
export function useVeniceCreds() {
  const [state, setState] = useState<CredsState>({
    ready: false,
    veniceKey: null,
    model: "e2ee-qwen3-30b-a3b-p",
  });

  useEffect(() => {
    (async () => {
      const [veniceKey, model] = await Promise.all([
        readVeniceKey(),
        readVeniceModel(),
      ]);
      setState({ ready: true, veniceKey, model });
    })();
  }, []);

  const setVeniceKey = useCallback(async (key: string) => {
    await saveVeniceKey(key);
    setState((s) => ({ ...s, veniceKey: key.trim() }));
  }, []);

  const clearVeniceKey = useCallback(async () => {
    await deleteVeniceKey();
    setState((s) => ({ ...s, veniceKey: null }));
  }, []);

  const setModel = useCallback(async (modelId: string) => {
    await saveVeniceModel(modelId);
    setState((s) => ({ ...s, model: modelId }));
  }, []);

  /** Re-read from IDB. Used after settings panel mutates keys directly. */
  const reload = useCallback(async () => {
    const [veniceKey, model] = await Promise.all([
      readVeniceKey(),
      readVeniceModel(),
    ]);
    setState({ ready: true, veniceKey, model });
  }, []);

  return { state, setVeniceKey, clearVeniceKey, setModel, reload };
}
