import camelCase from 'lodash-es/camelCase.js';
import kebabCase from 'lodash-es/kebabCase.js';
import { type Document, isAlias, isMap, isScalar, isSeq, visit } from 'yaml';

import type { ConfigEdit, ConfigSchema } from '../components/config.ts';
import clone from './clone-config.ts';
import normalize from './normalize-config.ts';
import validate from './validate-config.ts';

/** Edit a detached source document. Never follow aliases/imports or rewrite sibling keys. */
export default function editConfigDocument(
  input: Document,
  edits: readonly ConfigEdit[],
  schema: ConfigSchema,
  {
    select = [],
    force = false,
    app = false,
  }: {
    select?: readonly string[];
    force?: boolean;
    app?: boolean;
  } = {},
): Document {
  const document = input.clone();
  visit(document, {
    Scalar(_key, node) {
      node.value = clone(node.value);
    },
  });
  const field = (node: ConfigSchema, key: string) => {
    const entry = Object.entries(node.properties ?? {}).find(
      ([name]) => key === camelCase(name) || key === kebabCase(name),
    );
    return entry
      ? {
          schema: entry[1],
          key: kebabCase(entry[0]),
          aliases: [camelCase(entry[0]), kebabCase(entry[0])],
        }
      : { schema: node.items ?? node.values ?? {}, key, aliases: [key] };
  };
  const guard = (node: ConfigSchema, location: string, appInput: boolean) => {
    if (appInput && node.protected)
      throw new Error(`${location}: protected setting cannot be supplied by an app`);
    if (!force && (node.protected || node.writeProtected))
      throw new Error(`${location}: protected write requires force`);
  };
  const guardTree = (
    value: unknown,
    node: ConfigSchema,
    location: string,
    appInput: boolean,
  ): void => {
    appInput ||= Boolean(node.app);
    guard(node, location, appInput);
    if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        guardTree(child, field(node, key).schema, `${location}.${key}`, appInput);
  };
  const traversable = (keys: readonly string[], leaf = false) => {
    const node = document.getIn(keys, true);
    if (isAlias(node) || (node && typeof node === 'object' && 'anchor' in node && node.anchor))
      throw new Error(
        `${keys.join('.')}: edit crosses an alias or anchor; select an independent source value`,
      );
    if (!leaf && node !== undefined && !isMap(node) && !isSeq(node))
      throw new Error(
        `${keys.join('.')}: cannot edit through a scalar or import; select a source-local value`,
      );
  };
  const serializable = (value: unknown): void => {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value)))
      throw new Error('Edit values must not contain undefined or non-finite numbers');
    if (value && typeof value === 'object')
      for (const child of Array.isArray(value) ? value : Object.values(value)) serializable(child);
  };
  for (const edit of edits) {
    const keys = typeof edit.path === 'string' ? edit.path.split('.') : [...edit.path];
    if (!keys.length || keys.some((key) => !key)) throw new Error('Edit requires a nonempty path');
    let node = schema;
    let appInput = app || Boolean(node.app);
    const actual = [...select];
    for (let i = 0; i <= actual.length; i++) traversable(actual.slice(0, i));
    for (const [index, key] of keys.entries()) {
      guard(node, actual.join('.'), appInput);
      traversable(actual);
      const next = field(node, key);
      const parent = document.getIn(actual, true);
      const matches = isMap(parent)
        ? parent.items.filter(
            (pair) => isScalar(pair.key) && next.aliases.includes(String(pair.key.value)),
          )
        : [];
      if (matches.length > 1) throw new Error(`${key}: ambiguous key`);
      const existing = matches[0]?.key;
      const spelling = isScalar(existing) ? String(existing.value) : next.key;
      actual.push(spelling);
      node = next.schema;
      appInput ||= Boolean(node.app);
      if (index < keys.length - 1) continue;
      traversable(actual, true);
      const oldValue = actual.reduce<unknown>(
        (value, key) =>
          value && typeof value === 'object' && Object.hasOwn(value, key)
            ? (value as Record<string, unknown>)[key]
            : undefined,
        document.toJS(),
      );
      guardTree(oldValue, node, actual.join('.'), appInput);
      if (edit.op === 'delete') {
        document.deleteIn(actual);
        continue;
      }
      if (edit.value === undefined) throw new Error(`${key}: use delete instead of undefined`);
      const value = normalize(edit.value, node, { external: true, app: appInput });
      serializable(value);
      guardTree(value, node, actual.join('.'), appInput);
      validate(normalize(value, node), node, actual.join('.'));
      // A changed schema key is serialized canonically; unrelated spellings are untouched.
      if (isScalar(existing)) {
        existing.value = next.key;
        actual[actual.length - 1] = next.key;
      }
      document.setIn(actual, value);
    }
  }
  return document;
}
