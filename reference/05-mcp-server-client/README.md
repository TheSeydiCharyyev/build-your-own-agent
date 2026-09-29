# §5 — MCP server + client (reference implementation)

The Model Context Protocol, from first principles — a working server **and** client in ~200 lines total, no SDK.

MCP has a reputation for being mysterious. It isn't: it's **JSON-RPC 2.0 sent as newline-delimited JSON over stdin/stdout.** Strip the SDK away and the whole "protocol" an agent needs is three calls.

> **Protocol revision:** this code speaks MCP `2024-11-05`, one of the handshake-based revisions the spec now calls *legacy*. The `2026-07-28` revision removed the `initialize` handshake — see [Which revision this is](#which-revision-this-is).

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

## The whole protocol (that a tool server needs, revision `2024-11-05`)

| Call | Direction | Purpose |
|------|-----------|---------|
| `initialize` | client → server | agree on protocol version + advertise capabilities |
| `notifications/initialized` | client → server | a notification (no `id`, no reply) — "handshake done" |
| `tools/list` | client → server | server returns each tool's name + JSON `inputSchema` |
| `tools/call` | client → server | run a named tool with arguments, get content blocks back |

Two things worth internalizing:

- **A message with no `id` is a notification** — the server must not reply to it. Requests have an `id`; the client matches each response back to its request by that `id`.
- **A tool *failing* is not a protocol error.** Errors from the tool come back inside the normal result with `isError: true`, so the model can see the failure and react. Protocol errors (`error` field) are reserved for "bad method / bad params."

## Which revision this is

The spec splits revisions into two eras. **Legacy** revisions (`2025-11-25` and earlier) open with the `initialize` handshake shown above. **Modern** revisions (`2026-07-28` and later) have no handshake: every request carries its protocol version and client capabilities in `_meta`, and servers must implement `server/discover` to advertise versions, capabilities, and identity.

This server is legacy-only. A client that supports both eras probes with `server/discover`, gets `method not found`, and falls back to `initialize` — so it still works. A client that speaks only modern revisions fails against it. The parts that carry over: newline-delimited JSON-RPC over stdio, the `tools/list` → `tools/call` flow (results now also need `resultType`, and `tools/list` results `ttlMs`/`cacheScope`), JSON Schema tool inputs, and the `isError` rule. Details: [TUTORIAL.md → What changed in 2026-07-28](./TUTORIAL.md#what-changed-in-2026-07-28).

## Files

- [`mcp-server.mjs`](./mcp-server.mjs) — the server: `initialize` · `tools/list` · `tools/call`, with two demo tools.
- [`mcp-client.mjs`](./mcp-client.mjs) — the client: spawn, handshake, discover, call.

## Where to go next

- Add a tool that does real work (read a file, hit an API) — the shape stays identical.
- Serve it over HTTP instead of stdio — use the Streamable HTTP transport; the older HTTP+SSE transport is deprecated.
- Point a real MCP host (an agent app) at `mcp-server.mjs` — a host that still supports legacy revisions will fall back to exactly these messages.
- Make it dual-era: keep the `initialize` flow for legacy clients, and add `server/discover` plus the modern per-request rules for the rest ([what changed](./TUTORIAL.md#what-changed-in-2026-07-28)).

---

_Part of [build-your-own-agent](../../README.md). A ⭐ original reference implementation — most MCP material is "install the SDK," not "here's the wire protocol."_
