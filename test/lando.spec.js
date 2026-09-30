'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {X509Certificate} = require('node:crypto');
const yaml = require('js-yaml');
const {fixture} = require('./project-fixture');
const {runCli} = require('../lib/cli');
const {createDevtool} = require('../lib/devtool');

const service = overrides => ({type: 'lando', api: 4, image: 'alpine:3.20', certs: false,
  user: {name: 'builder', uid: 1000, gid: 1000}, packages: {git: false, sudo: false, 'ssh-agent': false}, ...overrides});

describe('API 4 Lando lifecycle (#5)', () => {
  let f;
  beforeEach(() => { f = fixture({web: service()}); });
  afterEach(() => f.cleanup());
  it('extends L337, prepares owned assets before hashing, and reconstructs cached wrappers', async () => {
    const app = f.load();
    assert.ok(app.services[0] instanceof require('../components/l337-v4'));
    await app.start();
    const imagefile = fs.readFileSync(app.services[0].imagefile, 'utf8');
    assert.match(imagefile, /add-user.sh/);
    assert.match(imagefile, /run-hooks.sh image setup-user/);
    const first = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.deepEqual(first.services.web.entrypoint, ['/etc/lando/entrypoint.sh']);
    assert.deepEqual(first.services.web.command, ['sleep', 'infinity']);
    assert.equal(first.services.web.user, 'builder');
    assert.equal(first.networks.app.external, undefined);
    assert.equal(first.services.web.volumes.some(mount => mount.source === app.root && mount.target === '/app'), true);
    f.calls.length = 0;
    const next = f.load(); await next.start();
    assert.equal(f.calls.some(call => call[0] === 'build' || call[1]?.[0] === 'run'), false);
    assert.deepEqual(yaml.load(fs.readFileSync(next.composeFile, 'utf8')), first);
    assert.equal(next.getInfo().services[0].state.APP, 'BUILT');
  });
  it('runs internal-root and user hooks before startup, and repeats after changed hook content', async () => {
    fs.writeFileSync(path.join(f.root, 'hook.sh'), '#!/bin/sh\necho one\n');
    fs.writeFileSync(f.file, yaml.dump({services: {web: service({build: {app: 'hook.sh'}})}}));
    await f.load().start();
    let operations = f.calls.filter(call => call[0] === 'compose').map(call => call[1]);
    assert.deepEqual(operations.map(args => args[0]), ['run', 'run', 'up']);
    assert.deepEqual(operations[0].slice(-3), ['/etc/lando/run-hooks.sh', 'app', 'internal-root']);
    assert.equal(operations[0][operations[0].indexOf('--user') + 1], 'root');
    assert.equal(operations[1][operations[1].indexOf('--user') + 1], 'builder');
    f.calls.length = 0;
    fs.writeFileSync(path.join(f.root, 'hook.sh'), '#!/bin/sh\necho two\n');
    await f.load().start();
    assert.equal(f.calls.filter(call => call[1]?.[0] === 'run').length, 2);
  });
  it('propagates app failures through library and CLI without saving completed state; retry succeeds', async () => {
    f.engine.appError = Object.assign(new Error('app hook failed'), {code: 19});
    const app = f.load();
    await assert.rejects(app.start(), /app hook failed/);
    assert.equal(app.services[0].info.state.APP, 'BUILD FAILURE');
    assert.equal(f.calls.some(call => call[1]?.[0] === 'up'), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(app.stateFile)).services, {});
    const stream = {write() {}};
    assert.equal(await runCli(['start'], {runtime: createDevtool(f.options), cwd: f.root, stdout: stream, stderr: stream}), 19);
    delete f.engine.appError;
    await f.load().start();
    assert.equal(f.load().getInfo().services[0].state.APP, 'BUILT');
  });
  it('does not run app hooks after an image failure', async () => {
    f.engine.buildError = new Error('image failed');
    await assert.rejects(f.load().start(), /image failed/);
    assert.equal(f.calls.some(call => call[0] === 'compose'), false);
  });
  it('scopes storage, retains global volumes, and removes only the selected project', async () => {
    fs.writeFileSync(f.file, yaml.dump({services: {web: service({storage: ['/data', {target: '/shared', scope: 'app'}, {target: '/global', scope: 'global'}]})}}));
    const first = f.load(); await first.start();
    const other = f.load({identity: 'other'}); await other.start();
    assert.equal(f.volumes.size, 6);
    await first.rebuild();
    assert.equal(f.volumes.size, 6);
    await first.destroy();
    assert.equal(f.volumes.size, 4);
    assert.equal([...f.volumes.values()].filter(volume => volume.Labels['dev.lando.storage-project'] === other.project).length, 2);
    await first.destroy();
    assert.equal(f.volumes.size, 4);
  });
  it('keeps configured users and package settings isolated between instances', async () => {
    const first = f.load();
    const second = f.load({username: 'another', uid: 1234});
    second.services[0].packages.git = true;
    assert.equal(first.services[0].packages.git, false);
    await first.start();
    assert.deepEqual(second.state, {services: {}});
  });
  it('preserves read-only mounts and exec arguments while selecting the container environment wrapper', async () => {
    fs.writeFileSync(path.join(f.root, 'readonly'), 'read only');
    fs.writeFileSync(f.file, yaml.dump({services: {web: service({mounts: ['./readonly:/read-only:ro'], command: ['sleep', 'infinity']})}}));
    const app = f.load(); await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.equal(compose.services.web.volumes.find(mount => mount.target === '/read-only').read_only, true);
    await app.exec('web', ['printf', '%s', 'a b;$HOME']);
    assert.deepEqual(f.calls.at(-1)[1], ['exec', '-T', 'web', '/etc/lando/exec.sh', 'printf', '%s', 'a b;$HOME']);
  });
  it('records health success, exhaustion and disabled state without confusing running with healthy', async () => {
    fs.writeFileSync(f.file, yaml.dump({services: {web: service({healthcheck: {command: 'test -f /healthy', retry: 2, delay: 0}})}}));
    const compose = f.engine.compose;
    let failures = 1;
    f.engine.compose = async (...args) => {
      if (args[2][0] === 'exec' && failures-- > 0) throw new Error('not ready');
      return compose(...args);
    };
    await f.load().start();
    assert.equal(f.load().getInfo().services[0].healthy, true);
    failures = 3;
    await f.load().start();
    assert.equal(f.load().getInfo().services[0].healthy, false);
    assert.equal(f.load().state.running, true);
  });
  it('generates project certificates with SANs, container trust and stable cache inputs', async () => {
    fs.writeFileSync(f.file, yaml.dump({services: {web: service({certs: true, hostnames: ['fixture.internal']})}}));
    const app = f.load(); await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    const file = compose.services.web.volumes.find(mount => mount.target === '/etc/lando/certs/cert.crt').source;
    const cert = new X509Certificate(fs.readFileSync(file));
    assert.equal(cert.checkHost('fixture.internal'), 'fixture.internal');
    assert.ok(cert.verify(new X509Certificate(fs.readFileSync(app.certificates.caCert)).publicKey));
    assert.equal(fs.statSync(file.replace(/\.crt$/, '.key')).mode & 0o777, 0o600);
    assert.match(fs.readFileSync(app.services[0].imagefile, 'utf8'), /ca-certificates/);
    f.calls.length = 0; await f.load().start();
    assert.equal(f.calls.some(call => call[0] === 'build'), false);
  });
  it('normalizes command and entrypoint strings, files, multiline scripts and image fallback', async () => {
    fs.writeFileSync(path.join(f.root, 'command.sh'), '#!/bin/sh\nexec sleep infinity\n');
    for (const command of ['sleep infinity', 'command.sh', '#!/bin/sh\nexec sleep infinity\n', ['sleep', 'infinity']]) {
      fs.writeFileSync(f.file, yaml.dump({services: {web: service({command, entrypoint: '/bin/sh -c'})}}));
      const app = f.load(); await app.start();
      const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
      assert.deepEqual(compose.services.web.command.slice(0, 2), ['/bin/sh', '-c']);
      assert.ok(compose.services.web.command.length >= 3);
      assert.ok(!compose.services.web.command.some(value => typeof value !== 'string'));
    }
  });
  it('prepares every image before any app hook and emits app-state transitions', async () => {
    fs.writeFileSync(f.file, yaml.dump({services: {one: service(), two: service()}}));
    const app = f.load(); const states = [];
    app.services[0].on('state', info => states.push(info.state.APP));
    await app.start();
    const builds = f.calls.map((call, index) => call[0] === 'build' ? index : -1).filter(index => index >= 0);
    const firstHook = f.calls.findIndex(call => call[1]?.[0] === 'run');
    assert.ok(builds.every(index => index < firstHook));
    assert.ok(states.includes('BUILDING'));
    assert.equal(states.at(-1), 'BUILT');
  });
  it('supports custom certificate destinations and disabled healthchecks', async () => {
    fs.writeFileSync(f.file, yaml.dump({services: {web: service({certs: {cert: '/custom/server.crt', key: '/custom/server.key'}, healthcheck: false})}}));
    const app = f.load(); await app.start();
    const compose = yaml.load(fs.readFileSync(app.composeFile, 'utf8'));
    assert.ok(compose.services.web.volumes.some(mount => mount.target === '/custom/server.crt'));
    assert.ok(compose.services.web.volumes.some(mount => mount.target === '/custom/server.key'));
    assert.equal(app.services[0].info.healthy, 'unknown');
    assert.equal(f.calls.some(call => call[1]?.[0] === 'exec'), false);
  });
  it('rejects API 3 and proxy or global-container escape hatches before engine activity', () => {
    for (const override of [{api: 3}, {type: 'nginx'}, {packages: {proxy: true}}, {overrides: {network_mode: 'host'}}]) {
      fs.writeFileSync(f.file, yaml.dump({services: {web: service(override)}}));
      assert.throws(() => f.load(), /Unsupported|unsupported|not supported/);
      assert.deepEqual(f.calls, []);
    }
  });
});
