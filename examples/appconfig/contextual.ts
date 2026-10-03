import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  App,
  Config,
  configSchemas,
  createProductConfig,
  discoverApp,
  runCli,
  type AppConfig,
} from '@tanaab/devtool';

const root = path.join(import.meta.dirname, '.results');
fs.mkdirSync(root, { recursive: true });
for (const directory of ['data', 'cache'])
  fs.rmSync(path.join(root, directory), { recursive: true, force: true });
const primary = path.join(root, '.devtool.yaml');
fs.copyFileSync(path.join(import.meta.dirname, 'writable.yaml'), primary);
fs.writeFileSync(path.join(root, 'later.yaml'), 'config:\n  uid: 9\n');
const product = createProductConfig(
  { configFiles: { system: false, managed: false, user: false }, env: {} },
  { root },
);
const found = discoverApp({ cwd: root, appFiles: ['.', 'later'] });
const app = new App({
  root: found.root,
  definition: new Config<AppConfig>({
    root,
    schema: configSchemas.appDefinition,
    sources: found.sources,
  }),
  config: product,
});
const prior = app.settings.snapshot();
app.settings.writeSource(
  'app:primary',
  [
    { op: 'set', path: 'uid', value: 0 },
    { op: 'set', path: 'system.cache', value: false },
  ],
  { force: true },
);
assert.equal(app.settings.get('uid'), 9);
assert.equal(app.settings.explain('uid').winner?.source, 'app:layer-1');
assert.equal(prior.values.system, undefined);
assert.deepEqual(app.services, []);
assert.ok(!fs.existsSync(path.join(root, 'data')));
const content = fs.readFileSync(primary, 'utf8');
for (const marker of [
  '# Preserve this primary document.',
  '!import ../service/web.yaml',
  '&labels',
  '*labels',
  'untouched: keep',
])
  assert.ok(content.includes(marker), marker);
assert.throws(
  () =>
    app.settings.writeSource(
      'app:primary',
      [{ op: 'set', path: 'system.cli.app-files', value: ['bad'] }],
      { force: true },
    ),
  /read-only/,
);
assert.throws(
  () =>
    app.settings.writeSource('app:primary', [{ op: 'set', path: 'identity', value: 'bad' }], {
      force: true,
    }),
  /supplied by an app/,
);
assert.equal(fs.readFileSync(primary, 'utf8'), content);

let stdout = '';
let stderr = '';
const code = await runCli(['config', 'set', 'uid=2', '--json', '--debug'], {
  cwd: root,
  appFiles: ['.', 'later'],
  config: product,
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
assert.equal(code, 0, stderr);
const receipt = JSON.parse(stdout);
assert.equal(receipt.file, primary);
assert.equal(receipt.edits[0].saved, 2);
assert.equal(receipt.edits[0].effective, 9);
assert.equal(receipt.edits[0].maskedBy[0].source, 'app:layer-1');
assert.match(stderr, /write succeeded/);
assert.ok(!fs.existsSync(path.join(root, 'data')));
process.stdout.write(
  'primary persistence, masking, protected metadata and unprepared app verified\n',
);
