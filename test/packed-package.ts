import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import metadata from '../package.json';
import inventory from '../extraction.json';

const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool packed consumer '));
const writeJson = (file: string, value: unknown) =>
  fs.writeFileSync(path.join(temporary, file), JSON.stringify(value, null, 2));
const run = (args: string[]) => {
  const result = spawnSync(
    process.execPath,
    args[0] === 'install' ? args : ['--no-install', ...args],
    {
      cwd: temporary,
      encoding: 'utf8',
      timeout: 120000,
      env: {
        ...process.env,
        NO_COLOR: '1',
        BUN_INSTALL_CACHE_DIR: path.join(temporary, 'install-cache'),
      },
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
};
try {
  writeJson('package.json', {
    name: 'external-devtool-consumer',
    private: true,
    type: 'module',
    dependencies: { '@tanaab/devtool': path.join(root, 'dist/devtool.tgz') },
    devDependencies: {
      typescript: metadata.devDependencies.typescript,
      '@types/bun': metadata.devDependencies['@types/bun'],
    },
  });
  run(['install', '--ignore-scripts']);
  run(['install', '--frozen-lockfile', '--ignore-scripts']);
  const installed = path.join(temporary, 'node_modules/@tanaab/devtool');
  const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.scripts, undefined);
  assert.equal(manifest.version, metadata.version);
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.equal(manifest.bin, undefined);
  assert.equal(manifest.optionalDependencies, undefined);
  assert.ok(!fs.existsSync(path.join(installed, 'bin')));
  assert.ok(!fs.existsSync(path.join(installed, 'test')));
  assert.ok(!fs.existsSync(path.join(installed, 'lib/devtool.ts')));
  assert.ok(!fs.existsSync(path.join(installed, 'lib/cli.js')));
  assert.ok(!fs.existsSync(path.join(installed, 'node_modules')));
  assert.ok(fs.readFileSync(path.join(installed, 'LICENSE'), 'utf8').includes('Lando Alliance'));
  const notices = fs.readFileSync(path.join(installed, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
  assert.match(notices, /dockerode@/);
  assert.match(notices, /Apache License/);
  for (const file of inventory.files.filter((file) => file.path.endsWith('.sh'))) {
    assert.deepEqual(
      fs.readFileSync(path.join(installed, file.path)),
      fs.readFileSync(path.join(root, file.path)),
    );
    assert.equal(fs.statSync(path.join(installed, file.path)).mode & 0o777, 0o755);
  }
  for (const file of ['packed-consumer.ts', 'public-types.ts'])
    fs.copyFileSync(path.join(root, 'test', file), path.join(temporary, file));
  writeJson('tsconfig.json', {
    compilerOptions: {
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      module: 'Preserve',
      moduleResolution: 'bundler',
      target: 'ESNext',
      types: ['bun'],
    },
    include: ['*.ts'],
  });
  run(['node_modules/typescript/bin/tsc', '--noEmit']);
  // Reuse the import-side-effect tripwires with reads restricted to this installed package tree.
  const probe = fs
    .readFileSync(path.join(root, 'test/source-probe.ts'), 'utf8')
    .replace(
      "path.resolve(import.meta.dirname, '..') + path.sep",
      "path.join(import.meta.dirname, 'node_modules') + path.sep",
    );
  fs.writeFileSync(path.join(temporary, 'inert.ts'), probe);
  run(['inert.ts']);
  fs.writeFileSync(
    path.join(temporary, '.devtool.yml'),
    'services:\n  web:\n    type: lando\n    image: alpine:3.20\n    certs: false\n    packages: {git: false, sudo: false, ssh-agent: false}\n',
  );
  run(['packed-consumer.ts']);
  process.stdout.write('Packed library, declarations, inert imports and assets passed\n');
  run([
    '-e',
    'import assert from "node:assert/strict"; import * as api from "@tanaab/devtool"; assert.deepEqual(Object.keys(api).sort(), ["createDevtool", "name", "version"]);',
  ]);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
