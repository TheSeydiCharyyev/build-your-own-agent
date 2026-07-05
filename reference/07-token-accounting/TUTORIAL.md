# Build your own token accounting, step by step

You will build the four mechanisms that decide an agent's bill and its latency — token estimation, cost math, prompt-cache economics, and streaming metrics — from an empty file, dependency-free, in ~130 lines. Tokenizers from scratch are well taught elsewhere ([Karpathy's video](https://www.youtube.com/watch?v=zduSFxRajkE) is the canonical one); what nobody teaches is the **cost ledger of an agent loop**: where the money actually goes across a multi-step run, and how to attribute it. That's this tutorial.

At the end you'll have the exact code in [`token-accounting.mjs`](./token-accounting.mjs) and a demo that reproduces the ~80% cache saving providers advertise, from first principles.

Requirements: Node 18+. No API key — the math is the point, and math runs offline.

---

## Step 1 — Estimate tokens (and know when not to)

Create `token-accounting.mjs`. First rule of token counting: **real providers return exact counts in every response's `usage` field — always trust that number when you have it.** An estimator has exactly two legitimate jobs: budgeting *before* a call ("will this prompt fit?") and filling in when no usage is returned.

```js
export function estimateTokens(text) {
  if (!text) return 0;
  const chars = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(Math.ceil(chars / 4), Math.ceil(words * 0.75));
}
```

The ~4-characters-per-token rule is the well-known English heuristic. Blending it with a word count (`max` of the two) keeps it honest on inputs where chars/4 lies: dense code, long identifiers, short strings. This is deliberately *not* a real tokenizer — a real one is a trained BPE vocabulary ([build one here](https://github.com/karpathy/minbpe)); an estimator just needs to be cheap and roughly right.

## Step 2 — The price table, and the two numbers that surprise people

Cost is quoted per million tokens, split by *kind*. Add:

```js
export const PRICES = {
  'example-model': {
    input: 3.0,       // $ / 1M input tokens
    output: 15.0,     // $ / 1M output tokens
    cacheWrite: 3.75, // $ / 1M tokens written to cache (input + premium)
    cacheRead: 0.3,   // $ / 1M tokens read from cache (big discount)
  },
};

export function costForModel(model, usage) {
  const p = PRICES[model];
  if (!p) throw new Error(`no price table for model: ${model}`);
  const per = (tokens, rate) => ((tokens || 0) / 1_000_000) * rate;
  return (
    per(usage.input, p.input) +
    per(usage.output, p.output) +
    per(usage.cacheWrite, p.cacheWrite) +
    per(usage.cacheRead, p.cacheRead)
  );
}
```

The two entries that surprise people:

- **`cacheWrite` costs a premium over normal input** (here 1.25×). You pay extra to populate the cache — it's a bet that you'll read it back.
- **`cacheRead` is a deep discount** (here 0.1×). Reusing an already-processed prefix is ~10× cheaper than processing it again.

These ratios mirror real provider pricing (the 1.25×/0.1× structure is exactly [Anthropic's prompt-caching model](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). The `unknown model → throw` is a policy choice worth copying: guessing a price is worse than failing loudly.

## Step 3 — The meter: totals are useless, attribution is the point

A single "this run cost $0.47" tells you nothing actionable. The question that matters in an agent is *which part* is expensive — which step, which tool, which sub-agent. So the meter aggregates twice: global totals, and per **label**:

```js
export class UsageMeter {
  constructor() {
    this.totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    this.cost = 0;
    this.requests = 0;
    this.byLabel = new Map();
  }

  record({ model, usage, label = 'default' }) {
    for (const k of Object.keys(this.totals)) this.totals[k] += usage[k] || 0;
    const cost = costForModel(model, usage);
    this.cost += cost;
    this.requests += 1;

    const agg =
      this.byLabel.get(label) ||
      { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
    agg.cost += cost;
    agg.requests += 1;
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) agg[k] += usage[k] || 0;
    this.byLabel.set(label, agg);
    return cost;
  }

  report() {
    const cachedInput = this.totals.cacheRead + this.totals.input;
    return {
      requests: this.requests,
      tokens: { ...this.totals },
      costUSD: round(this.cost),
      cacheHitRate: cachedInput === 0 ? 0 : round(this.totals.cacheRead / cachedInput),
      byLabel: Object.fromEntries(
        [...this.byLabel].map(([k, v]) => [k, { ...v, cost: round(v.cost) }]),
      ),
    };
  }
}

function round(n, dp = 6) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
```

In an agent loop you call `meter.record({..., label: 'step-3'})` or `label: 'search-tool'` after every request. The `cacheHitRate` in the report answers the single most diagnostic question about a long-running agent's bill: *of all the prompt tokens I sent, what fraction came cheaply from cache?* Low hit rate on a loop that resends its transcript every step means something is invalidating the cache — and that's real money.

## Step 4 — The cache math, felt

Now make the economics tangible. An agent step resends a big stable prefix (system prompt, tool definitions) plus a small fresh suffix. Model one step both ways:

```js
import { UsageMeter, estimateTokens } from './token-accounting.mjs';

const systemPrompt = 'You are a helpful assistant. '.repeat(200); // the stable prefix
const userMsg = 'What is prompt caching and why does it matter?';
const answer = '...'; // whatever the model said

// WITH cache: the prefix is billed at the cacheRead rate.
const meter = new UsageMeter();
meter.record({
  model: 'example-model',
  usage: {
    input: estimateTokens(userMsg),
    cacheRead: estimateTokens(systemPrompt),
    output: estimateTokens(answer),
  },
  label: 'agent-step',
});

// WITHOUT cache: the whole prefix is fresh input, full price.
const meterNoCache = new UsageMeter();
meterNoCache.record({
  model: 'example-model',
  usage: {
    input: estimateTokens(systemPrompt) + estimateTokens(userMsg),
    output: estimateTokens(answer),
  },
  label: 'agent-step',
});

const cached = meter.report();
const uncached = meterNoCache.report();
console.log('with cache:   $' + cached.costUSD, '| cacheHitRate', cached.cacheHitRate);
console.log('without cache: $' + uncached.costUSD);
console.log('cache saved:  ' + Math.round((1 - cached.costUSD / uncached.costUSD) * 100) + '%');
```

**Checkpoint** — run it:

```
with cache:   $0.001035 | cacheHitRate 0.993151
without cache: $0.00495
cache saved:  79% on this step
```

That ~80% is the number providers advertise, and now you can see exactly where it comes from: the prefix dominates the token count, and the prefix rate dropped 10×. It also tells you when caching *doesn't* pay: a short prefix, or a prefix that changes every call (a timestamp in the system prompt is the classic self-inflicted wound — one changed byte re-bills the whole prefix at the write premium).

## Step 5 — Streaming metrics: TTFT and tokens/sec

Latency has two numbers users feel: **time-to-first-token** (how long the screen is blank) and **throughput** (how fast text flows once it starts). Measure both while accumulating the stream:

```js
export async function consumeStream(chunks, { now = () => Date.now() } = {}) {
  const start = now();
  let ttft = null;
  let text = '';
  let outChunks = 0;
  for await (const chunk of chunks) {
    if (ttft === null) ttft = now() - start; // first token has landed
    text += chunk;
    outChunks += 1;
  }
  const total = now() - start;
  const outputTokens = estimateTokens(text);
  return {
    text,
    ttftMs: ttft ?? total,
    totalMs: total,
    outputTokens,
    tokensPerSec: total > 0 ? round((outputTokens / total) * 1000, 2) : 0,
    chunks: outChunks,
  };
}
```

Two design choices to copy:

- It accepts **any async iterable of strings** — no provider types, so the same meter wraps an Anthropic SSE stream, an OpenAI stream, or a test generator.
- The clock is **injectable** (`now`). Time-dependent code with a hardwired `Date.now()` is untestable; with injection, a test can feed fake timestamps and assert exact TTFT values.

**Checkpoint** — feed it a fake stream:

```js
async function* fakeStream() {
  for (const c of ['Prompt ', 'caching ', 'reuses ', 'a ', 'processed ', 'prefix.']) {
    await new Promise((r) => setTimeout(r, 20));
    yield c;
  }
}
console.log(await consumeStream(fakeStream()));
// { ttftMs: ~20, totalMs: ~120, outputTokens: ..., tokensPerSec: ... }
```

## What you built

A dependency-free cost ledger for an agent: estimation you only trust when you must, exact cost math with the cache write-premium/read-discount structure real providers use, per-label attribution that turns "this run was expensive" into "step 3's retrieval is 80% of the bill", and provider-agnostic latency metrics. Wire `meter.record()` into an agent loop (like [§6's coding agent](../06-coding-agent/)) with the provider's real `usage` numbers, and you have per-step cost attribution — the piece none of the tokenizer tutorials teach.

---

_Part of [build-your-own-agent](../../README.md) — the index of the strongest from-scratch resource for each component of the agent stack._
