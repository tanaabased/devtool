import type { ExecOptions, ExecResult } from '../../../components/engine.ts';
import type { ExecutionError } from '../../../utils/as-error.ts';
import { spawn } from 'node:child_process';

/** Execute an argv array without a shell, preserving nonzero status and diagnostic output. */
export default (
  command: string,
  args: string[],
  { cwd, interactive = false, capture = 'all', stdout, stderr, env }: ExecOptions = {},
): Promise<ExecResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let diagnostic = '';
    child.stdout?.on('data', (data) => {
      output += data;
      if (capture === 'tail') output = output.slice(-8192);
      stdout?.write(data);
    });
    child.stderr?.on('data', (data) => {
      diagnostic += data;
      if (capture === 'tail') diagnostic = diagnostic.slice(-8192);
      stderr?.write(data);
    });
    child.on('error', (error) =>
      reject(new Error(`Unable to run ${command}: ${error.message}`, { cause: error })),
    );
    child.on('close', (code, signal) => {
      if (code === 0) return resolve({ code, stdout: output, stderr: diagnostic });
      const error: ExecutionError = new Error(
        `${command} ${args[0] ?? ''} failed (${signal ?? code}): ${diagnostic.trim() || output.trim()}`,
      );
      error.code = code || 1;
      error.stdout = output;
      error.stderr = diagnostic;
      reject(error);
    });
  });
