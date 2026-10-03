import type { MountInput } from '../../../components/service.ts';
import fs from 'node:fs';
import path from 'node:path';

// checks to see if dir is being mounted
export default (dir: string, volumes: MountInput[] = []) => {
  const root = fs.realpathSync(dir);
  return (
    volumes
      // filter out non string bind mounts
      .filter(
        (volume): volume is string =>
          typeof volume === 'string' && [2, 3].includes(volume.split(':').length),
      )
      // parse into object format
      .map((volume) => {
        const [source = '', target = ''] = volume.split(':');
        return { source, target };
      })
      // translate relative paths
      .map((volume) => ({
        source: !path.isAbsolute(volume.source) ? path.resolve(dir, volume.source) : volume.source,
        target: volume.target,
      }))
      // filter sources that dont exist and are not the appRoot
      .filter((volume) => fs.existsSync(volume.source) && fs.realpathSync(volume.source) === root)
      // map to the target
      .map((volume) => volume.target)
  );
};
