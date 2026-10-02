import { createDevtool } from '@tanaab/devtool';
import type { AppInfo, Engine, ExecResult, PersistedState, ProductOptions } from '@tanaab/devtool';

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
