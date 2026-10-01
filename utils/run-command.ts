import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import type { Debugger } from 'debug';
import type { ExecutionError } from './as-error.ts';
import merge from 'lodash-es/merge.js';
import color from 'ansis';
import { spawn } from 'node:child_process';
import debug from 'debug';
import mergePromise from './merge-promise.ts';

// Modules

// get the bosmang
const defaults = {
  debug: debug('@lando/run-command'),
  ignoreReturnCode: false,
  env: process.env,
};

export default (
  command: string,
  args: string[] = [],
  options: SpawnOptionsWithoutStdio & { debug?: Debugger; ignoreReturnCode?: boolean } = {},
  stdout = '',
  stderr = '',
) => {
  // @TODO: error handling?
  // merge our options over the defaults
  options = merge({}, defaults, options);
  const debug = options.debug ?? defaults.debug;

  // birth
  const child = spawn(command, args, options);
  debug('running command pid=%o %o %o', child.pid, command, args);

  return mergePromise(child, async () => {
    return new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve, reject) => {
        child.on('error', (error) => {
          debug('command pid=$o %o error %o', child.pid, command, error?.message);
          stderr += error?.message ?? error;
        });

        child.stdout?.on('data', (data) => {
          debug('stdout %s', color.dim(data.toString().trim()));
          stdout += data;
        });

        child.stderr?.on('data', (data) => {
          debug('stderr %s', color.dim(data.toString().trim()));
          stderr += data;
        });

        child.on('close', (code) => {
          debug('command pid=%o %o done with code %o', child.pid, command, code);
          // if code is non-zero and we arent ignoring then reject here
          if (code !== 0 && !options.ignoreReturnCode) {
            const error: ExecutionError = new Error(stderr);
            error.code = code ?? 1;
            reject(error);
          }

          // otherwise return
          resolve({ stdout, stderr, code });
        });
      },
    );
  });
};
