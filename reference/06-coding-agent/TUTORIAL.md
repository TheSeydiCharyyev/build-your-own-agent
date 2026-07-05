# Build your own coding agent, step by step

You will build a Claude-Code-style coding agent from an empty file: the loop, the tools, real workspace containment, error feedback, and a raw-HTTP adapter for a live model — no SDK, no dependencies. At the end you'll have the exact code shipped in this directory, and you'll know why every piece is shaped the way it is.

**The thesis:** a coding agent is not magic. It is *one loop* — ask the model what to do, run the tools it asks for, feed the results back, repeat until it says done. Everything else (files, shell, a real LLM) plugs into that shape.

Requirements: Node 18+. An API key only for the final step, and even that step is optional.

---

## Step 1 — The loop

Create `agent.mjs`. Before writing tools or touching a model, write the thing they plug into:

```js
export async function runAgent({ task, model, tools, maxSteps = 10, log = () => {} }) {
  const messages = [{ role: 'user', content: task }];

  for (let step = 1; step <= maxSteps; step++) {
    const out = await model({ messages, tools });

    if (out.done) {
      log(`step ${step}: done`);
      return { text: out.text, steps: step, messages };
    }

    for (const call of out.toolCalls) {
      const tool = tools[call.name];
      let result;
      try {
        result = tool
          ? String(tool.run(call.args || {}))
          : `error: unknown tool "${call.name}"`;
      } catch (e) {
        result = `error: ${e.message}`;
      }

      log(`step ${step}: ${call.name}(${JSON.stringify(call.args ?? {})}) -> ${result.slice(0, 70)}`);

      messages.push({ role: 'assistant', toolCall: call });
      messages.push({ role: 'tool', name: call.name, content: result });
    }
  }

  return { text: '(max steps reached without finishing)', steps: maxSteps, messages };
}
```

(The shipped [`agent.mjs`](./agent.mjs) is this exact loop plus two cosmetic log-formatting helpers, `truncate` and `compact`.)

Four load-bearing decisions, one per clause:

1. **The model is a parameter.** It's any function of `{ messages, tools }` that returns `{ toolCalls: [...] }` or `{ done: true, text }`. This one signature is why the rest of the tutorial can swap a scripted mock for a live LLM without touching the loop.
2. **`maxSteps` caps the loop.** An agent without a step budget is an infinite loop with a credit card.
3. **Tool failures are data, not crashes.** The `try/catch` turns a thrown error into a result string the model sees on the next turn — so it can react: retry, fix the path, change approach. MCP encodes the same idea as `isError`. Without this, one `ENOENT` kills the whole run.
4. **The transcript is the state.** Every call and every result is appended to `messages`. The model is stateless; the transcript is the agent's memory.

## Step 2 — The hands: file tools with schemas

Create `tools.mjs`. Each tool is a plain function plus a JSON Schema — the schema is how the model knows how to call it:

```js
import fs from 'node:fs';
import path from 'node:path';

export function makeTools(cwd) {
  const resolve = (p) => path.resolve(cwd, p); // ⚠ not done — see Step 3

  return {
    write_file: {
      description: 'Write text to a file (creates or overwrites).',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
      run: ({ path: p, content }) => {
        fs.mkdirSync(path.dirname(resolve(p)), { recursive: true });
        fs.writeFileSync(resolve(p), content);
        return `wrote ${p} (${content.length} bytes)`;
      },
    },

    read_file: {
      description: 'Read a file as text.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      run: ({ path: p }) => fs.readFileSync(resolve(p), 'utf8'),
    },

    list_dir: {
      description: 'List entries in a directory.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      run: ({ path: p = '.' }) => fs.readdirSync(resolve(p)).join('\n') || '(empty)',
    },
  };
}
```

Tools return **strings** describing what happened (`wrote greet.txt (15 bytes)`) — the model can't see your filesystem; the return string *is* its perception.

## Step 3 — Containment: `path.resolve` is not a sandbox

The `resolve` above has a hole you should see for yourself. `path.resolve(cwd, '../escape.txt')` happily returns a path *outside* `cwd` — and so does any absolute path. An agent given those tools can write anywhere the process can.

Real containment is: resolve, then **verify the result is still inside the workspace** before touching the filesystem:

```js
const resolve = (p) => {
  const full = path.resolve(cwd, p);
  const rel = path.relative(cwd, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`path escapes the workspace: ${p}`);
  }
  return full;
};
```

`path.relative(cwd, full)` answers "how do I get from the workspace to this path?" — if the answer starts with `..` (or is absolute, which happens on Windows across drives), the path left the workspace. The throw lands in the loop's `try/catch` from Step 1 and comes back to the model as `error: path escapes the workspace: ...` — containment and error-feedback working together.

(A hardened agent also needs a `realpath` check against symlink escapes, and a shell tool needs an entirely different answer — approval gates or an OS-level sandbox. That's §10 of the [main index](../../README.md#10-guardrails--human-in-the-loop).)

**Checkpoint** — try to escape:

```js
// node --input-type=module -e "..."
import { makeTools } from './tools.mjs';
const t = makeTools(process.cwd());
t.write_file.run({ path: '../escaped.txt', content: 'x' }); // must throw
```

## Step 4 — A shell tool, deliberately dangerous

Add to the returned object in `makeTools`:

```js
run_shell: {
  description: 'Run a shell command in the workspace. UNSAFE without approval.',
  inputSchema: {
    type: 'object',
    properties: { command: { type: 'string' } },
    required: ['command'],
  },
  run: ({ command }) => {
    try {
      return execSync(command, { cwd, encoding: 'utf8' }).trim() || '(no output)';
    } catch (e) {
      return `error: ${e.message}`;
    }
  },
},
```

(plus `import { execSync } from 'node:child_process';` at the top). Note what this tool does **not** have: containment. `cwd` sets the working directory, nothing more — `rm -rf /` runs. The danger is left visible on purpose: a real agent must put a sandbox and/or a human approval step in front of shell access, and pretending a working-directory setting is a security boundary is exactly the kind of false claim this tutorial wants you to recognize.

## Step 5 — A scripted model, so the loop runs with no key

Create `mock-model.mjs`. It honors the model contract from Step 1 and *reacts to the transcript* — deciding its next move from what already happened, exactly the way a real model does, just deterministically:

```js
export function mockModel({ target = 'greet.txt', content = 'hello from byoa' } = {}) {
  return async function model({ messages }) {
    const wrote = messages.some(
      (m) => m.role === 'assistant' && m.toolCall?.name === 'write_file' && m.toolCall?.args?.path === target,
    );
    const readMsg = messages.find((m) => m.role === 'tool' && m.name === 'read_file');

    if (!wrote) return { toolCalls: [{ name: 'write_file', args: { path: target, content } }] };
    if (!readMsg) return { toolCalls: [{ name: 'read_file', args: { path: target } }] };

    const ok = readMsg.content === content;
    return {
      done: true,
      text: ok
        ? `Created ${target} and verified its contents: "${readMsg.content}"`
        : `Created ${target} but contents did not match (got "${readMsg.content}")`,
    };
  };
}
```

Be clear-eyed about what this is: a scripted stand-in, not intelligence. Its value is that the *loop mechanics* — transcript, tool dispatch, result feedback, termination — are inspectable end-to-end without an API key, and the run is reproducible in CI.

**Checkpoint** — wire it up in `example.mjs` (throwaway temp dir as workspace) and run:

```
step 1: write_file({"path":"greet.txt","content":"hello from byoa"}) -> wrote greet.txt (15 bytes)
step 2: read_file({"path":"greet.txt"}) -> hello from byoa
step 3: done

final: Created greet.txt and verified its contents: "hello from byoa"
```

## Step 6 — A real model over raw HTTP

Create `real-model.mjs` — the same contract, backed by a live LLM. No SDK, so the wire format stays visible. Every provider adapter ever written is these two translations:

**Translation 1: your transcript → the provider's message format.** The Anthropic Messages API represents a tool call as a `tool_use` content block in an assistant message, and its result as a `tool_result` block in a user message, tied together by `id`:

```js
function toApiMessages(messages) {
  const out = [];
  let lastToolUseId;
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && m.toolCall) {
      lastToolUseId = m.toolCall.id;
      out.push({
        role: 'assistant',
        content: [{ type: 'tool_use', id: m.toolCall.id, name: m.toolCall.name, input: m.toolCall.args || {} }],
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: lastToolUseId,
          content: m.content,
          is_error: m.content.startsWith('error:') || undefined,
        }],
      });
    }
  }
  return out;
}
```

**Translation 2: the provider's response → the loop's contract.** `stop_reason: "tool_use"` means "run these and come back"; anything else means done:

```js
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    tools: Object.entries(tools).map(([name, t]) => ({
      name, description: t.description, input_schema: t.inputSchema,
    })),
    messages: toApiMessages(messages),
  }),
});
const msg = await res.json();

if (msg.stop_reason === 'tool_use') {
  return {
    toolCalls: msg.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, args: b.input })),
  };
}
return { done: true, text: msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') };
```

Two subtleties that bite everyone the first time: the API's field is `input_schema` (snake_case) while yours is `inputSchema`, and the `id` on each `tool_use` block **must** come back on the matching `tool_result` — which is why Step 1's loop stores the whole `call` object in the transcript: the id rides along for free.

**Checkpoint** — the same task, a real model, and `agent.mjs` unchanged:

```bash
ANTHROPIC_API_KEY=sk-... node example.mjs --real
```

## What you built

A complete coding agent: a model-agnostic loop with a step budget, schema-described tools, workspace containment that actually contains, failures that inform the model instead of killing the run, and a provider adapter you can retarget by swapping a URL and three field names. What Claude Code and Cursor add on top — better tools (search, precise edits), permission gates, context management, sub-agents — are refinements of exactly this skeleton.

---

_Part of [build-your-own-agent](../../README.md) — the index of the strongest from-scratch resource for each component of the agent stack._
