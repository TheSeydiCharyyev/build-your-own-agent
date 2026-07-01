// mcp-client.mjs — run with:  node mcp-client.mjs
//
// The other half: a minimal MCP client. It spawns the server as a child
// process, does the initialize handshake, lists the tools, and calls two of
// them — exactly what an agent host does before handing tools to a model.

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Talk to the server over its stdin/stdout; let its stderr pass through.
const server = spawn('node', [join(here, 'mcp-server.mjs')], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let nextId = 1;
const pending = new Map(); // id -> { resolve, reject }

// Match each response line back to the request that is waiting on its id.
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
  // Notifications have no id and expect no reply.
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

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
