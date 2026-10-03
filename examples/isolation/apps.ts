import { App, createProductConfig } from '@tanaab/devtool';
import path from 'node:path';

// Both products use the same app file and the runner's configured storage roots.
const root = path.join(import.meta.dirname, 'first');
export const first = new App({
  root,
  data: ['.devtool.yml'],
  config: createProductConfig({ identity: 'first', envPrefix: 'DEVTOOL' }),
});
export const second = new App({
  root,
  data: ['.devtool.yml'],
  config: createProductConfig({ identity: 'second', envPrefix: 'DEVTOOL' }),
});
