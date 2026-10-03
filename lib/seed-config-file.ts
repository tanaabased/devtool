import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConfigTemplate, ConfigSchema } from '../components/config.ts';
import Config from './config.ts';
import configTemplateSource from '../utils/config-template-source.ts';

/** Explicitly seed a JSON/YAML file once. Existing destinations are never replaced. */
export default function seedConfigFile<Context>(
  file: string,
  template: ConfigTemplate<Context>,
  {
    context,
    root = '.',
    schema = {},
  }: { context: Readonly<Context>; root?: string; schema?: ConfigSchema },
): boolean {
  const destination = path.resolve(root, file);
  if (fs.existsSync(destination)) return false;
  const extension = path.extname(destination);
  if (!['.json', '.yaml', '.yml'].includes(extension))
    throw new Error('Seed destination must be JSON or YAML');
  const config = new Config({ root, schema, sources: [configTemplateSource(template, context)] });
  config.compile();
  const data = config.export(extension === '.json' ? 'json' : 'yaml');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 });
    // Linking publishes the complete file atomically and fails if another initializer won.
    try {
      fs.linkSync(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    return true;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
