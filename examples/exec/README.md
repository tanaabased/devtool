# Execute commands

Pass arguments unchanged, preserve working directories through symlinked mounts,
capture output and handle failures. Container scenarios run in disposable CI.

## Setup

```sh
# should install the example dependency
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
mkdir -p .results
ln -sfn "$PWD" .results/root
```

## Testing CLI

```sh
# should start the service
devtool start

# should map the current directory through a symlinked app mount
test "$(devtool exec web -- pwd)" = /app
(cd .results && test "$(devtool exec web -- pwd)" = /app/.results)

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
bun ../package/standalone.ts streams

# should destroy the service
devtool destroy
```

## Testing Library

```sh
# should start the service
bun -e 'import { app } from "./app.ts"; await app.start()'

# should map the current directory with an absolute app file through a symlink
bun -e '
import assert from "node:assert/strict";
import path from "node:path";
import { App } from "@tanaab/devtool";
const root = process.cwd();
const app = new App({ root, definition: [path.join(root, ".results/root/.devtool.yml")] });
assert.equal((await app.exec("web", ["pwd"])).stdout.trim(), "/app");
assert.equal((await app.exec("web", ["pwd"], { cwd: path.join(root, ".results") })).stdout.trim(), "/app/.results");
'

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
