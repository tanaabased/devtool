import requireValue from '../../../utils/require-value.ts';
import type lando from '../lib/service.ts';
type LandoService = InstanceType<ReturnType<typeof lando.builder>>;
import type { ServiceConfig } from '../../../components/service.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import * as yaml from '../../../utils/read-fixture-yaml.ts';
import { fixture } from '../../../utils/create-test-project.ts';
import { runCli } from '../../../lib/cli.ts';
import { createProductConfig } from '../../../lib/devtool.ts';
import L337 from '../../l337/l337.ts';
import copyBuildSource from '../../../engines/docker/utils/copy-build-source.ts';

const service = (overrides: Partial<ServiceConfig> = {}): ServiceConfig => ({
  type: 'lando',
  api: 4,
  image: 'alpine:3.20',
  certs: false,
  user: { name: 'builder', uid: 1000, gid: 1000 },
  packages: { git: false, sudo: false, 'ssh-agent': false },
  ...overrides,
});

describe('API 4 Lando lifecycle (#5)', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture({ web: service() });
  });
  afterEach(() => f.cleanup());
  it('extends L337, prepares owned assets before hashing, and reconstructs cached wrappers', async () => {
    const app = f.load();
    assert.ok(app.services[0] instanceof L337);
    await app.start();
    const imagefile = fs.readFileSync(app.services[0].imagefile, 'utf8');
    assert.match(imagefile, /add-user.sh/);
    assert.match(imagefile, /run-hooks.sh image setup-user/);
    const first = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.deepEqual(requireValue(first.services.web).entrypoint, ['/etc/lando/entrypoint.sh']);
    assert.deepEqual(requireValue(first.services.web).command, ['sleep', 'infinity']);
    assert.equal(requireValue(first.services.web).user, 'builder');
    assert.equal(requireValue(first.networks.app).external, undefined);
    assert.equal(
      requireValue(first.services.web).volumes.some(
        (mount) => mount.source === app.root && mount.target === '/app',
      ),
      true,
    );
    f.calls.length = 0;
    const next = f.load();
    await next.start();
    assert.equal(
      f.calls.some((call) => call[0] === 'build' || call[1]?.[0] === 'run'),
      false,
    );
    assert.deepEqual(yaml.load(fs.readFileSync(next.composeFile, 'utf8')), first);
    assert.equal(requireValue(next.getInfo().services[0]).state.APP, 'BUILT');
  });
  it('stages generated certificate and entrypoint inputs despite excluding generated directories from app copies', async () => {
    const data = yaml.load(
      fs.readFileSync(
        path.join(import.meta.dirname, '../../../examples/lando/.devtool.yml'),
        'utf8',
      ),
    );
    fs.writeFileSync(f.file, yaml.dump(data));
    for (const name of ['readonly', 'copied', 'app.sh'])
      fs.copyFileSync(
        path.join(import.meta.dirname, '../../../examples/lando', name),
        path.join(f.root, name),
      );
    const original = f.engine.buildx;
    let staged = 0;
    f.engine.buildx = async (file, context) => {
      for (const source of context.sources ?? []) {
        copyBuildSource(source, context.context!, context.excludePaths);
        assert.ok(fs.existsSync(path.join(context.context!, source.target)), source.source);
        staged++;
      }
      return original(file, context);
    };
    const app = f.load();
    await app.start();
    assert.ok(staged > 10);
    const mounts = requireValue(
      yaml.load(fs.readFileSync(app.composeFile, 'utf8')).services.web,
    ).volumes;
    for (const target of [
      '/app',
      '/read-only',
      '/data',
      '/shared',
      '/global',
      '/etc/lando/certs/cert.crt',
      '/etc/lando/build/app/user.d/app.sh',
    ]) {
      assert.ok(
        mounts.some((mount) => mount.target === target),
        target,
      );
    }
  });
  it('runs internal-root and user hooks before startup, and repeats after changed hook content', async () => {
    fs.writeFileSync(path.join(f.root, 'hook.sh'), '#!/bin/sh\necho one\n');
    fs.writeFileSync(
      f.file,
      yaml.dump({ services: { web: service({ build: { app: 'hook.sh' } }) } }),
    );
    await f.load().start();
    const operations = f.calls.filter((call) => call[0] === 'compose').map((call) => call[1]);
    assert.deepEqual(
      operations.map((args) => args[0]),
      ['run', 'run', 'up'],
    );
    assert.deepEqual(requireValue(operations[0]).slice(-3), [
      '/etc/lando/run-hooks.sh',
      'app',
      'internal-root',
    ]);
    assert.equal(
      requireValue(operations[0])[requireValue(operations[0]).indexOf('--user') + 1],
      'root',
    );
    assert.equal(
      requireValue(operations[1])[requireValue(operations[1]).indexOf('--user') + 1],
      'builder',
    );
    f.calls.length = 0;
    fs.writeFileSync(path.join(f.root, 'hook.sh'), '#!/bin/sh\necho two\n');
    await f.load().start();
    assert.equal(f.calls.filter((call) => call[1]?.[0] === 'run').length, 2);
  });
  it('propagates app failures through library and CLI without saving completed state; retry succeeds', async () => {
    f.engine.appError = Object.assign(new Error('app hook failed'), { code: 19 });
    const app = f.load();
    await assert.rejects(app.start(), /app hook failed/);
    assert.equal(requireValue(app.services[0]).info.state.APP, 'BUILD FAILURE');
    assert.equal(
      f.calls.some((call) => call[1]?.[0] === 'up'),
      false,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(app.stateFile, 'utf8')).services, {});
    const stream = { write() {} };
    assert.equal(
      await runCli(['start'], {
        config: createProductConfig(f.options),
        engine: f.engine,
        cwd: f.root,
        stdout: stream,
        stderr: stream,
      }),
      19,
    );
    delete f.engine.appError;
    await f.load().start();
    assert.equal(requireValue(f.load().getInfo().services[0]).state.APP, 'BUILT');
  });
  it('does not run app hooks after an image failure', async () => {
    f.engine.buildError = new Error('image failed');
    await assert.rejects(f.load().start(), /image failed/);
    assert.equal(
      f.calls.some((call) => call[0] === 'compose'),
      false,
    );
  });
  it('scopes storage, retains global volumes, and removes only the selected project', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: {
          web: service({
            storage: [
              '/data',
              { target: '/shared', scope: 'app' },
              { target: '/global', scope: 'global' },
            ],
          }),
        },
      }),
    );
    const first = f.load();
    await first.start();
    const other = f.load({ identity: 'other' });
    await other.start();
    assert.equal(f.volumes.size, 6);
    await first.rebuild();
    assert.equal(f.volumes.size, 6);
    await first.destroy();
    assert.equal(f.volumes.size, 4);
    assert.equal(
      [...f.volumes.values()].filter(
        (volume) => volume.Labels?.['dev.lando.storage-project'] === other.project,
      ).length,
      2,
    );
    await first.destroy();
    assert.equal(f.volumes.size, 4);
  });
  it('keeps configured users and package settings isolated between instances', async () => {
    const first = f.load();
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: { web: service({ user: { name: 'another', uid: 1234, gid: 1234 } }) },
      }),
    );
    const second = f.load();
    assert.equal(requireValue(requireValue(first.services[0])._data.groups.user).user, 'builder');
    assert.equal(requireValue(requireValue(second.services[0])._data.groups.user).user, 'another');
    (second.services[0] as LandoService).packages.git = true;
    assert.equal((first.services[0] as LandoService).packages.git, false);
    await first.start();
    assert.deepEqual(second.state, { services: {} });
  });
  it('preserves read-only mounts and exec arguments while selecting the container environment wrapper', async () => {
    fs.writeFileSync(path.join(f.root, 'readonly'), 'read only');
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: {
          web: service({ mounts: ['./readonly:/read-only:ro'], command: ['sleep', 'infinity'] }),
        },
      }),
    );
    const app = f.load();
    await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.equal(
      requireValue(compose.services.web).volumes.find((mount) => mount.target === '/read-only')!
        .read_only,
      true,
    );
    await app.exec('web', ['printf', '%s', 'a b;$HOME']);
    assert.deepEqual(f.calls.at(-1)![1], [
      'exec',
      '-T',
      '--workdir',
      '/app',
      'web',
      '/etc/lando/exec.sh',
      'printf',
      '%s',
      'a b;$HOME',
    ]);
  });
  it('records health success, exhaustion and disabled state without confusing running with healthy', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: {
          web: service({ healthcheck: { command: 'test -f /healthy', retry: 2, delay: 0 } }),
        },
      }),
    );
    const compose = f.engine.compose;
    let failures = 1;
    f.engine.compose = async (...args) => {
      if (args[2][0] === 'exec' && failures-- > 0) throw new Error('not ready');
      return compose(...args);
    };
    await f.load().start();
    assert.equal(requireValue(f.load().getInfo().services[0]).healthy, true);
    failures = 3;
    await f.load().start();
    assert.equal(requireValue(f.load().getInfo().services[0]).healthy, false);
    assert.equal(f.load().state.running, true);
  });
  it('generates project certificates with SANs, container trust and stable cache inputs', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({ services: { web: service({ certs: true, hostnames: ['fixture.internal'] }) } }),
    );
    const app = f.load();
    await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    const file = requireValue(compose.services.web).volumes.find(
      (mount) => mount.target === '/etc/lando/certs/cert.crt',
    )!.source;
    const cert = new X509Certificate(fs.readFileSync(file));
    assert.equal(cert.checkHost('fixture.internal'), 'fixture.internal');
    assert.ok(cert.verify(new X509Certificate(fs.readFileSync(app.certificates.caCert)).publicKey));
    assert.equal(fs.statSync(file.replace(/\.crt$/, '.key')).mode & 0o777, 0o644);
    assert.equal(fs.statSync(app.certificates.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(app.certificates.caKey).mode & 0o777, 0o600);
    assert.ok(
      requireValue(compose.services.web)
        .volumes.filter((mount) => mount.target.startsWith('/etc/lando/certs/'))
        .every((mount) => mount.read_only),
    );
    assert.match(
      fs.readFileSync(requireValue(app.services[0]).imagefile, 'utf8'),
      /ca-certificates/,
    );
    f.calls.length = 0;
    await f.load().start();
    assert.equal(
      f.calls.some((call) => call[0] === 'build'),
      false,
    );
  });
  it('normalizes command and entrypoint strings, files, multiline scripts and image fallback', async () => {
    fs.writeFileSync(path.join(f.root, 'command.sh'), '#!/bin/sh\nexec sleep infinity\n');
    for (const command of [
      'sleep infinity',
      'command.sh',
      '#!/bin/sh\nexec sleep infinity\n',
      ['sleep', 'infinity'],
    ]) {
      fs.writeFileSync(
        f.file,
        yaml.dump({ services: { web: service({ command, entrypoint: '/bin/sh -c' }) } }),
      );
      const app = f.load();
      await app.start();
      const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
      assert.deepEqual(requireValue(compose.services.web).command.slice(0, 2), ['/bin/sh', '-c']);
      assert.ok(requireValue(compose.services.web).command.length >= 3);
      assert.ok(
        !requireValue(compose.services.web).command.some((value) => typeof value !== 'string'),
      );
    }
  });
  it('keeps absolute container executable paths out of the host build context', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: { web: service({ command: ['sleep', 'infinity'], entrypoint: '/bin/sh' }) },
      }),
    );
    const app = f.load();
    await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.equal(requireValue(compose.services.web).command[0], '/bin/sh');
    assert.equal(
      requireValue(app.services[0])
        .generateBuildContext()
        .sources.some((source) => source.source === '/bin/sh'),
      false,
    );
  });
  it('prepares every image before any app hook and emits app-state transitions', async () => {
    fs.writeFileSync(f.file, yaml.dump({ services: { one: service(), two: service() } }));
    const app = f.load();
    const states: string[] = [];
    requireValue(app.services[0]).on('state', (info) => states.push(info.state.APP));
    await app.start();
    const builds = f.calls
      .map((call, index) => (call[0] === 'build' ? index : -1))
      .filter((index) => index >= 0);
    const firstHook = f.calls.findIndex((call) => call[1]?.[0] === 'run');
    assert.ok(builds.every((index) => index < firstHook));
    assert.ok(states.includes('BUILDING'));
    assert.equal(states.at(-1), 'BUILT');
  });
  it('prepares container trust independently of service declaration order', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: { client: service({ certs: false }), server: service({ certs: true }) },
      }),
    );
    const app = f.load();
    await app.start();
    assert.match(
      fs.readFileSync(requireValue(app.services[0]).imagefile, 'utf8'),
      /ca-certificates/,
    );
    f.calls.length = 0;
    await f.load().start();
    assert.equal(
      f.calls.some((call) => call[0] === 'build'),
      false,
    );
  });
  it('supports custom certificate destinations and disabled healthchecks', async () => {
    fs.writeFileSync(
      f.file,
      yaml.dump({
        services: {
          web: service({
            certs: { cert: '/custom/server.crt', key: '/custom/server.key' },
            healthcheck: false,
          }),
        },
      }),
    );
    const app = f.load();
    await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.ok(
      requireValue(compose.services.web).volumes.some(
        (mount) => mount.target === '/custom/server.crt',
      ),
    );
    assert.ok(
      requireValue(compose.services.web).volumes.some(
        (mount) => mount.target === '/custom/server.key',
      ),
    );
    assert.equal(requireValue(app.services[0]).info.healthy, 'unknown');
    assert.equal(
      f.calls.some((call) => call[1]?.[0] === 'exec'),
      false,
    );
  });
  it('rejects API 3 and proxy or global-container escape hatches before engine activity', () => {
    for (const override of [
      { api: 3 },
      { type: 'nginx' },
      { packages: { proxy: true } },
      { overrides: { network_mode: 'host' } },
    ]) {
      fs.writeFileSync(
        f.file,
        yaml.dump({ services: { web: service(override as Partial<ServiceConfig>) } }),
      );
      assert.throws(() => f.load(), /Unsupported|unsupported|not supported/);
      assert.deepEqual(f.calls, []);
    }
  });
});
