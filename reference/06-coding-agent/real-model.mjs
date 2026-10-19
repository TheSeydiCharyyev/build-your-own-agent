// real-model.mjs
//
// The same model contract as mock-model.mjs, but backed by a real LLM over
// raw HTTP — no SDK on purpose, so the exact wire format of a tool-use turn
// stays visible. Needs ANTHROPIC_API_KEY. Run: node example.mjs --real
//
// The whole adapter is two translations:
//   our transcript  → API `messages` (tool calls/results as content blocks)
//   API response    → { toolCalls } or { done, text } for agent.mjs

const API_URL = 'https://api.anthropic.com/v1/messages';

export function realModel({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  // Thinking counts toward max_tokens, so leave room for it as well as the reply.
  maxTokens = 16000,
} = {}) {
  if (!apiKey) throw new Error('realModel needs ANTHROPIC_API_KEY (or pass apiKey)');

  return async function ({ messages, tools }) {
    const body = {
      model,
      max_tokens: maxTokens,
      // Our tool registry → API tool definitions (`input_schema` on the wire).
      tools: Object.entries(tools).map(([name, t]) => ({
        name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      messages: toApiMessages(messages),
    };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const msg = await res.json();

    // Check why the model stopped before reading `content`: a refusal or a
    // max_tokens cut can leave a half-written tool call, so never run it.
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') {
      throw new Error(`model stopped early: ${msg.stop_reason}`);
    }

    if (msg.stop_reason === 'tool_use') {
      return {
        toolCalls: msg.content
          .filter((b) => b.type === 'tool_use')
          // Keep `id`: the API requires each tool_result to name the tool_use
          // it answers. Keep `turn`: the assistant's content blocks exactly as
          // the API returned them (thinking, text, tool_use), so they can be
          // sent back unchanged. agent.mjs stores the call object as-is, so
          // both survive the round trip through the transcript.
          .map((b) => ({ id: b.id, name: b.name, args: b.input, turn: msg.content })),
      };
    }
    return {
      done: true,
      text: msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n'),
    };
  };
}

// Translate our flat transcript into API messages. agent.mjs records one
// `assistant {toolCall}` + `tool {content}` pair per call, even when the model
// asked for several calls in one turn. The API wants each turn whole:
//   - the assistant turn echoed back unchanged. Thinking blocks are checked:
//     dropping, editing, or reordering them is a 400 on current models.
//   - every tool_result for that turn in ONE user message. Splitting them
//     across messages teaches the model to stop making parallel calls.
function toApiMessages(messages) {
  const out = [];
  let turn; // content of the assistant turn being answered
  let results = []; // its tool_result blocks, collected until the turn ends
  let callId;

  const flush = () => {
    if (results.length) out.push({ role: 'user', content: results });
    results = [];
  };

  for (const m of messages) {
    if (m.role === 'user') {
      flush();
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && m.toolCall) {
      callId = m.toolCall.id;
      // A call from another model has no `turn`: rebuild its tool_use block.
      const content = m.toolCall.turn ?? [
        { type: 'tool_use', id: callId, name: m.toolCall.name, input: m.toolCall.args || {} },
      ];
      if (content !== turn) {
        // First call of a new turn; later calls share the same `turn` array.
        flush();
        out.push({ role: 'assistant', content });
        turn = content;
      }
    } else if (m.role === 'tool') {
      results.push({
        type: 'tool_result',
        tool_use_id: callId, // agent.mjs records each result right after its call
        content: m.content,
        // Same idea as MCP's isError: a failure is data for the model.
        is_error: m.content.startsWith('error:') || undefined,
      });
    }
  }
  flush();
  return out;
}
