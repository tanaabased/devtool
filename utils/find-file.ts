import fs from 'node:fs';
import path from 'node:path';
import traverseUp from './traverse-up.ts';

export default (file: string, base = process.cwd()) =>
  traverseUp([file], path.resolve(base))
    .map((candidate) => path.join(path.dirname(candidate), file))
    .find((candidate) => fs.existsSync(candidate));
