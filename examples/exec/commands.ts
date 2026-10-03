import assert from 'node:assert/strict';
import { runCli, type CommandRegistration } from '@tanaab/devtool';

const commands: CommandRegistration[] = [
  {
    definition: {
      name: 'hello',
      help: 'Print a literal value',
      availability: 'app',
      initialization: 'app',
      execution: { kind: 'container-exec', service: 'web', argv: ['printf', '%s'] },
    },
  },
];
let stdout = '';
let stderr = '';
const result = await runCli(['hello', '--debug', '--', 'a b;$HOME'], {
  cwd: import.meta.dirname,
  commands,
  stdout: {
    write(chunk) {
      stdout += chunk;
    },
  },
  stderr: {
    write(chunk) {
      stderr += chunk;
    },
  },
});
assert.equal(result, 0, stderr);
assert.equal(stdout, 'a b;$HOME');
assert.match(stderr, /execute container service web/);
assert.doesNotMatch(stderr, /a b;\$HOME/);
process.stdout.write('declarative container execution preserves argv and streams\n');
