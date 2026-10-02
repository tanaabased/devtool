import path from 'node:path';

/** List candidate filenames from the starting directory through its filesystem root. */
export default (files: string[], startsFrom: string) => {
  const candidates: string[] = [];
  let directory = path.resolve(startsFrom);
  while (true) {
    candidates.push(...files.map((file) => path.join(directory, path.basename(file))));
    const parent = path.dirname(directory);
    if (parent === directory) return candidates;
    directory = parent;
  }
};
