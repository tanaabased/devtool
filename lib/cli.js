'use strict';

const {parseArgs} = require('node:util');

const ansis = require('ansis');

const {createDevtool, version} = require('./devtool');

const color = ansis.extend({tp: '#00c88a'});
const commands = ['start', 'stop', 'restart', 'rebuild', 'info', 'exec', 'destroy'];

/** CLI adapter; library consumers never parse argv or change process exit state. */
exports.runCli = async (args, {stdout = process.stdout, stderr = process.stderr, runtime, cwd = process.cwd()} = {}) => {
  let name = runtime?.commandName ?? 'devtool';
  try {
    const separator = args.indexOf('--');
    const commandArgs = separator < 0 ? [] : args.slice(separator + 1);
    const {values, positionals} = parseArgs({
      args: separator < 0 ? args : args.slice(0, separator), allowPositionals: true,
      options: {
        help: {type: 'boolean', short: 'h'}, version: {type: 'boolean', short: 'v'},
        file: {type: 'string', short: 'f'}, config: {type: 'string'},
        'data-root': {type: 'string'}, 'cache-root': {type: 'string'},
        'no-cache': {type: 'boolean'}, json: {type: 'boolean'}, interactive: {type: 'boolean', short: 'i'},
      },
    });
    const overrides = {};
    if (values['data-root']) overrides.dataRoot = values['data-root'];
    if (values['cache-root']) overrides.cacheRoot = values['cache-root'];
    if (values['no-cache']) overrides.cache = false;
    if (runtime && (Object.keys(overrides).length || values.config)) {
      runtime = createDevtool({
        ...runtime.overrides, ...overrides, engine: runtime.engine, env: runtime.env,
        configFile: values.config ?? runtime.configFile,
      });
    }
    runtime ??= createDevtool({...overrides, configFile: values.config});
    name = runtime.resolveConfig().commandName;
    if (values.help || !args.length) {
      stdout.write([
        `Usage: ${color.bold(name)} ${color.dim('[options]')} <command>`,
        `       ${name} exec <service> -- <command> ${color.dim('[arguments...]')}`,
        '', `Commands: ${commands.join(', ')}`, '', color.tp('Options:'),
        '  -h, --help           Show help', '  -v, --version        Show the package version',
        '  -f, --file <path>    Select an app file', '      --config <path>  Read product configuration',
        '      --data-root <path>   Set generated project storage',
        '      --cache-root <path>  Set persistent cache storage',
        '      --no-cache       Disable persistent cache reads and writes',
        '      --json           Print info as JSON', '  -i, --interactive    Attach exec to the terminal',
        '', color.tp('Environment Variables:'),
        `  ${runtime?.envPrefix ?? 'DEVTOOL'}_DATA_ROOT    same as --data-root`,
        `  ${runtime?.envPrefix ?? 'DEVTOOL'}_CACHE_ROOT   same as --cache-root`,
        `  ${runtime?.envPrefix ?? 'DEVTOOL'}_CACHE        false disables persistent caching`,
        `  ${runtime?.envPrefix ?? 'DEVTOOL'}_APP_FILES    Comma-separated app filenames`, '',
      ].join('\n'));
      return 0;
    }
    if (values.version) { stdout.write(`${version}\n`); return 0; }
    const [command, service, ...extra] = positionals;
    if (!commands.includes(command)) throw new Error(`Unknown command: ${command ?? '(missing)'}`);
    if ((command !== 'exec' && (service || commandArgs.length)) || extra.length) throw new Error(`Unexpected arguments for ${command}`);
    if (command === 'exec' && (!service || !commandArgs.length)) throw new Error('Usage: exec <service> -- <command> [arguments...]');
    const app = runtime.loadApp({cwd, file: values.file});
    if (command === 'info') {
      const info = app.getInfo();
      stdout.write(values.json ? `${JSON.stringify(info)}\n` : require('js-yaml').dump(info));
    } else if (command === 'exec') {
      await app.exec(service, commandArgs, {interactive: Boolean(values.interactive), stdout, stderr});
    } else {
      await app[command]();
      stdout.write(`${command} complete: ${app.project}\n`);
    }
    return 0;
  } catch (error) {
    stderr.write(`error: ${error.message}\nRun ${name} --help for usage.\n`);
    return Number.isInteger(error.code) && error.code > 0 && error.code < 256 ? error.code : 1;
  }
};
