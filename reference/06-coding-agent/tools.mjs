// tools.mjs
//
// The hands of a coding agent. Each tool is a plain function plus a schema the
// model uses to decide how to call it. File paths are resolved and then
// VERIFIED to stay inside `cwd` — resolving alone is not containment
// (`../x` and absolute paths both escape it); see `resolve` below.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function makeTools(cwd) {
  // path.resolve(cwd, p) is NOT a sandbox: it happily returns paths outside
  // cwd for `../x` or absolute inputs. Containment = resolve, then check the
  // result is still under cwd before touching the filesystem. (A hardened
  // agent also needs a realpath check against symlink escapes — see §10.)
  const resolve = (p) => {
    const full = path.resolve(cwd, p);
    const rel = path.relative(cwd, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`path escapes the workspace: ${p}`);
    }
    return full;
  };

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
