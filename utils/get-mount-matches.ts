import type { MountInput } from '../lib/types.ts';
import fs from 'node:fs';
import path from 'node:path';

// checks to see if dir is being mounted
export default (dir: string, volumes: MountInput[] = []) =>
  volumes
    // filter out non string bind mounts
    .filter(
      (volume): volume is string =>
        typeof volume === 'string' && [2, 3].includes(volume.split(':').length),
    )
    // parse into object format
    .map((volume) => ({ source: volume.split(':')[0], target: volume.split(':')[1] }))
    // translate relative paths
    .map((volume) => ({
      source: !path.isAbsolute(volume.source) ? path.resolve(dir, volume.source) : volume.source,
      target: volume.target,
    }))
    // filter sources that dont exist and are not the appRoot
    .filter((volume) => fs.existsSync(volume.source) && volume.source === dir)
    // map to the target
    .map((volume) => volume.target);
