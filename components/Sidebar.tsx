"use client";

import { OPEN_ONBOARDING_EVENT } from "@/components/Onboarding";

export function Sidebar({
  vaultPhase,
  onOpenSettings,
  onNewChat,
  hasMessages,
  newChatPending,
}: {
  vaultPhase: "loading" | "ready" | "error";
  onOpenSettings: () => void;
  onNewChat: () => void;
  hasMessages: boolean;
  newChatPending: boolean;
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
      <div className="px-5 pt-5 pb-4">
        <div className="font-[var(--font-display)] text-[22px] leading-none tracking-[0.04em] text-[var(--color-accent-bright)] glow">
          blindchat
        </div>
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <button
          onClick={onNewChat}
          disabled={!hasMessages}
          title={
            newChatPending
              ? "click again to confirm — current chat will be cleared"
              : hasMessages
              ? "clear current conversation · ⌘N"
              : "already a fresh chat"
          }
          className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-mono border transition disabled:opacity-40 disabled:cursor-not-allowed ${
            newChatPending
              ? "text-[var(--color-warn)] border-[var(--color-warn)]/60 bg-[var(--color-warn)]/[0.07]"
              : "text-[var(--color-text-secondary)] border-[var(--color-border)] enabled:hover:text-[var(--color-accent-bright)] enabled:hover:bg-[var(--color-input)] enabled:hover:border-[var(--color-accent-dim)]"
          }`}
        >
          <span
            className={
              newChatPending
                ? "text-[var(--color-warn)]"
                : "text-[var(--color-accent)]"
            }
          >
            {newChatPending ? "!" : "+"}
          </span>
          <span>{newChatPending ? "click again to confirm" : "new chat"}</span>
          {!newChatPending && (
            <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
              ⌘N
            </span>
          )}
        </button>
      </div>

      {/* Threads — placeholder. Multi-conversation list isn't wired yet; today
          we persist only the single active conversation to IndexedDB. */}
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
