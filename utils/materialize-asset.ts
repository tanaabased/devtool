import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Restore exact executable bytes atomically, without rewriting an unchanged asset. */
export default (source: string, destination: string) => {
  const bytes = fs.readFileSync(source);
  try {
    const stat = fs.lstatSync(destination);
    if (
      stat.isFile() &&
      (stat.mode & 0o777) === 0o755 &&
      fs.readFileSync(destination).equals(bytes)
    )
      return destination;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o755 });
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return destination;
};
