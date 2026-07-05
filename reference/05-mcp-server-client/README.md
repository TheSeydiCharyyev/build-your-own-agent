# §5 — MCP server + client (reference implementation)

The Model Context Protocol, from first principles — a working server **and** client in ~200 lines total, no SDK.

MCP has a reputation for being mysterious. It isn't: it's **JSON-RPC 2.0 sent as newline-delimited JSON over stdin/stdout.** Strip the SDK away and the whole "protocol" an agent needs is three calls.

**Want to build it yourself instead of reading it?** [TUTORIAL.md](./TUTORIAL.md) walks the whole thing step by step, from an empty file.

## Run it

```bash
node mcp-client.mjs
```

The client spawns the server, does the handshake, and calls two tools:

```
initialized with: { name: 'byoa-mini-mcp', version: '0.1.0' }
tools: add, reverse
add(2, 3) -> 5
reverse("agent") -> tnega
```

## The whole protocol (that a tool server needs)

| Call | Direction | Purpose |
|------|-----------|---------|
| `initialize` | client → server | agree on protocol version + advertise capabilities |
| `notifications/initialized` | client → server | a notification (no `id`, no reply) — "handshake done" |
| `tools/list` | client → server | server returns each tool's name + JSON `inputSchema` |
| `tools/call` | client → server | run a named tool with arguments, get content blocks back |

Two things worth internalizing:

- **A message with no `id` is a notification** — the server must not reply to it. Requests have an `id`; the client matches each response back to its request by that `id`.
- **A tool *failing* is not a protocol error.** Errors from the tool come back inside the normal result with `isError: true`, so the model can see the failure and react. Protocol errors (`error` field) are reserved for "bad method / bad params."

## Files

- [`mcp-server.mjs`](./mcp-server.mjs) — the server: `initialize` · `tools/list` · `tools/call`, with two demo tools.
- [`mcp-client.mjs`](./mcp-client.mjs) — the client: spawn, handshake, discover, call.

## Where to go next

- Add a tool that does real work (read a file, hit an API) — the shape stays identical.
- Swap the stdio transport for HTTP/SSE — only the read/write layer changes; the JSON-RPC messages don't.
- Point a real MCP host (an agent app) at `mcp-server.mjs` — it will speak exactly these messages.

---

_Part of [build-your-own-agent](../../README.md). A ⭐ original reference implementation — most MCP material is "install the SDK," not "here's the wire protocol."_
