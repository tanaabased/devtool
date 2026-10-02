import { ImportString } from '../lib/yaml.ts';

export default (data: unknown): data is string | ImportString =>
  typeof data === 'string' || data instanceof ImportString;
