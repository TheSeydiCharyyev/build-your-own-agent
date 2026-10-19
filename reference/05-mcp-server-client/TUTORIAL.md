# Build your own MCP server + client, step by step

You will build a working [Model Context Protocol](https://modelcontextprotocol.io/) server and client from an empty file — no SDK, no dependencies, ~190 lines of code in total. At the end you'll have the exact code in [`mcp-server.mjs`](./mcp-server.mjs) and [`mcp-client.mjs`](./mcp-client.mjs), and you'll know what every line is for.

**What MCP actually is:** JSON-RPC 2.0 messages, one per line, over stdin/stdout. A server needs exactly three methods for an agent to discover and use tools: one for discovery, plus `tools/list` and `tools/call`. That's the whole "magic."

> **Protocol revisions:** Steps 1–6 build MCP `2024-11-05`, where discovery is the `initialize` handshake. The spec now calls such revisions *legacy* (`2025-11-25` and earlier). [Step 7](#step-7--speak-2026-07-28-too-a-dual-era-server-and-client) makes the server and client *dual-era*, so they also speak the stateless `2026-07-28` revision, where `server/discover` replaces the handshake.

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

The legacy server is done. Step 7 turns it into the dual-era [`mcp-server.mjs`](./mcp-server.mjs).

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

Append the actual conversation — the sequence an agent host performs on a legacy-revision server before handing tools to a model:

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

## Step 7 — Speak 2026-07-28 too: a dual-era server and client

The [`2026-07-28` revision](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx) made MCP stateless. For the tool-serving core you built, that means:

- **No handshake.** `initialize` and `notifications/initialized` are gone. Every request carries its protocol version and client capabilities in `_meta` (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`).
- **`server/discover` is required.** Servers must implement it to advertise their supported versions, capabilities, and identity. On stdio, clients may call it first — or use it as a probe to tell a modern server from a legacy one.
- **Results carry more fields.** Every result has a `resultType` (`"complete"` for ordinary results). `server/discover` and `tools/list` results also carry the cache hints `ttlMs` and `cacheScope`.

What stays: newline-delimited JSON-RPC over stdio, discovery with `tools/list` and invocation with `tools/call`, JSON Schema tool inputs, and the `isError` rule from Step 4.

Legacy clients are still everywhere, so don't replace the handshake — serve both eras. The spec allows one server to implement both behaviors.

**The server.** Keep `TOOLS`, `send`, and the readline loop. Replace `handle` with the code below: the two tool branches move into `serveTools`, which both eras share, and each era gets its own front door.

```js
const SERVER_INFO = { name: 'byoa-mini-mcp', version: '0.2.0' };
const LEGACY_VERSION = '2024-11-05';
const MODERN_VERSIONS = ['2026-07-28'];

// The tool-serving core, the same in both eras. Returns { result } or { error }.
function serveTools(method, params) {
  if (method === 'tools/list') {
    return {
      result: {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }

  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) return { error: { code: -32602, message: `unknown tool: ${params?.name}` } };
    try {
      const text = tool.run(params.arguments || {});
      return { result: { content: [{ type: 'text', text }] } };
    } catch (e) {
      return { result: { content: [{ type: 'text', text: String(e) }], isError: true } };
    }
  }

  return { error: { code: -32601, message: `method not found: ${method}` } };
}

let legacySession = false; // set by `initialize`: legacy rules for this process

function handle(req) {
  const { id, method, params } = req;

  // A JSON-RPC message with no `id` is a notification — it gets no response.
  if (id === undefined) return;

  // Modern era: the request names its own protocol version in `_meta`.
  if (params?._meta?.['io.modelcontextprotocol/protocolVersion'] !== undefined) {
    return send({ jsonrpc: '2.0', id, ...handleModern(method, params) });
  }

  // Legacy era: one handshake, then plain results for the rest of the process.
  if (method === 'initialize') {
    legacySession = true;
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: LEGACY_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
  }
  if (!legacySession) {
    // Neither era: no `_meta` and no handshake. Fail clearly instead of guessing.
    return send({
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: 'missing _meta protocolVersion (or send initialize first)' },
    });
  }
  send({ jsonrpc: '2.0', id, ...serveTools(method, params) });
}

// Modern era (2026-07-28) is stateless: everything comes from the request itself.
function handleModern(method, params) {
  const meta = params._meta;
  const version = meta['io.modelcontextprotocol/protocolVersion'];
  if (!MODERN_VERSIONS.includes(version)) {
    return {
      error: {
        code: -32022,
        message: 'Unsupported protocol version',
        data: { supported: MODERN_VERSIONS, requested: version },
      },
    };
  }
  if (meta['io.modelcontextprotocol/clientCapabilities'] === undefined) {
    return { error: { code: -32602, message: 'missing _meta clientCapabilities' } };
  }

  const out =
    method === 'server/discover'
      ? { result: { supportedVersions: MODERN_VERSIONS, capabilities: { tools: {} } } }
      : serveTools(method, params);
  if (out.error) return out;

  // Every modern result says what kind it is and who answered it.
  const result = {
    resultType: 'complete',
    ...out.result,
    _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
  };
  // Lists also carry cache hints. This tool list never changes and holds no
  // user data, so any client may cache it for a minute.
  if (method === 'server/discover' || method === 'tools/list') {
    result.ttlMs = 60_000;
    result.cacheScope = 'public';
  }
  return { result };
}
```

Four decisions worth noticing:

- **The era is chosen per request.** A request with `_meta.io.modelcontextprotocol/protocolVersion` is served the modern way, with no memory of earlier requests. `initialize` switches the process to legacy rules — the handshake is the only state this server keeps.
- **A request from neither era fails with `-32602`.** The spec calls a request without the required `_meta` fields malformed. Failing here also protects modern-only clients: a server that quietly answered their `tools/call` with legacy rules would hide the mismatch instead of reporting it.
- **An unknown version gets `-32022` with a `supported` list**, so the client can retry with a version both sides know. `supportedVersions` lists only modern versions: those are the ones a client can put in `_meta`. The legacy version is reachable only through `initialize`.
- **The modern additions live in one place.** `resultType`, the `serverInfo` stamp, and the cache hints are added on the way out; `serveTools` doesn't know which era is asking.

**The client.** In Step 5's response handler, keep the error code, so the client can tell errors apart:

```js
if (msg.error) reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
```

Then replace Step 6's conversation with a client that probes first, the way the spec tells a dual-era client to:

```js
const CLIENT_INFO = { name: 'byoa-mini-client', version: '0.2.0' };

// Modern requests carry the protocol version and client capabilities every time.
const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
  'io.modelcontextprotocol/clientCapabilities': {},
};

// 1. Find out which era the server speaks.
let discovered = null;
if (!process.argv.includes('--legacy')) {
  try {
    discovered = await call('server/discover', { _meta: modernMeta });
  } catch (e) {
    // -32022 means "modern, but not your version": the spec says don't fall
    // back. Any other error means a legacy server.
    if (e.code === -32022) throw e;
  }
}

let request; // how every later request is sent, in the era we ended up in
if (discovered) {
  console.log('modern (2026-07-28):', discovered._meta['io.modelcontextprotocol/serverInfo']);
  request = (method, params = {}) => call(method, { ...params, _meta: modernMeta });
} else {
  const init = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });
  console.log(`legacy (${init.protocolVersion}):`, init.serverInfo);
  notify('notifications/initialized');
  request = call;
}

// 2. Discover tools.
const { tools } = await request('tools/list');
console.log('tools:', tools.map((t) => t.name).join(', '));

// 3. Use them.
const sum = await request('tools/call', { name: 'add', arguments: { a: 2, b: 3 } });
console.log('add(2, 3) ->', sum.content[0].text);

const rev = await request('tools/call', { name: 'reverse', arguments: { text: 'agent' } });
console.log('reverse("agent") ->', rev.content[0].text);

server.stdin.end();
server.kill();
```

The fallback is keyed to "anything but a modern error", not to one error code: legacy servers answer an unknown pre-`initialize` request in different ways. A production client also treats a probe that gets no answer within a timeout as legacy.

**Checkpoint** — both eras against the same server:

```bash
node mcp-client.mjs
node mcp-client.mjs --legacy
```

```
modern (2026-07-28): { name: 'byoa-mini-mcp', version: '0.2.0' }
tools: add, reverse
add(2, 3) -> 5
reverse("agent") -> tnega
legacy (2024-11-05): { name: 'byoa-mini-mcp', version: '0.2.0' }
tools: add, reverse
add(2, 3) -> 5
reverse("agent") -> tnega
```

The server also works with the official SDK clients, checked in October 2026 in each of their negotiation modes: TypeScript `@modelcontextprotocol/client` 2.3.1 (`legacy`, `auto`, and a `2026-07-28` pin), `@modelcontextprotocol/sdk` 1.32.1, and Python `mcp` 2.3.0 (`auto`, `legacy`, and `2026-07-28`). Before this step, the modern-only modes failed against it.

## What you built, and what real implementations add

You now have the complete tool-serving core of MCP in both eras: framing, discovery by handshake and by `server/discover`, invocation, and the error-as-data rule. Production servers and SDKs add, in rough order of importance: **resources** and **prompts** (two more capability namespaces alongside tools), the Streamable HTTP transport for remote servers, support for more than one revision per era, cancellation, progress notifications, `subscriptions/listen` for change notifications, and multi round-trip requests (`resultType: "input_required"`). All of them ride on the same JSON-RPC request, response, and notification shapes you just wrote by hand.

---

_Part of [build-your-own-agent](../../README.md) — the index of the strongest from-scratch resource for each component of the agent stack._
