<h1 align="center">build-your-own-agent</h1>

<p align="center">
  <em>The build-your-own-x for the modern AI-agent stack — reimplement every component from scratch, no frameworks, no black boxes.</em>
</p>

<p align="center">
  <img alt="stars" src="https://img.shields.io/github/stars/TheSeydiCharyyev/build-your-own-agent?style=social">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen">
  <img alt="status" src="https://img.shields.io/badge/status-v1%20in%20progress-orange">
</p>

---

> 🚧 **v1 in progress.** The stack map below is the skeleton. Curated links land per section, and the flagship reference implementations (⭐) are being written. Watch/star to follow.

## Why this exists

Everyone can call an agent framework. Almost no one can rebuild the pieces underneath it. When something breaks — a tool call loops, memory bloats the context, the token bill explodes, an MCP server hangs — you need to know how the machine actually works, not which framework method to call.

This repo is the **map of the modern agent stack**: for every component, it points you to the single best from-scratch resource that exists anywhere, and where none exists, it ships a minimal, readable reference implementation of its own.

## How this is different

There are already excellent **from-scratch courses** — one author, one linear path, their own codebase (e.g. `learn-claude-code`, `ai-engineering-from-scratch`). This is not another one. This is the layer above them:

- **A curated meta-index, not a course.** Best-of-breed *per component* — the strongest tutorial for the agent loop, a different one for RAG, another for evals — instead of one author's take on all of it. Vendor-neutral by design.
- **A living map, not a frozen curriculum.** The field moves monthly. A 500-lesson course ossifies; an index swaps one link and stays current. Quality is gatekept like a real `awesome` list.
- **Own reference implementations where the gaps are.** For the components with no good from-scratch resource, this repo ships its own minimal code — the part you can't get by linking to someone else's course.

## The stack

| # | Component | Curated | Reference impl |
|---|-----------|---------|----------------|
| 1 | [The agent loop](#1-the-agent-loop) | 🔗 | link |
| 2 | [Tool / function calling](#2-tool--function-calling) | 🔗 | link |
| 3 | [Memory](#3-memory) | 🔗 | link |
| 4 | [RAG](#4-rag) | 🔗 | link |
| 5 | [MCP server + client](#5-mcp-server--client) | 🔗 | ⭐ ours |
| 6 | [Coding agent](#6-coding-agent) | 🔗 | ⭐ ours |
| 7 | [Token accounting, streaming & cache](#7-token-accounting-streaming--cache) | 🔗 | ⭐ [code](reference/07-token-accounting/) |
| 8 | [Evals](#8-evals) | 🔗 | link |
| 9 | [Multi-agent / orchestration](#9-multi-agent--orchestration) | 🔗 | link |
| 10 | [Guardrails & human-in-the-loop](#10-guardrails--human-in-the-loop) | 🔗 | link |

⭐ = original reference implementation written for this repo.

---

## 1. The agent loop

The `while` loop at the heart of every agent: think → act → observe → repeat (ReAct). Build it once and every framework demystifies itself.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** how control flow, stop conditions, and the model↔tool handshake actually work — no orchestration library required.

## 2. Tool / function calling

How a model asks to run code and gets the result back: schema, dispatch, result formatting, error handling.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** the JSON-schema contract, safe dispatch, and why malformed tool calls happen.

## 3. Memory

Short-term (context management, compaction) and long-term (vector recall) — from scratch, no vector-DB SaaS required to understand it.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** windowing, summarization, embedding recall, and when each fails.

## 4. RAG

Retrieval-augmented generation built by hand: chunking, embedding, retrieval, reranking, and grounding.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** why chunking strategy dominates quality, and where retrieval silently drops relevance.

## 5. MCP server + client ⭐

The Model Context Protocol from first principles — a minimal server and client, no SDK magic. _Hot, under-covered, and a flagship of this repo._

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** ⭐ _ours — minimal MCP server + client (in progress)_
- **What you learn:** transport, tool/resource exposure, and the handshake agents use to discover capabilities.

## 6. Coding agent ⭐

A Claude-Code-style CLI agent from scratch: file tools, a shell tool, an edit loop, and a verification pass. _Flagship._

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** ⭐ _ours — minimal coding agent (in progress)_
- **What you learn:** how a coding agent plans edits, runs commands, and self-checks — the parts a demo hides.

## 7. Token accounting, streaming & cache ⭐

Where the money and latency actually go: token counting, streaming, prompt caching, and cost attribution. _Almost no one teaches this from scratch — the unique piece of this repo._

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** ⭐ [**`reference/07-token-accounting/`**](reference/07-token-accounting/) — dependency-free token estimation, cost, prompt-cache math, and streaming metrics (`node example.mjs`).
- **What you learn:** how to measure and control cost/latency per request instead of guessing.

## 8. Evals

Evaluating agents from scratch: task suites, graders, regression detection — without an eval platform.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** why agent evals are hard, and what a trustworthy grader looks like.

## 9. Multi-agent / orchestration

Coordinating multiple agents: hand-offs, shared state, fan-out/fan-in — built by hand.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** when multi-agent actually helps vs. adds latency and failure modes.

## 10. Guardrails & human-in-the-loop

Safety and control: input/output guardrails, approval gates, and human-in-the-loop checkpoints.

- **Best from-scratch tutorials:** _curated — landing in v1_
- **Reference implementation:** _link_
- **What you learn:** where to put a human in the loop and how to fail safe.

---

## Contributing

Curated links and reference implementations are gatekept for quality — this is a map you can trust, not a dump of every link. Contribution guidelines and an "add a resource" template are coming with v1.

## License

MIT
