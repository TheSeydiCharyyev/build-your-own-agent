// token-accounting.mjs
//
// Minimal, dependency-free reference implementation of the four things that
// decide an agent's bill and its latency:
//
//   1. Token estimation   — how big is this prompt, before I send it?
//   2. Pricing & cost      — what did a request actually cost?
//   3. Prompt-cache math    — why a cached prefix is ~10x cheaper.
//   4. Streaming metrics    — time-to-first-token and tokens/sec.
//
// Teaching code for build-your-own-agent §7. Vendor-neutral: it works on any
// stream of text and any price table. NOT a production tokenizer — see below.

// --- 1. Token estimation ---------------------------------------------------
// Real providers return EXACT token counts in each response's `usage` field.
// Always trust that number when you have it. This estimator is only for
// *budgeting before a call* (will this prompt fit?) or when no usage is
// returned. The ~4-chars-per-token rule is the well-known English heuristic;
// blending it with a word count keeps it honest on code and short strings.
export function estimateTokens(text) {
  if (!text) return 0;
  const chars = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(Math.ceil(chars / 4), Math.ceil(words * 0.75));
}

// --- 2. Pricing ------------------------------------------------------------
// Cost is quoted per 1M tokens and split by kind. The two that surprise people:
//   - cacheWrite costs a PREMIUM over normal input (you pay to populate the cache)
//   - cacheRead is a deep discount (you reuse an already-processed prefix)
// Replace these example numbers with your provider's real pricing.
export const PRICES = {
  'example-model': {
    input: 3.0, //      $ / 1M input tokens
    output: 15.0, //    $ / 1M output tokens
    cacheWrite: 3.75, // $ / 1M tokens written to cache (input + premium)
    cacheRead: 0.3, //   $ / 1M tokens read from cache (big discount)
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

// --- 3. The meter ----------------------------------------------------------
// Accumulates usage across many requests and ATTRIBUTES cost per label (per
// agent step, per tool, per user). Attribution is the whole point: a single
// total tells you nothing about which part of your agent is expensive.
export class UsageMeter {
  constructor() {
    this.totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    this.cost = 0;
    this.requests = 0;
    this.byLabel = new Map();
  }

  // Record one completed request. Prefer the provider's exact `usage` numbers;
  // fall back to estimateTokens() only when the API gives you none.
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
      // Of all prompt tokens, what fraction came cheaply from cache?
      cacheHitRate: cachedInput === 0 ? 0 : round(this.totals.cacheRead / cachedInput),
      byLabel: Object.fromEntries(
        [...this.byLabel].map(([k, v]) => [k, { ...v, cost: round(v.cost) }]),
      ),
    };
  }
}

// --- 4. Streaming measurement ----------------------------------------------
// Consume a stream of text chunks, measuring time-to-first-token (TTFT) and
// throughput while accumulating the output. Accepts ANY async iterable of
// strings, so it is provider-agnostic. `now` is injectable so tests are
// deterministic.
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

function round(n, dp = 6) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
