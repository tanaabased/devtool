'use strict';
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.DEVTOOL_FIXTURE_ROOT;
const first = JSON.parse(fs.readFileSync(path.join(root, 'first.json')));
const second = JSON.parse(fs.readFileSync(path.join(root, 'second.json')));
const stateFile = path.join(process.env.DEVTOOL_CACHE_ROOT, 'projects', first.project, 'state.json');
const state = () => JSON.parse(fs.readFileSync(stateFile));
const image = () => execFileSync('docker', ['image', 'inspect', `${first.project}-web:latest`, '--format', '{{.Id}}'], {encoding: 'utf8'}).trim();
const containers = (project, all = false) => execFileSync('docker', ['ps', ...(all ? ['--all'] : []), '--quiet', '--filter', `label=com.docker.compose.project=${project}`], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
const snapshot = path.join(root, 'snapshot.json');

switch (process.argv[2]) {
  case 'info':
    assert.notEqual(first.project, second.project);
    assert.equal(first.running, true);
    assert.equal(first.services[0].state.IMAGE, 'BUILT');
    assert.equal(containers(first.project).length, 1);
    assert.equal(containers(second.project).length, 1);
    break;
  case 'snapshot': fs.writeFileSync(snapshot, JSON.stringify({image: image(), state: state()})); break;
  case 'reused': {
    const previous = JSON.parse(fs.readFileSync(snapshot));
    assert.equal(image(), previous.image);
    assert.equal(state().services.web.fingerprint, previous.state.services.web.fingerprint);
    break;
  }
  case 'stopped': assert.equal(containers(first.project).length, 0); break;
  case 'changed': {
    const previous = JSON.parse(fs.readFileSync(snapshot));
    assert.notEqual(image(), previous.image);
    assert.notEqual(state().services.web.fingerprint, previous.state.services.web.fingerprint);
    break;
  }
  case 'failed': assert.deepEqual(state().services, {}); assert.equal(state().running, false); break;
  case 'destroyed':
    assert.equal(containers(first.project, true).length, 0);
    assert.equal(fs.existsSync(stateFile), false);
    assert.equal(fs.existsSync(path.join(process.env.DEVTOOL_DATA_ROOT, 'projects', first.project)), false);
    assert.equal(fs.existsSync(path.join(root, 'first', '.devtool.yml')), true);
    assert.equal(containers(second.project).length, 1);
    break;
  default: throw new Error('Unknown lifecycle assertion');
}
