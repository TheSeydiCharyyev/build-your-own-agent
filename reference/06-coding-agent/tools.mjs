// tools.mjs
//
// The hands of a coding agent. Each tool is a plain function plus a schema the
// model uses to decide how to call it. All paths are resolved inside `cwd` so
// the agent can only touch its workspace.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function makeTools(cwd) {
  const resolve = (p) => path.resolve(cwd, p);

  return {
    write_file: {
      description: 'Write text to a file (creates or overwrites).',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
      run: ({ path: p, content }) => {
        fs.mkdirSync(path.dirname(resolve(p)), { recursive: true });
        fs.writeFileSync(resolve(p), content);
        return `wrote ${p} (${content.length} bytes)`;
      },
    },

    read_file: {
      description: 'Read a file as text.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      run: ({ path: p }) => fs.readFileSync(resolve(p), 'utf8'),
    },

    list_dir: {
      description: 'List entries in a directory.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
      run: ({ path: p = '.' }) => fs.readdirSync(resolve(p)).join('\n') || '(empty)',
    },

    run_shell: {
      // A real agent MUST gate this behind a sandbox and/or human approval —
      // see §10 (guardrails / human-in-the-loop). Here it's unguarded on
      // purpose, so the danger is visible rather than hidden.
      description: 'Run a shell command in the workspace. UNSAFE without approval.',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      run: ({ command }) => {
        try {
          return execSync(command, { cwd, encoding: 'utf8' }).trim() || '(no output)';
        } catch (e) {
          return `error: ${e.message}`;
        }
      },
    },
  };
}
