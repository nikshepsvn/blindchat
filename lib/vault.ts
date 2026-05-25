// Browser-side BlindCache wrapper.
//
// Reads the NUC private key + collection ID from IndexedDB (migrating from
// legacy localStorage on first run). Opens the vault against Nillion testnet
// nodes. The vault handle is memoized so React StrictMode double-effects
// don't open it twice.
//
// We dynamically-import @nillion/* + blindcache-core because the SDK reads
// `process.env` at module-evaluation time — we have to install a browser shim
// for `process` before any of that code runs.

"use client";

import type { Vault as VaultType, MemoryEntry, SearchInput } from "blindcache-core";
import { kvGet, kvSet, kvDelete, STORAGE_KEYS } from "@/lib/storage";

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

function genHexKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getOrCreatePrivateKey(): Promise<string> {
  const existing = await kvGet<string>(STORAGE_KEYS.nucPrivateKey);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return existing;
  const hex = genHexKey();
  await kvSet(STORAGE_KEYS.nucPrivateKey, hex);
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
      const privateKey = await getOrCreatePrivateKey();
      const signer = Signer.fromPrivateKey(privateKey, "key");
      const collectionId =
        (await kvGet<string>(STORAGE_KEYS.collectionId)) ?? undefined;
      const vault = await Vault.openWithSigner(signer, {
        dbs: TESTNET_DBS,
        collectionId,
        builderName: "blindchat",
      });
      const id = vault.getCollectionId();
      if (id !== collectionId) await kvSet(STORAGE_KEYS.collectionId, id);
      return vault;
    })();
  }
  return vaultPromise;
}

export type { MemoryEntry, SearchInput };

/** Clear vault identity and force a fresh key + collection on next open. */
export async function resetVault(): Promise<void> {
  await kvDelete(STORAGE_KEYS.nucPrivateKey);
  await kvDelete(STORAGE_KEYS.collectionId);
  vaultPromise = null;
}

/** Replace the active key + collection (used by the import-backup flow). */
export async function adoptIdentity(opts: {
  privateKey: string;
  collectionId?: string;
}): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(opts.privateKey)) {
    throw new Error("private key must be a 64-character hex string");
  }
  await kvSet(STORAGE_KEYS.nucPrivateKey, opts.privateKey);
  if (opts.collectionId) {
    await kvSet(STORAGE_KEYS.collectionId, opts.collectionId);
  } else {
    await kvDelete(STORAGE_KEYS.collectionId);
  }
  vaultPromise = null;
}

/** Read the current identity (for the settings panel display + export). */
export async function readIdentity(): Promise<{
  privateKey: string | null;
  collectionId: string | null;
}> {
  return {
    privateKey: await kvGet<string>(STORAGE_KEYS.nucPrivateKey),
    collectionId: await kvGet<string>(STORAGE_KEYS.collectionId),
  };
}
