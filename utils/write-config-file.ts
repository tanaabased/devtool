import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Publish one file atomically; detect stale contents and preserve existing permissions. */
export default function writeConfigFile(
  file: string,
  text: string,
  expected: string | null,
  {
    create = false,
    io = fs,
  }: {
    create?: boolean;
    io?: Pick<
      typeof fs,
      | 'lstatSync'
      | 'readFileSync'
      | 'accessSync'
      | 'mkdirSync'
      | 'openSync'
      | 'writeFileSync'
      | 'fchmodSync'
      | 'fsyncSync'
      | 'closeSync'
      | 'linkSync'
      | 'renameSync'
      | 'rmSync'
    >;
  } = {},
): void {
  const inspect = () => {
    try {
      const stat = io.lstatSync(file);
      if (!stat.isFile())
        throw new Error(`${file}: write destination must be a regular file (no symlinks)`);
      if (io.readFileSync(file, 'utf8') !== expected)
        throw new Error(`${file}: source changed on disk; reload before writing`);
      io.accessSync(file, fs.constants.W_OK);
      return stat;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (expected !== null)
        throw new Error(`${file}: source removed; reload before writing`, { cause: error });
      if (!create)
        throw new Error(`${file}: missing destination requires create`, { cause: error });
      return undefined;
    }
  };
  const stat = inspect();
  if (!stat) io.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  const fd = io.openSync(temporary, 'wx', 0o600);
  const cleanup = () => {
    try {
      io.rmSync(temporary, { force: true });
    } catch {
      // Preserve the transaction result, including a write already published successfully.
    }
  };
  try {
    try {
      io.writeFileSync(fd, text);
      if (stat) io.fchmodSync(fd, stat.mode & 0o777);
      io.fsyncSync(fd);
    } finally {
      io.closeSync(fd);
    }
    inspect();
    // A new destination must not replace a competing creator between check and publication.
    if (stat) io.renameSync(temporary, file);
    else io.linkSync(temporary, file);
  } catch (error) {
    cleanup();
    throw error;
  }
  if (!stat) cleanup();
}
