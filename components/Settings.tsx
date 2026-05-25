"use client";

import { useEffect, useState, useCallback } from "react";
import {
  readVeniceKey,
  saveVeniceKey,
  deleteVeniceKey,
  validateVeniceKey,
} from "@/lib/veniceKey";
import { readIdentity, resetVault, adoptIdentity } from "@/lib/vault";
import { kvClear } from "@/lib/storage";

type Phase = "idle" | "saving" | "error" | "success";

function mask(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 2) return "•".repeat(s.length);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function Settings({
  open,
  onClose,
  onCredsChanged,
  onClearChats,
  onClearMemories,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired when the venice key changes, so the parent can re-read creds. */
  onCredsChanged: () => void;
  /** Wipe all local conversations (preserves the vault). */
  onClearChats: () => Promise<void>;
  /** Iterate vault.delete for every entry. May take 10-30s for many. */
  onClearMemories: (
    onProgress?: (done: number, total: number) => void
  ) => Promise<number>;
}) {
  const [veniceKey, setVeniceKeyState] = useState<string | null>(null);
  const [nucKey, setNucKey] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [vk, id] = await Promise.all([readVeniceKey(), readIdentity()]);
    setVeniceKeyState(vk);
    setNucKey(id.privateKey);
    setCollectionId(id.collectionId);
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      setEditingKey(false);
      setNewKey("");
      setPhase("idle");
      setMessage(null);
    }
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSaveKey() {
    const k = newKey.trim();
    if (!k) return;
    setPhase("saving");
    setMessage(null);
    try {
      const ok = await validateVeniceKey(k);
      if (!ok) {
        setPhase("error");
        setMessage("Venice rejected that key.");
        return;
      }
      await saveVeniceKey(k);
      onCredsChanged();
      await refresh();
      setEditingKey(false);
      setNewKey("");
      setPhase("success");
      setMessage("Venice key updated.");
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  const [removePending, setRemovePending] = useState(false);
  async function handleRemoveVenice() {
    if (!removePending) {
      setRemovePending(true);
      setTimeout(() => setRemovePending(false), 4000);
      return;
    }
    setRemovePending(false);
    await deleteVeniceKey();
    onCredsChanged();
    await refresh();
    setPhase("success");
    setMessage("Venice key removed.");
  }

  async function handleExport() {
    if (!nucKey) return;
    const payload = {
      version: 1,
      kind: "blindchat-backup",
      createdAt: new Date().toISOString(),
      nillionPrivateKey: nucKey,
      collectionId: collectionId ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blindchat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setPhase("success");
    setMessage("Backup downloaded.");
  }

  async function handleImport(file: File) {
    setPhase("saving");
    setMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.kind !== "blindchat-backup") {
        throw new Error("Not a BlindChat backup file.");
      }
      if (typeof data.nillionPrivateKey !== "string") {
        throw new Error("Backup is missing nillionPrivateKey.");
      }
      await adoptIdentity({
        privateKey: data.nillionPrivateKey,
        collectionId:
          typeof data.collectionId === "string" ? data.collectionId : undefined,
      });
      setPhase("success");
      setMessage("Imported. Reload the page to open the restored vault.");
      await refresh();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  const [resetPending, setResetPending] = useState(false);
  async function handleResetAll() {
    if (!resetPending) {
      setResetPending(true);
      setTimeout(() => setResetPending(false), 4000);
      return;
    }
    setResetPending(false);
    await deleteVeniceKey();
    await resetVault();
    await kvClear();
    onCredsChanged();
    await refresh();
    setPhase("success");
    setMessage("Reset complete. Reload to start fresh.");
  }

  const [chatsPending, setChatsPending] = useState(false);
  const [chatsBusy, setChatsBusy] = useState(false);
  async function handleClearChats() {
    if (!chatsPending) {
      setChatsPending(true);
      setTimeout(() => setChatsPending(false), 4000);
      return;
    }
    setChatsPending(false);
    setChatsBusy(true);
    try {
      await onClearChats();
      setPhase("success");
      setMessage("All chats cleared. A fresh empty thread is open.");
    } finally {
      setChatsBusy(false);
    }
  }

  const [memPending, setMemPending] = useState(false);
  const [memBusy, setMemBusy] = useState(false);
  const [memProgress, setMemProgress] = useState<{ done: number; total: number } | null>(null);
  async function handleClearMemories() {
    if (!memPending) {
      setMemPending(true);
      setTimeout(() => setMemPending(false), 4000);
      return;
    }
    setMemPending(false);
    setMemBusy(true);
    setMemProgress({ done: 0, total: 0 });
    try {
      const removed = await onClearMemories((done, total) => {
        setMemProgress({ done, total });
      });
      setPhase("success");
      setMessage(
        removed === 0
          ? "Vault was already empty."
          : `Deleted ${removed} memor${removed === 1 ? "y" : "ies"} from the vault.`
      );
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setMemBusy(false);
      setMemProgress(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[450] flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm backdrop-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[600px] max-w-[94vw] max-h-[90vh] bg-[var(--color-panel)] border border-[var(--color-border-strong)] shadow-[0_24px_72px_rgba(0,0,0,0.85)] flex flex-col modal-in"
      >
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute top-3 right-3 z-10 w-7 h-7 grid place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-input)] transition"
        >
          ✕
        </button>

        <div className="px-7 pt-6 pb-3">
          <div className="font-mono text-[10px] text-[var(--color-accent)] tracking-[0.28em] mb-2">
            SETTINGS
          </div>
          <h2 className="font-[var(--font-display)] text-[28px] leading-[1.05] text-[var(--color-text-primary)] tracking-[0.01em]">
            your keys
          </h2>
        </div>

        <div className="px-7 pb-3 flex-1 overflow-y-auto thin-scroll space-y-5">
          {/* Venice key */}
          <Section title="venice key" subtitle="bearer token used to call the TEE inference endpoint.">
            {editingKey ? (
              <div className="space-y-2">
                <input
                  type="password"
                  autoFocus
                  value={newKey}
                  onChange={(e) => {
                    setNewKey(e.target.value);
                    if (phase === "error") setPhase("idle");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveKey();
                  }}
                  placeholder="VENICE-INFERENCE-KEY-…"
                  className="w-full bg-[var(--color-input)] border border-[var(--color-border)] focus:border-[var(--color-accent-dim)] px-3 py-2 font-mono text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveKey}
                    disabled={phase === "saving" || newKey.trim().length === 0}
                    className="font-mono text-[10.5px] uppercase tracking-[0.16em] px-3 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-bright)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)] text-[var(--color-base)] font-medium transition"
                  >
                    {phase === "saving" ? "validating…" : "save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingKey(false);
                      setNewKey("");
                      setPhase("idle");
                    }}
                    className="font-mono text-[10.5px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] px-2 py-1.5 transition"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <code className="font-mono text-[11.5px] text-[var(--color-text-secondary)]">
                  {veniceKey ? mask(veniceKey) : "(none set)"}
                </code>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setEditingKey(true)}
                    className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-accent)] hover:text-[var(--color-accent-bright)] transition"
                  >
                    {veniceKey ? "change" : "set"}
                  </button>
                  {veniceKey && (
                    <button
                      onClick={handleRemoveVenice}
                      className={`font-mono text-[10.5px] uppercase tracking-[0.16em] transition ${
                        removePending
                          ? "text-[var(--color-warn)]"
                          : "text-[var(--color-text-tertiary)] hover:text-[var(--color-warn)]"
                      }`}
                    >
                      {removePending ? "click to confirm" : "remove"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* Nillion identity */}
          <Section title="nillion key" subtitle="signs NUC tokens. derives your DID and your vault.">
            <div className="space-y-1.5 font-mono text-[11.5px] text-[var(--color-text-secondary)]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-tertiary)]">private key</span>
                <code>{nucKey ? mask(nucKey, 8, 6) : "(none)"}</code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-text-tertiary)]">collection</span>
                <code>{collectionId ? mask(collectionId, 8, 6) : "(none)"}</code>
              </div>
            </div>
          </Section>

          {/* Backup */}
          <Section title="backup" subtitle="export the nillion key + collection id so you can restore on another device.">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExport}
                disabled={!nucKey}
                className="font-mono text-[10.5px] uppercase tracking-[0.16em] px-3 py-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent-dim)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-bright)] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                export backup
              </button>
              <label className="font-mono text-[10.5px] uppercase tracking-[0.16em] px-3 py-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent-dim)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-bright)] transition cursor-pointer">
                import backup
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="font-mono text-[10.5px] text-[var(--color-text-tertiary)] mt-2 leading-[1.5]">
              the file contains your nillion private key — treat it like a password.
            </p>
          </Section>

          {/* Granular clears */}
          <Section
            title="clear data"
            subtitle="targeted deletes — local chats stay local; memory deletes go to the vault and can't be undone."
            warn
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleClearChats}
                disabled={chatsBusy}
                className={`font-mono text-[10.5px] uppercase tracking-[0.16em] px-3 py-1.5 border transition disabled:opacity-50 ${
                  chatsPending
                    ? "border-[var(--color-warn)] bg-[var(--color-warn)]/[0.1] text-[var(--color-warn)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-warn)] text-[var(--color-text-secondary)] hover:text-[var(--color-warn)]"
                }`}
              >
                {chatsBusy
                  ? "clearing…"
                  : chatsPending
                  ? "click again — clear chats"
                  : "clear all chats"}
              </button>
              <button
                onClick={handleClearMemories}
                disabled={memBusy}
                className={`font-mono text-[10.5px] uppercase tracking-[0.16em] px-3 py-1.5 border transition disabled:opacity-50 ${
                  memPending
                    ? "border-[var(--color-warn)] bg-[var(--color-warn)]/[0.1] text-[var(--color-warn)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-warn)] text-[var(--color-text-secondary)] hover:text-[var(--color-warn)]"
                }`}
              >
                {memBusy
                  ? memProgress
                    ? `deleting ${memProgress.done}/${memProgress.total}…`
                    : "deleting…"
                  : memPending
                  ? "click again — clear vault"
                  : "clear all memories"}
              </button>
            </div>
            <p className="font-mono text-[10.5px] text-[var(--color-text-tertiary)] mt-3 leading-[1.5]">
              chats live in this browser only. memories live in nillion — clearing them sends one delete per entry across the 3 nodes (may take a few seconds).
            </p>
          </Section>

          {/* Nuclear */}
          <Section
            title="danger zone"
            subtitle="reset everything in your browser (venice key + nillion identity + chats). memories already in the vault become orphaned unless you exported a backup."
            warn
          >
            <button
              onClick={handleResetAll}
              className={`font-mono text-[10.5px] uppercase tracking-[0.16em] px-3 py-1.5 border text-[var(--color-warn)] transition ${
                resetPending
                  ? "border-[var(--color-warn)] bg-[var(--color-warn)]/[0.1]"
                  : "border-[var(--color-warn)]/40 hover:border-[var(--color-warn)]"
              }`}
            >
              {resetPending ? "click again to confirm" : "reset everything"}
            </button>
          </Section>
        </div>

        {message && (
          <div
            className={`px-7 py-2.5 border-t border-[var(--color-border)] font-mono text-[11px] ${
              phase === "error"
                ? "text-[var(--color-warn)]"
                : "text-[var(--color-success)]"
            }`}
          >
            {message}
          </div>
        )}

        <div className="px-7 py-3 border-t border-[var(--color-border)] flex items-center justify-between font-mono text-[10px] text-[var(--color-text-tertiary)]">
          <span>esc to close</span>
          <span>v0.0.1 · preview</span>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  warn,
  children,
}: {
  title: string;
  subtitle?: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-4 pr-2 py-2">
      <span
        className={`absolute left-0 top-2 bottom-2 w-[2px] ${
          warn ? "bg-[var(--color-warn)]" : "bg-[var(--color-accent)]"
        } opacity-70`}
      />
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.18em] mb-1.5 ${
          warn ? "text-[var(--color-warn)]" : "text-[var(--color-accent)]"
        }`}
      >
        {title}
      </div>
      {subtitle && (
        <p className="font-mono text-[11px] text-[var(--color-text-tertiary)] mb-2.5 leading-[1.5]">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
