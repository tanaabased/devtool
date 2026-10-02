import type L337Service from '../services/l337/l337.ts';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Hash actual build inputs; generated project storage is never an input. */
export default (service: L337Service, excluded: string[] = []) => {
  const hash = createHash('sha256');
  excluded = excluded.map((root) =>
    fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root),
  );
  const visiting = new Set();
  const add = (value: unknown) => hash.update(JSON.stringify(value));
  const visit = (file: string, explicit = false) => {
    const real = fs.realpathSync(file);
    if (
      !explicit &&
      excluded.some((root) => real === root || real.startsWith(`${root}${path.sep}`))
    )
      return;
    if (visiting.has(real)) throw new Error(`Circular build context at ${file}`);
    visiting.add(real);
    const stat = fs.statSync(real);
    add([file, stat.mode & 0o777]);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(real).sort()) visit(path.join(file, name));
    } else if (stat.isFile()) hash.update(fs.readFileSync(real));
    visiting.delete(real);
  };
  const context = service.generateBuildContext();
  add({
    config: service.sourceConfig ?? service.config,
    args: context.buildArgs,
    buildkit: service.buildkit,
  });
  hash.update(fs.readFileSync(context.imagefile));
  for (const source of context.sources) {
    add(source);
    visit(source.source, true);
  }
  // An image reference that changes remotely is refreshed by explicit rebuild.
  return hash.digest('hex');
};
