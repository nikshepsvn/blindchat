"use client";

// Multi-conversation persistence in IndexedDB.
//
// Schema:
//   conversations_index    → ConversationMeta[]
//   conversation:<id>      → StoredConversation
//   active_conversation_id → string
//
// Chat history stays local (not in the Nillion vault) to avoid the 3-5s
// write latency per turn and to keep the conversation off the wire. Memories
// the LLM curates are separate — those live in the vault.

import { kvGet, kvSet, kvDelete } from "@/lib/storage";
import type { Message } from "@/lib/mockData";

const INDEX_KEY = "conversations_index";
const ACTIVE_KEY = "active_conversation_id";
const PREFIX = "conversation:";
const SCHEMA_VERSION = 2;

export type ConversationMeta = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
};

type StoredConversation = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: Message[];
};

function uuid(): string {
  return crypto.randomUUID();
}

function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "new chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 40).trim()}…` : text;
}

function derivePreview(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const c = m?.content?.trim();
    if (c) return c.replace(/\s+/g, " ").slice(0, 80);
  }
  return "";
}

// ── public API ─────────────────────────────────────────────────────────────

export async function listConversations(): Promise<ConversationMeta[]> {
  const raw = await kvGet<ConversationMeta[]>(INDEX_KEY);
  if (!Array.isArray(raw)) return [];
  return [...raw].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function loadConversation(id: string): Promise<Message[]> {
  const raw = await kvGet<StoredConversation>(`${PREFIX}${id}`);
  if (!raw || !Array.isArray(raw.messages)) return [];
  return raw.messages.map((m) => ({ ...m, streaming: false }));
}

export async function saveConversation(
  id: string,
  messages: Message[]
): Promise<ConversationMeta> {
  const now = new Date().toISOString();
  const existing = await kvGet<StoredConversation>(`${PREFIX}${id}`);
  const createdAt = existing?.createdAt ?? now;
  const title = existing?.title?.startsWith("new chat") || !existing?.title
    ? deriveTitle(messages)
    : existing.title;
  const stored: StoredConversation = {
    id,
    version: SCHEMA_VERSION,
    createdAt,
    updatedAt: now,
    title,
    messages,
  };
  await kvSet(`${PREFIX}${id}`, stored);

  const meta: ConversationMeta = {
    id,
    title,
    preview: derivePreview(messages),
    updatedAt: now,
    messageCount: messages.length,
  };
  const index = (await kvGet<ConversationMeta[]>(INDEX_KEY)) ?? [];
  const filtered = index.filter((m) => m.id !== id);
  await kvSet(INDEX_KEY, [meta, ...filtered]);
  return meta;
}

export async function createConversation(): Promise<ConversationMeta> {
  const id = uuid();
  const now = new Date().toISOString();
  const meta: ConversationMeta = {
    id,
    title: "new chat",
    preview: "",
    updatedAt: now,
    messageCount: 0,
  };
  const index = (await kvGet<ConversationMeta[]>(INDEX_KEY)) ?? [];
  await kvSet(INDEX_KEY, [meta, ...index]);
  await kvSet(ACTIVE_KEY, id);
  return meta;
}

export async function deleteConversation(id: string): Promise<void> {
  await kvDelete(`${PREFIX}${id}`);
  const index = (await kvGet<ConversationMeta[]>(INDEX_KEY)) ?? [];
  await kvSet(INDEX_KEY, index.filter((m) => m.id !== id));
  const active = await kvGet<string>(ACTIVE_KEY);
  if (active === id) {
    // Pick newest remaining, or create a fresh one.
    const remaining = index.filter((m) => m.id !== id);
    if (remaining.length > 0) {
      await kvSet(ACTIVE_KEY, remaining[0]!.id);
    } else {
      await kvDelete(ACTIVE_KEY);
    }
  }
}

export async function getActiveConversationId(): Promise<string | null> {
  const id = await kvGet<string>(ACTIVE_KEY);
  if (!id) return null;
  // Validate it still exists.
  const exists = await kvGet<StoredConversation>(`${PREFIX}${id}`);
  if (!exists) {
    // Stale pointer. Pick the newest.
    const index = await listConversations();
    if (index.length > 0) {
      await kvSet(ACTIVE_KEY, index[0]!.id);
      return index[0]!.id;
    }
    return null;
  }
  return id;
}

export async function setActiveConversation(id: string): Promise<void> {
  await kvSet(ACTIVE_KEY, id);
}

