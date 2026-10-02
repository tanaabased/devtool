import type { BuildSource } from '../../../components/engine.ts';
import fs from 'fs-extra';
import path from 'node:path';

/** Stage source contents without recursing into generated storage or escaping the build context. */
export default ({ source, target }: BuildSource, context: string, excluded: string[] = []) => {
  const destination = path.join(context, target);
  const relative = path.relative(context, destination);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Build context destination escapes its directory: ${target}`);
  }
  const roots = excluded.map((root) =>
    fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root),
  );
  const visiting = new Set();
  const copy = (from: string, to: string, explicit = false) => {
    const real = fs.realpathSync(from);
    if (!explicit && roots.some((root) => real === root || real.startsWith(`${root}${path.sep}`)))
      return;
    if (visiting.has(real)) throw new Error(`Circular build context at ${from}`);
    const stat = fs.statSync(real);
    if (stat.isDirectory()) {
      visiting.add(real);
      fs.mkdirSync(to, { recursive: true, mode: stat.mode });
      for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
      visiting.delete(real);
    } else fs.copySync(from, to, { dereference: true });
  };
  copy(source, destination, true);
};
