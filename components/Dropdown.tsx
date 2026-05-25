"use client";

import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
} from "react";

export type DropdownOption = {
  value: string;
  label: string;
  hint?: string;
  badge?: string;
};

export function Dropdown({
  label,
  value,
  onChange,
  options,
  align = "left",
  width = 260,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(
    Math.max(0, options.findIndex((o) => o.value === value))
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Scroll active row into view when opened or moved
  useEffect(() => {
    if (open) {
      activeRowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIdx]);

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    }
  }

  function toggle() {
    setOpen((o) => {
      if (!o) {
        setActiveIdx(
          Math.max(0, options.findIndex((opt) => opt.value === value))
        );
      }
      return !o;
    });
  }

  return (
    <div className="relative inline-flex items-center">
      {label && (
        <span className="mr-1.5 text-[var(--color-text-tertiary)] font-mono text-[10px]">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] text-[var(--color-text-primary)] hover:text-[var(--color-accent-bright)] border border-[var(--color-border)] hover:border-[var(--color-accent-dim)] bg-[var(--color-input)] transition"
      >
        <span>{selected?.label}</span>
        <span className="text-[8px] text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)]">
          ▾
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          tabIndex={-1}
          onKeyDown={handleKey}
          className={`absolute bottom-full mb-1.5 z-50 bg-[var(--color-panel)] border border-[var(--color-border-strong)] shadow-[0_8px_32px_rgba(0,0,0,0.6)] focus:outline-none ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ width }}
          role="listbox"
        >
          <div className="max-h-[280px] overflow-y-auto thin-scroll py-1">
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIdx;
              return (
                <button
                  key={opt.value}
                  ref={isActive ? activeRowRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full text-left px-3 py-2 font-mono text-[12px] flex items-center gap-2 transition ${
                    isActive
                      ? "bg-[var(--color-input)]"
                      : "bg-transparent"
                  } ${
                    isSelected
                      ? "text-[var(--color-accent-bright)]"
                      : "text-[var(--color-text-primary)]"
                  }`}
                >
                  <span
                    className={`w-3 shrink-0 text-[var(--color-accent)] ${
                      isSelected ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    ›
                  </span>
                  <span className="truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)] shrink-0">
                      {opt.hint}
                    </span>
                  )}
                  {opt.badge && (
                    <span className="ml-auto text-[9px] text-[var(--color-accent)] shrink-0 uppercase tracking-[0.1em]">
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
