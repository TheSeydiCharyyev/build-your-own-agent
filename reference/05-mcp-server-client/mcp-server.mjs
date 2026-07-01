// mcp-server.mjs
//
// A minimal Model Context Protocol server over stdio — no SDK.
//
// MCP is just JSON-RPC 2.0 sent as newline-delimited JSON over stdin/stdout.
// A server needs exactly three calls for an agent to discover and use tools:
//
//   initialize   → announce protocol version + capabilities
//   tools/list   → describe the tools (name + JSON schema)
//   tools/call   → run a tool and return its result
//
// That's the whole "magic." Run it via mcp-client.mjs, which spawns this file.

import process from 'node:process';
import readline from 'node:readline';

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

  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) {
      return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${params?.name}` } });
    }
    try {
      const text = tool.run(params.arguments || {});
      // Tool output is a list of content blocks — text here, but could be images etc.
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
    } catch (e) {
      // A tool *failing* is reported inside the result (isError), NOT as a
      // protocol-level error — the model is meant to see and react to it.
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e) }], isError: true } });
    }
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
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
