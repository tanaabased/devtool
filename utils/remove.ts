import type { PathLike } from 'node:fs';
import fs from 'node:fs';

// standardize remove func
export default (path: PathLike) =>
  fs.rmSync(path, { force: true, retryDelay: 201, maxRetries: 16, recursive: true });
