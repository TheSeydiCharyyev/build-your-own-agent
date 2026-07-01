// example.mjs — run with:  node example.mjs
//
// Simulates one agent step: a large CACHED system prompt + a small fresh
// question, streamed back token by token. Shows how caching collapses the
// cost and how you measure streaming latency. Nothing here calls a real API —
// swap fakeStream() for your provider's stream and record the provider's
// exact `usage` instead of estimates.

import { UsageMeter, consumeStream, estimateTokens } from './token-accounting.mjs';

// A fake streamed model response: an async generator of text chunks with a
// small delay, so TTFT and tokens/sec are non-trivial.
async function* fakeStream(text, { chunkSize = 8, delayMs = 15 } = {}) {
  for (let i = 0; i < text.length; i += chunkSize) {
    await new Promise((r) => setTimeout(r, delayMs));
    yield text.slice(i, i + chunkSize);
  }
}

const meter = new UsageMeter();

// A big, stable system prompt that a provider would serve from cache on the
// 2nd+ call, plus the small new part of this turn.
const systemPrompt = 'You are a helpful assistant. '.repeat(200); // cached prefix
const question = 'Explain prompt caching in one sentence.'; // fresh input

const answer =
  'Prompt caching stores the tokens of a stable prefix so repeated requests ' +
  'pay a cheap cache-read rate instead of re-processing the whole prompt again.';

// Stream the answer and measure it.
const stream = await consumeStream(fakeStream(answer));

// Record the request. On a cache HIT the big prefix is billed at cacheRead;
// only the new question is fresh `input`.
meter.record({
  model: 'example-model',
  label: 'agent-step-1',
  usage: {
    cacheRead: estimateTokens(systemPrompt),
    input: estimateTokens(question),
    output: stream.outputTokens,
  },
});

// For contrast: the SAME step with no cache — the whole prefix is fresh input.
const meterNoCache = new UsageMeter();
meterNoCache.record({
  model: 'example-model',
  label: 'agent-step-1',
  usage: {
    input: estimateTokens(systemPrompt) + estimateTokens(question),
    output: stream.outputTokens,
  },
});

console.log('stream metrics:', {
  ttftMs: stream.ttftMs,
  totalMs: stream.totalMs,
  tokensPerSec: stream.tokensPerSec,
  outputTokens: stream.outputTokens,
});

const cached = meter.report();
const uncached = meterNoCache.report();
console.log('\nwith cache:   $' + cached.costUSD, '| cacheHitRate', cached.cacheHitRate);
console.log('without cache: $' + uncached.costUSD);
console.log(
  'cache saved:  ' +
    Math.round((1 - cached.costUSD / uncached.costUSD) * 100) +
    '% on this step',
);

console.log('\nfull report:', JSON.stringify(cached, null, 2));
