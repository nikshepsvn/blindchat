"use client";

import { useState } from "react";
import { saveVeniceKey, validateVeniceKey } from "@/lib/veniceKey";

/**
 * First-run setup modal — fires when no Venice key is present (and no
 * dev env-var fallback). User pastes their key, we validate it against
 * /v1/models, then persist to IndexedDB and unblock the chat.
 */
export function Setup({ onComplete }: { onComplete: (key: string) => void }) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "validating" | "saving" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const key = value.trim();
    if (!key) return;
    setError(null);
    setPhase("validating");
    try {
      const ok = await validateVeniceKey(key);
      if (!ok) {
        setPhase("error");
        setError("Venice rejected that key. Double-check it at venice.ai/settings/api.");
        return;
      }
      setPhase("saving");
      await saveVeniceKey(key);
      onComplete(key);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = phase === "validating" || phase === "saving";

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm backdrop-in">
      <div className="relative w-[520px] max-w-[94vw] bg-[var(--color-panel)] border border-[var(--color-border-strong)] shadow-[0_24px_72px_rgba(0,0,0,0.85)] flex flex-col modal-in">
        <div className="px-7 pt-7 pb-2">
          <div className="font-mono text-[10px] text-[var(--color-accent)] tracking-[0.28em] mb-2">
            SETUP · 01 / 01
          </div>
          <h2 className="font-[var(--font-display)] text-[30px] leading-[1.05] text-[var(--color-text-primary)] tracking-[0.01em]">
            connect to venice
          </h2>
          <p className="font-mono text-[12px] leading-[1.6] text-[var(--color-text-secondary)] mt-3 max-w-[60ch]">
            BlindChat uses Venice AI for TEE-hosted inference. Paste your API
            key below — it&apos;s stored only in your browser (IndexedDB) and
            sent only to Venice when you chat.
          </p>
        </div>

        <div className="px-7 py-4">
          <label className="block font-mono text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-[0.16em] mb-2">
            Venice API key
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[var(--color-accent)]">▸</span>
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (phase === "error") setPhase("idle");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) handleConnect();
              }}
              placeholder="VENICE-INFERENCE-KEY-…"
              disabled={busy}
              className="flex-1 bg-[var(--color-input)] border border-[var(--color-border)] focus:border-[var(--color-accent-dim)] px-3 py-2 font-mono text-[12.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none disabled:opacity-60"
            />
          </div>
          {error && (
            <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)] leading-[1.5]">
              {error}
            </p>
          )}
          <p className="mt-4 font-mono text-[10.5px] text-[var(--color-text-tertiary)] leading-[1.5]">
            Don&apos;t have one yet? Get a free key at{" "}
            <a
              href="https://venice.ai/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-bright)] underline underline-offset-2"
            >
              venice.ai/settings/api
            </a>
            . Or run BlindChat locally and set{" "}
            <code className="text-[var(--color-text-secondary)]">
              NEXT_PUBLIC_VENICE_API_KEY
            </code>{" "}
            in <code className="text-[var(--color-text-secondary)]">.env.local</code>.
          </p>
        </div>

        <div className="px-7 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
            <span className="inline-block h-1.5 w-1.5 bg-[var(--color-success)]" />
            <span>stays in your browser · never sent to us</span>
          </div>
          <button
            onClick={handleConnect}
            disabled={busy || value.trim().length === 0}
            className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-bright)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)] disabled:cursor-not-allowed text-[var(--color-base)] font-medium transition"
          >
            {phase === "validating"
              ? "validating…"
              : phase === "saving"
              ? "saving…"
              : "connect"}
            {!busy && (
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
