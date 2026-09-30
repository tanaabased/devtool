'use strict';

const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Hash actual build inputs; generated project storage is never an input. */
module.exports = (service, excluded = []) => {
  const hash = createHash('sha256');
  excluded = excluded.map(root => fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root));
  const visiting = new Set();
  const add = value => hash.update(JSON.stringify(value));
  const visit = file => {
    const real = fs.realpathSync(file);
    if (excluded.some(root => real === root || real.startsWith(`${root}${path.sep}`))) return;
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
  add({config: service.config, args: context.buildArgs, buildkit: service.buildkit});
  hash.update(fs.readFileSync(context.imagefile));
  for (const source of context.sources) { add(source); visit(source.source); }
  // An image reference that changes remotely is refreshed by explicit rebuild.
  return hash.digest('hex');
};
