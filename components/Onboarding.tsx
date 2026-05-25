"use client";

import { useEffect, useState, type ReactNode } from "react";
import { kvGet, kvSet, STORAGE_KEYS } from "@/lib/storage";

type Step = {
  slug: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  image?: string;
  body: ReactNode;
};

export const OPEN_ONBOARDING_EVENT = "blindchat:open-onboarding";

const STEPS: Step[] = [
  {
    slug: "welcome",
    eyebrow: "WELCOME",
    title: "chat nothing reads",
    subtitle:
      "the whole app runs in your browser. no backend on our side; no provider that can read your prompts or memory.",
    image: "/onboarding/01-welcome.jpg",
    body: (
      <div className="space-y-1 mt-3">
        <Row
          num="01"
          tag="inference"
          where="venice · TEE"
          detail="prompts run inside a hardware enclave the provider can't read."
        />
        <Row
          num="02"
          tag="memory"
          where="blindcache · nillion"
          detail="content secret-shared across 4 operators on 3 continents."
        />
        <Row
          num="03"
          tag="embed"
          where="local · transformers.js"
          detail="text never leaves the tab to be vectorized."
        />
      </div>
    ),
  },
  {
    slug: "stack",
    eyebrow: "THE STACK",
    title: "three primitives, stitched",
    subtitle:
      "the seam between an enclave LLM, a sharded vault, a local embedder — and a tool-calling adapter so every model can use memory.",
    image: "/onboarding/02-stack.jpg",
    body: (
      <div className="space-y-1 mt-3">
        <Row
          tag="inference"
          where="venice"
          detail="LLM lives inside a TEE. nillion verifies the enclave via remote attestation before any prompt is sent."
        />
        <Row
          tag="memory"
          where="blindcache"
          detail="Shamir-sharded across independent nilDB nodes. operators must collude across jurisdictions to decrypt."
        />
        <Row
          tag="embed"
          where="in-browser"
          detail="Xenova all-MiniLM-L6-v2 in your tab. semantic search resolved before anything leaves your machine."
        />
        <Row
          tag="adapter"
          where="native or compat"
          detail="Qwen3 models use native function calling; everything else uses an in-text marker protocol. Either way, the model can read + write the vault."
        />
      </div>
    ),
  },
  {
    slug: "honest",
    eyebrow: "HONEST",
    title: "what isn't private",
    subtitle:
      "no privacy claim is unconditional. these are the three real footnotes.",
    image: "/onboarding/03-honest.jpg",
    body: (
      <div className="space-y-1 mt-3">
        <Row
          variant="warn"
          tag="metadata"
          where="single node"
          detail="tags, scope, timestamps live as plaintext for queryability. any single operator can read them."
        />
        <Row
          variant="warn"
          tag="browser ram"
          where="your tab"
          detail="anything typed sits in tab memory until you close it. tab dumps are in scope for an attacker."
        />
        <Row
          variant="warn"
          tag="this page"
          where="attack surface"
          detail="a malicious extension or compromised browser reads everything you do on this site."
        />
      </div>
    ),
  },
  {
    slug: "keys",
    eyebrow: "YOUR KEYS",
    title: "you hold them",
    subtitle:
      "two keys do all the work. neither ever crosses our wire. this preview keeps them in localStorage; a passkey-wrapped IndexedDB envelope is on the roadmap.",
    image: "/onboarding/04-keys.jpg",
    body: (
      <div className="space-y-1 mt-3">
        <Row
          tag="venice key"
          where="TEE access"
          detail="bearer token to your provider's enclave. talks to Venice directly from your tab."
        />
        <Row
          tag="nillion key"
          where="vault identity"
          detail="signs NUC tokens for your nilDB shards. your DID is derived from it."
        />
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)] font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
          <span className="inline-block h-1.5 w-1.5 bg-[var(--color-success)]" />
          <span>client-side only · no accounts · no telemetry</span>
        </div>
      </div>
    ),
  },
];

export function OnboardingProvider() {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const seen = await kvGet<string | boolean>(STORAGE_KEYS.onboardingSeen);
      if (!seen) setOpen(true);
    })();
    function onOpen() {
      setIdx(0);
      setOpen(true);
    }
    window.addEventListener(OPEN_ONBOARDING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, onOpen);
  }, []);

  function dismiss() {
    kvSet(STORAGE_KEYS.onboardingSeen, new Date().toISOString()).catch(() => {});
    setOpen(false);
  }
  function next() {
    setIdx((i) => {
      if (i < STEPS.length - 1) return i + 1;
      dismiss();
      return i;
    });
  }
  function back() {
    setIdx((i) => Math.max(0, i - 1));
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const step = STEPS[idx]!;
  const isLast = idx === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[640px] max-w-[94vw] bg-[var(--color-panel)] border border-[var(--color-border-strong)] shadow-[0_24px_72px_rgba(0,0,0,0.85)] flex flex-col"
      >
        {/* Close — floating */}
        <button
          onClick={dismiss}
          aria-label="close"
          className="absolute top-3 right-3 z-10 w-7 h-7 grid place-items-center font-mono text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-input)] transition"
        >
          ✕
        </button>

        {/* Step pills with labels */}
        <div className="px-8 pt-7 pb-5 flex items-end gap-3 shrink-0">
          {STEPS.map((s, i) => {
            const isCurrent = i === idx;
            const isPast = i < idx;
            return (
              <button
                key={s.slug}
                onClick={() => setIdx(i)}
                aria-label={s.slug}
                className="group flex flex-col items-start gap-2 flex-1 text-left"
              >
                <div
                  className={`h-[2px] w-full transition ${
                    isCurrent
                      ? "bg-[var(--color-accent)] shadow-[0_0_6px_rgba(79,189,255,0.55)]"
                      : isPast
                      ? "bg-[var(--color-accent-dim)]"
                      : "bg-[var(--color-border)] group-hover:bg-[var(--color-border-strong)]"
                  }`}
                />
                <span
                  className={`font-mono text-[9.5px] tracking-[0.2em] uppercase ${
                    isCurrent
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  {s.slug}
                </span>
              </button>
            );
          })}
        </div>

        {/* Banner */}
        <div className="px-8 pb-5 shrink-0">
          <div
            className="relative w-full overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-base)]"
            style={{ aspectRatio: "4 / 1" }}
          >
            {step.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={step.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>
        </div>

        {/* Body — no scroll, sized to fit longest step */}
        <div className="px-8 pb-5 shrink-0">
          <div className="font-mono text-[10px] text-[var(--color-accent)] tracking-[0.28em] mb-2">
            {step.eyebrow}
          </div>
          <h2 className="font-[var(--font-display)] text-[32px] leading-[1.05] text-[var(--color-text-primary)] tracking-[0.01em]">
            {step.title}
          </h2>
          {step.subtitle && (
            <p className="font-mono text-[12px] leading-[1.55] text-[var(--color-text-secondary)] mt-2.5 max-w-[60ch]">
              {step.subtitle}
            </p>
          )}
          {step.body}
        </div>

        {/* Footer */}
        <div className="px-7 py-3.5 border-t border-[var(--color-border)] flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={back}
            disabled={idx === 0}
            className="font-mono text-[11px] px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] disabled:text-[var(--color-text-faint)] disabled:cursor-not-allowed transition"
          >
            ← back
          </button>
          <div className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {idx + 1} of {STEPS.length}
          </div>
          <button
            onClick={next}
            className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-bright)] text-[var(--color-base)] font-medium transition"
          >
            <span>{isLast ? "enter blindchat" : "continue"}</span>
            <span className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  num,
  tag,
  where,
  detail,
  variant = "default",
}: {
  num?: string;
  tag: string;
  where: string;
  detail: string;
  variant?: "default" | "warn";
}) {
  const isWarn = variant === "warn";
  const accent = isWarn ? "text-[var(--color-warn)]" : "text-[var(--color-accent)]";
  const stripe = isWarn ? "bg-[var(--color-warn)]" : "bg-[var(--color-accent)]";
  return (
    <div className="relative flex items-start gap-3 pl-4 pr-2 py-2">
      <span
        className={`absolute left-0 top-2 bottom-2 w-[2px] ${stripe} opacity-70`}
      />
      {num && (
        <div
          className={`shrink-0 w-5 font-mono text-[11px] ${accent} mt-px text-center`}
        >
          {num}
        </div>
      )}
      <div className="shrink-0 w-[108px]">
        <div
          className={`font-mono text-[10px] uppercase tracking-[0.16em] ${accent}`}
        >
          {tag}
        </div>
        <div className="font-mono text-[9.5px] text-[var(--color-text-tertiary)] mt-0.5">
          {where}
        </div>
      </div>
      <div className="font-mono text-[11.5px] text-[var(--color-text-secondary)] leading-[1.55] flex-1">
        {detail}
      </div>
    </div>
  );
}
