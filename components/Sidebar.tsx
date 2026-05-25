"use client";

import { OPEN_ONBOARDING_EVENT } from "@/components/Onboarding";

export function Sidebar({
  vaultPhase,
  onOpenSettings,
}: {
  vaultPhase: "loading" | "ready" | "error";
  onOpenSettings: () => void;
}) {
  const statusColor =
    vaultPhase === "ready"
      ? "bg-[var(--color-success)]"
      : vaultPhase === "error"
      ? "bg-[var(--color-warn)]"
      : "bg-[var(--color-text-tertiary)] pulse-dot";
  const statusLabel =
    vaultPhase === "ready"
      ? "vault online"
      : vaultPhase === "error"
      ? "vault error"
      : "vault opening";

  return (
    <aside className="w-[260px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-elevated)] flex flex-col">
      {/* Brand */}
      <div className="px-5 pt-5 pb-5">
        <div className="font-[var(--font-display)] text-[22px] leading-none tracking-[0.04em] text-[var(--color-accent-bright)] glow">
          blindchat
        </div>
      </div>

      {/* Threads — placeholder. Multi-conversation persistence is not yet wired,
          so we don't render the section until it is. */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="border-t border-[var(--color-border)] px-4 py-3 flex items-center justify-between text-[11px] font-mono text-[var(--color-text-tertiary)]">
        <div className="flex items-center gap-1.5" title={vaultPhase}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
          <span>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_EVENT))
            }
            className="hover:text-[var(--color-accent)] transition"
            title="re-open the welcome tour"
          >
            intro
          </button>
          <button
            onClick={onOpenSettings}
            className="hover:text-[var(--color-accent)] transition"
            title="keys, backup, reset"
          >
            settings
          </button>
        </div>
      </div>
    </aside>
  );
}
