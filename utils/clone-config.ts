import { ImportArray, ImportObject, ImportString } from '../lib/yaml.ts';

/** Copy caller-owned data, including import contents and their source metadata. */
const clone = <T>(value: T, seen = new Map<object, unknown>()): T => {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (value instanceof ImportString)
    return new ImportString(String(value), value.getMetadata()) as T;
  const result =
    value instanceof ImportArray
      ? new ImportArray([], value.getMetadata())
      : value instanceof ImportObject
        ? new ImportObject({}, value.getMetadata())
        : Array.isArray(value)
          ? []
          : {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value))
    Object.defineProperty(result, key, {
      value: clone(item, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return result as T;
};
export default clone;
