import type { ConfigOrigin } from '../components/config.ts';
import { ImportArray, ImportObject, ImportString } from '../lib/yaml.ts';
import clone from './clone-config.ts';

export type Provenance = Map<string, ConfigOrigin[]>;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof ImportString);

/** Deep object composition with whole-array replacement and per-path source history. */
export default function mergeConfig(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  origin: ConfigOrigin,
  provenance: Provenance,
): Record<string, unknown> {
  const merge = (
    previous: unknown,
    next: unknown,
    keys: string[],
    inherited: ConfigOrigin,
  ): unknown => {
    const metadata =
      next instanceof ImportObject || next instanceof ImportString || next instanceof ImportArray
        ? next.getMetadata()
        : undefined;
    const current = metadata?.file ? { ...inherited, importedFrom: metadata.file } : inherited;
    const id = JSON.stringify(keys);
    provenance.set(id, [...(provenance.get(id) ?? []), current]);
    if (object(next)) {
      if (Array.isArray(previous)) {
        for (const key of provenance.keys()) {
          const segments: string[] = JSON.parse(key);
          if (segments.length > keys.length && keys.every((part, i) => part === segments[i]))
            provenance.delete(key);
        }
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
    if (previous !== null && typeof previous === 'object') {
      for (const key of provenance.keys()) {
        const segments: string[] = JSON.parse(key);
        if (segments.length > keys.length && keys.every((part, i) => part === segments[i]))
          provenance.delete(key);
      }
    }
    if (Array.isArray(next)) {
      const items = next.map((value, i) => merge(undefined, value, [...keys, String(i)], current));
      return next instanceof ImportArray ? new ImportArray(items, next.getMetadata()) : items;
    }
    return clone(next);
  };
  return merge(target, source, [], origin) as Record<string, unknown>;
}
