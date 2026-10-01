'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture} = require('./project-fixture');

describe('downstream source consumer (#7)', () => {
  it('runs an external copy through the public package and isolated product instances', async () => {
    const f = fixture();
    try {
      fs.copyFileSync(path.join(__dirname, '../examples/consumer/index.js'), path.join(f.root, 'consumer.js'));
      fs.copyFileSync(path.join(__dirname, '../examples/consumer/.wrapper.yml'), path.join(f.root, '.wrapper.yml'));
      const compose = f.engine.compose;
      f.engine.compose = async (...args) => {
        const result = await compose(...args);
        if (args[2][0] === 'exec') result.stdout = 'consumer-proof';
        return result;
      };
      const apps = await require(path.join(f.root, 'consumer.js')).verify(path.resolve(__dirname, '..'), f.root, f.engine);
      assert.equal(apps.length, 2);
      assert.equal(f.calls.filter(call => call[0] === 'build').length, 2);
      assert.equal(apps.every(app => !fs.existsSync(app.stateFile)), true);
    } finally { f.cleanup(); }
  });
});
