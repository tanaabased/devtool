import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDevtool } from '../lib/devtool.ts';

// Informational only: paired source measurements on the same disposable runner and warm container.
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Startup measurements are CI-only');
const base = process.env.DEVTOOL_BASE_SHA;
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Missing base commit');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-startup-'));
const baseline = path.join(root, 'baseline');
const fixture = path.join(root, 'fixture');
const commandDirectory = path.join(root, 'bin');
for (const directory of [baseline, fixture, commandDirectory]) fs.mkdirSync(directory);
execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', base]);
const archive = execFileSync('git', ['archive', base]);
const extracted = spawnSync('tar', ['-x', '-C', baseline], { input: archive });
if (extracted.status !== 0) throw new Error('Unable to prepare baseline source');
fs.symlinkSync(path.resolve('node_modules'), path.join(baseline, 'node_modules'));
const packageFile = JSON.parse(fs.readFileSync(path.join(baseline, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  bin: { devtool: string };
};
const candidatePackage = JSON.parse(fs.readFileSync('package.json', 'utf8')) as typeof packageFile;
if (JSON.stringify(packageFile.dependencies) !== JSON.stringify(candidatePackage.dependencies))
  throw new Error('Paired measurement requires matching runtime dependencies');
fs.writeFileSync(
  path.join(fixture, '.devtool.yml'),
  'services:\n  web:\n    type: l337\n    image: alpine:3.20\n    command: [sleep, infinity]\n',
);
const configFile = path.join(root, 'product.yml');
fs.writeFileSync(
  configFile,
  JSON.stringify({
    identity: 'timing',
    dataRoot: path.join(root, 'data'),
    cacheRoot: path.join(root, 'cache'),
  }),
);
const app = createDevtool({ configFile, env: {} }).loadApp({ cwd: fixture });
const docker = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim();
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
fs.writeFileSync(
  path.join(commandDirectory, 'docker'),
  `#!/usr/bin/env bash\nprintf 'DEVTOOL_DISPATCH:%s\\n' "$EPOCHREALTIME" >&2\nexec ${quote(docker)} "$@"\n`,
  { mode: 0o755 },
);
const marker = 'devtool-timing-output';
const commands = {
  baseline: [
    process.execPath,
    path.join(baseline, packageFile.bin.devtool),
    '--config',
    configFile,
    'exec',
    'web',
    '--',
    'printf',
    '%s',
    marker,
  ],
  candidate: [
    process.execPath,
    path.resolve(candidatePackage.bin.devtool),
    '--config',
    configFile,
    'exec',
    'web',
    '--',
    'printf',
    '%s',
    marker,
  ],
  direct: [
    path.join(commandDirectory, 'docker'),
    'compose',
    '--project-name',
    app.project,
    '--file',
    app.composeFile,
    'exec',
    '-T',
    'web',
    'printf',
    '%s',
    marker,
  ],
};
interface Sample {
  dispatch: number;
  firstOutput: number;
}
const sample = (command: string[], cache: string): Promise<Sample> =>
  new Promise((resolve, reject) => {
    const started = performance.now();
    const epoch = performance.timeOrigin + started;
    const child = spawn(command[0], command.slice(1), {
      cwd: fixture,
      env: {
        ...process.env,
        DEVTOOL_DATA_ROOT: path.join(root, 'data'),
        DEVTOOL_CACHE_ROOT: path.join(root, 'cache'),
        PATH: `${commandDirectory}:${process.env.PATH}`,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      diagnostic = '',
      firstOutput: number | undefined;
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.includes(marker)) firstOutput ??= performance.now() - started;
    });
    child.stderr.on('data', (chunk) => {
      diagnostic += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const dispatch = /DEVTOOL_DISPATCH:(\d+\.\d+)/.exec(diagnostic);
      if (code !== 0 || !dispatch || firstOutput === undefined)
        return reject(new Error(`Measurement failed (${code}): ${diagnostic}`));
      resolve({ dispatch: Number(dispatch[1]) * 1000 - epoch, firstOutput });
    });
  });
const percentile = (values: number[], fraction: number) =>
  values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1].toFixed(1);
try {
  await app.start();
  const rows: string[] = [];
  for (const mode of ['cold', 'warm']) {
    const samples: Record<keyof typeof commands, Sample[]> = {
      baseline: [],
      candidate: [],
      direct: [],
    };
    if (mode === 'warm')
      for (const [name, command] of Object.entries(commands))
        await sample(command, path.join(root, `cache-${name}`));
    for (let index = 0; index < 12; index++) {
      const names = Object.keys(commands) as (keyof typeof commands)[];
      if (index % 2) names.reverse();
      for (const name of names)
        samples[name].push(
          await sample(
            commands[name],
            path.join(root, mode === 'cold' ? `cache-${name}-${index}` : `cache-${name}`),
          ),
        );
    }
    for (const [name, values] of Object.entries(samples))
      rows.push(
        `| ${mode} | ${name} | ${percentile(
          values.map((v) => v.dispatch),
          0.5,
        )} | ${percentile(
          values.map((v) => v.dispatch),
          0.95,
        )} | ${percentile(
          values.map((v) => v.firstOutput),
          0.5,
        )} | ${percentile(
          values.map((v) => v.firstOutput),
          0.95,
        )} |`,
      );
  }
  const report = `### Source exec startup (milliseconds)\n\nBase: ${base}. Twelve paired samples per target/mode; same running container. Cold uses a fresh Bun transpiler cache, warm reuses it; OS page caches are uncontrolled. Dispatch is timestamped immediately before exec of Docker; first output includes the same Docker/container command cost. Container setup is excluded. These observations establish a baseline, not a CI regression budget.\n\n| Mode | Target | Dispatch median | Dispatch p95 | Output median | Output p95 |\n| --- | --- | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n`;
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
} finally {
  try {
    await app.destroy();
  } finally {
    spawnSync(docker, ['image', 'rm', `${app.project}-web:latest`], { stdio: 'inherit' });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
