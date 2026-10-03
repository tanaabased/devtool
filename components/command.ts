import type App from '../lib/app.ts';
import type Config from '../lib/config.ts';
import type { Debugger } from '../lib/debug.ts';
import type { ProductSettings } from '../lib/types.ts';
import type { OutputWriter } from './engine.ts';

export interface CommandOption {
  type: 'string' | 'boolean';
  description: string;
  short?: string;
}

/** Data only: implementations and presentation never belong in cacheable metadata. */
export interface CommandDefinition {
  name: string;
  help: string;
  arguments?: readonly { name: string; required?: boolean; multiple?: boolean }[];
  options?: Readonly<Record<string, CommandOption>>;
  availability: 'app' | 'global' | 'both';
  initialization: 'none' | 'config' | 'app';
  execution:
    | { kind: 'handler'; id: string }
    | {
        kind: 'container-exec';
        /** Omitted service comes from the service positional; argv prefixes untouched input after --. */
        service?: string;
        argv?: readonly string[];
      };
}

export interface CommandConfigContext {
  kind: 'app' | 'global';
  config: Config<ProductSettings>;
  writeTarget: string;
}

export interface CommandContext {
  cwd: string;
  arguments: Readonly<Record<string, string | readonly string[]>>;
  options: Readonly<Record<string, string | boolean | undefined>>;
  argv: readonly string[];
  stdout: OutputWriter;
  stderr: OutputWriter;
  debug: Debugger;
  /** Present only for config/app initialization, respectively. */
  configuration?: CommandConfigContext;
  app?: App;
}

/** Execution returns data; presentation runs afterwards. Streaming handlers may return undefined. */
export type CommandHandler = (context: CommandContext) => unknown | Promise<unknown>;
export type CommandRenderer = (result: unknown, context: CommandContext) => void;
export interface CommandRegistration {
  definition: CommandDefinition;
  /** Direct SDK implementation for a handler ID; never stored in the descriptor. */
  handler?: CommandHandler;
  render?: CommandRenderer;
}
