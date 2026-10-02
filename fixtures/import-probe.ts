import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

assert.ok(process.versions.bun, 'the source import probe must run under Bun');

const load = yaml.load;
const forbid = () => {
  throw new Error('library import attempted a host side effect');
};
for (const method of [
  'writeFileSync',
  'writeFile',
  'mkdirSync',
  'mkdir',
  'rmSync',
  'rm',
  'unlinkSync',
  'unlink',
]) {
  Reflect.set(fs, method, forbid);
  if (Reflect.has(fs.promises, method)) Reflect.set(fs.promises, method, forbid);
}
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
  Reflect.set(childProcess, method, forbid);
net.connect = net.createConnection = http.request = https.request = forbid;
Reflect.set(globalThis, 'fetch', forbid);
const read = fs.readFileSync;
const source = process.argv[2];
assert.ok(source && path.isAbsolute(source), 'provide an absolute permitted read directory');
const permitted = path.resolve(source) + path.sep;
fs.readFileSync = new Proxy(read, {
  apply(target, receiver, args: Parameters<typeof read>) {
    const [file] = args;
    if (typeof file !== 'string' || !path.resolve(file).startsWith(permitted)) forbid();
    return Reflect.apply(target, receiver, args);
  },
});
os.homedir = os.userInfo = forbid;
process.exit = forbid;
process.argv.push('--version', '--unknown-consumer-option');
const argv = [...process.argv];
const exitCode = process.exitCode;
const listeners = EventEmitter.defaultMaxListeners;

const { createDevtool } = await import('@tanaab/devtool');
const runtime = createDevtool({ identity: 'consumer' });
assert.equal(runtime.identity, 'consumer');
assert.deepEqual(process.argv, argv);
assert.equal(process.exitCode, exitCode);
assert.equal(EventEmitter.defaultMaxListeners, listeners);
assert.equal(yaml.load, load);
console.log('import stayed inert; consumer continued');
