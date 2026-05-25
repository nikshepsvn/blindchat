// Browser-side BlindCache wrapper.
//
// Generates an ephemeral NUC key on first load (stored in localStorage) and
// uses it to open a Vault against Nillion testnet nodes. The vault handle is
// memoized so React StrictMode double-effects don't open it twice.
//
// We dynamically-import @nillion/* + blindcache-core because the SDK reads
// `process.env` at module-evaluation time — we have to install a browser shim
// for `process` before any of that code runs.

"use client";

import type { Vault as VaultType, MemoryEntry, SearchInput } from "blindcache-core";

const KEY_STORAGE = "bc_nuc_privkey_v1";
const COLLECTION_STORAGE = "bc_collection_id_v1";

const TESTNET_DBS = [
  "https://nildb-stg-n1.nillion.network",
  "https://nildb-stg-n2.nillion.network",
  "https://nildb-stg-n3.nillion.network",
];

function shimNodeGlobals() {
  const g = globalThis as unknown as {
    process?: { env: Record<string, string | undefined> };
    Buffer?: unknown;
  };
  if (typeof g.process === "undefined") {
    g.process = { env: {} };
  } else if (!g.process.env) {
    g.process.env = {};
  }
}

function getOrCreatePrivateKey(): string {
  const existing = localStorage.getItem(KEY_STORAGE);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(KEY_STORAGE, hex);
  return hex;
}

let vaultPromise: Promise<VaultType> | null = null;

export function openVault(): Promise<VaultType> {
  if (!vaultPromise) {
    vaultPromise = (async () => {
      shimNodeGlobals();
      const [{ Signer }, { Vault }] = await Promise.all([
        import("@nillion/nuc"),
        import("blindcache-core"),
      ]);
      const privateKey = getOrCreatePrivateKey();
      const signer = Signer.fromPrivateKey(privateKey, "key");
      const collectionId =
        localStorage.getItem(COLLECTION_STORAGE) ?? undefined;
      const vault = await Vault.openWithSigner(signer, {
        dbs: TESTNET_DBS,
        collectionId,
        builderName: "blindchat",
      });
      const id = vault.getCollectionId();
      if (id !== collectionId) localStorage.setItem(COLLECTION_STORAGE, id);
      return vault;
    })();
  }
  return vaultPromise;
}

export type { MemoryEntry, SearchInput };

export function resetVault() {
  localStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(COLLECTION_STORAGE);
  vaultPromise = null;
}
