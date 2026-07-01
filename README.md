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

> **v1 landing.** Every section curated with fetch-verified links (except §7 token-accounting — almost nothing exists from scratch, so it's our own code). Three flagship reference implementations shipped and runnable — §5 MCP server+client, §6 coding agent, §7 token-accounting (each `node`-runnable, zero deps). Next: reference impls for the remaining sections. Watch/star to follow.

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
| 1 | [The agent loop](#1-the-agent-loop) | ✅ | link |
| 2 | [Tool / function calling](#2-tool--function-calling) | ✅ | link |
| 3 | [Memory](#3-memory) | ✅ | link |
| 4 | [RAG](#4-rag) | ✅ | link |
| 5 | [MCP server + client](#5-mcp-server--client) | ✅ | ⭐ [code](reference/05-mcp-server-client/) |
| 6 | [Coding agent](#6-coding-agent) | ✅ | ⭐ [code](reference/06-coding-agent/) |
| 7 | [Token accounting, streaming & cache](#7-token-accounting-streaming--cache) | — | ⭐ [code](reference/07-token-accounting/) |
| 8 | [Evals](#8-evals) | ✅ | link |
| 9 | [Multi-agent / orchestration](#9-multi-agent--orchestration) | ✅ | link |
| 10 | [Guardrails & human-in-the-loop](#10-guardrails--human-in-the-loop) | ✅ | link |

⭐ = original reference implementation written for this repo.

---

## 1. The agent loop

The `while` loop at the heart of every agent: think → act → observe → repeat (ReAct). Build it once and every framework demystifies itself.

- **Best from-scratch tutorials:**
  - [How to Build an Agent](https://ampcode.com/notes/how-to-build-an-agent) — Thorsten Ball · the canonical read-input → call-model → detect `tool_use` → execute → feed-back loop in ~300 lines, zero framework.
  - [The Dummy Agent Library](https://huggingface.co/learn/agents-course/unit1/dummy-agent-library) — Hugging Face · hand-codes the ReAct Thought/Action/Observation loop on a raw LLM API, including the `stop=["Observation:"]` trick.
  - [A Super Simple ReAct Agent from Scratch](https://medium.com/data-science-collective/a-super-simple-react-agent-87913949f69f) — Sami Maameri · minimal Python loop on the raw SDK driven by `stop_reason == 'tool_use'`.
- **Reference implementation:** _link_
- **What you learn:** how control flow, stop conditions, and the model↔tool handshake actually work — no orchestration library required.

## 2. Tool / function calling

How a model asks to run code and gets the result back: schema, dispatch, result formatting, error handling.

- **Best from-scratch tutorials:**
  - [How to Build an Agent (or: The Emperor Has No Clothes)](https://ampcode.com/how-to-build-an-agent) — Thorsten Ball · hand-builds the full tool-use loop: schema generation, `tool_use` detection, local registry dispatch, result feed-back.
  - [Build a tool-using agent](https://platform.claude.com/docs/en/agents-and-tools/tool-use/build-a-tool-using-agent) — Anthropic · five concentric "rings" — input_schema, stop_reason parsing, dispatch, `tool_result` threading, parallel calls, errors — SDK only at the end.
  - [Tool Calling From Scratch to Production](https://www.decodingai.com/p/tool-calling-from-scratch-to-production) — Paul Iusztin · the manual full cycle (signatures → JSON schema → registry → extract → execute → thread results) with error handling.
- **Reference implementation:** _link_
- **What you learn:** the JSON-schema contract, safe dispatch, and why malformed tool calls happen.

## 3. Memory

Short-term (context management, compaction) and long-term (vector recall) — from scratch, no vector-DB SaaS required to understand it.

- **Best from-scratch tutorials:**
  - [Build AI Agent Memory From Scratch](https://dev.to/zachary62/build-ai-agent-memory-from-scratch-tutorial-for-dummies-47ma) — Zachary Huang · both halves by hand — a short-term message window and long-term embedding recall in plain dicts, no vector DB.
  - [Advanced Agent with Summarized Short-Term + Vector Long-Term Memory](https://www.marktechpost.com/2025/09/02/how-to-build-an-advanced-ai-agent-with-summarized-short-term-and-vector-based-long-term-memory/) — Asif Razzaq · inline Python: an LLM-summarizing short-term buffer + a FAISS + sentence-transformers long-term class.
  - [Context Engineering for Agents](https://rlancemartin.github.io/2025/06/23/context_engineering/) — Lance Martin · vendor-neutral write/select/compress/isolate framing of memory as buildable techniques.
- **Reference implementation:** _link_
- **What you learn:** windowing, summarization, embedding recall, and when each fails.

## 4. RAG

Retrieval-augmented generation built by hand: chunking, embedding, retrieval, reranking, and grounding.

- **Best from-scratch tutorials:**
  - [RAG From Scratch (notebooks + videos)](https://github.com/langchain-ai/rag-from-scratch) — Lance Martin · ~18 short notebooks from raw indexing/retrieval up through RAG-Fusion, HyDE, RAPTOR, ColBERT, CRAG — each reimplemented by hand.
  - [RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — Nir Diamant · the broadest hand-coded reference: chunking, HyDE, fusion, cross-encoder reranking, graph retrieval, CRAG/Self-RAG/RAPTOR, with intuition + code.
  - [A beginner's guide to building a RAG application from scratch](https://learnbybuilding.ai/tutorial/rag-from-scratch/) — Bill Chambers · purest "no libraries" on-ramp: corpus, hand-written similarity, retrieval, prompt assembly in plain Python.
- **Reference implementation:** _link_
- **What you learn:** why chunking strategy dominates quality, and where retrieval silently drops relevance.

## 5. MCP server + client ⭐

The Model Context Protocol from first principles — a minimal server and client, no SDK magic. _Hot, under-covered, and a flagship of this repo._

- **Best from-scratch tutorials:**
  - [MCP on the Wire: JSON-RPC 2.0 in Go](https://imti.co/mcp-json-rpc/) — Craig Johnston · message-by-message series that hand-builds the JSON-RPC wire layer, then initialize + tools/list with full wire captures.
  - [Understanding MCP Through Raw STDIO Communication](https://foojay.io/today/understanding-mcp-through-raw-stdio-communication/) — David Parry · Java-stdlib-only server: newline framing, routing, and the full initialize → tools/list → tools/call flow.
  - [Building an MCP Server from Scratch: No SDK, Just a JSON-RPC Loop](https://medium.com/write-a-catalyst/building-an-mcp-server-from-scratch-no-sdk-just-a-json-rpc-loop-4894a0119da7) — DevQuill · ~90-line Python counterpart: stdio transport, dispatch loop, JSON-Schema tools list, capability negotiation.
- **Reference implementation:** ⭐ [**`reference/05-mcp-server-client/`**](reference/05-mcp-server-client/) — a working MCP server + client over stdio JSON-RPC, no SDK (`node mcp-client.mjs`).
- **What you learn:** transport, tool/resource exposure, and the handshake agents use to discover capabilities.

## 6. Coding agent ⭐

A Claude-Code-style CLI agent from scratch: file tools, a shell tool, an edit loop, and a verification pass. _Flagship._

- **Best from-scratch tutorials:**
  - [How to Build an Agent in JavaScript](https://kevinyank.com/posts/how-to-build-an-agent-in-javascript/) — Kevin Yank · agent loop + read/list/edit-file tools + human-in-the-loop consent in ~400 lines of TypeScript.
  - [How to Build an Agent (or: The Emperor Has No Clothes)](https://ampcode.com/notes/how-to-build-an-agent) — Thorsten Ball · the canonical piece — a full code-editing agent in ~400 lines against the raw API.
  - [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) — shareAI-lab · 20 sequential lessons layering tool dispatch, permissions, context management, the edit loop, and sub-agents.
- **Reference implementation:** ⭐ [**`reference/06-coding-agent/`**](reference/06-coding-agent/) — the agent loop + file/shell tools + a pluggable model, runnable with no API key (`node example.mjs`).
- **What you learn:** how a coding agent plans edits, runs commands, and self-checks — the parts a demo hides.

## 7. Token accounting, streaming & cache ⭐

Where the money and latency actually go: token counting, streaming, prompt caching, and cost attribution. _Almost no one teaches this from scratch — the unique piece of this repo._

- **Best from-scratch tutorials:** _almost nothing exists from scratch — which is exactly why the reference implementation below is the point._
- **Reference implementation:** ⭐ [**`reference/07-token-accounting/`**](reference/07-token-accounting/) — dependency-free token estimation, cost, prompt-cache math, and streaming metrics (`node example.mjs`).
- **What you learn:** how to measure and control cost/latency per request instead of guessing.

## 8. Evals

Evaluating agents from scratch: task suites, graders, regression detection — without an eval platform.

- **Best from-scratch tutorials:**
  - [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — Anthropic · the full agent-eval loop by hand: sourcing tasks from failures, task design, the three grader types, capability vs regression evals.
  - [Using LLM-as-a-Judge for Evaluation](https://hamel.dev/blog/posts/llm-judge/) — Hamel Husain · the canonical hand-built LLM-judge ("Critique Shadowing"): expert-labeled data, binary pass/fail + critiques, iteratively calibrate the judge to expert labels.
  - [Task-Specific LLM Evals that Do & Don't Work](https://eugeneyan.com/writing/evals/) — Eugene Yan · build-your-own graders per task type (classification, extraction, summarization, translation) with honest coverage of which metrics actually correlate.
- **Reference implementation:** _link_
- **What you learn:** why agent evals are hard, and what a trustworthy grader looks like.

## 9. Multi-agent / orchestration

Coordinating multiple agents: hand-offs, shared state, fan-out/fan-in — built by hand.

- **Best from-scratch tutorials:**
  - [Orchestrating Agents: Routines and Handoffs](https://developers.openai.com/cookbook/examples/orchestrating_agents) — Ilan Bigio · hand-builds the tool-calling loop, a schema helper, and agent-swapping handoffs on the raw API.
  - [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — Anthropic · orchestrator-worker mechanics from a shipped system: lead-agent planning, parallel subagents, shared state, failure modes + fixes.
  - [Multi-Agent System: Coordinator + Workers in 200 Lines](https://www.aibuilderclub.com/blog/multi-agent-system-python-tutorial) — AI Jason · ~200-line coordinator+workers on the raw SDK with parallel work and explicit retry-on-failure.
- **Reference implementation:** _link_
- **What you learn:** when multi-agent actually helps vs. adds latency and failure modes.

## 10. Guardrails & human-in-the-loop

Safety and control: input/output guardrails, approval gates, and human-in-the-loop checkpoints.

- **Best from-scratch tutorials:**
  - [How to implement LLM guardrails](https://developers.openai.com/cookbook/examples/how_to_use_guardrails) — Colin Jarvis · hand-builds an input topical guardrail (parallel relevance check) + an output moderation guardrail (scored block threshold) in plain async Python.
  - [Guardrails vs. evaluators — what's the difference?](https://hamel.dev/blog/posts/evals-faq/whats-the-difference-between-guardrails-evaluators.html) — Hamel Husain · vendor-neutral definition of a guardrail as a fast inline check (regex, block-lists, schema validators, light classifiers).
  - [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic · the control half: LLM-screening guardrail pattern, human-in-the-loop checkpoints, stopping conditions, sandboxing.
- **Reference implementation:** _link_
- **What you learn:** where to put a human in the loop and how to fail safe.

---

## Contributing

Curated links and reference implementations are gatekept for quality — this is a map you can trust, not a dump of every link, so **most submissions are refined or declined**, not merged as-is.

- **Suggest a resource** — open an [Add a resource](../../issues/new?template=add-a-resource.yml) issue.
- **Read the bar first** — [CONTRIBUTING.md](CONTRIBUTING.md) covers inclusion criteria, the entry format, and how reference implementations work.

## License

MIT
