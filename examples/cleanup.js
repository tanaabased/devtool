'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createDevtool} = require('../lib/devtool');
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Cleanup is CI-only');
const root = process.env.DEVTOOL_FIXTURE_ROOT;
if (!root) throw new Error('Missing fixture root');
(async () => {
  const failures = [];
  const clean = async app => {
    try { await app.destroy(); } catch (error) { failures.push(error); }
  };
  if (!process.argv[2] || process.argv[2] === 'consumer') {
    const directory = path.join(root, 'consumer');
    if (fs.existsSync(path.join(directory, '.wrapper.yml'))) {
      for (const runtime of require('./consumer').createProducts(path.resolve(__dirname, '..'), directory)) await clean(runtime.loadApp({cwd: directory}));
    }
  }
  if (!process.argv[2]) {
    for (const name of ['first', 'second', 'lando']) {
      const directory = path.join(root, name);
      if (!fs.existsSync(path.join(directory, '.devtool.yml'))) continue;
      const app = createDevtool().loadApp({cwd: directory});
      await clean(app);
      // Product-global volumes deliberately survive destroy; the disposable fixture owns this namespace.
      const volumes = execFileSync('docker', ['volume', 'ls', '-q', '--filter', `label=dev.devtool.storage-owner=${app.storageNamespace}`], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
      for (const volume of volumes) execFileSync('docker', ['volume', 'rm', volume], {stdio: 'inherit'});
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Fixture cleanup failed');
})().catch(error => { console.error(error); process.exitCode = 1; });
