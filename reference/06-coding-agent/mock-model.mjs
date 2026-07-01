// mock-model.mjs
//
// A scripted stand-in for a real LLM so the demo runs with NO API key. It
// reads the message history and decides the next tool call — exactly the way a
// real model reacts to tool results — but deterministically.
//
// To use a real model, replace this with a function that:
//   1. formats `messages` + `tools` for your provider,
//   2. calls the provider,
//   3. returns { toolCalls: [{ name, args }] }  OR  { done: true, text }.
// The agent loop in agent.mjs does not change at all.

export function mockModel({ target = 'greet.txt', content = 'hello from byoa' } = {}) {
  return async function model({ messages }) {
    const wrote = messages.some(
      (m) => m.role === 'assistant' && m.toolCall?.name === 'write_file' && m.toolCall?.args?.path === target,
    );
    const readMsg = messages.find((m) => m.role === 'tool' && m.name === 'read_file');

    // 1. Not created yet → write it.
    if (!wrote) {
      return { toolCalls: [{ name: 'write_file', args: { path: target, content } }] };
    }
    // 2. Written but not verified → read it back.
    if (!readMsg) {
      return { toolCalls: [{ name: 'read_file', args: { path: target } }] };
    }
    // 3. Verified → finish.
    const ok = readMsg.content === content;
    return {
      done: true,
      text: ok
        ? `Created ${target} and verified its contents: "${readMsg.content}"`
        : `Created ${target} but contents did not match (got "${readMsg.content}")`,
    };
  };
}
