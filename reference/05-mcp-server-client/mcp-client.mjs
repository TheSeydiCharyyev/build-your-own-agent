// mcp-client.mjs — run with:  node mcp-client.mjs   (or: node mcp-client.mjs --legacy)
//
// The other half: a minimal MCP client. It spawns the server as a child
// process, finds out which protocol era the server speaks, lists the tools,
// and calls two of them — what an agent host does before handing tools to a
// model.
//
// Like a dual-era client in the spec, it probes with `server/discover` first
// and falls back to the legacy `initialize` handshake when the answer is not a
// DiscoverResult. --legacy skips the probe and goes straight to the handshake.

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
    if (msg.error) reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
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
