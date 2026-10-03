import assert from 'node:assert/strict';
import configTemplateSource from '../utils/config-template-source.ts';

describe('configuration template sources', () => {
  it('retains file ownership and passes explicit context to factories', () => {
    assert.deepEqual(configTemplateSource('nested/defaults.yaml', {}), {
      id: 'template',
      kind: 'file',
      file: 'nested/defaults.yaml',
      imports: false,
    });
    assert.deepEqual(
      configTemplateSource(({ name }) => ({ commandName: name }), { name: 'wrapper' }),
      {
        id: 'template',
        kind: 'object',
        data: { commandName: 'wrapper' },
      },
    );
  });
  it('rejects asynchronous and non-object template results', () => {
    for (const template of [[], new Date(), () => [], async () => ({})])
      assert.throws(() => configTemplateSource(template, {}), /plain object synchronously/);
  });
});
