import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AppInfo } from '@tanaab/devtool';

const dataRoot = process.env.DEVTOOL_DATA_ROOT;
const cacheRoot = process.env.DEVTOOL_CACHE_ROOT;
assert.ok(dataRoot, 'Missing DEVTOOL_DATA_ROOT');
assert.ok(cacheRoot, 'Missing DEVTOOL_CACHE_ROOT');
const first: AppInfo = JSON.parse(fs.readFileSync('.results/first.json', 'utf8'));
const second: AppInfo = JSON.parse(fs.readFileSync('.results/second.json', 'utf8'));
const stateFile = (project: string) => path.join(cacheRoot, 'projects', project, 'state.json');
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

switch (process.argv[2]) {
  case 'running':
    assert.notEqual(first.project, second.project);
    assert.equal(first.running, true);
    assert.equal(second.running, true);
    assert.equal(containers(first.project).length, 1);
    assert.equal(containers(second.project).length, 1);
    fs.copyFileSync(stateFile(second.project), '.results/second-state.json');
    break;
  case 'destroyed':
    assert.equal(containers(first.project, true).length, 0);
    assert.equal(containers(second.project).length, 1);
    assert.equal(fs.existsSync(stateFile(first.project)), false);
    assert.equal(fs.existsSync(path.join(dataRoot, 'projects', first.project)), false);
    assert.deepEqual(
      fs.readFileSync(stateFile(second.project)),
      fs.readFileSync('.results/second-state.json'),
    );
    assert.ok(fs.existsSync('first/.devtool.yml'));
    assert.ok(fs.existsSync('second/.devtool.yml'));
    break;
  default:
    throw new Error('Expected running or destroyed');
}
