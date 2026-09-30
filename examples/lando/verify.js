'use strict';
const assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {X509Certificate} = require('node:crypto');
const yaml = require('js-yaml');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Container assertions run only in disposable CI');
const source = path.resolve(__dirname, '../..');
const root = path.join(process.env.DEVTOOL_FIXTURE_ROOT, 'lando');
const file = path.join(root, '.devtool.yml');
const cli = (...args) => {
  const result = spawnSync(process.execPath, [path.join(source, 'bin/devtool.js'), '--file', file, ...args], {encoding: 'utf8', timeout: 240000});
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
};
const exec = (service, ...args) => cli('exec', service, '--', ...args);
const info = () => JSON.parse(cli('info', '--json'));
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8'}).trim();
const snapshot = path.join(root, 'snapshot.json');
const project = () => info().project;
const state = () => JSON.parse(fs.readFileSync(path.join(process.env.DEVTOOL_CACHE_ROOT, 'projects', project(), 'state.json')));
const edit = fn => { const data = yaml.load(fs.readFileSync(file, 'utf8')); fn(data); fs.writeFileSync(file, yaml.dump(data)); };
const fail = args => {
  const result = spawnSync(process.execPath, [path.join(source, 'bin/devtool.js'), '--file', file, ...args], {encoding: 'utf8', timeout: 240000});
  fs.writeFileSync(path.join(root, 'failure.log'), result.stderr + result.stdout);
  assert.notEqual(result.status, 0);
  assert.deepEqual(state().services, {});
  assert.equal(state().running, false);
  return result.status;
};
switch (process.argv[2]) {
  case 'setup':
    assert.ok(process.env.DEVTOOL_FIXTURE_ROOT);
    fs.mkdirSync(root, {recursive: true});
    for (const name of ['.devtool.yml', 'readonly', 'copied', 'app.sh']) fs.copyFileSync(path.join(__dirname, name), path.join(root, name));
    fs.chmodSync(path.join(root, 'app.sh'), 0o755);
    break;
  case 'start':
    cli('start');
    assert.equal(info().services.find(service => service.service === 'web').healthy, true);
    assert.equal(info().services.every(service => service.state.IMAGE === 'BUILT' && service.state.APP === 'BUILT'), true);
    assert.equal(exec('web', 'id', '-u'), String(process.getuid()));
    assert.equal(exec('web', 'id', '-g'), String(process.getgid()));
    assert.equal(exec('web', 'pwd'), '/app');
    assert.equal(exec('web', 'cat', '/copied'), 'copied');
    assert.equal(exec('web', 'cat', '/read-only'), 'read only');
    exec('web', 'sh', '-c', '! printf overwritten > /read-only');
    assert.equal(exec('web', 'cat', '/read-only'), 'read only');
    assert.equal(exec('web', 'cat', '/app/app-proof'), 'app');
    for (let i = 0; i < 30 && !fs.existsSync(path.join(root, 'entrypoint-proof')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    assert.equal(fs.readFileSync(path.join(root, 'entrypoint-proof'), 'utf8').trim(), 'entrypoint');
    assert.match(exec('web', 'git', '--version'), /git version/);
    assert.equal(exec('web', 'sudo', '-n', 'id', '-u'), '0');
    assert.equal(exec('web', 'printenv', 'LANDO_CA_BUNDLE'), '/etc/ssl/certs/ca-certificates.crt');
    const cert = new X509Certificate(exec('web', 'cat', '/etc/lando/certs/cert.crt'));
    assert.ok(cert.checkHost(`web.${project()}.internal`));
    assert.ok(cert.verify(new X509Certificate(fs.readFileSync(path.join(process.env.DEVTOOL_DATA_ROOT, 'projects', project(), 'certs', 'ca.crt'))).publicKey));
    assert.ok(exec('web', 'cat', '/etc/ssl/certs/ca-certificates.crt').includes(fs.readFileSync(path.join(process.env.DEVTOOL_DATA_ROOT, 'projects', project(), 'certs', 'ca.crt'), 'utf8').trim()));
    assert.equal(exec('web', 'printf', '%s', 'a b;$HOME'), 'a b;$HOME');
    assert.equal(exec('web', 'stat', '-c', '%u:%g', '/data'), `${process.getuid()}:${process.getgid()}`);
    assert.equal(exec('web', 'stat', '-c', '%a', '/shared'), '770');
    exec('web', 'sh', '-c', 'echo shared > /shared/value; echo global > /global/value; echo persisted > /data/value');
    assert.equal(exec('peer', 'cat', '/shared/value'), 'shared');
    fs.writeFileSync(snapshot, JSON.stringify({image: docker('image', 'inspect', `${project()}-web:latest`, '--format', '{{.Id}}'), state: state(), project: project()}));
    break;
  case 'cache':
    cli('start');
    assert.equal(exec('web', 'cat', '/app/app-proof'), 'app');
    assert.equal(docker('image', 'inspect', `${project()}-web:latest`, '--format', '{{.Id}}'), JSON.parse(fs.readFileSync(snapshot)).image);
    cli('stop'); cli('restart');
    assert.equal(exec('web', 'cat', '/data/value'), 'persisted');
    assert.equal(exec('web', 'cat', '/app/app-proof'), 'app');
    cli('rebuild');
    assert.equal(exec('web', 'cat', '/data/value'), 'persisted');
    assert.equal(exec('web', 'cat', '/app/app-proof'), 'app\napp');
    break;
  case 'failures':
    fs.writeFileSync(path.join(root, 'app.sh'), '#!/bin/sh\nexit 19\n');
    assert.equal(fail(['start']), 19);
    fs.copyFileSync(path.join(__dirname, 'app.sh'), path.join(root, 'app.sh'));
    cli('start');
    const original = fs.readFileSync(file);
    edit(data => { data.services.web.build.image = 'exit 23'; });
    fail(['rebuild']);
    fs.writeFileSync(file, original);
    cli('start');
    const result = spawnSync(process.execPath, [path.join(source, 'bin/devtool.js'), '--file', file, 'exec', 'web', '--', 'sh', '-c', 'exit 17']);
    assert.equal(result.status, 17);
    break;
  case 'destroy': {
    const id = project();
    cli('destroy'); cli('destroy');
    assert.equal(docker('ps', '-aq', '--filter', `label=com.docker.compose.project=${id}`), '');
    assert.equal(docker('volume', 'ls', '-q', '--filter', `label=dev.lando.storage-project=${id}`), '');
    assert.ok(fs.existsSync(file));
    assert.equal(fs.existsSync(path.join(process.env.DEVTOOL_CACHE_ROOT, 'projects', id)), false);
    const globals = docker('volume', 'ls', '-q', '--filter', 'label=dev.lando.storage-scope=global').split('\n').filter(Boolean);
    assert.ok(globals.length > 0);
    cli('start');
    assert.equal(exec('web', 'cat', '/global/value'), 'global');
    exec('web', 'sh', '-c', '! test -f /data/value');
    cli('destroy');
    break;
  }
  default: throw new Error('Unknown Lando assertion');
}
console.log(`Lando assertion passed: ${process.argv[2]}`);
