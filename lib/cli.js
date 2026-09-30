import { parseArgs } from 'node:util';

import ansis from 'ansis';

import { name, version } from './devtool.js';

const color = ansis.extend({ tp: '#00c88a' });

/** Report source-package information. Service commands are added in later extraction steps. */
export function runCli(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    stderr.write(`error: ${error.message}\nRun ${name} --help for usage.\n`);
    return 1;
  }

  if (values.help || args.length === 0) {
    stdout.write([
      `Usage: ${color.bold(name)} ${color.dim('[options]')}`,
      '',
      color.tp('Options:'),
      '  -h, --help     Show help',
      '  -v, --version  Show the package version',
      '',
      'Source extraction baseline; service commands are not available yet.',
      '',
    ].join('\n'));
    return 0;
  }

  if (values.version) {
    stdout.write(`${version}\n`);
    return 0;
  }

  stderr.write(`error: expected --help or --version\n`);
  return 1;
}
