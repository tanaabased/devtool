import type { ConfigOrigin } from '../components/config.ts';
import type Config from '../lib/config.ts';

/** Report later winners for the saved fields, excluding unrelated siblings in merged objects. */
export default function maskedConfigOrigins(
  config: Config<object>,
  source: string,
  keys: string[],
  saved: unknown,
): ConfigOrigin[] {
  const sources = config.sources;
  const target = sources.findIndex(({ id }) => id === source);
  const origins: ConfigOrigin[] = [];
  const winnerAt = (path: string[]) => {
    // A higher ancestor replacement can remove the requested leaf altogether.
    let current = path;
    while (current.length && config.get(current) === undefined) current = current.slice(0, -1);
    const winner = config.explain(current).winner;
    if (
      winner &&
      sources.findIndex(({ id }) => id === winner.source) > target &&
      !origins.some(
        (origin) => origin.source === winner.source && origin.importedFrom === winner.importedFrom,
      )
    )
      origins.push(winner);
  };
  const visit = (value: unknown, path: string[]) => {
    const effective = config.get(path);
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length
    ) {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    } else if (
      Array.isArray(value) &&
      value.length &&
      value.every((item) => item !== null && typeof item === 'object' && Object.hasOwn(item, 'id'))
    ) {
      for (const item of value) {
        const index = Array.isArray(effective)
          ? effective.findIndex((entry) => entry?.id === item.id)
          : -1;
        if (index < 0) winnerAt(path);
        else visit(item, [...path, String(index)]);
      }
    } else winnerAt(path);
  };
  visit(saved, keys);
  return origins;
}
