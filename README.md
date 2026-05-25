<div align="center">

![BlindChat](public/onboarding/01-welcome.jpg)

# BlindChat

**Private chat with portable memory. The whole app runs in your browser — no backend, no provider that can read your prompts or your memory.**

[![Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![blindcache-core](https://img.shields.io/npm/v/blindcache-core?label=blindcache-core)](https://www.npmjs.com/package/blindcache-core)

</div>

---

## What is it

A chat client that combines three independent privacy primitives so that **no single party** in the chain can read your conversation or your memory.

![The stack](public/onboarding/02-stack.jpg)

| Layer | Where | What |
|---|---|---|
| **Inference** | Venice AI · TEE | LLM lives inside a Trusted Execution Environment. Nillion verifies the enclave via remote attestation before any prompt is sent. |
| **Memory** | [BlindCache](https://github.com/nikshepsvn/blindcache) · Nillion nilDB | Content is Shamir-shared across 4 operators on 3 continents. Operators must collude across jurisdictions to decrypt. |
| **Embeddings** | In-browser · Transformers.js | `Xenova/all-MiniLM-L6-v2` runs locally in your tab. Your text is never sent to an embedding API. |
| **Adapter** | Native or compat | Qwen3 models get native OpenAI function-calling; everything else uses an in-text marker protocol. Either way, every model can read + write the vault. |

---

## The interesting part: every model can use memory

Most chat clients gate memory tools to "models with function-calling support." Venice exposes that flag on only **4 of 15** of its TEE models — all Qwen3-family. BlindChat ships its own application-layer adapter so the other 11 models work too:

```
┌─────────────────────────────────────────────────────────────┐
│  User: "remember I prefer concise commit messages"          │
│                                                              │
│  Native path (Qwen3):                                        │
│    → API request includes `tools: [save_memory, ...]`       │
│    → Model emits a tool_call in the stream                  │
│    → We execute against the vault                           │
│    → Send tool result back, model replies "Saved."          │
│                                                              │
│  Compat path (GLM, GPT-OSS, Gemma, Venice, …):              │
│    → System prompt teaches a marker syntax                  │
│    → Model embeds [[SAVE]]{json}[[/SAVE]] in its reply      │
│    → Streaming filter buffers the marker out of view        │
│    → We parse + execute against the vault                   │
│    → For SEARCH, we send a 2nd turn with the result block   │
└─────────────────────────────────────────────────────────────┘
```

The user sees clean text either way. The badge in the input bar (`memory: native` or `memory: compat`) tells you which path is active.

### Four memory tools the LLM gets

| Tool | What |
|---|---|
| `save_memory(content, tags?)` | Persist a durable fact about the user |
| `search_memory(query, limit?)` | Semantic search over the vault |
| `list_recent_memories(limit?)` | Last N entries, newest first |
| `delete_memory(id)` | Permanently remove by id |

---

## What we're honest about

![Honest](public/onboarding/03-honest.jpg)

No privacy claim is unconditional. The three real footnotes:

| | Where it leaks | Why |
|---|---|---|
| **Metadata** | Any single nilDB operator | Tags, scope, timestamps live as plaintext so they're queryable. Content stays sharded, but the metadata around it is readable. |
| **Browser RAM** | Your tab | Anything typed sits in tab memory until you close it. Memory exfiltration via tab dumps is in scope for an attacker on your device. |
| **This page** | Attack surface | A malicious browser extension or compromised browser reads everything you do on this site. |

---

## You hold the keys

![Your keys](public/onboarding/04-keys.jpg)

Two keys do all the work. Neither ever crosses our wire:

- **Venice key** — bearer token to your provider's enclave. Talks to Venice directly from your tab.
- **Nillion key** — signs NUC tokens for your nilDB shards. Your DID is derived from it.

**Preview status:** this version keeps both keys in `localStorage` (plaintext). A passkey-wrapped IndexedDB envelope is on the roadmap (see below).

---

## Run it locally

```bash
pnpm install
cp .env.example .env.local
# edit .env.local — add your Venice key from https://venice.ai/settings/api
pnpm dev
```

Opens at `http://localhost:3939`. On first load, the app generates a fresh NUC private key and registers a new vault on Nillion testnet. The collection ID is stored in `localStorage` alongside the key.

To wipe and start fresh: clear `localStorage` in DevTools — the next reload mints a new identity.

---

## Stack

- **Next.js 15** (App Router, static export)
- **React 19** with streaming UI
- **Tailwind v4** (`@theme` tokens, no rounded corners)
- **[`blindcache-core`](https://www.npmjs.com/package/blindcache-core)** — the encrypted vault SDK
- **[`@nillion/secretvaults`](https://www.npmjs.com/package/@nillion/secretvaults)** — Shamir-share storage across nilDB
- **[`@nillion/nuc`](https://www.npmjs.com/package/@nillion/nuc)** — secp256k1 signing for vault auth
- **[`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers)** — in-browser embeddings (ONNX + WASM)
- **Venice AI** — OpenAI-compatible TEE + E2EE inference

The browser bundle does require some Node-polyfill plumbing (`stream-browserify`, `crypto-browserify`, `process/browser`, a `NormalModuleReplacementPlugin` for `node:` scheme, a postinstall symlink for `libsodium-wrappers-sumo`). See `next.config.ts` and `scripts/fix-libsodium.mjs`.

---

## Roadmap to production

Today this is preview-grade. To take it to a real user-facing product:

### Tier 1 — must-haves before public domain
- **Key entry UI** — first-run modal where the user pastes their Venice key + clicks "Generate vault." No more env vars.
- **Passkey-wrapped key storage** — use WebAuthn `deriveKey` → AES-GCM the NUC + Venice keys at rest in IndexedDB. Onboarding already promises this.
- **Key recovery** — export NUC key + collection ID as a downloadable JSON or QR. Import flow on a new device.
- **Multi-conversation persistence** — store thread list + messages. Either in the vault (private, slow) or IndexedDB (fast, local-only).
- **Strict CSP + XSS hardening** — content security policy headers, sanitize any model-output markdown that lands in DOM.

### Tier 2 — production polish
- Reasoning model timeouts (GLM, GPT-OSS occasionally 504 on Venice's gateway — needs retry/keepalive)
- Vault node failover (3-of-3 nilDB nodes — graceful degradation when one is down)
- Mobile responsive (drawer for sidebar + memory panel under 900px)
- Settings panel (manage keys, change model defaults, reset vault, export memories)
- Memory CRUD UI (edit/pin/delete from the panel, not just via the LLM)
- Loading skeletons (vault open is 3–5s with no visual feedback today)

### Tier 3 — engineering hygiene
- Playwright E2E tests (save/search in both native + compat modes, key recovery, multi-conversation)
- Unit tests for `MarkerFilter` (highest-risk surface — token-streaming edge cases)
- Bundle analyzer (the 23 MB Transformers.js model dominates — lazy-load until first vault op)
- TypeScript `noUncheckedIndexedAccess`
- GitHub Actions for lint/typecheck/build + preview deploys per PR

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
