// mcp-server.mjs
//
// A minimal Model Context Protocol server over stdio — no SDK.
//
// MCP is just JSON-RPC 2.0 sent as newline-delimited JSON over stdin/stdout.
// This server is dual-era: it speaks both protocol eras the spec defines.
//
//   legacy (2024-11-05)  initialize → tools/list → tools/call
//                        one handshake, then the rules hold for the process
//   modern (2026-07-28)  server/discover → tools/list → tools/call
//                        no handshake: every request carries its protocol
//                        version and client capabilities in `_meta`
//
// Either way, an agent needs only discovery plus two tool calls. That's the
// whole "magic." Run it via mcp-client.mjs, which spawns this file.

import process from 'node:process';
import readline from 'node:readline';

const SERVER_INFO = { name: 'byoa-mini-mcp', version: '0.2.0' };
const LEGACY_VERSION = '2024-11-05';
const MODERN_VERSIONS = ['2026-07-28'];

// The tools this server exposes. `inputSchema` is standard JSON Schema — that's
// how the client (and the model behind it) knows how to call each tool.
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

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

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
      // Tool output is a list of content blocks — text here, but could be images etc.
      return { result: { content: [{ type: 'text', text }] } };
    } catch (e) {
      // A tool *failing* is reported inside the result (isError), NOT as a
      // protocol-level error — the model is meant to see and react to it.
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

// Read one JSON-RPC message per line.
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
