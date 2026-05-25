"use client";

import { useState } from "react";
import type { MemoryEntry } from "@/lib/vault";
import type { VaultState } from "@/lib/useVault";

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function MemoryPanel({
  memories,
  injectedIds,
  hoveredIds,
  vaultState,
  collapsed,
  onToggleCollapsed,
  onRefresh,
  refreshing,
  open,
  onClose,
}: {
  memories: MemoryEntry[];
  injectedIds: string[];
  hoveredIds: string[];
  vaultState: VaultState;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** Mobile drawer state. Desktop ignores and always renders. */
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"all" | "injected">("all");

  const focusIds = hoveredIds.length > 0 ? hoveredIds : injectedIds;
  const injected = memories.filter((m) => focusIds.includes(m.id));
  const list = tab === "injected" ? injected : memories;

  const statusDot =
    vaultState.phase === "ready"
      ? "bg-[var(--color-success)]"
      : vaultState.phase === "error"
      ? "bg-[var(--color-warn)]"
      : "bg-[var(--color-text-tertiary)] pulse-dot";

  // Collapsed rail — desktop only; on mobile the panel is a drawer.
  if (collapsed) {
    return (
      <aside className="hidden md:flex w-[36px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-elevated)] flex-col items-center py-3">
        <button
          onClick={onToggleCollapsed}
          aria-label="expand memory panel"
          title="show memory · ⌘\\"
          className="w-6 h-6 grid place-items-center font-mono text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition"
        >
          ◂
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 font-mono text-[10px] text-[var(--color-text-tertiary)] [writing-mode:vertical-rl] [text-orientation:mixed] tracking-[0.18em] uppercase">
          <span>memory</span>
          <span className="text-[var(--color-text-secondary)]">
            {memories.length}
          </span>
        </div>
        <span
          title={vaultState.phase}
          className={`h-1.5 w-1.5 rounded-full ${statusDot}`}
        />
      </aside>
    );
  }

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
        className={`fixed md:relative z-[45] top-0 right-0 h-full w-[320px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-elevated)] flex flex-col transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleCollapsed}
                aria-label="collapse memory panel"
                title="hide memory · ⌘\\"
                className="hidden md:grid w-5 h-5 place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition"
              >
                ▸
              </button>
              <button
                onClick={onClose}
                aria-label="close memory drawer"
                className="md:hidden w-5 h-5 grid place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition"
              >
                ✕
              </button>
              <div className="font-mono text-[12px] text-[var(--color-text-secondary)]">
                memory
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onRefresh}
                disabled={refreshing || vaultState.phase !== "ready"}
                title="refresh"
                className={`font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition disabled:opacity-40 ${
                  refreshing ? "animate-pulse" : ""
                }`}
              >
                ↻
              </button>
              <div className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                {memories.length} total
              </div>
            </div>
          </div>
          <div className="flex gap-4 font-mono text-[11px]">
            <button
              onClick={() => setTab("all")}
              className={`pb-2 border-b transition ${
                tab === "all"
                  ? "text-[var(--color-text-primary)] border-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-secondary)]"
              }`}
            >
              all
            </button>
            <button
              onClick={() => setTab("injected")}
              className={`pb-2 border-b transition ${
                tab === "injected"
                  ? "text-[var(--color-text-primary)] border-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-secondary)]"
              }`}
            >
              touched
              {focusIds.length > 0 && (
                <span className="ml-1 text-[var(--color-accent)]">
                  {focusIds.length}
                </span>
              )}
            </button>
            <div className="flex-1 border-b border-[var(--color-border)] pb-2" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto thin-scroll p-3 space-y-1.5">
          {vaultState.phase === "loading" && list.length === 0 && (
            <SkeletonCards />
          )}
          {vaultState.phase === "error" && (
            <div className="px-3 py-3 border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/[0.05] font-mono text-[10.5px] text-[var(--color-warn)] leading-[1.5]">
              <div className="font-medium mb-1">vault error</div>
              <div className="text-[var(--color-text-secondary)] break-words">
                {vaultState.message}
              </div>
            </div>
          )}
          {vaultState.phase === "ready" && list.length === 0 && (
            <div className="px-3 py-8 text-center font-mono text-[11px] text-[var(--color-text-tertiary)]">
              {tab === "injected"
                ? "no memories touched in this turn"
                : "vault is empty — chat to populate it"}
            </div>
          )}
          {list.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              highlight={focusIds.includes(m.id)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-5 py-3 font-mono text-[10px] text-[var(--color-text-tertiary)] flex items-center justify-between">
          <span className="truncate pr-2">embed local · TEE · MPC · polls 20s</span>
          <span
            title={vaultState.phase}
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot}`}
          />
        </div>
      </aside>
    </>
  );
}

function SkeletonCards() {
  // Three pulsing placeholder cards while the vault opens (~3-5s on first
  // load — shorter on warm reloads).
  return (
    <div className="space-y-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="px-3 py-2.5 border border-[var(--color-border)] bg-[var(--color-input)]/30 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="h-2 w-[80%] bg-[var(--color-border-strong)] mb-2" />
          <div className="h-2 w-[60%] bg-[var(--color-border)]" />
          <div className="flex items-center justify-between mt-3">
            <div className="h-1.5 w-12 bg-[var(--color-border)]" />
            <div className="h-1.5 w-6 bg-[var(--color-border)]" />
          </div>
        </div>
      ))}
      <div className="text-center font-mono text-[10px] text-[var(--color-text-tertiary)] mt-3">
        opening vault…
      </div>
    </div>
  );
}

function MemoryCard({
  memory,
  highlight,
}: {
  memory: MemoryEntry;
  highlight?: boolean;
}) {
  return (
    <div
      className={`px-3 py-2.5 border transition ${
        highlight
          ? "bg-[var(--color-input)] border-[var(--color-accent-dim)]"
          : "border-transparent hover:bg-[var(--color-input)]/40 hover:border-[var(--color-border)]"
      }`}
    >
      <div className="text-[12px] leading-snug text-[var(--color-text-primary)] font-mono line-clamp-3 mb-2">
        {memory.content}
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
        <div className="flex items-center gap-2 truncate">
          <span>{memory.scope}</span>
          <span className="opacity-50">·</span>
          <span className="truncate">{relativeTime(memory.timestamp)}</span>
        </div>
        {memory.score !== undefined && (
          <span className="text-[var(--color-accent)] shrink-0">
            {memory.score.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
