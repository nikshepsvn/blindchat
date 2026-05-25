"use client";

// Single-conversation persistence in IndexedDB.
//
// The chat history is sensitive but mostly ephemeral — keeping it local
// (not in the Nillion vault) avoids 3-5s write latency per turn and keeps
// it off the wire entirely. Users who want cross-device chat can back up
// via the export flow (next iteration extends that file to include the
// active conversation snapshot).

import { kvGet, kvSet, kvDelete } from "@/lib/storage";
import type { Message } from "@/lib/mockData";

const CONV_KEY = "active_conversation";
const SCHEMA_VERSION = 1;

type StoredConversation = {
  version: number;
  updatedAt: string;
  messages: Message[];
};

export async function readConversation(): Promise<Message[]> {
  const raw = await kvGet<StoredConversation>(CONV_KEY);
  if (!raw) return [];
  if (raw.version !== SCHEMA_VERSION) return [];
  // Always reset streaming flags — if we crashed mid-stream they'd be stuck on.
  return raw.messages.map((m) => ({ ...m, streaming: false }));
}

export async function writeConversation(messages: Message[]): Promise<void> {
  const payload: StoredConversation = {
    version: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    messages,
  };
  await kvSet(CONV_KEY, payload);
}

export async function clearConversation(): Promise<void> {
  await kvDelete(CONV_KEY);
}
