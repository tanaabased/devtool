import fs from 'node:fs';

// standardize remove func
export default (path: import('node:fs').PathLike) =>
  fs.rmSync(path, { force: true, retryDelay: 201, maxRetries: 16, recursive: true });
