# Configuration example

Configure devtool with a product file, environment variables and explicit options.
The library imports the built ESM package installed by Setup.

## Setup

```sh
# should install the example dependency
bun install --cwd .. --frozen-lockfile --ignore-scripts --no-optional --force
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

# should read product configuration
devtool --config product.yml --help | grep -F 'Usage: example'

# should prefer the environment to the product file
DEVTOOL_COMMAND_NAME=custom devtool --config product.yml --help | grep -F 'Usage: custom'

# should load an imported service definition
devtool --config product.yml info --json | bun -e 'const info = await Bun.stdin.json(); if (info.services[0].type !== "l337") throw new Error("expected l337 service")'

# should reject unknown options
devtool --unknown > .results/error 2>&1 && exit 1
grep -F 'error:' .results/error

# should work without the source checkout or a JavaScript runtime
bun ../../test/compiled-cli.ts config
bun ../../test/compiled-cli.ts assets
```

## Testing Library

```sh
# should read product configuration
bun -e '
import assert from "node:assert/strict";
import { createDevtool } from "@tanaab/devtool";
const config = createDevtool({ configFile: "product.yml" }).resolveConfig();
assert.equal(config.commandName, "example");
'

# should prefer explicit options to environment and file values
bun -e '
import assert from "node:assert/strict";
import { createDevtool } from "@tanaab/devtool";
const config = createDevtool({
  configFile: "product.yml",
  env: { DEVTOOL_COMMAND_NAME: "environment" },
  commandName: "explicit",
}).resolveConfig();
assert.equal(config.commandName, "explicit");
'

# should load an imported service definition
bun -e '
import assert from "node:assert/strict";
import { createDevtool } from "@tanaab/devtool";
const app = createDevtool({ configFile: "product.yml" }).loadApp();
assert.equal(app.getInfo().services[0].type, "l337");
'
```
