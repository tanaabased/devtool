# L337 example

Start, rebuild and destroy one L337 application. Image inputs live in `image/` so
test results do not change the build context. Container scenarios run in disposable CI.
See [isolation](../isolation/README.md) for checks involving multiple apps or products.

## Setup

```sh
# should install the example dependency
bun install --cwd .. --frozen-lockfile --ignore-scripts --no-optional --force
mkdir -p .results
```

## Testing CLI

```sh
# should start and run ordered imported image instructions
devtool start
actual=$(devtool exec web -- cat /order)
test "$actual" = "$(printf 'pre\nmain\npost')"
test "$(devtool exec web -- cat /marker)" = original

# should report a built and running service
devtool info --json > .results/info.json
bun verify.ts info

# should reuse a valid image across CLI invocations
bun verify.ts snapshot
devtool start
bun verify.ts reused

# should stop and restart with persisted volume contents
devtool exec web -- sh -c 'echo retained > /data/value'
devtool stop
bun verify.ts stopped
devtool restart
test "$(devtool exec web -- cat /data/value)" = retained

# should rebuild when copied source content changes
printf 'changed\n' > image/marker
devtool start
test "$(devtool exec web -- cat /marker)" = changed
devtool rebuild
bun verify.ts changed
printf 'original\n' > image/marker

# should preserve a failing container command exit code
status=0
devtool exec web -- sh -c 'echo deliberate-failure >&2; exit 17' 2> ".results/exec-error" || status=$?
test "$status" -eq 17
grep -F deliberate-failure ".results/exec-error"

# should reject a failed build without persisting success and recover on retry
printf 'RUN exit 23\n' > image/instructions
status=0
devtool rebuild 2> ".results/build-error" || status=$?
test "$status" -ne 0
bun verify.ts failed
printf 'RUN echo main >> /order\n' > image/instructions
devtool start

# should destroy the app without removing its source files
devtool destroy
bun verify.ts destroyed
```

## Testing Library

[`app.ts`](app.ts) imports `createDevtool` from the public package export and
loads this directory's app. Each command below makes an explicit public API call.

```sh
# should start and run ordered imported image instructions
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.start();
assert.equal((await app.exec("web", ["cat", "/order"])).stdout.trim(), "pre\nmain\npost");
assert.equal((await app.exec("web", ["cat", "/marker"])).stdout.trim(), "original");
assert.equal(app.getInfo().services[0].state.IMAGE, "BUILT");
await Bun.write(".results/state.json", JSON.stringify(app.state));
'

# should reuse a valid image and its cached state
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
const previous = await Bun.file(".results/state.json").json();
await app.start();
assert.equal(app.state.services.web.fingerprint, previous.services.web.fingerprint);
'

# should stop and restart with persisted volume contents
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.exec("web", ["sh", "-c", "echo retained > /data/value"]);
await app.stop();
assert.equal(app.getInfo().running, false);
await app.restart();
assert.equal((await app.exec("web", ["cat", "/data/value"])).stdout.trim(), "retained");
'

# should rebuild when copied source content changes
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
const previous = app.state.services.web.fingerprint;
await Bun.write("image/marker", "changed\n");
await app.start();
assert.equal((await app.exec("web", ["cat", "/marker"])).stdout.trim(), "changed");
assert.notEqual(app.state.services.web.fingerprint, previous);
await app.rebuild();
await Bun.write("image/marker", "original\n");
'

# should reject a failed build and recover on retry
bun -e '
import assert from "node:assert/strict";
import { createDevtool } from "@tanaab/devtool";
await Bun.write("image/instructions", "RUN exit 23\n");
const app = createDevtool().loadApp();
await assert.rejects(app.rebuild());
assert.deepEqual(app.state.services, {});
assert.equal(app.state.running, false);
await Bun.write("image/instructions", "RUN echo main >> /order\n");
await createDevtool().loadApp().start();
'

# should destroy the app without removing its source files
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.destroy();
assert.equal(await Bun.file(app.stateFile).exists(), false);
assert.equal(await Bun.file(".devtool.yml").exists(), true);
'
```
