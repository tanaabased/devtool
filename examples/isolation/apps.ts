import { createDevtool } from '@tanaab/devtool';

// Both products use the same app file and the runner's configured storage roots.
export const first = createDevtool({ identity: 'first', envPrefix: 'DEVTOOL' }).loadApp({
  file: 'first/.devtool.yml',
});
export const second = createDevtool({ identity: 'second', envPrefix: 'DEVTOOL' }).loadApp({
  file: 'first/.devtool.yml',
});
