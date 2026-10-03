import assert from 'node:assert/strict';
import {
  createProductConfig,
  runCli,
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
const invoke = async (args: string[], debugNamespaces = '') => {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    config,
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
process.stdout.write(
  'command metadata, direct handlers, typed output and concurrent debug isolation verified\n',
);
