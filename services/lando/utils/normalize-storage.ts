import type { Mount, MountInput, ServiceUser } from '../../../components/service.ts';
import type L337Service from '../../l337/l337.ts';
import isObject from 'lodash-es/isPlainObject.js';
import kebabCase from 'lodash-es/kebabCase.js';
import merge from 'lodash-es/merge.js';
import toPosixPath from '../../../utils/to-posix-path.ts';

export default (
  volumes: MountInput[] = [],
  {
    _data,
    appRoot,
    id,
    normalizeVolumes,
    project,
    storageNamespace,
    user,
  }: Pick<L337Service, '_data' | 'appRoot' | 'id' | 'normalizeVolumes' | 'project'> & {
    storageNamespace: string;
    user: ServiceUser;
  },
): Mount[] => {
  return volumes.map((volume) => {
    // if volume is a single string then its either a bind mount
    if (typeof volume === 'string' && toPosixPath(volume).split(':').length > 1) {
      const [normalized] = normalizeVolumes.bind({ _data, appRoot })([volume]);
      if (normalized !== undefined) volume = normalized;

      // or a service scoped volume
    } else if (typeof volume === 'string' && toPosixPath(volume).split(':').length === 1) {
      volume = { type: 'volume', destination: volume, scope: 'service' };
    }

    if (typeof volume === 'string') throw new Error('Invalid storage volume');

    // is a volume object and we can rebase on defaults
    if (isObject(volume) && volume.type !== 'bind') {
      // permit dest instead of destination
      if (volume.dest && !volume.destination) volume.destination = volume.dest;
      // remove dest if we have destination for cleanliness purposes
      if (volume.destination && volume.dest) delete volume.dest;
      // add the volume scope is scope if unset
      if (!volume.scope) volume.scope = 'service';

      // merge basics
      volume = merge(
        {},
        {
          owner: volume.user ?? user.name ?? 'root',
          permissions: volume.permissions ?? volume.perms,
          source: volume.source,
          scope: volume.scope,
          target: volume.target ?? volume.destination,
          type: 'volume',
          labels: {},
        },
        volume,
      );

      // cleanup props a bit
      delete volume.destination;

      // if the dont have a source that means we are not referencing an already created volume and need to create one
      if (!volume.source) {
        // give it a name based on scope and target
        if (volume.scope === 'global')
          volume.source = `${storageNamespace}-${kebabCase(volume.target ?? '')}`;
        else if (volume.scope === 'project')
          volume.source = `${project}-${kebabCase(volume.target ?? '')}`;
        else if (volume.scope === 'app')
          volume.source = `${project}-${kebabCase(volume.target ?? '')}`;
        else volume.source = `${project}-${id}-${kebabCase(volume.target ?? '')}`;

        // we also add labels here because we only want to set labels with the FIRST service that creates the volume
        volume.labels!['dev.lando.storage-volume'] = 'TRUE';
        volume.labels!['dev.lando.storage-scope'] = volume.scope ?? 'service';
        volume.labels!['dev.devtool.storage-owner'] = storageNamespace;

        // for non-global mounets lets add additional labels so we know which service should remove which volumes
        if (volume.scope !== 'global') {
          volume.labels!['dev.lando.storage-project'] = project;
          volume.labels!['dev.lando.storage-service'] = id;
        }
      }
    }

    if (!['service', 'app', 'project', 'global'].includes(volume.scope ?? 'service'))
      throw new Error(`Unsupported storage scope: ${volume.scope}`);
    volume.id = volume.source;
    return volume as Mount;
  });
};
