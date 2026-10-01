import asError from '../utils/as-error.ts';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'node_modules/.bin');
const command = path.join(directory, 'devtool');
const entrypoint = path.join(root, 'bin/devtool.ts');
fs.mkdirSync(directory, { recursive: true });
let existing;
try {
  existing = fs.lstatSync(command);
} catch (caught) {
  const error = asError(caught);
  if (error.code !== 'ENOENT') throw error;
}
if (existing) {
  const previous = path.join(root, 'bin/devtool.js');
  if (existing.isSymbolicLink() && path.resolve(directory, fs.readlinkSync(command)) === previous) {
    fs.unlinkSync(command);
    fs.symlinkSync('../../bin/devtool.ts', command);
  } else if (
    !existing.isSymbolicLink() ||
    path.resolve(directory, fs.readlinkSync(command)) !== entrypoint
  ) {
    throw new Error(`Refusing to replace an unrelated command: ${command}`);
  }
} else fs.symlinkSync('../../bin/devtool.ts', command);
