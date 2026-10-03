import type Config from '../lib/config.ts';
import { ImportString } from '../lib/yaml.ts';

/** Restore imported text for existing service consumers, without tagging ordinary image names. */
export default function configInputData<T extends object>(config: Config<T>): T {
  const visit = (value: unknown, keys: string[]): unknown => {
    if (typeof value === 'string') {
      const origin = config.explain(keys).winner;
      if (origin?.importedString && origin.importedFrom)
        return new ImportString(value, { file: origin.importedFrom });
    }
    if (Array.isArray(value)) return value.map((item, i) => visit(item, [...keys, String(i)]));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, visit(item, [...keys, key])]),
      );
    return value;
  };
  return visit(config.compile().values, []) as T;
}
