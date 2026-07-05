# §7 — Token accounting, streaming & cache (reference implementation)

Where an agent's money and latency actually go — built from scratch, zero dependencies.

Most tutorials stop at "call the model." This one covers the part that decides your bill: **token estimation, cost, prompt-cache math, and streaming metrics.** ~150 lines of plain JavaScript you can read in one sitting.

**Want to build it yourself instead of reading it?** [TUTORIAL.md](./TUTORIAL.md) walks the whole thing step by step, from an empty file.

## Run it

```bash
node example.mjs
```

You'll see the streaming metrics (TTFT, tokens/sec) and a side-by-side of the same agent step **with vs. without prompt caching** — the cache saves ~80% on this example, and more as the cached prefix grows relative to the generated output.

## What it teaches

| Piece | Function | Idea |
|-------|----------|------|
| Token estimation | `estimateTokens(text)` | Budget a prompt *before* sending. Providers return exact counts in `usage` — trust those when you have them; estimate only to decide whether a prompt fits. |
| Pricing & cost | `costForModel(model, usage)` | Cost is per-1M-tokens, split by kind. `cacheWrite` costs a **premium**; `cacheRead` is a deep **discount**. |
| Attribution | `UsageMeter` | A single total hides which agent step / tool is expensive. The meter aggregates cost **per label** so you can see it. |
| Streaming | `consumeStream(chunks)` | Measure **time-to-first-token** and **tokens/sec** over any async iterable of strings — provider-agnostic. |

## Wiring it to a real provider

- Replace `fakeStream()` with your provider's streaming response (any async iterable of text chunks).
- Replace the `estimateTokens(...)` values in `meter.record({ usage })` with the provider's **exact** `usage` numbers from the API response.
- Put real per-1M pricing in `PRICES`.

The estimator and the meter don't care which provider you use — that's the point of building it yourself.

## Files

- [`token-accounting.mjs`](./token-accounting.mjs) — the implementation (estimate · price · meter · stream).
- [`example.mjs`](./example.mjs) — a runnable agent-step simulation with a cached prefix.

---

_Part of [build-your-own-agent](../../README.md). This is a ⭐ original reference implementation, not a link-out — there's almost no good from-scratch material on cost/latency accounting._
