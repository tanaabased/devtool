import {
  Config,
  configSchemas,
  createDevtool,
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
  const options = { identity: 'wrapper', cache: false, engine } satisfies ProductOptions;
  const runtime = createDevtool(options);
  const app = runtime.loadApp({ cwd: '/fixture' });
  const info: AppInfo = await app.start();
  const state: PersistedState = app.state;
  const result: ExecResult = await app.exec('web', ['printf', 'hello']);
  return { info, state, result, name: runtime.resolveConfig().commandName };
}

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
export type PublicContractChecks = [
  Assert<IsAny<ReturnType<typeof createDevtool>> extends false ? true : false>,
  Assert<IsAny<Awaited<ReturnType<Engine['compose']>>> extends false ? true : false>,
  Assert<{ cache: string } extends ProductOptions ? false : true>,
  Assert<{ engine: Record<string, never> } extends ProductOptions ? false : true>,
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
