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
          return [...new Map([...left, ...right].map((mount) => [mount.target, mount])).values()];
        return right;
      });
  }
  return compose;
};
