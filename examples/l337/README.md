# L337 example

Build image, context and group variants, then start, rebuild
and destroy one L337 application. Results live in generated storage excluded from
build inputs. Container scenarios run in disposable CI.
See [isolation](../isolation/README.md) for checks involving multiple apps or products.

The `db` fixture uses Alpine to check build inputs, COPY and working directories;
it does not test a database. Buildx/buildkit cases use local multistage COPY and
known users instead of developer SSH keys or authenticated clones. Explicit `exec`
checks environment, argv, users and working directories; tooling aliases and the
legacy event dispatcher are outside this scenario. L337 has no scanner or
healthcheck orchestration; see the disabled [service lifecycle scenario](../lando/README.md).

## Setup

```sh
# should install the example dependency
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
mkdir -p "$DEVTOOL_CACHE_ROOT/projects/l337-results"
ln -sfn "$DEVTOOL_CACHE_ROOT/projects/l337-results" .results
```

## Testing CLI

```sh
# should report unbuilt image variants and service metadata
devtool info --json > .results/info.json
bun verify.ts unbuilt

# should start and run ordered imported image instructions
devtool start
actual=$(devtool exec web -- cat /order)
test "$actual" = "$(printf 'pre\nmain\npost')"
test "$(devtool exec web -- cat /marker)" = original

# should report a built and running service
devtool info --json > .results/info.json
bun verify.ts info

# should retain reference, file, inline and object image formats
test "$(devtool exec image-1 -- printenv NGINX_VERSION)" = 1.21.6
test "$(devtool exec image-2 -- printenv SERVICE)" = image-2
test "$(devtool exec image-3 -- printenv SERVICE)" = image-3
test "$(devtool exec image-4 -- printenv NGINX_VERSION)" = 1.21.5
test "$(devtool exec image-5 -- printenv SERVICE)" = image-5
test "$(devtool exec image-6 -- printenv SERVICE)" = image-6
test "$(devtool exec db -- printenv SERVICE)" = db
test "$(devtool exec web -- printenv SERVICE)" = web

# should pass array and object build arguments to both builders
test "$(devtool exec build-args-1 -- printenv NGINX_VERSION)" = 1.19.2
test "$(devtool exec build-args-1 -- printenv VIBE)" = rising
test "$(devtool exec build-args-2 -- printenv NGINX_VERSION)" = 1.21.5
test "$(devtool exec build-args-2 -- printenv VIBE)" = dialed

# should retain buildx and buildkit multistage COPY, numeric owners and modes
for service in buildx buildkit; do
  devtool exec "$service" -- test -f /app2/me
  test "$(devtool exec "$service" -- stat -c '%u:%g' /files1/file1)" = 55:55
  test "$(devtool exec "$service" -- stat -c '%U:%G' /files2/file1)" = bin:bin
  test "$(devtool exec "$service" -- stat -c '%u' /files3/file1)" = 1
  test "$(devtool exec "$service" -- stat -c '%u:%g' /files4/file1)" = 10:11
  test "$(devtool exec "$service" -- stat -c '%U:%G:%a' /files5/file1)" = myuser:mygroup:644
  test "$(devtool exec "$service" -- stat -c '%U:%G:%a' /file7)" = nobody:nogroup:775
done

# should copy files from each Dockerfile context and serve the copied nginx configuration
devtool exec db -- test -f /thing/stuff
devtool exec db -- test -f /itworked
devtool exec image-2 -- test -f /file10
devtool exec image-3 -- test -f /file1
devtool exec web -- curl --retry 5 --retry-connrefused --retry-delay 1 --fail localhost:8888 | grep -F 'look you wanna be L337'

# should honor app mounts, explicit working directories and image fallbacks
test "$(devtool exec web -- pwd)" = /site
test "$(devtool exec web -- whoami)" = nginx
test "$(devtool exec db -- pwd)" = /tmp
(cd inputs/folder && test "$(devtool exec db -- pwd)" = /tmp && test "$(devtool exec web -- pwd)" = /site/inputs/folder)
test "$(devtool exec image-1 -- pwd)" = /
test "$(devtool exec image-6 -- pwd)" = /usr/share/nginx/html

# should retain context aliases, directories, destinations and instruction overrides
devtool exec context-1 -- sh -c 'test -f /folder/stuff && test -f /folder/more-stuff && test -f /thing/stuff && test -f /thing/more-stuff && test -f /file2 && test -f /file3 && test -f /tmp/file4 && test ! -e /file4 && test -f /tmp/stuff/file5 && test -f /file6 && test -f /images/nginx/Dockerfile'
test "$(devtool exec context-1 -- printenv HALL)" = OATES

# should preserve copied ownership and modes
test "$(devtool exec context-1 -- stat -c '%U:%G:%a' /file7)" = nginx:nginx:775
test "$(devtool exec context-1 -- stat -c '%U:%G' /file8)" = nginx:dialout
test "$(devtool exec context-1 -- stat -c '%U:%G' /file9)" = nginx:nginx

# should ADD remote inputs with default and explicit destinations and ownership
devtool exec context-1 -- test -s /SeaShanties/lyrics/a7e6ae5e12f32f9afac3a89d78f0afb43e5e0c1e/shanties/HeresAHealthToTheCompany.json
devtool exec context-1 -- test -s /etc/config/available-shanties.json
test "$(devtool exec context-1 -- stat -c '%U:%G' /etc/config/available-shanties.json)" = eddie-teach:eddie-teach

# should order every supported group syntax and execute as the selected user
devtool exec groups-1 -- cat /tmp/groups > .results/groups
cmp groups.expected .results/groups

# should run multiline, array and imported instruction formats
test "$(devtool exec steps-1 -- printenv VIBES)" = RISING
test "$(devtool exec steps-1 -- printenv KIRK)" = wesley
test "$(devtool exec steps-1 -- printenv SPOCK)" = peck
for key in LANDO_STRINGY_IMPORT_INSTRUCTIONS_1 LANDO_STRINGY_IMPORT_INSTRUCTIONS_2 LANDO_STRINGY_IMPORT_INSTRUCTIONS_3; do
  test "$(devtool exec import -- printenv "$key")" = 1
done

# should use the default for unknown groups and order detached groups by weight
test "$(devtool exec steps-1 -- cat /tmp/val-jean-group)" = default-1000-root
test "$(devtool exec steps-1 -- cat /stuff)" = "$(printf 'first\nmiddle\nlast')"

# should mount readable files read-only and create project networks and volumes
devtool exec web -- test -r /file-ro
devtool exec web -- test -r /file-long
test "$(devtool exec web -- cat /file-ro)" = "$(devtool exec web -- cat /file-long)"
status=0
devtool exec web -- sh -c 'echo forbidden >> /file-ro' 2> .results/mount-error || status=$?
test "$status" -ne 0
bun verify.ts resources

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
# should report unbuilt image variants and service metadata
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await Bun.write(".results/info.json", JSON.stringify(app.getInfo()));
'
bun verify.ts unbuilt

# should start and run ordered imported image instructions
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.start();
assert.equal((await app.exec("web", ["cat", "/order"])).stdout.trim(), "pre\nmain\npost");
assert.equal((await app.exec("web", ["cat", "/marker"])).stdout.trim(), "original");
assert.equal(app.getInfo().services[0].state.IMAGE, "BUILT");
await Bun.write(".results/info.json", JSON.stringify(app.getInfo()));
'
bun verify.ts info
bun verify.ts snapshot

# should retain reference, file, inline and object image formats
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const [service, key, value] of [
  ["image-1", "NGINX_VERSION", "1.21.6"], ["image-2", "SERVICE", "image-2"],
  ["image-3", "SERVICE", "image-3"], ["image-4", "NGINX_VERSION", "1.21.5"],
  ["image-5", "SERVICE", "image-5"], ["image-6", "SERVICE", "image-6"], ["db", "SERVICE", "db"], ["web", "SERVICE", "web"],
]) assert.equal((await app.exec(service, ["printenv", key])).stdout.trim(), value);
'

# should pass array and object build arguments to both builders
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const [service, version, vibe] of [["build-args-1", "1.19.2", "rising"], ["build-args-2", "1.21.5", "dialed"]]) {
  assert.equal((await app.exec(service, ["printenv", "NGINX_VERSION"])).stdout.trim(), version);
  assert.equal((await app.exec(service, ["printenv", "VIBE"])).stdout.trim(), vibe);
}
'

# should retain buildx and buildkit multistage COPY, numeric owners and modes
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const service of ["buildx", "buildkit"]) {
  await app.exec(service, ["test", "-f", "/app2/me"]);
  for (const [format, file, expected] of [
    ["%u:%g", "/files1/file1", "55:55"], ["%U:%G", "/files2/file1", "bin:bin"],
    ["%u", "/files3/file1", "1"], ["%u:%g", "/files4/file1", "10:11"],
    ["%U:%G:%a", "/files5/file1", "myuser:mygroup:644"], ["%U:%G:%a", "/file7", "nobody:nogroup:775"],
  ]) assert.equal((await app.exec(service, ["stat", "-c", format, file])).stdout.trim(), expected);
}
'

# should copy files from each Dockerfile context and serve the copied nginx configuration
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const [service, file] of [["db", "/thing/stuff"], ["db", "/itworked"], ["image-2", "/file10"], ["image-3", "/file1"]])
  await app.exec(service, ["test", "-f", file]);
assert.match((await app.exec("web", ["curl", "--retry", "5", "--retry-connrefused", "--retry-delay", "1", "--fail", "localhost:8888"])).stdout, /look you wanna be L337/);
'

# should honor app mounts, explicit working directories and image fallbacks
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const [service, directory] of [["web", "/site"], ["db", "/tmp"], ["image-1", "/"], ["image-6", "/usr/share/nginx/html"]])
  assert.equal((await app.exec(service, ["pwd"])).stdout.trim(), directory);
assert.equal((await app.exec("web", ["whoami"])).stdout.trim(), "nginx");
assert.equal((await app.exec("web", ["pwd"], { cwd: "inputs/folder" })).stdout.trim(), "/site/inputs/folder");
assert.equal((await app.exec("db", ["pwd"], { cwd: "inputs/folder" })).stdout.trim(), "/tmp");
'

# should retain context aliases, directories, destinations and instruction overrides
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const file of ["/folder/stuff", "/folder/more-stuff", "/thing/stuff", "/thing/more-stuff", "/file2", "/file3", "/tmp/file4", "/tmp/stuff/file5", "/file6", "/images/nginx/Dockerfile"])
  await app.exec("context-1", ["test", "-f", file]);
await app.exec("context-1", ["test", "!", "-e", "/file4"]);
assert.equal((await app.exec("context-1", ["printenv", "HALL"])).stdout.trim(), "OATES");
'

# should preserve copied ownership and modes
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
assert.equal((await app.exec("context-1", ["stat", "-c", "%U:%G:%a", "/file7"])).stdout.trim(), "nginx:nginx:775");
assert.equal((await app.exec("context-1", ["stat", "-c", "%U:%G", "/file8"])).stdout.trim(), "nginx:dialout");
assert.equal((await app.exec("context-1", ["stat", "-c", "%U:%G", "/file9"])).stdout.trim(), "nginx:nginx");
'

# should ADD remote inputs with default and explicit destinations and ownership
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.exec("context-1", ["test", "-s", "/SeaShanties/lyrics/a7e6ae5e12f32f9afac3a89d78f0afb43e5e0c1e/shanties/HeresAHealthToTheCompany.json"]);
await app.exec("context-1", ["test", "-s", "/etc/config/available-shanties.json"]);
assert.equal((await app.exec("context-1", ["stat", "-c", "%U:%G", "/etc/config/available-shanties.json"])).stdout.trim(), "eddie-teach:eddie-teach");
'

# should order every supported group syntax and execute as the selected user
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
assert.equal((await app.exec("groups-1", ["cat", "/tmp/groups"])).stdout, await Bun.file("groups.expected").text());
'

# should run multiline, array and imported instruction formats
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
for (const [key, value] of [["VIBES", "RISING"], ["KIRK", "wesley"], ["SPOCK", "peck"]])
  assert.equal((await app.exec("steps-1", ["printenv", key])).stdout.trim(), value);
for (const key of ["LANDO_STRINGY_IMPORT_INSTRUCTIONS_1", "LANDO_STRINGY_IMPORT_INSTRUCTIONS_2", "LANDO_STRINGY_IMPORT_INSTRUCTIONS_3"])
  assert.equal((await app.exec("import", ["printenv", key])).stdout.trim(), "1");
'

# should use the default for unknown groups and order detached groups by weight
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
assert.equal((await app.exec("steps-1", ["cat", "/tmp/val-jean-group"])).stdout.trim(), "default-1000-root");
assert.equal((await app.exec("steps-1", ["cat", "/stuff"])).stdout.trim(), "first\nmiddle\nlast");
'

# should mount readable files read-only and create project networks and volumes
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.exec("web", ["test", "-r", "/file-ro"]);
assert.equal((await app.exec("web", ["cat", "/file-ro"])).stdout, (await app.exec("web", ["cat", "/file-long"])).stdout);
await assert.rejects(app.exec("web", ["sh", "-c", "echo forbidden >> /file-ro"]));
await Bun.write(".results/info.json", JSON.stringify(app.getInfo()));
'
bun verify.ts resources

# should reuse a valid image and its cached state
bun -e '
import assert from "node:assert/strict";
import { app } from "./app.ts";
await app.start();
'
bun verify.ts reused

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
bun verify.ts destroyed
```
