'use strict';
const assert = require('node:assert/strict');
const {spawn, execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'run container measurements only in disposable CI');
assert.ok(process.versions.bun, 'measure the Bun source CLI');
const root = process.env.DEVTOOL_FIXTURE_ROOT;
const info = JSON.parse(fs.readFileSync(path.join(root, 'first.json')));
const file = path.join(root, 'first', '.devtool.yml');
const compose = path.join(process.env.DEVTOOL_DATA_ROOT, 'projects', info.project, 'compose.yml');
const trace = path.join(root, 'dispatch-time');
// Container is already running. Its delayed second line proves streaming before exit.
const command = ['sh', '-c', 'echo devtool-first-output; sleep 1; echo devtool-finished'];
const dockerArgs = ['compose', '--project-name', info.project, '--file', compose, 'exec', '-T', 'web', ...command];
const cliArgs = ['--preload', path.join(__dirname, 'trace-dispatch.js'),
  path.join(__dirname, '../../bin/devtool.js'), '--file', file, 'exec', 'web', '--', ...command];
const ms = time => Number(time) / 1e6;

function measure(target) {
  return new Promise((resolve, reject) => {
    fs.rmSync(trace, {force: true});
    const start = process.hrtime.bigint();
    const child = spawn(target === 'source' ? process.execPath : 'docker', target === 'source' ? cliArgs : dockerArgs,
      {env: {...process.env, DEVTOOL_DISPATCH_TRACE: trace}, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', first, final;
    child.stdout.on('data', data => {
      stdout += data;
      if (first === undefined && stdout.includes('devtool-first-output')) first = process.hrtime.bigint();
      if (final === undefined && stdout.includes('devtool-finished')) final = process.hrtime.bigint();
    });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => {
      try {
        assert.equal(code, 0, stderr);
        assert.ok(first !== undefined && final !== undefined, stdout);
        assert.ok(first < final, 'first output must arrive before the delayed final output');
        const dispatch = target === 'source' ? BigInt(fs.readFileSync(trace, 'utf8')) : start;
        assert.ok(dispatch >= start && dispatch < first, 'dispatch must precede useful output');
        resolve({dispatchMs: ms(dispatch - start), firstOutputMs: ms(first - start),
          dispatchToOutputMs: ms(first - dispatch), commandMs: ms(final - first)});
      } catch (error) { reject(error); }
    });
  });
}

const quantiles = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return {median: (sorted[4] + sorted[5]) / 2, p95: sorted[9]};
};

async function main() {
  const initial = {source: await measure('source'), directDocker: await measure('docker')};
  const samples = {source: [], directDocker: []};
  for (let i = 0; i < 10; i++) {
    // Alternate order to limit systematic effects from runner or engine load.
    for (const target of i % 2 ? ['docker', 'source'] : ['source', 'docker']) {
      samples[target === 'source' ? 'source' : 'directDocker'].push(await measure(target));
    }
  }
  const warm = Object.fromEntries(Object.entries(samples).map(([target, rows]) =>
    [target, Object.fromEntries(Object.keys(rows[0]).map(key => [key, quantiles(rows.map(row => row[key]))]))]));
  const report = {bun: process.versions.bun, platform: process.platform, arch: process.arch,
    docker: execFileSync('docker', ['version', '--format', '{{.Client.Version}}'], {encoding: 'utf8'}).trim(),
    conditions: 'Already-running container; initial measured invocation then ten repetitions, each a fresh process. OS caches are not flushed. Source dispatch has a CI-only timestamp write; direct dispatch starts at spawn.',
    initial, warm, samples};
  const output = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(root, 'exec-latency.json'), output + '\n');
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\n### Bun source exec baseline\n\n```json\n' + JSON.stringify({initial, warm}, null, 2) + '\n```\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
