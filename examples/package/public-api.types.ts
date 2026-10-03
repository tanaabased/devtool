import {
  App,
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
} from '@tanaab/devtool';

/** Compile-only consumer: importing the package must expose useful contracts, not implicit any. */
export async function consume(engine: Engine) {
  const options = { identity: 'wrapper', cache: false } satisfies ProductOptions;
  const config = createProductConfig(options);
  const app = new App({ root: '/fixture', data: ['app.yml'], config, engine });
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
  const config = new Config<{ commandName: string; appFiles: string[] }>({
    schema: configSchemas.product,
    sources: [
      { id: 'caller', kind: 'object', data: { commandName: 'wrapper', appFiles: ['app.yml'] } },
    ],
  });
  config.compile();
  const definition: AppConfig = { services: { web: { type: 'l337', image: 'alpine' } } };
  Config.from<AppConfig>(definition, { schema: configSchemas.appDefinition });
  const name: string = config.get('commandName');
  const files: readonly string[] = config.get('appFiles');
  // @ts-expect-error compiled snapshots are immutable
  config.get('appFiles').push('wrong');
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
  const app = new App({ root, data: input });
  const fromConfig = new App({ root, data: Config.from<AppConfig>(input) });
  const fromFiles = new App({ root, data: ['arbitrary.yaml', 'overrides.json'] });
  const found: { root: string; file: string } = discoverApp({
    cwd: root,
    filenames: ['application.yaml'],
  });
  // @ts-expect-error direct callers must supply the app root
  new App({ data: input });
  return { app, fromConfig, fromFiles, found };
}
