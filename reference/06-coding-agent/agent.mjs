// agent.mjs
//
// The core loop of a Claude-Code / Cursor-style coding agent, from scratch.
//
// The whole thing is a loop: ask the model what to do → it returns tool calls
// → run them → feed the results back → repeat until the model says it's done.
// Everything else (file tools, shell, a real LLM) plugs into this shape.

export async function runAgent({ task, model, tools, maxSteps = 10, log = () => {} }) {
  // The running transcript the model sees. Real providers format this as
  // messages with tool_use / tool_result blocks; the shape is the same idea.
  const messages = [{ role: 'user', content: task }];

  for (let step = 1; step <= maxSteps; step++) {
    // Ask the model for the next move. It returns either tool calls to run,
    // or { done: true } with a final answer.
    const out = await model({ messages, tools });

    if (out.done) {
      log(`step ${step}: done`);
      return { text: out.text, steps: step, messages };
    }

    for (const call of out.toolCalls) {
      const tool = tools[call.name];
      const result = tool
        ? String(tool.run(call.args || {}))
        : `error: unknown tool "${call.name}"`;

      log(`step ${step}: ${call.name}(${compact(call.args)}) -> ${truncate(result)}`);

      // Record the call and its result so the model can react on the next turn.
      messages.push({ role: 'assistant', toolCall: call });
      messages.push({ role: 'tool', name: call.name, content: result });
    }
  }

  return { text: '(max steps reached without finishing)', steps: maxSteps, messages };
}

function truncate(s, n = 70) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function compact(args) {
  const s = JSON.stringify(args ?? {});
  return s.length > 50 ? s.slice(0, 50) + '…}' : s;
}
