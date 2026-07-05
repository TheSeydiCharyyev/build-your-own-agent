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
  model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  maxTokens = 8192,
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

    if (msg.stop_reason === 'tool_use') {
      return {
        toolCalls: msg.content
          .filter((b) => b.type === 'tool_use')
          // Keep `id`: the API requires each tool_result to name the tool_use
          // it answers. agent.mjs stores the call object as-is, so the id
          // survives the round trip through the transcript.
          .map((b) => ({ id: b.id, name: b.name, args: b.input })),
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

// Translate our flat transcript into API messages. The loop in agent.mjs
// records each call as `assistant {toolCall}` immediately followed by
// `tool {content}`, so pairing is positional; the API wants them as
// tool_use / tool_result content blocks tied together by id.
function toApiMessages(messages) {
  const out = [];
  let lastToolUseId;
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && m.toolCall) {
      lastToolUseId = m.toolCall.id;
      out.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: m.toolCall.id,
            name: m.toolCall.name,
            input: m.toolCall.args || {},
          },
        ],
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: lastToolUseId,
            content: m.content,
            // Same idea as MCP's isError: a failure is data for the model.
            is_error: m.content.startsWith('error:') || undefined,
          },
        ],
      });
    }
  }
  return out;
}
