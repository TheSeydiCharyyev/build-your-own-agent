# Build your own MCP server + client, step by step

You will build a working [Model Context Protocol](https://modelcontextprotocol.io/) server and client from an empty file — no SDK, no dependencies, ~170 lines total. At the end you'll have the exact code in [`mcp-server.mjs`](./mcp-server.mjs) and [`mcp-client.mjs`](./mcp-client.mjs), and you'll know what every line is for.

**What MCP actually is:** JSON-RPC 2.0 messages, one per line, over stdin/stdout. A server needs exactly three methods for an agent to discover and use tools: `initialize`, `tools/list`, `tools/call`. That's the whole "magic."

Requirements: Node 18+. Nothing else.

---

## Step 1 — A server that speaks JSON-RPC over stdio

Create `mcp-server.mjs`. The transport is the simplest thing that could work: read one JSON message per line from stdin, write one JSON message per line to stdout.

```js
import process from 'node:process';
import readline from 'node:readline';

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return; // ignore malformed lines
  }
  handle(req);
});
```

Two decisions worth noticing:

- **Newline-delimited JSON** is the stdio framing MCP uses — no `Content-Length` headers to parse (that's the LSP style; MCP stdio is simpler).
- Malformed lines are ignored rather than crashing the server — a transport should be boring.

## Step 2 — The `initialize` handshake

JSON-RPC requests carry an `id`; the response must echo it. A message *without* an `id` is a **notification** — it expects no reply. Start `handle` with those rules, then answer `initialize`:

```js
function handle(req) {
  const { id, method, params } = req;

  // A JSON-RPC message with no `id` is a notification — it gets no response.
  if (id === undefined) return;

  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'byoa-mini-mcp', version: '0.1.0' },
      },
    });
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
}
```

The handshake is a capability negotiation: the server announces which protocol revision it speaks and that it serves tools (`capabilities: { tools: {} }`). A real client may refuse to proceed if the versions are incompatible.

**Checkpoint** — run the server and type a request into it:

```bash
node mcp-server.mjs
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
```

You should get back one line with `protocolVersion` and `serverInfo`. Ctrl+C to exit.

## Step 3 — Describe your tools: `tools/list`

Tools are plain functions plus a **JSON Schema** describing their input. The schema is not decoration — it is how the model on the other end knows how to call the tool. Add above `handle`:

```js
const TOOLS = {
  add: {
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
    run: ({ a, b }) => String(a + b),
  },
  reverse: {
    description: 'Reverse a string',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    run: ({ text }) => [...text].reverse().join(''),
  },
};
```

And inside `handle`, before the method-not-found fallback:

```js
if (method === 'tools/list') {
  return send({
    jsonrpc: '2.0',
    id,
    result: {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    },
  });
}
```

## Step 4 — Run a tool: `tools/call`, and the `isError` rule

```js
if (method === 'tools/call') {
  const tool = TOOLS[params?.name];
  if (!tool) {
    return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${params?.name}` } });
  }
  try {
    const text = tool.run(params.arguments || {});
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
  } catch (e) {
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e) }], isError: true } });
  }
}
```

This step contains the most important design rule in MCP:

- Calling a tool that **doesn't exist** is a *protocol* error → JSON-RPC `error`.
- A tool that exists but **fails while running** is *data* → a normal `result` with `isError: true`.

Why? Because the model is supposed to *see* tool failures and react to them — retry, try different arguments, change approach. A protocol error would kill the exchange instead of informing it. Tool output is a list of content blocks (`{type: 'text', ...}`) so servers can also return images and other media.

The server is done — it matches [`mcp-server.mjs`](./mcp-server.mjs).

## Step 5 — The client: spawn, and match responses by `id`

Create `mcp-client.mjs`. The client is what an agent host runs: it spawns the server as a child process and talks to it over its stdin/stdout.

```js
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const server = spawn('node', [join(here, 'mcp-server.mjs')], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let nextId = 1;
const pending = new Map(); // id -> { resolve, reject }

const rl = readline.createInterface({ input: server.stdout });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function call(method, params) {
  const id = nextId++;
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
```

The `pending` map is the heart of every JSON-RPC client ever written: requests go out with increasing ids, responses come back in *any* order, and the id is what reunites a response with the promise that awaits it.

## Step 6 — Handshake, discover, call

Append the actual conversation — the exact sequence every agent host performs before handing tools to a model:

```js
// 1. Handshake.
const init = await call('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'byoa-mini-client', version: '0.1.0' },
});
console.log('initialized with:', init.serverInfo);
notify('notifications/initialized');

// 2. Discover tools.
const { tools } = await call('tools/list');
console.log('tools:', tools.map((t) => t.name).join(', '));

// 3. Use them.
const sum = await call('tools/call', { name: 'add', arguments: { a: 2, b: 3 } });
console.log('add(2, 3) ->', sum.content[0].text);

const rev = await call('tools/call', { name: 'reverse', arguments: { text: 'agent' } });
console.log('reverse("agent") ->', rev.content[0].text);

server.stdin.end();
server.kill();
```

Note `notifications/initialized`: it's a notification (no `id`), which is why the server's first rule in Step 2 — "no id → no response" — matters. Without it, a naive server would send a reply the client never asked for.

**Checkpoint** — the full run:

```bash
node mcp-client.mjs
```

```
initialized with: { name: 'byoa-mini-mcp', version: '0.1.0' }
tools: add, reverse
add(2, 3) -> 5
reverse("agent") -> tnega
```

## What you built, and what real implementations add

You now have the complete tool-serving core of MCP: framing, handshake, discovery, invocation, and the error-as-data rule. Production servers and SDKs add, in rough order of importance: **resources** and **prompts** (two more capability namespaces alongside tools), the Streamable HTTP transport for remote servers, protocol-revision negotiation beyond a single hardcoded date, cancellation, and progress notifications. All of them ride on exactly the message shapes you just wrote by hand.

---

_Part of [build-your-own-agent](../../README.md) — the index of the strongest from-scratch resource for each component of the agent stack._
