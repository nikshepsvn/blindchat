// Tiny typed IndexedDB key/value store. We use IDB instead of localStorage
// because (a) we'll wrap CryptoKeys here once the passkey envelope lands —
// IDB can store binary natively, and (b) async access keeps the main thread
// free during the 3-5s vault warmup.
//
// One-shot migration on first read pulls any legacy values out of
// localStorage. Future loads only ever touch IDB.

"use client";

const DB_NAME = "blindchat";
const DB_VERSION = 1;
const STORE = "kv";

// Legacy localStorage keys we migrate from on first read.
const LEGACY_MAP: Record<string, string> = {
  bc_nuc_privkey_v1: "nuc_private_key",
  bc_collection_id_v1: "collection_id",
  bc_onboarding_seen_v1: "onboarding_seen",
  bc_memory_panel_collapsed_v1: "panel_collapsed",
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    });
  }
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("IDB tx failed"));
  });
}

/** Migrate legacy localStorage entries the first time we touch IDB. */
let migrated = false;
async function runMigration(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    for (const [legacyKey, newKey] of Object.entries(LEGACY_MAP)) {
      const v = localStorage.getItem(legacyKey);
      if (v === null) continue;
      // Only migrate if IDB doesn't already have this key.
      const existing = await tx("readonly", (s) => s.get(newKey));
      if (existing === undefined) {
        await tx("readwrite", (s) => s.put(v, newKey));
      }
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Migration is best-effort; if it fails we just keep going.
  }
}

export async function kvGet<T = string>(key: string): Promise<T | null> {
  await runMigration();
  const v = await tx<T>("readonly", (s) => s.get(key));
  return v === undefined ? null : v;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await runMigration();
  await tx("readwrite", (s) => s.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  await runMigration();
  await tx("readwrite", (s) => s.delete(key));
}

export async function kvClear(): Promise<void> {
  await runMigration();
  await tx("readwrite", (s) => s.clear());
}

// ── named accessors (so call sites stay typed) ─────────────────────────────

export const STORAGE_KEYS = {
  veniceKey: "venice_api_key",
  veniceModel: "venice_model",
  nucPrivateKey: "nuc_private_key",
  collectionId: "collection_id",
  onboardingSeen: "onboarding_seen",
  panelCollapsed: "panel_collapsed",
} as const;
