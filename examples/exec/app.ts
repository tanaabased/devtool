import { App } from '@tanaab/devtool';

export const app = new App({ root: import.meta.dirname, definition: ['.devtool.yml'] });
