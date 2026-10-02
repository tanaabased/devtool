import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { platformPackage } from '../lib/platform-package.ts';
import metadata from '../package.json';
import inventory from '../extraction.json';

const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool packed consumer '));
const writeJson = (file: string, value: unknown) =>
  fs.writeFileSync(path.join(temporary, file), JSON.stringify(value, null, 2));
const run = (args: string[], expected = 0) => {
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
  assert.equal(result.status, expected, result.stdout + result.stderr);
  return result;
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
  run(['install', '--ignore-scripts', '--no-optional']);
  run(['install', '--frozen-lockfile', '--ignore-scripts', '--no-optional']);
  const installed = path.join(temporary, 'node_modules/@tanaab/devtool');
  const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.scripts, undefined);
  assert.equal(manifest.version, metadata.version);
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.ok(
    Object.values(manifest.optionalDependencies).every((version) => version === manifest.version),
  );
  assert.ok(!fs.existsSync(path.join(installed, 'test')));
  assert.ok(!fs.existsSync(path.join(installed, 'lib/devtool.ts')));
  assert.ok(!fs.existsSync(path.join(installed, 'lib/cli.js')));
  assert.ok(!fs.existsSync(path.join(installed, 'node_modules')));
  for (const name of Object.keys(manifest.optionalDependencies))
    assert.ok(!fs.existsSync(path.join(temporary, 'node_modules', name)));
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
  run([
    '-e',
    'import assert from "node:assert/strict"; import * as api from "@tanaab/devtool"; assert.deepEqual(Object.keys(api).sort(), ["createDevtool", "name", "version"]);',
  ]);
  const launcher = path.join(installed, 'bin/devtool.js');
  assert.match(run([launcher, '--version'], 1).stderr, /Missing @tanaab\/devtool-/);
  const binaryName = platformPackage(process.platform, process.arch);
  const consumer = JSON.parse(fs.readFileSync(path.join(temporary, 'package.json'), 'utf8'));
  consumer.dependencies[binaryName] = path.join(
    root,
    `dist/devtool-${process.platform}-${process.arch}.tgz`,
  );
  writeJson('package.json', consumer);
  run(['install', '--ignore-scripts', '--no-optional']);
  assert.equal(run([launcher, '--version']).stdout.trim(), metadata.version);
  assert.equal(run(['--bun', 'run', 'devtool', '--version']).stdout.trim(), metadata.version);
  assert.match(run([launcher, '--help']).stdout, /Usage: devtool/);
  const binaryRoot = path.join(temporary, 'node_modules', binaryName);
  const binaryManifest = path.join(binaryRoot, 'package.json');
  const binaryMetadata = JSON.parse(fs.readFileSync(binaryManifest, 'utf8'));
  assert.equal(binaryMetadata.version, metadata.version);
  assert.equal(fs.readFileSync(path.join(binaryRoot, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), notices);
  fs.writeFileSync(binaryManifest, JSON.stringify({ ...binaryMetadata, version: '99.0.0' }));
  assert.match(run([launcher, '--version'], 1).stderr, /Expected .*; found/);
  fs.writeFileSync(binaryManifest, JSON.stringify(binaryMetadata));

  // A controlled executable proves the launcher's process contract independently of Docker.
  const executable = path.join(binaryRoot, 'bin/devtool');
  fs.writeFileSync(
    executable,
    `#!/bin/sh\nprintf 'argv:<%s>\\n' "$@"\nprintf 'stderr-marker\\n' >&2\nIFS= read -r value\nprintf 'stdin:<%s>\\n' "$value"\nsleep 0.2\nprintf 'last-output\\n'\nexit 23\n`,
    { mode: 0o755 },
  );
  const child = spawn(process.execPath, [launcher, 'a b', ';$HOME', '', '--flag'], {
    cwd: temporary,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end('input with spaces\n');
  let stdout = '',
    stderr = '',
    early = false;
  child.stdout.on('data', (data) => {
    stdout += data;
    if (stdout.includes('argv:') && !stdout.includes('last-output')) early = true;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const [code] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve([code, signal]));
  });
  assert.equal(code, 23, stderr);
  assert.equal(early, true);
  for (const argument of ['a b', ';$HOME', '', '--flag'])
    assert.ok(stdout.includes(`argv:<${argument}>`));
  assert.ok(stdout.includes('stdin:<input with spaces>'));
  assert.match(stderr, /stderr-marker/);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    fs.writeFileSync(
      executable,
      `#!/bin/sh\ntrap 'echo received-${signal}; exit 42' ${signal.slice(3)}\necho ready\nwhile :; do sleep 0.05; done\n`,
    );
    const processUnderTest = spawn(process.execPath, [launcher], {
      cwd: temporary,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => processUnderTest.kill('SIGKILL'), 5000);
    processUnderTest.stdout.on('data', (data) => {
      output += data;
      if (String(data).includes('ready')) processUnderTest.kill(signal);
    });
    const status = await new Promise<number | null>((resolve, reject) => {
      processUnderTest.on('error', reject);
      processUnderTest.on('close', resolve);
    });
    clearTimeout(timer);
    assert.equal(status, 42, output);
    assert.match(output, new RegExp(`received-${signal}`));
  }
  fs.writeFileSync(executable, '#!/bin/sh\nkill -TERM $$\n');
  const terminated = spawnSync(process.execPath, [launcher], {
    cwd: temporary,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(terminated.signal, 'SIGTERM', terminated.stderr);
  fs.rmSync(executable);
  assert.match(run([launcher], 1).stderr, /devtool:.*ENOENT/);
  process.stdout.write(
    'Packed library, declarations, assets, optional binaries and launcher passed\n',
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
