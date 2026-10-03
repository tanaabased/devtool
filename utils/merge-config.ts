import { mergeArrays } from '@tanaab/merge';

import type { ConfigOrigin } from '../components/config.ts';
import { ImportArray, ImportObject, ImportScalar, ImportString } from '../lib/yaml.ts';
import clone from './clone-config.ts';

export type Provenance = Map<string, ConfigOrigin[]>;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof ImportString) &&
  !(value instanceof ImportScalar);
const scalar = (value: unknown): unknown =>
  value instanceof ImportScalar
    ? value.value
    : value instanceof ImportString
      ? String(value)
      : value;

/** Deep composition with ID-matched object arrays, scalar-array replacement and source history. */
export default function mergeConfig(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  origin: ConfigOrigin,
  provenance: Provenance,
): Record<string, unknown> {
  const clearDescendants = (keys: string[]) => {
    for (const key of provenance.keys()) {
      const segments: string[] = JSON.parse(key);
      if (segments.length > keys.length && keys.every((part, i) => part === segments[i]))
        provenance.delete(key);
    }
  };
  const merge = (
    previous: unknown,
    next: unknown,
    keys: string[],
    inherited: ConfigOrigin,
  ): unknown => {
    const metadata =
      next instanceof ImportObject ||
      next instanceof ImportString ||
      next instanceof ImportArray ||
      next instanceof ImportScalar
        ? next.getMetadata()
        : undefined;
    const current = { ...inherited, ...(metadata?.file ? { importedFrom: metadata.file } : {}) };
    delete current.importedString;
    if (next instanceof ImportString) current.importedString = true;
    const id = JSON.stringify(keys);
    provenance.set(id, [...(provenance.get(id) ?? []), current]);
    if (object(next)) {
      if (Array.isArray(previous)) {
        clearDescendants(keys);
      }
      const result = object(previous) ? clone(previous) : {};
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined) continue;
        Object.defineProperty(result, key, {
          value: merge(
            Object.hasOwn(result, key) ? result[key] : undefined,
            value,
            [...keys, key],
            current,
          ),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return next instanceof ImportObject ? new ImportObject(result, next.getMetadata()) : result;
    }
    if (Array.isArray(next)) {
      const before = Array.isArray(previous) ? previous : [];
      const keyed = [...before, ...next].some((item) => object(item) && Object.hasOwn(item, 'id'));
      if (keyed) {
        if (!Array.isArray(previous) && previous !== null && typeof previous === 'object') {
          clearDescendants(keys);
        }
        // Let the shared utility pair IDs. Merge each pair here to retain import metadata and
        // field provenance, including recursive array policies. Prefix IDs to preserve order
        // for numeric IDs and distinguish numeric IDs from strings.
        const entries = (items: unknown[], side: 'before' | 'after') => {
          const seen = new Set<string>();
          return items.map((item, index) => {
            const itemId = object(item) && Object.hasOwn(item, 'id') ? scalar(item.id) : undefined;
            if (!(
              typeof itemId === 'string' ||
              (typeof itemId === 'number' && Number.isFinite(itemId))
            ))
              throw new Error(
                `${keys.join('.')}: ID-matched arrays require a string or number id on every object`,
              );
            const id = `${typeof itemId}:${itemId}`;
            if (seen.has(id)) throw new Error(`${keys.join('.')}: duplicate array id ${itemId}`);
            seen.add(id);
            return { id, [side]: index } as { id: string; before?: number; after?: number };
          });
        };
        const pairs = mergeArrays(entries(before, 'before'), entries(next, 'after'), 'merge:id');
        const items = pairs.map((pair, index) =>
          pair.after === undefined
            ? clone(before[pair.before!])
            : merge(
                pair.before === undefined ? undefined : before[pair.before],
                next[pair.after],
                [...keys, String(index)],
                current,
              ),
        );
        return next instanceof ImportArray ? new ImportArray(items, next.getMetadata()) : items;
      }
    }
    if (previous !== null && typeof previous === 'object') {
      clearDescendants(keys);
    }
    if (Array.isArray(next)) {
      const items = next.map((value, i) => merge(undefined, value, [...keys, String(i)], current));
      return next instanceof ImportArray ? new ImportArray(items, next.getMetadata()) : items;
    }
    return scalar(next);
  };
  return merge(target, source, [], origin) as Record<string, unknown>;
}
