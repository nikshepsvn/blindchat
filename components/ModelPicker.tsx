"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  VENICE_PRIVATE_MODELS,
  type VeniceModel,
  type VeniceTag,
} from "@/lib/venice";

const TAG_FILTERS: { id: VeniceTag | "all"; label: string }[] = [
  { id: "all", label: "all" },
  { id: "reasoning", label: "reasoning" },
  { id: "code", label: "code" },
  { id: "vision", label: "vision" },
  { id: "long-ctx", label: "long ctx" },
  { id: "tools", label: "tools" },
  { id: "uncensored", label: "uncensored" },
  { id: "fast", label: "fast" },
];

const TAG_STYLES: Record<VeniceTag, string> = {
  flagship:    "text-[var(--color-accent-bright)]",
  reasoning:   "text-[var(--color-accent)]",
  code:        "text-[var(--color-success)]",
  vision:      "text-[#c896ff]",
  tools:       "text-[#ffd966]",
  "long-ctx":  "text-[var(--color-accent)]",
  uncensored:  "text-[var(--color-warn)]",
  fast:        "text-[var(--color-text-secondary)]",
};

function formatPrice(usd: number): string {
  return usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(2)}`;
}

export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    VENICE_PRIVATE_MODELS.find((m) => m.id === value) ??
    VENICE_PRIVATE_MODELS[0]!;

  // Global ⌘M / Ctrl+M opens the picker.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-primary)] hover:text-[var(--color-accent-bright)] border border-[var(--color-border)] hover:border-[var(--color-accent-dim)] bg-[var(--color-input)] transition"
        title="change model · ⌘M"
      >
        <span>{selected.label}</span>
        <span className="text-[9px] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)]">
          {selected.contextK}k
        </span>
        <span className="ml-1 text-[8px] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)]">
          ⌘M
        </span>
      </button>

      {open && (
        <ModelPickerModal
          value={value}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ModelPickerModal({
  value,
  onClose,
  onPick,
}: {
  value: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<VeniceTag | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo<VeniceModel[]>(() => {
    const q = query.trim().toLowerCase();
    return VENICE_PRIVATE_MODELS.filter((m) => {
      if (tagFilter !== "all" && !m.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.includes(q))
      );
    });
  }, [query, tagFilter]);

  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, filtered.findIndex((m) => m.id === value))
  );
  const activeRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setActiveIdx(0), [query, tagFilter]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(
        (i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[activeIdx];
      if (m) onPick(m.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(Math.max(0, filtered.length - 1));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[680px] max-w-[94vw] bg-[var(--color-panel)] border border-[var(--color-border-strong)] shadow-[0_24px_72px_rgba(0,0,0,0.8)] flex flex-col max-h-[78vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-[var(--color-accent-bright)] uppercase tracking-[0.22em] glow">
              select model
            </span>
            <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
              {filtered.length} of {VENICE_PRIVATE_MODELS.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition px-1"
            aria-label="close"
          >
            esc ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-accent)] font-mono text-[12px]">
              ▸
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="filter by name, family, or capability…"
              className="flex-1 bg-transparent font-mono text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
          </div>
        </div>

        {/* Tag filters */}
        <div className="px-5 py-2.5 border-b border-[var(--color-border)] flex items-center gap-1.5 overflow-x-auto thin-scroll">
          {TAG_FILTERS.map((tf) => {
            const active = tagFilter === tf.id;
            return (
              <button
                key={tf.id}
                onClick={() => setTagFilter(tf.id)}
                className={`shrink-0 font-mono text-[10px] px-2 py-1 border transition ${
                  active
                    ? "bg-[var(--color-input)] border-[var(--color-accent)] text-[var(--color-accent-bright)]"
                    : "bg-transparent border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto thin-scroll">
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center font-mono text-[12px] text-[var(--color-text-tertiary)]">
              no models match those filters
            </div>
          ) : (
            filtered.map((m, i) => {
              const isSelected = m.id === value;
              const isActive = i === activeIdx;
              return (
                <button
                  key={m.id}
                  ref={isActive ? activeRowRef : undefined}
                  type="button"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => onPick(m.id)}
                  className={`w-full text-left px-5 py-3 border-l-2 transition ${
                    isActive
                      ? "bg-[var(--color-input)] border-l-[var(--color-accent)]"
                      : "bg-transparent border-l-transparent hover:bg-[var(--color-input)]/40"
                  }`}
                >
                  {/* Row 1: name + ctx + price */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-3 shrink-0 font-mono text-[12px] text-[var(--color-accent)] ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`font-mono text-[13px] truncate ${
                        isSelected
                          ? "text-[var(--color-accent-bright)] font-medium"
                          : "text-[var(--color-text-primary)]"
                      }`}
                    >
                      {m.label}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                      {m.family}
                    </span>
                    <div className="ml-auto flex items-center gap-3 shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                      <span>{m.contextK}k ctx</span>
                      <span className="text-[var(--color-text-secondary)]">
                        {formatPrice(m.outPerMtok)}
                        <span className="text-[var(--color-text-tertiary)]">
                          /Mtok
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Row 2: description */}
                  <div className="pl-6 mt-1 font-mono text-[11px] text-[var(--color-text-secondary)] truncate">
                    {m.description}
                  </div>

                  {/* Row 3: tags */}
                  <div className="pl-6 mt-1.5 flex flex-wrap gap-1.5">
                    {m.tags.map((t) => (
                      <span
                        key={t}
                        className={`font-mono text-[9px] px-1.5 py-px border border-[var(--color-border)] bg-[var(--color-base)]/40 ${TAG_STYLES[t]}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between font-mono text-[10px] text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-3">
            <span>↑↓ nav</span>
            <span>⏎ select</span>
            <span>esc close</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 bg-[var(--color-success)] rounded-full" />
            <span>all {VENICE_PRIVATE_MODELS.length} run in TEE + E2EE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
