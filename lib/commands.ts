import type {
  CommandContext,
  CommandDefinition,
  CommandHandler,
  CommandRegistration,
  CommandRenderer,
} from '../components/command.ts';

const configOptions = {
  global: { type: 'boolean' as const, description: 'Use global configuration anywhere' },
};
export const builtinCommands: readonly CommandDefinition[] = [
  {
    name: 'config get',
    help: 'Read effective configuration',
    availability: 'both',
    initialization: 'config',
    arguments: [{ name: 'key' }],
    options: {
      ...configOptions,
      extended: { type: 'boolean', description: 'Show sources and precedence' },
    },
    execution: { kind: 'handler', id: 'config-get' },
  },
  {
    name: 'config set',
    help: 'Save targeted configuration overrides',
    availability: 'both',
    initialization: 'config',
    arguments: [{ name: 'assignments', required: true, multiple: true }],
    options: {
      ...configOptions,
      force: { type: 'boolean', description: 'Permit protected configuration writes' },
    },
    execution: { kind: 'handler', id: 'config-set' },
  },
  {
    name: 'exec',
    help: 'Execute a command in an app service',
    availability: 'app',
    initialization: 'app',
    arguments: [{ name: 'service', required: true }],
    options: {
      interactive: { type: 'boolean', short: 'i', description: 'Attach exec to the terminal' },
    },
    execution: { kind: 'container-exec' },
  },
];

// Literal imports are visible to Bun. Metadata never becomes an executable filesystem path.
const implementations: Record<
  string,
  () => Promise<{ handler: CommandHandler; render?: CommandRenderer }>
> = {
  'config-get': async () => {
    const command = await import('./config-command.ts');
    return {
      handler: command.get,
      render: (result, context) =>
        command.render(result as ReturnType<typeof command.get>, context),
    };
  },
  'config-set': async () => {
    const command = await import('./config-command.ts');
    return {
      handler: command.set,
      render: (result, context) =>
        command.render(result as ReturnType<typeof command.set>, context),
    };
  },
};

/** Build an invocation-local registry without importing or executing handlers. */
export function registerCommands(additions: readonly CommandRegistration[] = []) {
  const registry = new Map<string, CommandRegistration>();
  const handlers = new Map<string, CommandHandler>();
  const dataOnly = (value: unknown, ancestors = new Set<object>()) => {
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (
      typeof value !== 'object' ||
      ancestors.has(value) ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
    )
      throw new Error('Command definitions must contain serializable data only');
    ancestors.add(value);
    for (const entry of Object.values(value)) dataOnly(entry, ancestors);
    ancestors.delete(value);
  };
  for (const registration of [
    ...builtinCommands.map((definition) => ({ definition })),
    ...additions,
  ] as CommandRegistration[]) {
    const { definition, handler } = registration;
    dataOnly(definition);
    if (!/^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/.test(definition.name))
      throw new Error('Invalid command name');
    if (registry.has(definition.name)) throw new Error(`Duplicate command: ${definition.name}`);
    if (
      !['app', 'global', 'both'].includes(definition.availability) ||
      !['none', 'config', 'app'].includes(definition.initialization)
    )
      throw new Error(`Invalid command requirements: ${definition.name}`);
    if (definition.execution.kind === 'container-exec') {
      if (handler || definition.initialization !== 'app' || definition.availability !== 'app')
        throw new Error(
          'Container execution requires app availability/initialization and no handler',
        );
      if (
        definition.execution.argv?.some((arg) => typeof arg !== 'string') ||
        (definition.execution.service !== undefined &&
          typeof definition.execution.service !== 'string')
      )
        throw new Error('Container operands must be strings');
    } else if (definition.execution.kind === 'handler') {
      const id = definition.execution.id;
      if (handler) {
        if (Object.hasOwn(implementations, id) || handlers.has(id))
          throw new Error(`Duplicate implementation: ${id}`);
        handlers.set(id, handler);
      } else if (!Object.hasOwn(implementations, id))
        throw new Error(`Unknown implementation: ${id}`);
    } else throw new Error('Unknown execution kind');
    const names = new Set<string>();
    for (const [index, argument] of (definition.arguments ?? []).entries()) {
      if (
        !argument.name ||
        names.has(argument.name) ||
        (argument.multiple && index !== definition.arguments!.length - 1)
      )
        throw new Error(`Invalid arguments: ${definition.name}`);
      names.add(argument.name);
    }
    registry.set(definition.name, { ...registration, definition: structuredClone(definition) });
  }
  return registry;
}

export function commandArguments(definition: CommandDefinition, values: string[]) {
  const parsed: Record<string, string | readonly string[]> = Object.create(null);
  let index = 0;
  for (const argument of definition.arguments ?? []) {
    if (argument.required && index >= values.length)
      throw new Error(`Missing ${argument.name} for ${definition.name}`);
    if (argument.multiple) {
      parsed[argument.name] = values.slice(index);
      index = values.length;
    } else if (values[index] !== undefined) parsed[argument.name] = values[index++]!;
  }
  if (index < values.length) throw new Error(`Unexpected arguments for ${definition.name}`);
  return parsed;
}

export async function executeCommand(
  registration: CommandRegistration,
  context: CommandContext,
): Promise<number> {
  const { definition } = registration;
  if (definition.execution.kind === 'container-exec') {
    const service = definition.execution.service ?? context.arguments.service;
    const argv = [...(definition.execution.argv ?? []), ...context.argv];
    if (!context.app || typeof service !== 'string' || !service || !argv.length)
      throw new Error('Usage: exec <service> -- <command> [arguments...]');
    context.debug('execute container service %s', service);
    const result = await context.app.exec(service, [...argv], {
      cwd: context.cwd,
      interactive: context.options.interactive === true,
      capture: 'tail',
      stdout: context.stdout,
      stderr: context.stderr,
    });
    return result.code;
  }
  const implementation = registration.handler
    ? { handler: registration.handler, render: registration.render }
    : await implementations[definition.execution.id]!();
  const result = await implementation.handler(context);
  const render = registration.render ?? implementation.render;
  if (render) render(result, context);
  else if (result !== undefined) {
    if (!context.options.json)
      throw new Error(
        `Command ${definition.name} returned data without a human renderer; use --json`,
      );
    context.stdout.write(`${JSON.stringify(result)}\n`);
  }
  return 0;
}
