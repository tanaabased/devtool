import {
  App,
  runCli,
  discoverApp,
  Config,
  configSchemas,
  createProductConfig,
  seedConfigFile,
} from '@tanaab/devtool';
import type {
  AppConfig,
  AppInfo,
  Engine,
  ExecResult,
  PersistedState,
  ProductOptions,
  CommandDefinition,
  CommandRegistration,
} from '@tanaab/devtool';

/** Compile-only consumer: importing the package must expose useful contracts, not implicit any. */
export async function consume(engine: Engine) {
  const options = { identity: 'wrapper', cache: false } satisfies ProductOptions;
  const config = createProductConfig(options);
  const app = new App({ root: '/fixture', definition: ['app.yml'], config, engine });
  const info: AppInfo = await app.start();
  const state: PersistedState = app.state;
  const result: ExecResult = await app.exec('web', ['printf', 'hello']);
  return { info, state, result, name: config.get('commandName') };
}

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
export type PublicContractChecks = [
  Assert<IsAny<App> extends false ? true : false>,
  Assert<IsAny<Awaited<ReturnType<Engine['compose']>>> extends false ? true : false>,
  Assert<{ cache: string } extends ProductOptions ? false : true>,
  Assert<
    { engine: Record<string, never> } extends Pick<ConstructorParameters<typeof App>[0], 'engine'>
      ? false
      : true
  >,
  Assert<{ services: { web: { fingerprint: number } } } extends PersistedState ? false : true>,
];

/** Config is independently consumable; typed reads and snapshots do not expose mutable state. */
export function consumeConfig() {
  const config = new Config<{ commandName: string; tags: string[] }>({
    schema: configSchemas.product,
    sources: [
      { id: 'caller', kind: 'object', data: { commandName: 'wrapper', tags: ['example'] } },
    ],
  });
  config.compile();
  const definition: AppConfig = { services: { web: { type: 'l337', image: 'alpine' } } };
  Config.from<AppConfig>(definition, { schema: configSchemas.appDefinition });
  const name: string = config.get('commandName');
  const files: readonly string[] = config.get('tags');
  // @ts-expect-error compiled snapshots are immutable
  config.get('tags').push('wrong');
  return { name, files, serialized: config.export('yaml') };
}

export function consumeProductConfig(root: string) {
  const settings = createProductConfig(
    {
      configDir: root,
      configFiles: { system: false },
      defaults: ({ identity }) => ({ commandName: identity }),
      env: {},
    },
    { root },
  );
  settings.compile();
  const created: boolean = seedConfigFile(`${root}/config.json`, { cache: false }, { context: {} });
  return { settings, created };
}

export function consumeApp(root: string, input: AppConfig) {
  const app = new App({ root, definition: input });
  const fromConfig = new App({ root, definition: Config.from<AppConfig>(input) });
  const fromFiles = new App({ root, definition: ['arbitrary.yaml', 'overrides.json'] });
  const found: { root: string; file: string } = discoverApp({
    cwd: root,
    appFile: 'application',
  });
  // @ts-expect-error direct callers must supply the app root
  new App({ definition: input });
  // @ts-expect-error data is not a constructor input
  new App({ root, data: input });
  // @ts-expect-error discovery is not a product setting
  createProductConfig({ appFiles: ['application'] });
  return { app, fromConfig, fromFiles, found };
}

/** Definitions remain serializable; implementations are supplied separately. */
export function consumeCommands() {
  const definition: CommandDefinition = {
    name: 'example',
    help: 'Example',
    availability: 'both',
    initialization: 'none',
    execution: { kind: 'handler', id: 'example' },
  };
  const registration: CommandRegistration = {
    definition,
    handler: ({ cwd, debug }) => {
      debug('example invoked');
      return { cwd };
    },
    render: (result, { stdout }) => {
      stdout.write(JSON.stringify(result));
    },
  };
  const declarative: CommandDefinition = {
    name: 'hello',
    help: 'Print hello',
    availability: 'app',
    initialization: 'app',
    execution: { kind: 'container-exec', service: 'web', argv: ['printf', 'hello'] },
  };
  // @ts-expect-error functions do not belong in descriptors
  const invalid: CommandDefinition = { ...definition, execution: () => {} };
  return {
    invalid,
    result: runCli(['example', '--json'], {
      commands: [registration, { definition: declarative }],
      debugNamespaces: '',
    }),
  };
}
