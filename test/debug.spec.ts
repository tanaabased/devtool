import assert from 'node:assert/strict';
import Debug from 'debug';
import { format } from 'node:util';
import createDebug from '../lib/debug.ts';

describe('debug namespaces', () => {
  it('extends, contracts and replaces without changing the parent or global enablement', () => {
    const enabled = Debug.disable();
    try {
      Debug.enable('devtool:*');
      const parent = createDebug('devtool:services:lando');
      const child = parent.extend('build');
      assert.equal(child.namespace, 'devtool:services:lando:build');
      assert.equal(child.contract().namespace, parent.namespace);
      assert.equal(child.contract(2).namespace, 'devtool:services');
      assert.equal(child.contract(0).namespace, child.namespace);
      assert.equal(child.contract(9).namespace, '');
      assert.equal(child.replace(3, 'l337').namespace, 'devtool:services:l337:build');
      assert.equal(
        child.replace('lando', 'l337').extend('context').namespace,
        'devtool:services:l337:build:context',
      );
      assert.equal(parent.extend('build', '/').namespace, 'devtool:services:lando/build');
      assert.equal(parent.namespace, 'devtool:services:lando');
      assert.equal(child.enabled, true);
      assert.equal(Debug.disable(), 'devtool:*');
    } finally {
      Debug.enable(enabled);
    }
  });
  it('retains an injected output sink through derived loggers and honors disabled output', () => {
    const debug = createDebug('devtool:debug-test');
    const output: unknown[][] = [];
    debug.log = (...args) => output.push(args);
    const child = debug.extend('child').contract().replace('debug-test', 'sink');
    child.enabled = true;
    child('building %s', 'web');
    assert.equal(output.length, 1);
    assert.match(format(...(output[0] ?? [])), /building web/);
    child.enabled = false;
    child('hidden');
    assert.equal(output.length, 1);
    assert.throws(() => debug.replace(0, 'x'), RangeError);
    assert.throws(() => debug.replace(99, 'x'), RangeError);
    assert.throws(() => debug.contract(0.5), RangeError);
  });
});
