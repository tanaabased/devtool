# Isolation example

Run independent apps without sharing their containers, volumes or cached state.
The CLI uses the two checked-in project directories. The library loads one app
file under two product identities. Both prove that destroying one leaves the
other working. Container scenarios run only in disposable CI.

## Setup

```sh
# should install dependencies
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
mkdir -p .results
```

## Testing CLI

```sh
# should start two apps with distinct projects and containers
devtool --file first/.devtool.yml start
devtool --file second/.devtool.yml start
devtool --file first/.devtool.yml info --json > .results/first.json
devtool --file second/.devtool.yml info --json > .results/second.json
bun verify.ts running

# should keep each app’s volume contents independent
devtool --file first/.devtool.yml exec web -- sh -c 'echo first > /data/value'
devtool --file second/.devtool.yml exec web -- test ! -f /data/value
devtool --file second/.devtool.yml exec web -- sh -c 'echo second > /data/value'
test "$(devtool --file first/.devtool.yml exec web -- cat /data/value)" = first
test "$(devtool --file second/.devtool.yml exec web -- cat /data/value)" = second

# should destroy one app while preserving the other app and its cached state
devtool --file first/.devtool.yml destroy
bun verify.ts destroyed
test "$(devtool --file second/.devtool.yml exec web -- cat /data/value)" = second

# should restart and destroy the remaining app
devtool --file second/.devtool.yml stop
devtool --file second/.devtool.yml restart
test "$(devtool --file second/.devtool.yml exec web -- cat /data/value)" = second
devtool --file second/.devtool.yml destroy
```

## Testing Library

[`apps.ts`](apps.ts) creates two products with the same app file and storage roots.
The product identity must keep their resources independent.

```sh
# should keep product configuration independent
bun -e '
import assert from "node:assert/strict";
import { createDevtool } from "@tanaab/devtool";
const first = createDevtool({ identity: "first", env: {}, dataRoot: ".results/first" });
const second = createDevtool({ identity: "second", env: {}, dataRoot: ".results/second" });
assert.notEqual(first.loadApp({ file: "first/.devtool.yml" }).project, second.loadApp({ file: "first/.devtool.yml" }).project);
assert.notEqual(first.resolveConfig().dataRoot, second.resolveConfig().dataRoot);
assert.equal(first.commandName, "first");
assert.equal(second.commandName, "second");
'
# should start two embedded products with independent state
bun -e '
import assert from "node:assert/strict";
import { first, second } from "./apps.ts";
assert.notEqual(first.project, second.project);
assert.notEqual(first.stateFile, second.stateFile);
await first.start();
assert.deepEqual(second.state, { services: {} });
await second.start();
await Bun.write(".results/first.json", JSON.stringify(first.getInfo()));
await Bun.write(".results/second.json", JSON.stringify(second.getInfo()));
'
bun verify.ts running

# should keep each product’s volume contents independent
bun -e '
import assert from "node:assert/strict";
import { first, second } from "./apps.ts";
await first.exec("web", ["sh", "-c", "echo first > /data/value"]);
await second.exec("web", ["test", "!", "-f", "/data/value"]);
await second.exec("web", ["sh", "-c", "echo second > /data/value"]);
assert.equal((await first.exec("web", ["cat", "/data/value"])).stdout.trim(), "first");
assert.equal((await second.exec("web", ["cat", "/data/value"])).stdout.trim(), "second");
'

# should destroy one product while preserving the other product and its cached state
bun -e '
import assert from "node:assert/strict";
import { first, second } from "./apps.ts";
await first.destroy();
assert.equal((await second.exec("web", ["cat", "/data/value"])).stdout.trim(), "second");
'
bun verify.ts destroyed

# should restart and destroy the remaining product
bun -e '
import assert from "node:assert/strict";
import { second } from "./apps.ts";
await second.stop();
await second.restart();
assert.equal((await second.exec("web", ["cat", "/data/value"])).stdout.trim(), "second");
await second.destroy();
assert.equal(await Bun.file(second.stateFile).exists(), false);
'
```
