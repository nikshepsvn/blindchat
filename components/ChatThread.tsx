"use client";

import { useEffect, useRef } from "react";
import { type Message } from "@/lib/mockData";

function formatContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="text-[var(--color-accent-bright)] font-medium">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function ChatThread({
  messages,
  onHoverMemoryIds,
  vaultPhase,
}: {
  messages: Message[];
  selectedMemoryIds: string[];
  onHoverMemoryIds: (ids: string[]) => void;
  vaultPhase: "loading" | "ready" | "error";
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll only if the user is already pinned near the bottom — otherwise
  // streaming content would hijack scrollback while the user is reading.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll">
        <div className="max-w-[720px] mx-auto px-8 py-24 text-center space-y-3">
          <div className="font-[var(--font-display)] text-[36px] text-[var(--color-accent-bright)] glow leading-none">
            blindchat
          </div>
          <div className="font-mono text-[13px] text-[var(--color-text-secondary)]">
            private chat with portable memory
          </div>
          <div className="font-mono text-[11px] text-[var(--color-text-tertiary)] pt-6 flex items-center justify-center gap-2">
            {vaultPhase === "loading" && (
              <>
                <span className="h-1.5 w-1.5 bg-[var(--color-accent)] rounded-full pulse-dot" />
                <span>opening vault · this takes 3–5s on first load</span>
              </>
            )}
            {vaultPhase === "ready" && (
              <span>type below to start · venice inference · embed local</span>
            )}
            {vaultPhase === "error" && (
              <span className="text-[var(--color-warn)]">
                vault failed to open — check settings
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll">
      <div className="max-w-[720px] mx-auto px-8 py-10 space-y-7">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className="space-y-2">
              <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--color-text-tertiary)]">
                <span
                  className={
                    isUser
                      ? "text-[var(--color-text-secondary)]"
                      : "text-[var(--color-accent)]"
                  }
                >
                  {isUser ? "you" : "venice"}
                </span>
                {msg.injectedMemoryIds && msg.injectedMemoryIds.length > 0 && (
                  <button
                    onMouseEnter={() => onHoverMemoryIds(msg.injectedMemoryIds!)}
                    onMouseLeave={() => onHoverMemoryIds([])}
                    className="hover:text-[var(--color-accent)] transition"
                  >
                    {msg.injectedMemoryIds.length === 1
                      ? "1 memory touched"
                      : `${msg.injectedMemoryIds.length} memories touched`}
                  </button>
                )}
                <span className="ml-auto">{msg.timestamp}</span>
              </div>

              {msg.toolEvents && msg.toolEvents.length > 0 && (
                <div className="space-y-1 mb-1">
                  {msg.toolEvents.map((ev, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 font-mono text-[10.5px] text-[var(--color-text-tertiary)]"
                    >
                      <span
                        className={
                          ev.ok
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-warn)]"
                        }
                      >
                        ▸
                      </span>
                      <span className="text-[var(--color-text-secondary)]">
                        {ev.name}
                      </span>
                      <span className="opacity-60">{ev.summary}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[14.5px] leading-[1.75] whitespace-pre-wrap font-mono text-[var(--color-text-primary)]">
                {msg.content ? (
                  formatContent(msg.content)
                ) : msg.streaming ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 bg-[var(--color-accent)] rounded-full pulse-dot" />
                    <span className="h-1.5 w-1.5 bg-[var(--color-accent)] rounded-full pulse-dot pulse-dot-2" />
                    <span className="h-1.5 w-1.5 bg-[var(--color-accent)] rounded-full pulse-dot pulse-dot-3" />
                  </span>
                ) : (
                  <span className="opacity-50">(empty)</span>
                )}
                {msg.content && msg.streaming && (
                  <span className="inline-block w-2 h-4 bg-[var(--color-accent)] ml-0.5 caret align-text-bottom" />
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
