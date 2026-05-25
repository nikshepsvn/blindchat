"use client";

import { kvGet, kvSet, kvDelete, STORAGE_KEYS } from "@/lib/storage";

const DEFAULT_MODEL = "e2ee-qwen3-30b-a3b-p";
const VENICE_BASE = "https://api.venice.ai/api/v1";

/**
 * Resolution order for the Venice key:
 *   1. IndexedDB (what the user pasted in the setup modal)
 *   2. NEXT_PUBLIC_VENICE_API_KEY env (dev convenience only)
 *   3. null — caller should show the setup modal
 */
export async function readVeniceKey(): Promise<string | null> {
  const idb = await kvGet<string>(STORAGE_KEYS.veniceKey);
  if (idb) return idb;
  const env = process.env.NEXT_PUBLIC_VENICE_API_KEY;
  return env && env.length > 0 ? env : null;
}

export async function saveVeniceKey(key: string): Promise<void> {
  await kvSet(STORAGE_KEYS.veniceKey, key.trim());
}

export async function deleteVeniceKey(): Promise<void> {
  await kvDelete(STORAGE_KEYS.veniceKey);
}

export async function readVeniceModel(): Promise<string> {
  const idb = await kvGet<string>(STORAGE_KEYS.veniceModel);
  if (idb) return idb;
  return process.env.NEXT_PUBLIC_VENICE_MODEL ?? DEFAULT_MODEL;
}

export async function saveVeniceModel(modelId: string): Promise<void> {
  await kvSet(STORAGE_KEYS.veniceModel, modelId);
}

/**
 * Validate a Venice key by issuing a one-token chat completion. Costs ~1
 * token of inference but is the only reliable way to authenticate against
 * Venice — /v1/models is public.
 *
 * Returns true if Venice accepts the key, false on 401/403.
 * Throws on network errors so the caller can distinguish "bad key" from
 * "offline".
 */
export async function validateVeniceKey(key: string): Promise<boolean> {
  const r = await fetch(`${VENICE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Smallest, cheapest TEE model so probing burns the fewest credits.
      model: "e2ee-qwen-2-5-7b-p",
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 1,
      stream: false,
    }),
  });
  if (r.status === 401 || r.status === 403) return false;
  if (!r.ok) {
    // 400 / 5xx are not auth problems but still surface to user.
    const body = await r.text().catch(() => "");
    throw new Error(`Venice returned HTTP ${r.status}: ${body.slice(0, 120)}`);
  }
  return true;
}
