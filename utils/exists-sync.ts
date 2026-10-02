import type { PathLike } from 'node:fs';
import fs from 'node:fs';

/** Return false for optional config values that are not paths, without filesystem warnings. */
export default (file: unknown): file is PathLike => {
  if (typeof file !== 'string' && !Buffer.isBuffer(file) && !(file instanceof URL)) return false;
  return fs.existsSync(file);
};
