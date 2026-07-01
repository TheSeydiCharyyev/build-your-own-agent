// example.mjs — run with:  node example.mjs
//
// Runs the coding agent on a real task in a throwaway workspace, using the
// mock model so it works with no API key. Watch the loop: write → read → done.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAgent } from './agent.mjs';
import { makeTools } from './tools.mjs';
import { mockModel } from './mock-model.mjs';

const cwd = mkdtempSync(join(tmpdir(), 'byoa-agent-'));
console.log('workspace:', cwd, '\n');

const result = await runAgent({
  task: 'Create greet.txt with a greeting, then read it back to verify.',
  model: mockModel(),
  tools: makeTools(cwd),
  log: (m) => console.log('  ' + m),
});

console.log('\nfinal:', result.text);
console.log('steps:', result.steps);
