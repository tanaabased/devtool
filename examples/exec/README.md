# Execute commands

Pass arguments unchanged, capture output and handle failures. Container scenarios
run in disposable CI. Timing measurements belong to the manual timing workflow.

## Setup

```sh
# should install the example dependency
bun install --cwd ../.. --frozen-lockfile --ignore-scripts
mkdir -p .results
```

## Testing CLI

```sh
# should start the service
devtool start

# should preserve spaces and shell metacharacters
test "$(devtool exec web -- printf '%s' 'a b;$HOME')" = 'a b;$HOME'

# should keep standard output and standard error separate
devtool exec web -- sh -c 'echo output; echo error >&2' > .results/stdout 2> .results/stderr
grep -Fx output .results/stdout
grep -Fx error .results/stderr

# should preserve a failing command exit code
status=0
devtool exec web -- sh -c 'exit 17' || status=$?
test "$status" -eq 17

# should stream output before the command finishes
bun ../../test/compiled-cli.ts streams

# should destroy the service
devtool destroy
```

## Testing Library

```sh
# should start the service
bun -e 'import { app } from "./app.ts"; await app.start()'

# should preserve spaces and shell metacharacters
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
assert.equal((await app.exec("web", ["printf", "%s", "a b;$HOME"])).stdout, "a b;$HOME");
'

# should return standard output and standard error separately
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
const result = await app.exec("web", ["sh", "-c", "echo output; echo error >&2"]);
assert.equal(result.code, 0);
assert.equal(result.stdout.trim(), "output");
assert.equal(result.stderr.trim(), "error");
'

# should reject a failing command with its exit code
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await assert.rejects(app.exec("web", ["sh", "-c", "exit 17"]), { code: 17 });
'

# should stream output before the command finishes
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
let output = "";
let early = false;
await app.exec("web", ["sh", "-c", "echo first; sleep 1; echo last"], {
  stdout: { write(chunk) {
    output += chunk;
    if (output.includes("first") && !output.includes("last")) early = true;
    return true;
  } },
});
assert.ok(early);
assert.match(output, /last/);
'

# should destroy the service
bun -e 'import { app } from "./app.ts"; await app.destroy()'
```
