import type { CommandContext, CommandConfigContext } from '../components/command.ts';
import type { ConfigOrigin } from '../components/config.ts';
import configKey from '../utils/config-key.ts';
import configRows, { type ConfigRow } from '../utils/config-rows.ts';
import normalize from '../utils/normalize-config.ts';
import maskedConfigOrigins from '../utils/masked-config-origins.ts';
import parseConfigAssignment from '../utils/parse-config-assignment.ts';
import renderValue from '../utils/render-config-value.ts';
import schemas from './config-schemas.ts';

interface ReadResult {
  kind: 'read';
  value: unknown;
  rows: ConfigRow[];
}
interface WriteResult {
  kind: 'write';
  context: CommandConfigContext['kind'];
  source: string;
  file: string;
  edits: {
    key: string;
    saved: unknown;
    effective: unknown;
    effectivePresent: boolean;
    maskedBy: ConfigOrigin[];
  }[];
}
const configuration = (context: CommandContext) => {
  if (!context.configuration) throw new Error('Command requires configuration initialization');
  return context.configuration;
};

export function get(context: CommandContext): ReadResult {
  const { config } = configuration(context);
  const requested = context.arguments.key;
  const key = typeof requested === 'string' ? configKey(requested, schemas.runtime) : undefined;
  const value = key ? config.get(key.internal) : config.get();
  context.debug('read key %s', key?.external.join('.') ?? '(all)');
  if (value === undefined) throw new Error(`No configuration found for key: ${requested}`);
  const rows = configRows(config, value, schemas.runtime, key?.internal);
  for (const row of rows)
    context.debug('key %s winner %s', row.key, row.winner?.source ?? '(none)');
  return {
    kind: 'read',
    value: normalize(value, key?.schema ?? schemas.runtime, { external: true }),
    rows,
  };
}

export function set(context: CommandContext): WriteResult {
  const { config, writeTarget, kind } = configuration(context);
  const assignments = context.arguments.assignments;
  if (!Array.isArray(assignments) || !assignments.length) throw new Error('Expected key=value');
  const edits = assignments.map(parseConfigAssignment);
  const paths = edits.map(({ path }) => configKey(path, schemas.runtime).internal);
  for (const [index, path] of paths.entries())
    if (
      paths
        .slice(0, index)
        .some((other) =>
          path.slice(0, Math.min(path.length, other.length)).every((key, i) => key === other[i]),
        )
    )
      throw new Error('Assignments must address distinct, non-overlapping keys');
  const target = config.sources.find(({ id }) => id === writeTarget);
  if (!target?.writable) throw new Error(`No writable ${kind} configuration destination`);
  const receipt = config.writeSource(writeTarget, edits, {
    force: context.options.force === true,
    create: kind === 'global',
  });
  return {
    kind: 'write',
    context: kind,
    source: receipt.source,
    file: receipt.file,
    edits: edits.map((edit) => {
      const key = configKey(edit.path, schemas.runtime);
      const value = config.get(key.internal);
      const origins = maskedConfigOrigins(
        config,
        writeTarget,
        key.internal,
        normalize(edit.value, key.schema),
      );
      context.debug(
        'saved key %s; masked by %s',
        key.external.join('.'),
        origins.map(({ source }) => source).join(', ') || '(none)',
      );
      return {
        key: key.external.join('.'),
        saved: normalize(edit.value, key.schema, { external: true }),
        effective: normalize(value, key.schema, { external: true }),
        effectivePresent: value !== undefined,
        maskedBy: origins,
      };
    }),
  };
}

/** Presentation consumes the same result for human and JSON modes. */
export function render(result: ReadResult | WriteResult, context: CommandContext) {
  if (context.options.json) {
    const data =
      result.kind === 'read'
        ? result.value
        : {
            context: result.context,
            source: result.source,
            file: result.file,
            edits: result.edits,
          };
    context.stdout.write(`${JSON.stringify(data)}\n`);
    return;
  }
  if (result.kind === 'write') {
    context.stdout.write(`saved ${result.file}\n`);
    for (const edit of result.edits) {
      context.stdout.write(`${edit.key} = ${renderValue(edit.saved)}\n`);
      if (edit.maskedBy.length)
        context.stdout.write(
          `  masked by ${edit.maskedBy.map(({ source }) => source).join(', ')}; effective: ${edit.effective === undefined ? '(missing)' : renderValue(edit.effective)}\n`,
        );
    }
    return;
  }
  const object =
    result.value !== null && typeof result.value === 'object' && !Array.isArray(result.value);
  if (!object && !context.options.extended) {
    context.stdout.write(`${renderValue(result.value)}\n`);
    return;
  }
  const origin = (item: ConfigOrigin) =>
    `${item.source}${item.importedFrom ? ` (${item.importedFrom})` : item.file ? ` (${item.file})` : ''}`;
  const rows = result.rows.map((row) => [
    row.key,
    renderValue(row.value),
    ...(context.options.extended
      ? [row.winner ? origin(row.winner) : '(none)', row.contributors.map(origin).join(' -> ')]
      : []),
  ]);
  rows.unshift([
    'key',
    'value',
    ...(context.options.extended ? ['source', 'precedence (low -> high)'] : []),
  ]);
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => row[i]!.length)));
  context.stdout.write(
    rows
      .map((row) =>
        row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join('  '),
      )
      .join('\n') + '\n',
  );
}
