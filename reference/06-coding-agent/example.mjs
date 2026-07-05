// example.mjs — run with:  node example.mjs
//
// Runs the coding agent on a real task in a throwaway workspace, using the
// mock model so it works with no API key. Watch the loop: write → read → done.
//
// Pass --real to run the SAME loop against a live model via real-model.mjs
// (needs ANTHROPIC_API_KEY). agent.mjs does not change — that's the point.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAgent } from './agent.mjs';
import { makeTools } from './tools.mjs';
import { mockModel } from './mock-model.mjs';

const cwd = mkdtempSync(join(tmpdir(), 'byoa-agent-'));
console.log('workspace:', cwd, '\n');

const useReal = process.argv.includes('--real');
const model = useReal ? (await import('./real-model.mjs')).realModel() : mockModel();

const result = await runAgent({
  task: 'Create greet.txt with a greeting, then read it back to verify.',
  model,
  tools: makeTools(cwd),
  log: (m) => console.log('  ' + m),
});

console.log('\nfinal:', result.text);
console.log('steps:', result.steps);
