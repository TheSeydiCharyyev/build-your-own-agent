# §5 — MCP server + client (reference implementation)

The Model Context Protocol, from first principles — a working server **and** client in ~190 lines of code, no SDK.

MCP has a reputation for being mysterious. It isn't: it's **JSON-RPC 2.0 sent as newline-delimited JSON over stdin/stdout.** Strip the SDK away and the whole "protocol" an agent needs is three calls: one for discovery, plus `tools/list` and `tools/call`.

> **Protocol revisions:** both files are *dual-era*. They speak the legacy `2024-11-05` revision, which opens with the `initialize` handshake, and the stateless `2026-07-28` revision, which has no handshake — see [Two eras, one server](#two-eras-one-server).

**Want to build it yourself instead of reading it?** [TUTORIAL.md](./TUTORIAL.md) walks the whole thing step by step, from an empty file.

## Run it

```bash
node mcp-client.mjs            # modern: probes with server/discover
node mcp-client.mjs --legacy   # legacy: the initialize handshake
```

The client spawns the server, finds out which era it speaks, and calls two tools:

```
modern (2026-07-28): { name: 'byoa-mini-mcp', version: '0.2.0' }
tools: add, reverse
add(2, 3) -> 5
reverse("agent") -> tnega
```

With `--legacy`, the first line is `legacy (2024-11-05): { name: 'byoa-mini-mcp', version: '0.2.0' }`; the rest is the same.

## The whole protocol (that a tool server needs)

| Call | Era | Purpose |
|------|-----|---------|
| `initialize` | legacy | agree on protocol version + advertise capabilities, once per process |
| `notifications/initialized` | legacy | a notification (no `id`, no reply) — "handshake done" |
| `server/discover` | modern | server returns its supported versions, capabilities, and identity |
| `tools/list` | both | server returns each tool's name + JSON `inputSchema` |
| `tools/call` | both | run a named tool with arguments, get content blocks back |

Every call goes client → server. Two things worth internalizing:

- **A message with no `id` is a notification** — the server must not reply to it. Requests have an `id`; the client matches each response back to its request by that `id`.
- **A tool *failing* is not a protocol error.** Errors from the tool come back inside the normal result with `isError: true`, so the model can see the failure and react. Protocol errors (`error` field) are reserved for "bad method / bad params."

## Two eras, one server

The spec splits revisions into two eras. **Legacy** revisions (`2025-11-25` and earlier) open with the `initialize` handshake. **Modern** revisions (`2026-07-28` and later) have no handshake: every request carries its protocol version and client capabilities in `_meta`, servers must implement `server/discover`, and every result carries a `resultType` (lists also carry the cache hints `ttlMs` and `cacheScope`).

The server picks the era per request. A request with a protocol version in `_meta` is served the modern way; `initialize` switches the process to legacy rules; a request with neither is rejected with `-32602`. The client does what the spec asks of a dual-era client: it probes with `server/discover` and falls back to `initialize` on any error that isn't a modern one.

Checked in October 2026 against the official SDK clients in each of their negotiation modes: TypeScript `@modelcontextprotocol/client` 2.3.1 and `@modelcontextprotocol/sdk` 1.32.1, and Python `mcp` 2.3.0. Details: [TUTORIAL.md → Step 7](./TUTORIAL.md#step-7--speak-2026-07-28-too-a-dual-era-server-and-client).

## Files

- [`mcp-server.mjs`](./mcp-server.mjs) — the server: `initialize` and `server/discover` in front of one shared `tools/list` · `tools/call` core, with two demo tools.
- [`mcp-client.mjs`](./mcp-client.mjs) — the client: spawn, probe or handshake, discover tools, call.

## Where to go next

- Add a tool that does real work (read a file, hit an API) — the shape stays identical.
- Serve it over HTTP instead of stdio — use the Streamable HTTP transport; the older HTTP+SSE transport is deprecated.
- Point a real MCP host (an agent app) at `mcp-server.mjs` — it will speak one of the two flows above, depending on which eras the host supports.

---

_Part of [build-your-own-agent](../../README.md). A ⭐ original reference implementation — most MCP material is "install the SDK," not "here's the wire protocol."_
