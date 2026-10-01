'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'node_modules/.bin');
const command = path.join(directory, 'devtool');
const entrypoint = path.join(root, 'bin/devtool.js');
fs.mkdirSync(directory, {recursive: true});
let existing;
try { existing = fs.lstatSync(command); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  if (!existing.isSymbolicLink() || path.resolve(directory, fs.readlinkSync(command)) !== entrypoint) {
    throw new Error(`Refusing to replace an unrelated command: ${command}`);
  }
} else fs.symlinkSync('../../bin/devtool.js', command);
