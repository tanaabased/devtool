import mergeWith from 'lodash-es/mergeWith.js';
import type { ComposeData } from '../lib/types.ts';
import type { ComposeFragment } from '../components/service.ts';

/** Merge contributions in order; arrays replace except mounts, which replace by target. */
export default (fragments: ComposeFragment[]): ComposeData => {
  const compose: ComposeData = {};
  for (const fragment of fragments) {
    for (const data of fragment.data)
      mergeWith(compose, data, (left, right, key) => {
        if (!Array.isArray(right)) return undefined;
        if (key === 'volumes' && Array.isArray(left))
          return [
            ...new Map(
              [...left, ...right].map((mount) => {
                if (typeof mount !== 'string') return [mount.target, mount];
                const parts = mount.slice(/^[A-Za-z]:[\\/]/.test(mount) ? 2 : 0).split(':');
                return [parts[1] ?? parts[0], mount];
              }),
            ).values(),
          ];
        return right;
      });
  }
  return compose;
};
