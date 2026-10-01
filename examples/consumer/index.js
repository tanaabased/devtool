'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

/** A downstream wrapper consumes only the source package's public entrypoint. */
exports.createProducts = (source, root, engine) => {
  const {createDevtool} = require(source);
  return ['wrapper-one', 'wrapper-two'].map(identity => createDevtool({
    identity, commandName: `${identity}-cli`, envPrefix: identity.toUpperCase().replaceAll('-', '_'),
    appFiles: ['.wrapper.yml'], env: {}, engine,
    dataRoot: path.join(root, identity, 'data'), cacheRoot: path.join(root, identity, 'cache'),
  }));
};

exports.verify = async (source, root, engine) => {
  const runtimes = exports.createProducts(source, root, engine);
  const apps = runtimes.map(runtime => runtime.loadApp({cwd: root}));
  assert.notEqual(apps[0].project, apps[1].project);
  assert.notEqual(apps[0].stateFile, apps[1].stateFile);
  assert.equal(runtimes[0].resolveConfig().commandName, 'wrapper-one-cli');
  await apps[0].start();
  assert.deepEqual(apps[1].state, {services: {}});
  await apps[1].start();
  await apps[0].destroy();
  const result = await apps[1].exec('web', ['printf', '%s', 'consumer-proof']);
  assert.equal(result.stdout, 'consumer-proof');
  await apps[1].stop();
  await apps[1].restart();
  await apps[1].destroy();
  return apps;
};

if (require.main === module) exports.verify(path.resolve(process.argv[2]), path.resolve(process.argv[3]))
  .then(() => console.log('downstream products stayed isolated'))
  .catch(error => { console.error(error); process.exitCode = 1; });
