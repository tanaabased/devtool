import assert from 'node:assert/strict';
import {
  createProductConfig,
  runCli,
  version,
  type CommandDefinition,
  type CommandRegistration,
} from '@tanaab/devtool';

const config = createProductConfig({
  configFiles: { system: false, managed: false, user: false },
  env: {},
});
const definition: CommandDefinition = {
  name: 'sample',
  help: 'Read a typed sample',
  availability: 'both',
  initialization: 'none',
  arguments: [{ name: 'value', required: true }],
  options: { label: { type: 'string', description: 'Label the result' } },
  execution: { kind: 'handler', id: 'sample' },
};
let calls = 0;
const registration: CommandRegistration = {
  definition,
  async handler(context) {
    calls++;
    assert.equal(context.configuration, undefined);
    assert.equal(context.app, undefined);
    context.debug('handler started');
    await Promise.resolve();
    context.debug.extend('child')('handler finished');
    return {
      value: context.arguments.value,
      label: context.options.label,
      zero: 0,
      empty: '',
      nullable: null,
    };
  },
  render(result, context) {
    context.stdout.write(
      context.options.json ? `${JSON.stringify(result)}\n` : 'sample complete\n',
    );
  },
};
const invoke = async (args: string[], debugNamespaces = '', suppliedConfig = config) => {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    config: suppliedConfig,
    commands: [registration],
    cwd: import.meta.dirname,
    debugNamespaces,
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  });
  return { code, stdout, stderr };
};
const env = { ...process.env };
const help = await invoke(['sample', '--help']);
assert.equal(help.code, 0, help.stderr);
assert.match(help.stdout, /sample/);
assert.equal(calls, 0);
const [loud, quiet, filtered] = await Promise.all([
  invoke(['sample', 'SECRET_ARG', '--label', 'SECRET_OPTION', '--json', '--debug']),
  invoke(['sample', 'quiet', '--json']),
  invoke(['sample', 'filtered', '--json'], 'devtool:cli*,-devtool:cli:child'),
]);
for (const result of [loud, quiet, filtered]) {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).zero, 0);
}
assert.match(loud.stderr, /handler started/);
assert.match(loud.stderr, /handler finished/);
assert.doesNotMatch(loud.stderr, /SECRET_ARG|SECRET_OPTION/);
assert.equal(quiet.stderr, '');
assert.match(filtered.stderr, /handler started/);
assert.doesNotMatch(filtered.stderr, /handler finished|devtool:config/);
assert.deepEqual(process.env, env);
assert.equal(
  config.revision,
  createProductConfig({ configFiles: { system: false, managed: false, user: false }, env: {} })
    .revision,
);
assert.equal((await invoke(['sample'])).code, 1);
assert.equal((await invoke(['sample', 'x', '--force'])).code, 1);
assert.equal((await invoke(['sample', 'x', '--', 'untouched'])).code, 1);
assert.deepEqual(JSON.parse(JSON.stringify(definition)), definition);
let reads = 0;
const invalid = config.fork();
invalid.addSource({
  id: 'invalid',
  kind: 'environment',
  prefix: 'SAMPLE',
  values: { SAMPLE_CACHE: 'invalid' },
  fields: {
    CACHE: {
      path: 'cache',
      parse(value) {
        reads++;
        return value;
      },
    },
  },
});
const inert = await invoke(['sample', 'inert', '--json'], '', invalid);
assert.equal(inert.code, 0, inert.stderr);
assert.equal(JSON.parse(inert.stdout).value, 'inert');
for (const flag of ['--version', '-v'])
  assert.deepEqual(await invoke([flag], '', invalid), {
    code: 0,
    stdout: `${version}\n`,
    stderr: '',
  });
assert.equal(reads, 0, 'No-initialization commands and version must not load configuration');
for (const args of [[], ['--help'], ['-h']]) {
  const result = await invoke(args, '', invalid);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Usage: devtool/);
  assert.equal(result.stderr, '');
}
const required = await invoke(['config', 'get', '--global'], '', invalid);
assert.equal(required.code, 1);
assert.equal(required.stdout, '');
assert.match(required.stderr, /cache: expected boolean/);
assert.equal(reads, 4);
process.stdout.write(
  'command metadata, direct handlers, typed output and concurrent debug isolation verified\n',
);
