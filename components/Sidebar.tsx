"use client";

import { useState, useRef } from "react";
import { OPEN_ONBOARDING_EVENT } from "@/components/Onboarding";
import type { ConversationMeta } from "@/lib/conversation";

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function Sidebar({
  vaultPhase,
  onOpenSettings,
  onNewChat,
  threads,
  activeId,
  onSwitchThread,
  onDeleteThread,
  open,
  onClose,
}: {
  vaultPhase: "loading" | "ready" | "error";
  onOpenSettings: () => void;
  onNewChat: () => void;
  threads: ConversationMeta[];
  activeId: string | null;
  onSwitchThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  /** Mobile: whether the drawer is open. Desktop ignores this and always shows. */
  open: boolean;
  /** Close handler for mobile drawer. */
  onClose: () => void;
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
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={`md:hidden fixed inset-0 z-[40] bg-black/60 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        className={`fixed md:relative z-[45] top-0 left-0 h-full w-[280px] md:w-[260px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-elevated)] flex flex-col transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
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
            title="start a new conversation · ⌘N"
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-accent-bright)] hover:bg-[var(--color-input)] border border-[var(--color-border)] hover:border-[var(--color-accent-dim)] transition"
          >
            <span className="text-[var(--color-accent)]">+</span>
            <span>new chat</span>
            <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
              ⌘N
            </span>
          </button>
        </div>

        {/* Threads */}
        <div className="flex-1 overflow-y-auto thin-scroll px-2 pb-3">
          {threads.length === 0 && (
            <div className="px-3 py-4 font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
              no chats yet
            </div>
          )}
          {threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              active={t.id === activeId}
              onSwitch={() => onSwitchThread(t.id)}
              onDelete={() => onDeleteThread(t.id)}
            />
          ))}
        </div>

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
    </>
  );
}

function ThreadRow({
  thread,
  active,
  onSwitch,
  onDelete,
}: {
  thread: ConversationMeta;
  active: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimer = useRef<number | null>(null);

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!pendingDelete) {
      setPendingDelete(true);
      if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
      deleteTimer.current = window.setTimeout(() => {
        setPendingDelete(false);
        deleteTimer.current = null;
      }, 3000);
      return;
    }
    if (deleteTimer.current) {
      window.clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
    }
    onDelete();
  }

  return (
    <div
      onClick={onSwitch}
      className={`group cursor-pointer relative px-3 py-2.5 mb-0.5 transition border-l-2 ${
        active
          ? "bg-[var(--color-input)] border-l-[var(--color-accent)]"
          : "border-l-transparent hover:bg-[var(--color-input)]/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div
            className={`text-[12px] truncate font-mono leading-tight ${
              active
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-secondary)]"
            }`}
          >
            {thread.title}
          </div>
          {thread.preview && (
            <div className="text-[10px] text-[var(--color-text-tertiary)] truncate mt-1 leading-tight font-mono">
              {thread.preview}
            </div>
          )}
        </div>
        <span className="font-mono text-[9.5px] text-[var(--color-text-tertiary)] shrink-0 mt-0.5">
          {relativeTime(thread.updatedAt)}
        </span>
      </div>
      <button
        onClick={handleDeleteClick}
        title={pendingDelete ? "click again to confirm" : "delete chat"}
        className={`absolute top-2.5 right-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
          pendingDelete
            ? "text-[var(--color-warn)] opacity-100"
            : "text-[var(--color-text-tertiary)] hover:text-[var(--color-warn)] opacity-0 group-hover:opacity-100"
        }`}
      >
        {pendingDelete ? "?" : "✕"}
      </button>
    </div>
  );
}
