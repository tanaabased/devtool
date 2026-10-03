import assert from 'node:assert/strict';
import type { CommandDefinition } from '../components/command.ts';
import { builtinCommands, commandArguments, registerCommands } from '../lib/commands.ts';

describe('command registration and inputs', () => {
  const definition: CommandDefinition = {
    name: 'example',
    help: 'Example',
    availability: 'both',
    initialization: 'none',
    execution: { kind: 'handler', id: 'example' },
  };
  it('keeps descriptors serializable and registration inert and isolated', () => {
    let calls = 0;
    const handler = () => {
      calls++;
    };
    const registry = registerCommands([{ definition, handler }]);
    assert.equal(calls, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(builtinCommands)), builtinCommands);
    definition.help = 'Changed';
    assert.equal(registry.get('example')?.definition.help, 'Example');
    assert.equal(registerCommands().has('example'), false);
  });
  it('rejects collisions, unknown execution IDs and non-data metadata', () => {
    assert.throws(() => registerCommands([{ definition }]));
    assert.throws(() =>
      registerCommands([{ definition: { ...definition, name: 'exec' }, handler() {} }]),
    );
    assert.throws(() =>
      registerCommands([
        { definition: { ...definition, help: (() => {}) as unknown as string }, handler() {} },
      ]),
    );
    assert.throws(() =>
      registerCommands([{ definition: { ...definition, execution: { kind: 'container-exec' } } }]),
    );
  });
  it('checks positional arity without altering assignment contents', () => {
    const get = builtinCommands[0]!;
    const set = builtinCommands[1]!;
    assert.deepEqual({ ...commandArguments(get, []) }, {});
    assert.deepEqual(
      { ...commandArguments(set, ['key=a=b', 'other=']) },
      { assignments: ['key=a=b', 'other='] },
    );
    assert.throws(() => commandArguments(get, ['a', 'b']));
    assert.throws(() => commandArguments(set, []));
  });
});
