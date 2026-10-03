import type { ConfigSource, ConfigTemplate } from '../components/config.ts';

/** File templates retain their source base; object/factory templates use the supplied root. */
export default function configTemplateSource<Context>(
  template: ConfigTemplate<Context>,
  context: Readonly<Context>,
  id = 'template',
): ConfigSource {
  if (typeof template === 'string') return { id, kind: 'file', file: template, imports: false };
  const data = typeof template === 'function' ? template(context) : template;
  if (!data || Object.getPrototypeOf(data) !== Object.prototype)
    throw new Error('A configuration template must produce a plain object synchronously');
  return { id, kind: 'object', data };
}
