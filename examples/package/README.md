# Package example

Check the shipped devtool executable and installed SDK tarball. Feature behavior
lives in the config, service, exec and isolation examples.
This scenario may run locally after `bun run build`; CI also checks executable
isolation inside a disposable container.

## Setup

```sh
# should install the SDK tarball and declaration checker
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
mkdir -p .results
```

## Testing CLI

```sh
# should show the available commands
devtool --help | grep -F 'start, stop, restart, rebuild, info, exec, destroy'
devtool | grep -F 'Usage: devtool'
devtool -h | grep -F 'Usage: devtool'

# should report the package version
test "$(devtool --version)" = "$(bun -e 'import { version } from "@tanaab/devtool"; console.log(version)')"
test "$(devtool -v)" = "$(devtool --version)"

# should reject unknown options
devtool --unknown > .results/error 2>&1 && exit 1
grep -F 'error:' .results/error

# should load explicit configuration without a source checkout or JavaScript runtime
bun standalone.ts config

# should materialize and repair embedded executable assets
bun standalone.ts assets
```

`standalone.ts` checks executable isolation with an empty runtime path and a
controlled Docker substitute. In disposable CI it also isolates the executable
inside a container. It does not run the app lifecycle against a real backend.

## Testing Library

```sh
# should ship only the SDK surface with its licenses and executable service assets
bun -e '
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as api from "@tanaab/devtool";
const installed = path.resolve("../node_modules/@tanaab/devtool");
const metadata = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
assert.deepEqual(Object.keys(api).sort(), ["App", "Config", "configSchemas", "createDevtool", "createProductConfig", "discoverApp", "name", "seedConfigFile", "version"]);
assert.deepEqual(Object.keys(metadata.exports), ["."]);
assert.equal(metadata.version, api.version);
for (const key of ["private", "scripts", "bin", "optionalDependencies"]) assert.equal(metadata[key], undefined);
for (const file of ["bin", "test", "fixtures", "lib/devtool.ts", "lib/cli.js", "lib/runtime.js", "node_modules", "utils/create-test-project.js", "utils/read-fixture-yaml.js", "utils/require-value.js"]) assert.ok(!fs.existsSync(path.join(installed, file)), file);
assert.equal(fs.readFileSync(path.join(installed, "LICENSE"), "utf8"), fs.readFileSync("../../LICENSE", "utf8"));
const notices = fs.readFileSync(path.join(installed, "THIRD_PARTY_NOTICES.txt"), "utf8");
assert.match(notices, /dockerode@/);
assert.match(notices, /Apache License/);
for (const file of new Bun.Glob("**/*.sh").scanSync("../../services/lando")) {
  const asset = path.join(installed, "services/lando", file);
  assert.deepEqual(fs.readFileSync(asset), fs.readFileSync(path.join("../../services/lando", file)));
  assert.equal(fs.statSync(asset).mode & 0o777, 0o755);
}
'

# should typecheck examples and public contracts against the installed declarations
bun --bun ../node_modules/typescript/bin/tsc --project ../tsconfig.json

# should import and construct the SDK without host I/O or consumer process changes
bun inert-import.ts
```

`inert-import.ts` rejects host side effects during import and construction. It is
kept separate because those guards intentionally replace process APIs for that
one invocation. Successful feature imports need no additional per-feature probe.
