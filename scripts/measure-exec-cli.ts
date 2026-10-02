import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Timing requires disposable CI');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-timing-'));
const project = path.join(root, 'project');
const bin = path.join(root, 'bin');
fs.mkdirSync(project);
fs.mkdirSync(bin);
const binary = path.resolve('dist/devtool');
const config = path.join(root, 'config.yml');
fs.writeFileSync(
  config,
  JSON.stringify({ dataRoot: path.join(root, 'data'), cacheRoot: path.join(root, 'cache') }),
);
fs.writeFileSync(
  path.join(project, '.devtool.yml'),
  'services:\n  web:\n    type: lando\n    image: alpine:3.20\n    command: [sleep, infinity]\n    certs: false\n    packages: {git: false, sudo: false, ssh-agent: false}\n',
);
const docker = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim();
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
fs.writeFileSync(
  path.join(bin, 'docker'),
  `#!/usr/bin/env bash\nprintf 'DEVTOOL_DISPATCH:%s\\n' "$EPOCHREALTIME" >&2\nexec ${quote(docker)} "$@"\n`,
  { mode: 0o755 },
);
const started = performance.now();
execFileSync(binary, ['--config', config, 'start'], { cwd: project, stdio: 'inherit' });
const setup = performance.now() - started;
const info = JSON.parse(
  execFileSync(binary, ['--config', config, 'info', '--json'], { cwd: project, encoding: 'utf8' }),
);
const compose = path.join(root, 'data', 'projects', info.project, 'compose.yml');
const marker = 'devtool-first-output';
const args = ['--config', config, 'exec', 'web', '--', 'sh', '-c', `printf ${marker}; sleep 0.05`];
const commands = {
  source: [process.execPath, path.resolve('bin/devtool.ts'), ...args],
  compiled: [binary, ...args],
  direct: [
    path.join(bin, 'docker'),
    'compose',
    '--project-name',
    info.project,
    '--file',
    compose,
    'exec',
    '-T',
    '--workdir',
    '/app',
    'web',
    '/etc/lando/exec.sh',
    ...args.slice(args.indexOf('--') + 1),
  ],
};
type Target = keyof typeof commands;
interface Sample {
  dispatch: number;
  firstOutput: number;
  completion: number;
}
const sample = (command: string[], cache: string): Promise<Sample> =>
  new Promise((resolve, reject) => {
    const start = performance.now();
    const epoch = performance.timeOrigin + start;
    const child = spawn(command[0], command.slice(1), {
      cwd: project,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      firstOutput: number | undefined;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes(marker)) firstOutput ??= performance.now() - start;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const dispatch = /DEVTOOL_DISPATCH:(\d+\.\d+)/.exec(stderr);
      if (code !== 0 || !dispatch || firstOutput === undefined)
        return reject(new Error(`Measurement failed (${code}): ${stderr}`));
      resolve({
        dispatch: Number(dispatch[1]) * 1000 - epoch,
        firstOutput,
        completion: performance.now() - start,
      });
    });
  });
const records: { batch: number; mode: string; target: Target; sample: Sample }[] = [];
for (let batch = 0; batch < 3; batch++) {
  for (const mode of ['cold', 'warm']) {
    for (const target of Object.keys(commands) as Target[])
      await sample(commands[target], path.join(root, `warm-${target}`));
    for (let index = 0; index < 30; index++) {
      const targets = Object.keys(commands) as Target[];
      if (index % 2) targets.reverse();
      for (const target of targets) {
        const command = [...commands[target]];
        // A fresh inode for first-launch samples; OS page caches remain uncontrolled.
        if (mode === 'cold' && target === 'compiled') {
          command[0] = path.join(root, `compiled-${batch}-${index}`);
          fs.copyFileSync(binary, command[0]);
          fs.chmodSync(command[0], 0o755);
        }
        const result = await sample(
          command,
          path.join(root, mode === 'cold' ? `cold-${batch}-${target}-${index}` : `warm-${target}`),
        );
        records.push({ batch, mode, target, sample: result });
        if (mode === 'cold' && target === 'compiled') fs.rmSync(command[0]);
      }
    }
  }
}
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1].toFixed(1);
const rows: string[] = [];
for (let batch = 0; batch < 3; batch++)
  for (const mode of ['cold', 'warm'])
    for (const target of Object.keys(commands) as Target[]) {
      const values = records
        .filter(
          (record) => record.batch === batch && record.mode === mode && record.target === target,
        )
        .map((record) => record.sample);
      rows.push(
        `| ${batch + 1} | ${mode} | ${target} | ${['dispatch', 'firstOutput', 'completion']
          .map((key) =>
            [0.5, 0.95]
              .map((p) =>
                percentile(
                  values.map((value) => value[key as keyof Sample]),
                  p,
                ),
              )
              .join(' / '),
          )
          .join(' | ')} |`,
      );
    }
const report = `## Exec timing (milliseconds)\n\nBun ${Bun.version}, ${process.platform}/${process.arch}, kernel ${os.release()}. Three batches of 30 paired samples per mode/target on one running Lando container. Setup/build/start took ${setup.toFixed(0)} ms, outside samples. Workload prints immediately, then sleeps 50 ms; completion includes that workload and Docker overhead. Dispatch measures process startup through the wrapper immediately before Docker. Cold source uses fresh transpiler caches; cold compiled uses a fresh executable inode. OS caches are uncontrolled, so these are first-launch proxies, not disk-cold claims. Warm samples reuse executable and transpiler cache. Direct Docker uses identical Compose, service wrapper and argv. No timing gate.\n\n| Batch | Mode | Target | Dispatch median / p95 | First output median / p95 | Completion median / p95 |\n| --- | --- | --- | ---: | ---: | ---: |\n${rows.join('\n')}\n`;
fs.writeFileSync(
  'exec-timing.json',
  JSON.stringify(
    {
      runtime: Bun.version,
      platform: process.platform,
      arch: process.arch,
      kernel: os.release(),
      setup,
      records,
    },
    null,
    2,
  ),
);
fs.writeFileSync('exec-timing.md', report);
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
// The disposable runner owns final resource cleanup; lifecycle destruction is covered by scenarios.
