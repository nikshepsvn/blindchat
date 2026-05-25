"use client";

import { useMemo, useState, useRef } from "react";
import type { MemoryEntry } from "@/lib/vault";
import type { VaultState } from "@/lib/useVault";

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
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
  onDeleteMemory,
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
  onDeleteMemory: (id: string) => Promise<void>;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"all" | "touched">("all");
  const [query, setQuery] = useState("");

  const focusIds = hoveredIds.length > 0 ? hoveredIds : injectedIds;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tab === "touched"
      ? memories.filter((m) => focusIds.includes(m.id))
      : memories;
    if (q) {
      list = list.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q)) ||
          m.scope.toLowerCase().includes(q)
      );
    }
    return list;
  }, [memories, tab, focusIds, query]);

  const statusColor =
    vaultState.phase === "ready"
      ? "bg-[var(--color-success)]"
      : vaultState.phase === "error"
      ? "bg-[var(--color-warn)]"
      : "bg-[var(--color-text-tertiary)] pulse-dot";

  // ── collapsed rail ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="hidden md:flex w-[40px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-elevated)] flex-col items-center py-3 gap-3">
        <button
          onClick={onToggleCollapsed}
          aria-label="expand memory panel"
          title="show blindcache · ⌘\\"
          className="w-7 h-7 grid place-items-center font-mono text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-bright)] hover:bg-[var(--color-input)] transition"
        >
          ◂
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 [writing-mode:vertical-rl] [text-orientation:mixed]">
          <span className="font-[var(--font-display)] text-[16px] tracking-[0.06em] text-[var(--color-accent-bright)] glow">
            blindcache
          </span>
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-secondary)] tracking-[0.18em]">
            <span>{memories.length}</span>
            <span>memories</span>
          </div>
        </div>
        <span
          title={vaultState.phase}
          className={`h-1.5 w-1.5 rounded-full ${statusColor}`}
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
        className={`fixed md:relative z-[45] top-0 right-0 h-full w-[340px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-elevated)] flex flex-col transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        {/* ── HEADER: brand + utility row ────────────────────────────────── */}
        <header className="border-b border-[var(--color-border)]">
          <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <a
                href="https://github.com/nikshepsvn/blindcache"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-[var(--font-display)] text-[22px] leading-none tracking-[0.05em] text-[var(--color-accent-bright)] glow hover:opacity-90 transition"
                title="blindcache · encrypted vault on nillion"
              >
                blindcache
              </a>
              <div className="font-mono text-[9.5px] text-[var(--color-text-tertiary)] tracking-[0.22em] uppercase mt-1.5">
                encrypted vault · nillion
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onRefresh}
                disabled={refreshing || vaultState.phase !== "ready"}
                title="resync from nilDB"
                className={`w-7 h-7 grid place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-bright)] hover:bg-[var(--color-input)] transition disabled:opacity-40 ${
                  refreshing ? "animate-pulse" : ""
                }`}
              >
                ↻
              </button>
              <button
                onClick={onToggleCollapsed}
                aria-label="collapse"
                title="hide blindcache · ⌘\\"
                className="hidden md:grid w-7 h-7 place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-bright)] hover:bg-[var(--color-input)] transition"
              >
                ▸
              </button>
              <button
                onClick={onClose}
                aria-label="close"
                className="md:hidden w-7 h-7 grid place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat strip */}
          <div className="px-5 pb-4 flex items-stretch gap-2">
            <Stat
              label="memories"
              value={memories.length}
              accent
            />
            <Stat
              label="this turn"
              value={focusIds.length}
              warn={focusIds.length > 0}
            />
            <Stat
              label="status"
              value={
                vaultState.phase === "ready"
                  ? "live"
                  : vaultState.phase === "error"
                  ? "err"
                  : "…"
              }
              statusKind={vaultState.phase}
            />
          </div>
        </header>

        {/* ── TOOLBAR: tabs + search ─────────────────────────────────────── */}
        <div className="px-5 pt-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-4 font-mono text-[11px] mb-2">
            <button
              onClick={() => setTab("all")}
              className={`pb-2 -mb-px border-b transition ${
                tab === "all"
                  ? "text-[var(--color-text-primary)] border-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-secondary)]"
              }`}
            >
              all
            </button>
            <button
              onClick={() => setTab("touched")}
              className={`pb-2 -mb-px border-b transition flex items-center gap-1.5 ${
                tab === "touched"
                  ? "text-[var(--color-text-primary)] border-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] border-transparent hover:text-[var(--color-text-secondary)]"
              }`}
            >
              touched
              {focusIds.length > 0 && (
                <span className="font-mono text-[9.5px] px-1 py-px bg-[var(--color-warn)]/15 border border-[var(--color-warn)]/30 text-[var(--color-warn)]">
                  {focusIds.length}
                </span>
              )}
            </button>
            <div className="flex-1" />
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
              {filtered.length} / {memories.length}
            </span>
          </div>
          <div className="flex items-center gap-2 pb-3">
            <span className="font-mono text-[11px] text-[var(--color-accent)]">▸</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter by content, tag, or scope…"
              className="flex-1 bg-transparent font-mono text-[11.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="font-mono text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition"
                title="clear filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── LIST ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto thin-scroll">
          {vaultState.phase === "loading" && filtered.length === 0 && (
            <div className="px-4 py-4 space-y-2">
              <SkeletonCards />
            </div>
          )}
          {vaultState.phase === "error" && (
            <div className="m-4 px-3 py-3 border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/[0.05] font-mono text-[10.5px] text-[var(--color-warn)] leading-[1.5]">
              <div className="font-medium mb-1 tracking-[0.18em] uppercase">
                vault error
              </div>
              <div className="text-[var(--color-text-secondary)] break-words">
                {vaultState.message}
              </div>
            </div>
          )}
          {vaultState.phase === "ready" && filtered.length === 0 && (
            <div className="px-5 py-12 text-center font-mono text-[11px] text-[var(--color-text-tertiary)] leading-[1.6]">
              {query ? (
                <>
                  no matches for{" "}
                  <span className="text-[var(--color-text-secondary)]">
                    &quot;{query}&quot;
                  </span>
                </>
              ) : tab === "touched" ? (
                "no memories touched in this turn"
              ) : (
                <>
                  vault is empty
                  <br />
                  <span className="text-[var(--color-text-faint)]">
                    ask the model to remember something
                  </span>
                </>
              )}
            </div>
          )}
          {filtered.map((m, i) => (
            <MemoryRow
              key={m.id}
              memory={m}
              index={i}
              highlight={focusIds.includes(m.id)}
              onDelete={() => onDeleteMemory(m.id)}
            />
          ))}
        </div>

        {/* ── FOOTER: stack signature ───────────────────────────────────── */}
        <footer className="border-t border-[var(--color-border)] px-5 py-2.5 flex items-center justify-between font-mono text-[9.5px] text-[var(--color-text-tertiary)] tracking-[0.06em]">
          <div className="flex items-center gap-1.5 truncate">
            <span
              title={vaultState.phase}
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`}
            />
            <span className="truncate">
              {vaultState.phase === "ready"
                ? "embed local · 3-of-3 nilDB · 20s poll"
                : vaultState.phase === "error"
                ? "see settings"
                : "opening vault…"}
            </span>
          </div>
          <span className="text-[var(--color-text-faint)] shrink-0">v0.2</span>
        </footer>
      </aside>
    </>
  );
}

// ── stat cell ──────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
  warn,
  statusKind,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
  statusKind?: "ready" | "error" | "loading";
}) {
  const valueColor = statusKind
    ? statusKind === "ready"
      ? "text-[var(--color-success)]"
      : statusKind === "error"
      ? "text-[var(--color-warn)]"
      : "text-[var(--color-text-secondary)]"
    : warn
    ? "text-[var(--color-warn)]"
    : accent
    ? "text-[var(--color-text-primary)]"
    : "text-[var(--color-text-secondary)]";
  return (
    <div className="flex-1 px-2.5 py-1.5 border border-[var(--color-border)] bg-[var(--color-input)]/40">
      <div className="font-mono text-[9px] text-[var(--color-text-tertiary)] tracking-[0.18em] uppercase">
        {label}
      </div>
      <div className={`font-mono text-[14px] mt-0.5 leading-none ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

// ── skeleton ───────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="px-3 py-2.5 border border-[var(--color-border)] bg-[var(--color-input)]/30 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="h-2 w-[85%] bg-[var(--color-border-strong)] mb-2" />
          <div className="h-2 w-[60%] bg-[var(--color-border)]" />
          <div className="flex items-center gap-2 mt-3">
            <div className="h-1.5 w-12 bg-[var(--color-border)]" />
            <div className="h-1.5 w-8 bg-[var(--color-border)]" />
          </div>
        </div>
      ))}
      <div className="text-center font-mono text-[10px] text-[var(--color-text-tertiary)] mt-2">
        opening vault…
      </div>
    </>
  );
}

// ── single entry row ───────────────────────────────────────────────────────

function MemoryRow({
  memory,
  index,
  highlight,
  onDelete,
}: {
  memory: MemoryEntry;
  index: number;
  highlight?: boolean;
  onDelete: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (!pending) {
      setPending(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setPending(false);
        timer.current = null;
      }, 3000);
      return;
    }
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
      setPending(false);
    }
  }

  return (
    <div
      className={`group relative border-b border-[var(--color-border)]/60 transition-colors duration-150 slide-in-right ${
        highlight
          ? "bg-[var(--color-accent)]/[0.06] border-l-2 border-l-[var(--color-accent)] pl-[14px]"
          : "border-l-2 border-l-transparent pl-4 hover:bg-[var(--color-input)]/30"
      } pr-4 py-2.5 ${busy ? "opacity-50" : ""}`}
    >
      {/* head: index + id + score + delete */}
      <div className="flex items-center gap-2 mb-1.5 font-mono text-[9.5px] tracking-[0.06em]">
        <span className="text-[var(--color-text-faint)] tabular-nums w-5">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="text-[var(--color-text-tertiary)]">id</span>
        <code className="text-[var(--color-text-secondary)]">
          {shortId(memory.id)}
        </code>
        <span className="flex-1" />
        {memory.score !== undefined && (
          <span className="text-[var(--color-accent)]">
            {memory.score.toFixed(2)}
          </span>
        )}
        <button
          onClick={handleDelete}
          disabled={busy}
          title={pending ? "click again to delete" : "delete memory"}
          className={`-mr-1 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
            pending
              ? "text-[var(--color-warn)] opacity-100"
              : "text-[var(--color-text-tertiary)] hover:text-[var(--color-warn)] opacity-0 group-hover:opacity-100"
          }`}
        >
          {pending ? "?" : "✕"}
        </button>
      </div>

      {/* content */}
      <div className="font-mono text-[12px] text-[var(--color-text-primary)] leading-[1.55] line-clamp-3 mb-2">
        {memory.content}
      </div>

      {/* meta: tags + scope + time */}
      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[9.5px] text-[var(--color-text-tertiary)]">
        {memory.tags.length > 0 ? (
          memory.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="px-1.5 py-px border border-[var(--color-border)] bg-[var(--color-base)]/40 text-[var(--color-accent)]/80"
            >
              {t}
            </span>
          ))
        ) : (
          <span className="px-1.5 py-px border border-[var(--color-border)] bg-[var(--color-base)]/40 text-[var(--color-text-tertiary)]">
            {memory.scope}
          </span>
        )}
        <span className="ml-auto text-[var(--color-text-tertiary)]">
          {relativeTime(memory.timestamp)}
        </span>
      </div>
    </div>
  );
}
