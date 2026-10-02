import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellAssets } from '../services/lando/lib/shell-assets.ts';
import metadata from '../package.json';

const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool standalone '));
const executable = path.join(temporary, 'devtool');
const bin = path.join(temporary, 'bin');
const project = path.join(temporary, 'project');
const data = path.join(temporary, 'data');
const isolated = process.env.DEVTOOL_ISOLATE === '1';
if (isolated)
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Container checks require disposable CI');
const environment = {
  PATH: bin,
  HOME: temporary,
  NO_COLOR: '1',
  DEVTOOL_DATA_ROOT: data,
  DEVTOOL_CACHE_ROOT: path.join(temporary, 'cache'),
  SSH_AUTH_SOCK: path.join(temporary, 'agent.sock'),
};
const invocation = (args: string[], env = environment): [string, ...string[]] =>
  isolated
    ? [
        'docker',
        'run',
        '--rm',
        '--network=none',
        '--user',
        `${process.getuid?.()}:${process.getgid?.()}`,
        '--mount',
        `type=bind,src=${temporary},dst=${temporary}`,
        '--workdir',
        project,
        ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
        'ubuntu:24.04',
        executable,
        ...args,
      ]
    : [executable, ...args];
const run = (args: string[], env = environment) => {
  const [command, ...argv] = invocation(args, env);
  const result = spawnSync(command, argv, {
    cwd: project,
    env: isolated ? process.env : env,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ifError(result.error);
  return result;
};
const files = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
try {
  fs.mkdirSync(bin);
  fs.mkdirSync(project);
  fs.copyFileSync(process.env.DEVTOOL_COMPILED_CLI ?? path.join(root, 'dist/devtool'), executable);
  fs.chmodSync(executable, 0o755);
  fs.writeFileSync(environment.SSH_AUTH_SOCK, 'fixture');
  fs.writeFileSync(
    path.join(project, '.devtool.yml'),
    'services:\n  web:\n    type: lando\n    image: alpine:3.20\n',
  );
  fs.writeFileSync(
    path.join(bin, 'docker'),
    `#!/bin/sh
if command -v bun || command -v node; then exit 99; fi
if [ "$1" = buildx ]; then echo fixture-build-failure >&2; exit 29; fi
printf '%s\\n' "$@"
printf 'fixture-stderr\\n' >&2
printf 'first-output\\n'
/bin/sleep 1
printf '%s\\n' '${'o'.repeat(32768)}'
printf '%s\\n' '${'e'.repeat(32768)}' >&2
printf 'last-diagnostic\\n' >&2
printf 'last-output\\n'
exit 17
`,
    { mode: 0o755 },
  );
  switch (process.argv[2]) {
    case 'config': {
      fs.writeFileSync(
        path.join(project, '.env'),
        'DEVTOOL_COMMAND_NAME=ambient\nDEVTOOL_CACHE=invalid\n',
      );
      fs.writeFileSync(path.join(project, 'bunfig.toml'), 'preload = ["./missing-preload.ts"]\n');
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"ambient","version":"wrong"}');
      fs.writeFileSync(path.join(project, 'tsconfig.json'), 'invalid');
      const version = run(['--version']);
      assert.equal(version.status, 0, version.stderr);
      assert.equal(version.stdout.trim(), metadata.version);
      assert.match(run(['--help']).stdout, /Usage: devtool/);
      fs.writeFileSync(path.join(project, 'product.yml'), 'commandName: explicit\n');
      assert.match(run(['--config', 'product.yml', '--help']).stdout, /Usage: explicit/);
      assert.match(
        run(['--config', 'product.yml', '--help'], {
          ...environment,
          DEVTOOL_COMMAND_NAME: 'environment',
        } as typeof environment).stdout,
        /Usage: environment/,
      );
      assert.equal(fs.existsSync(data), false, 'information flags must not materialize assets');
      const info = run(['info', '--json']);
      assert.equal(info.status, 0, info.stderr);
      assert.equal(JSON.parse(info.stdout).services[0].service, 'web');
      fs.writeFileSync(path.join(project, 'service.json'), '{"type":"l337","image":"alpine:3.20"}');
      fs.writeFileSync(
        path.join(project, '.devtool.yml'),
        'services:\n  web: !import ./service.json\n',
      );
      const imported = run(['info', '--json', '--data-root', path.join(temporary, 'override')]);
      assert.equal(imported.status, 0, imported.stderr);
      assert.equal(JSON.parse(imported.stdout).services[0].type, 'l337');
      assert.ok(fs.existsSync(path.join(temporary, 'override')));
      assert.equal(
        files(data).some((file) => file.includes('/assets/')),
        false,
      );
      break;
    }
    case 'assets': {
      const first = run(['start']);
      assert.equal(first.status, 29, first.stderr);
      assert.match(first.stderr, /fixture-build-failure/);
      const extracted = files(data).filter((file) => file.includes('/assets/'));
      // macOS also selects the SSH-agent package; Linux uses the explicit fixture socket.
      for (const asset of Object.keys(shellAssets)) {
        const file = extracted.find((file) => file.endsWith(`/assets/${asset}`));
        assert.ok(file, asset);
        assert.deepEqual(
          fs.readFileSync(file),
          fs.readFileSync(path.join(root, 'services/lando', asset)),
          asset,
        );
        assert.equal(fs.statSync(file).mode & 0o777, 0o755, asset);
      }
      assert.equal(extracted.length, Object.keys(shellAssets).length);
      const target = extracted[0];
      assert.ok(target);
      fs.writeFileSync(target, 'broken');
      fs.chmodSync(target, 0o644);
      const rerun = run(['start']);
      assert.equal(rerun.status, 29, rerun.stderr);
      const id = target.split('/assets/')[1];
      assert.ok(id);
      assert.deepEqual(
        fs.readFileSync(target),
        fs.readFileSync(path.join(root, 'services/lando', id)),
      );
      assert.equal(fs.statSync(target).mode & 0o777, 0o755);
      break;
    }
    case 'streams': {
      const [command, ...args] = invocation(['exec', 'web', '--', 'printf', 'a b;$HOME']);
      const child = spawn(command, args, {
        cwd: project,
        env: isolated ? process.env : environment,
      });
      let stdout = '';
      let stderr = '';
      let early = false;
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.includes('first-output') && !stdout.includes('last-output')) early = true;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      const status = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      assert.equal(status, 17, stderr);
      assert.ok(early, 'first output must arrive before command completion');
      assert.ok(stdout.includes('a b;$HOME\n'));
      assert.ok(stdout.includes('/etc/lando/exec.sh\n'));
      assert.match(stderr, /fixture-stderr/);
      assert.ok(stdout.includes('o'.repeat(32768)));
      assert.ok(stderr.includes('e'.repeat(32768)));
      const summary = stderr.slice(stderr.lastIndexOf('error: '));
      assert.ok(summary.startsWith('error: docker compose failed (17): '));
      assert.ok(summary.length < 8400, 'failure summary must retain only a bounded tail');
      assert.ok(!summary.includes('fixture-stderr'), 'old diagnostics must leave the tail');
      assert.match(summary, /last-diagnostic/);
      assert.equal(
        files(data).some((file) => file.includes('/assets/')),
        false,
      );
      break;
    }
    default:
      throw new Error('Expected config, assets or streams');
  }
  process.stdout.write(
    `${process.argv[2]} passed (${isolated ? 'isolated Linux' : process.platform + '/' + process.arch})\n`,
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
