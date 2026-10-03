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

describe('invocation debug filters', () => {
  it('does not let a failed diagnostic sink change operation outcomes', () => {
    const debug = createDebug('devtool:config', {
      namespaces: 'devtool:*',
      log() {
        throw new Error('closed diagnostic stream');
      },
    });
    assert.doesNotThrow(() => debug('write succeeded'));
    assert.doesNotThrow(() => debug.extend('child')('write succeeded'));
  });
  it('inherits sinks, reevaluates child namespaces and leaves global state alone', () => {
    const before = process.env.DEBUG;
    const outside = createDebug('unrelated:consumer');
    const enabled = outside.enabled;
    const lines: unknown[][] = [];
    const debug = createDebug('devtool:cli', {
      namespaces: 'devtool:*,-devtool:cli:quiet',
      log: (...args) => lines.push(args),
    });
    debug('visible');
    debug.extend('quiet')('hidden');
    debug.extend('other')('visible');
    debug.replace(1, 'other')('hidden');
    assert.equal(lines.length, 2);
    assert.equal(process.env.DEBUG, before);
    assert.equal(outside.enabled, enabled);
    const quiet = createDebug('devtool:cli', {
      namespaces: '',
      log: (...args) => lines.push(args),
    });
    quiet.extend('other')('hidden');
    assert.equal(lines.length, 2);
  });
});
