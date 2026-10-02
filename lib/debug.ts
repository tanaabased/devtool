import Debug from 'debug';
import type { Debugger as BaseDebugger } from 'debug';

export interface Debugger extends BaseDebugger {
  extend(namespace: string, delimiter?: string): Debugger;
  /** Remove namespace segments; zero leaves the namespace intact. */
  contract(size?: number): Debugger;
  /** Replace a literal substring or a one-based namespace segment. */
  replace(segment: string | number, replacement: string): Debugger;
}

/** A debug-compatible logger with reversible namespace helpers. No global configuration changes. */
export default function createDebug(namespace: string): Debugger {
  const debug = Debug(namespace) as Debugger;
  const child = (name: string) => {
    const next = createDebug(name);
    next.log = debug.log;
    return next;
  };
  debug.extend = (suffix, delimiter = ':') => child(`${debug.namespace}${delimiter}${suffix}`);
  debug.contract = (size = 1) => {
    if (!Number.isInteger(size)) throw new RangeError('Namespace depth must be an integer');
    return child(
      size === 0 ? debug.namespace : debug.namespace.split(':').slice(0, -Math.abs(size)).join(':'),
    );
  };
  debug.replace = (segment, replacement) => {
    if (typeof segment === 'string') return child(debug.namespace.replace(segment, replacement));
    const parts = debug.namespace.split(':');
    if (!Number.isInteger(segment) || segment < 1 || segment > parts.length)
      throw new RangeError('Namespace segment is out of range');
    parts[segment - 1] = replacement;
    return child(parts.join(':'));
  };
  return debug;
}
