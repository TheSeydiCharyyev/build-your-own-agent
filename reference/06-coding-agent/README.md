# §6 — Coding agent (reference implementation)

A Claude-Code / Cursor-style coding agent, reduced to its skeleton: a loop, a handful of file/shell tools, and a pluggable model. Runs with **no API key** via a scripted mock model.

The insight a demo hides: a coding agent is not magic, it's **one loop** — ask the model what to do, run the tools it asks for, feed the results back, repeat until it says done. Everything else plugs into that.

## Run it

```bash
node example.mjs
```

You'll watch the agent complete a real task in a throwaway workspace:

```
step 1: write_file({"path":"greet.txt","content":"hello from byoa"}) -> wrote greet.txt (15 bytes)
step 2: read_file({"path":"greet.txt"}) -> hello from byoa
step 3: done

final: Created greet.txt and verified its contents: "hello from byoa"
```

## The pieces

| File | Role |
|------|------|
| [`agent.mjs`](./agent.mjs) | the loop — `model → toolCalls → run → feed back → repeat`, capped by `maxSteps` |
| [`tools.mjs`](./tools.mjs) | the hands — `write_file`, `read_file`, `list_dir`, `run_shell`, all sandboxed to a workspace dir |
| [`mock-model.mjs`](./mock-model.mjs) | a deterministic stand-in LLM that reacts to tool results, so the demo needs no key |
| [`example.mjs`](./example.mjs) | wires them together on a real task |

## Wiring a real model

Replace `mockModel()` with a function that formats `messages` + `tools` for your provider, calls it, and returns either `{ toolCalls: [{ name, args }] }` or `{ done: true, text }`. **`agent.mjs` does not change** — that separation is the whole point.

## Two things to notice

- **The model never touches the filesystem.** It only *names* a tool and arguments; `agent.mjs` runs it and returns the result. That boundary is what makes an agent auditable and safe to gate.
- **`run_shell` is deliberately unguarded here.** A real agent must put a sandbox and/or a human approval step in front of it — that's [§10 (guardrails / human-in-the-loop)](../../README.md#10-guardrails--human-in-the-loop). The danger is left visible on purpose.

---

_Part of [build-your-own-agent](../../README.md). A ⭐ original reference implementation of the loop that powers coding agents._
