import fs from 'node:fs';
import path from 'node:path';

export interface AppDiscoveryOptions {
  cwd?: string;
  file?: string;
  filenames?: readonly string[];
}

/** CLI discovery policy only: explicit file or nearest ancestor, then canonical source/root. */
export default function discoverApp({
  cwd = process.cwd(),
  file,
  filenames = ['.devtool.yml', '.devtool.yaml'],
}: AppDiscoveryOptions = {}) {
  if (!filenames.length || filenames.some((name) => !name || path.basename(name) !== name))
    throw new Error('App discovery requires nonempty filenames');
  let directory = path.resolve(cwd);
  let selected = file === undefined ? undefined : path.resolve(directory, file);
  while (!selected) {
    selected = filenames
      .map((name) => path.join(directory, name))
      .find((candidate) => fs.existsSync(candidate));
    const parent = path.dirname(directory);
    if (selected || parent === directory) break;
    directory = parent;
  }
  if (!selected) throw new Error(`No app file found (${filenames.join(', ')}) from ${cwd}`);
  selected = fs.realpathSync(selected);
  if (!fs.statSync(selected).isFile()) throw new Error(`App source is not a file: ${selected}`);
  return { file: selected, root: path.dirname(selected) };
}
