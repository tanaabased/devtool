import Config from './config.ts';
import createProductConfig from './product-config.ts';
import resolveProductConfig from '../utils/resolve-product-config.ts';
import discoverApp, { AppNotFoundError, type AppDiscoveryPolicy } from '../utils/discover-app.ts';
import App from './app.ts';
import type { Engine, OutputWriter } from '../components/engine.ts';
import type { AppConfig, ProductOptions, ProductSettings } from './types.ts';
import asError from '../utils/as-error.ts';
import { parseArgs, format } from 'node:util';
import type { CommandRegistration, CommandOption, CommandContext } from '../components/command.ts';
import { registerCommands, commandArguments, executeCommand } from './commands.ts';
import createDebug from './debug.ts';
import ansis from 'ansis';
import { version } from '../package.json';
import jsYaml from 'js-yaml';
import path from 'node:path';

const color = ansis.extend({ tp: '#00c88a' });
const commands = ['start', 'stop', 'restart', 'rebuild', 'info', 'destroy'];

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
    commands: additions = [],
    debugNamespaces = process.env.DEBUG ?? '',
  }: AppDiscoveryPolicy & {
    stdout?: OutputWriter;
    stderr?: OutputWriter;
    config?: Config<ProductSettings>;
    engine?: Engine;
    cwd?: string;
    commands?: readonly CommandRegistration[];
    /** Captured DEBUG filter, injectable without changing the process environment. */
    debugNamespaces?: string;
  } = {},
) => {
  let name = 'devtool';
  try {
    const separator = args.indexOf('--');
    const commandArgs = separator < 0 ? [] : args.slice(separator + 1);
    const registry = registerCommands(additions);
    for (const name of registry.keys())
      if (commands.includes(name)) throw new Error(`Duplicate command: ${name}`);
    const common: Record<string, CommandOption> = {
      help: { type: 'boolean', short: 'h', description: 'Show help' },
      version: { type: 'boolean', short: 'v', description: 'Show the package version' },
      config: { type: 'string', description: 'Read product configuration' },
      'data-root': { type: 'string', description: 'Set generated project storage' },
      'cache-root': { type: 'string', description: 'Set persistent cache storage' },
      'no-cache': { type: 'boolean', description: 'Disable persistent caching' },
      json: { type: 'boolean', description: 'Print typed JSON' },
      debug: { type: 'boolean', description: 'Print debug diagnostics to stderr' },
    };
    const optionDefinitions = {
      ...common,
      metadata: { type: 'boolean', description: 'Print declarative info' },
    } as Record<string, CommandOption>;
    for (const { definition } of registry.values()) {
      for (const [key, option] of Object.entries(definition.options ?? {})) {
        if (Object.hasOwn(common, key) || key === 'metadata')
          throw new Error(`Reserved option: ${key}`);
        const existing = optionDefinitions[key];
        if (existing && (existing.type !== option.type || existing.short !== option.short))
          throw new Error(`Conflicting option: ${key}`);
        if (!/^[a-z][a-z0-9-]*$/.test(key) || !['string', 'boolean'].includes(option.type))
          throw new Error('Invalid command option');
        optionDefinitions[key] = option;
      }
    }
    const shorts = new Set<string>();
    for (const option of Object.values(optionDefinitions))
      if (option.short) {
        if (option.short.length !== 1 || shorts.has(option.short))
          throw new Error(`Conflicting short option: ${option.short}`);
        shorts.add(option.short);
      }
    const { values, positionals, tokens } = parseArgs({
      args: separator < 0 ? args : args.slice(0, separator),
      allowPositionals: true,
      tokens: true,
      options: Object.fromEntries(
        Object.entries(optionDefinitions).map(([key, { type, short }]) => [
          key,
          { type, ...(short ? { short } : {}) },
        ]),
      ),
    });
    const debug = createDebug('devtool:cli', {
      namespaces: debugNamespaces || (values.debug ? 'devtool:*' : ''),
      log: (...args) => stderr.write(`${format(...args)}\n`),
    });
    debug('invocation started');
    const overrides: ProductOptions = {};
    if (typeof values['data-root'] === 'string')
      overrides.dataRoot = path.resolve(cwd, values['data-root']);
    if (typeof values['cache-root'] === 'string')
      overrides.cacheRoot = path.resolve(cwd, values['cache-root']);
    if (values['no-cache']) overrides.cache = false;
    const config = (suppliedConfig ?? createProductConfig({}, { root: cwd })).fork({
      debug: debug.contract().extend('config'),
    });
    if (typeof values.config === 'string') {
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
          `Commands: ${[...commands, ...registry.keys()].join(', ')}`,
          ...[...registry.values()].map(
            ({ definition }) =>
              `  ${definition.name} ${(definition.arguments ?? []).map((arg) => (arg.required ? `<${arg.name}${arg.multiple ? '...' : ''}>` : `[${arg.name}]`)).join(' ')}  ${definition.help}`,
          ),
          '',
          color.tp('Options:'),
          '  -h, --help           Show help',
          '  -v, --version        Show the package version',
          '      --config <path>  Read product configuration',
          '      --data-root <path>   Set generated project storage',
          '      --cache-root <path>  Set persistent cache storage',
          '      --no-cache       Disable persistent cache reads and writes',
          '      --json           Print typed JSON',
          '      --debug          Print debug diagnostics to stderr',
          ...Object.entries(optionDefinitions)
            .filter(([key]) => !Object.hasOwn(common, key) && key !== 'metadata')
            .map(
              ([key, option]) =>
                `      --${key}${option.type === 'string' ? ' <value>' : ''}  ${option.description}`,
            ),
          '      --metadata       Print declarative info without preparing services',
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
    const selected = [...registry.values()]
      .sort((a, b) => b.definition.name.length - a.definition.name.length)
      .find(({ definition }) =>
        definition.name.split(' ').every((word, i) => positionals[i] === word),
      );
    const command = selected?.definition.name ?? positionals[0];
    if (!command || (!selected && !commands.includes(command)))
      throw new Error(`Unknown command: ${command ?? '(missing)'}`);
    const allowed = {
      ...common,
      ...(selected?.definition.options ??
        (command === 'info' ? { metadata: optionDefinitions.metadata! } : {})),
    };
    for (const token of tokens)
      if (token.kind === 'option' && !Object.hasOwn(allowed, token.name))
        throw new Error(`--${token.name} is not available for ${command}`);
    if (!selected && (positionals.length > 1 || commandArgs.length))
      throw new Error(`Unexpected arguments for ${command}`);
    if (selected?.definition.execution.kind === 'handler' && commandArgs.length)
      throw new Error(`Unexpected arguments after -- for ${command}`);
    const inputs = selected
      ? commandArguments(selected.definition, positionals.slice(command.split(' ').length))
      : {};
    const needsContext =
      !selected ||
      selected.definition.initialization !== 'none' ||
      selected.definition.availability !== 'both';
    let found: ReturnType<typeof discoverApp> | undefined;
    if (needsContext && !values.global) {
      debug('discover app from %s', cwd);
      try {
        found = discoverApp({ cwd, appFile, appFiles });
      } catch (error) {
        if (!(error instanceof AppNotFoundError)) throw error;
      }
    }
    const kind = found ? 'app' : 'global';
    debug('selected %s context', kind);
    if (
      (!selected ||
        selected.definition.availability === 'app' ||
        selected.definition.initialization === 'app') &&
      !found
    )
      throw new Error(`No app file found from ${cwd}`);
    if (
      selected &&
      selected.definition.availability !== 'both' &&
      selected.definition.availability !== kind
    )
      throw new Error(`${command} is not available in ${kind} context`);
    const app =
      found && (!selected || selected.definition.initialization !== 'none')
        ? new App({
            root: found.root,
            file: found.file,
            definition: new Config<AppConfig>({
              root: found.root,
              sources: found.sources,
              debug: debug.contract().extend('definition'),
            }),
            config,
            engine,
            debug: debug.contract().extend('app'),
          })
        : undefined;
    if (selected) {
      const context: CommandContext = {
        cwd,
        arguments: inputs,
        options: values,
        argv: commandArgs,
        stdout,
        stderr,
        debug,
        ...(selected.definition.initialization === 'config'
          ? {
              configuration: {
                kind,
                config: app?.settings ?? config,
                writeTarget: found ? `app:${found.writeTarget}` : 'managed',
              },
            }
          : {}),
        ...(selected.definition.initialization === 'app' ? { app } : {}),
      };
      return await executeCommand(selected, context);
    }
    if (!app || !found) throw new Error('App initialization required');
    if (command === 'info') {
      const info = values.metadata
        ? { ...app.getMetadata(), system: { cli: found.policy } }
        : app.getInfo();
      stdout.write(values.json ? `${JSON.stringify(info)}\n` : jsYaml.dump(info));
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
