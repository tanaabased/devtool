import Config from './config.ts';
import createProductConfig from './product-config.ts';
import resolveProductConfig from '../utils/resolve-product-config.ts';
import discoverApp, { type AppDiscoveryPolicy } from '../utils/discover-app.ts';
import App from './app.ts';
import type { Engine, OutputWriter } from '../components/engine.ts';
import type { AppConfig, ProductOptions, ProductSettings } from './types.ts';
import asError from '../utils/as-error.ts';
import { parseArgs } from 'node:util';
import ansis from 'ansis';
import { version } from '../package.json';
import jsYaml from 'js-yaml';
import path from 'node:path';

const color = ansis.extend({ tp: '#00c88a' });
const commands = ['start', 'stop', 'restart', 'rebuild', 'info', 'exec', 'destroy'];

/** CLI adapter; library consumers never parse argv or change process exit state. */
export const runCli = async (
  args: string[],
  {
    stdout = process.stdout,
    stderr = process.stderr,
    config: suppliedConfig,
    engine,
    cwd = process.cwd(),
    appFile,
    appFiles,
  }: AppDiscoveryPolicy & {
    stdout?: OutputWriter;
    stderr?: OutputWriter;
    config?: Config<ProductSettings>;
    engine?: Engine;
    cwd?: string;
  } = {},
) => {
  let name = 'devtool';
  try {
    const separator = args.indexOf('--');
    const commandArgs = separator < 0 ? [] : args.slice(separator + 1);
    const { values, positionals } = parseArgs({
      args: separator < 0 ? args : args.slice(0, separator),
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        config: { type: 'string' },
        'data-root': { type: 'string' },
        'cache-root': { type: 'string' },
        'no-cache': { type: 'boolean' },
        json: { type: 'boolean' },
        metadata: { type: 'boolean' },
        interactive: { type: 'boolean', short: 'i' },
      },
    });
    const overrides: ProductOptions = {};
    if (values['data-root']) overrides.dataRoot = path.resolve(cwd, values['data-root']);
    if (values['cache-root']) overrides.cacheRoot = path.resolve(cwd, values['cache-root']);
    if (values['no-cache']) overrides.cache = false;
    const config = suppliedConfig?.fork() ?? createProductConfig({}, { root: cwd });
    if (values.config) {
      const source = {
        id: 'explicit',
        kind: 'file' as const,
        role: 'caller' as const,
        file: path.resolve(cwd, values.config),
        imports: false,
      };
      if (config.sources.some(({ id }) => id === source.id))
        config.replaceSource(source.id, source);
      else
        config.addSource(source, {
          before: config.sources.find(({ role }) => role === 'caller')?.id,
        });
    }
    config.addSource({ id: 'cli', kind: 'object', role: 'caller', data: overrides });
    const settings = resolveProductConfig(config);
    name = settings.commandName;
    if (values.help || !args.length) {
      stdout.write(
        [
          `Usage: ${color.bold(name)} ${color.dim('[options]')} <command>`,
          `       ${name} exec <service> -- <command> ${color.dim('[arguments...]')}`,
          '',
          `Commands: ${commands.join(', ')}`,
          '',
          color.tp('Options:'),
          '  -h, --help           Show help',
          '  -v, --version        Show the package version',
          '      --config <path>  Read product configuration',
          '      --data-root <path>   Set generated project storage',
          '      --cache-root <path>  Set persistent cache storage',
          '      --no-cache       Disable persistent cache reads and writes',
          '      --json           Print info as JSON',
          '      --metadata       Print declarative info without preparing services',
          '  -i, --interactive    Attach exec to the terminal',
          '',
          color.tp('Environment Variables:'),
          `  ${settings.envPrefix}_COMMAND_NAME Name shown in help and diagnostics`,
          `  ${settings.envPrefix}_DATA_ROOT    same as --data-root`,
          `  ${settings.envPrefix}_CACHE_ROOT   same as --cache-root`,
          `  ${settings.envPrefix}_CACHE        false disables persistent caching`,
          '',
        ].join('\n'),
      );
      return 0;
    }
    if (values.version) {
      stdout.write(`${version}\n`);
      return 0;
    }
    const [command, service, ...extra] = positionals;
    if (!command || !commands.includes(command))
      throw new Error(`Unknown command: ${command ?? '(missing)'}`);
    if (values.metadata && command !== 'info') throw new Error('--metadata requires info');
    if ((command !== 'exec' && (service || commandArgs.length)) || extra.length)
      throw new Error(`Unexpected arguments for ${command}`);
    if (command === 'exec' && (!service || !commandArgs.length))
      throw new Error('Usage: exec <service> -- <command> [arguments...]');
    const found = discoverApp({ cwd, appFile, appFiles });
    const app = new App({
      root: found.root,
      file: found.file,
      definition: new Config<AppConfig>({ root: found.root, sources: found.sources }),
      config,
      engine,
    });
    if (command === 'info') {
      const info = values.metadata
        ? { ...app.getMetadata(), system: { cli: found.policy } }
        : app.getInfo();
      stdout.write(values.json ? `${JSON.stringify(info)}\n` : jsYaml.dump(info));
    } else if (command === 'exec') {
      if (!service) throw new Error('Missing service');
      await app.exec(service, commandArgs, {
        cwd,
        interactive: Boolean(values.interactive),
        capture: 'tail',
        stdout,
        stderr,
      });
    } else {
      await app[command as 'start' | 'stop' | 'restart' | 'rebuild' | 'destroy']();
      stdout.write(`${command} complete: ${app.project}\n`);
    }
    return 0;
  } catch (caught) {
    const error = asError(caught);
    stderr.write(`error: ${error.message}\nRun ${name} --help for usage.\n`);
    return typeof error.code === 'number' &&
      Number.isInteger(error.code) &&
      error.code > 0 &&
      error.code < 256
      ? error.code
      : 1;
  }
};
