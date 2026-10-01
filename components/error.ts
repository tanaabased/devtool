import debug from 'debug';

/**
 *
 */
class LandoError extends Error {
  all: string;
  args: string[];
  code: number;
  command: string;
  context: unknown;
  short: string;
  stdout: string;
  stderr: string;
  static id = 'error';
  static debug = debug('@lando/core:error');

  /*
   */
  constructor(
    message: string,
    {
      all = '',
      args = [],
      code = 1,
      command = '',
      context = {},
      stdout = '',
      stderr = '',
      short,
    }: {
      all?: string;
      args?: string[];
      code?: number;
      command?: string;
      context?: unknown;
      stdout?: string;
      stderr?: string;
      short?: string;
    } = {},
  ) {
    super(message);

    // add other metadata
    this.all = all;
    this.args = args;
    this.code = code;
    this.command = command;
    this.context = context;
    this.short = short ?? message;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export default LandoError;
