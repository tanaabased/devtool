const cacheRoot = process.env.DEVTOOL_CACHE_ROOT;
assert.ok(cacheRoot, 'Missing DEVTOOL_CACHE_ROOT');
const dataRoot = process.env.DEVTOOL_DATA_ROOT;
assert.ok(dataRoot, 'Missing DEVTOOL_DATA_ROOT');
const fixtureRoot = process.env.DEVTOOL_FIXTURE_ROOT;
assert.ok(fixtureRoot, 'Missing DEVTOOL_FIXTURE_ROOT');
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = fixtureRoot;
const first = JSON.parse(fs.readFileSync(path.join(root, 'first.json'), 'utf8'));
const second = JSON.parse(fs.readFileSync(path.join(root, 'second.json'), 'utf8'));
const stateFile = path.join(cacheRoot, 'projects', first.project, 'state.json');
const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const image = () =>
  execFileSync(
    'docker',
    ['image', 'inspect', `${first.project}-web:latest`, '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  ).trim();
const containers = (project: string, all = false) =>
  execFileSync(
    'docker',
    [
      'ps',
      ...(all ? ['--all'] : []),
      '--quiet',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
const snapshot = path.join(root, 'snapshot.json');

switch (process.argv[2]) {
  case 'info':
    assert.notEqual(first.project, second.project);
    assert.equal(first.running, true);
    assert.equal(first.services[0].state.IMAGE, 'BUILT');
    assert.equal(containers(first.project).length, 1);
    assert.equal(containers(second.project).length, 1);
    break;
  case 'snapshot':
    fs.writeFileSync(snapshot, JSON.stringify({ image: image(), state: state() }));
    break;
  case 'reused': {
    const previous = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
    assert.equal(image(), previous.image);
    assert.equal(state().services.web.fingerprint, previous.state.services.web.fingerprint);
    break;
  }
  case 'stopped':
    assert.equal(containers(first.project).length, 0);
    break;
  case 'changed': {
    const previous = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
    assert.notEqual(image(), previous.image);
    assert.notEqual(state().services.web.fingerprint, previous.state.services.web.fingerprint);
    break;
  }
  case 'failed':
    assert.deepEqual(state().services, {});
    assert.equal(state().running, false);
    break;
  case 'destroyed':
    assert.equal(containers(first.project, true).length, 0);
    assert.equal(fs.existsSync(stateFile), false);
    assert.equal(fs.existsSync(path.join(dataRoot, 'projects', first.project)), false);
    assert.equal(fs.existsSync(path.join(root, 'first', '.devtool.yml')), true);
    assert.equal(containers(second.project).length, 1);
    break;
  default:
    throw new Error('Unknown lifecycle assertion');
}
