# Configuration example

Configure devtool with a product file, environment variables and explicit options.
The library imports the built ESM package installed by Setup.

## Setup

```sh
# should install the example dependency
bun install --cwd .. --frozen-lockfile --ignore-scripts --force
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
bun ../../scripts/check-compiled-cli.ts config
bun ../../scripts/check-compiled-cli.ts assets
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

## Config sources

`Config` is also available independently of an App. It loads only the sources you
supply, in ascending precedence. Schema keys may use kebab-case or camelCase;
JavaScript reads use camelCase and YAML/JSON exports use kebab-case. Names inside
literal dictionaries, including labels and environment variables, stay intact.

`compile()` loads and validates a revision. `get()` reads that compiled snapshot
without reloading files. Use `replaceSource()`, `removeSource()` or
`reloadSource()` followed by `compile()` to change it. Previously returned
snapshots stay unchanged. `fork()` preserves source context while isolating data.

JavaScript files export a configuration object (`export default` or CommonJS),
not a function or asynchronous factory. Explicit reload refreshes the entry
module; its transitive JavaScript dependencies retain Bun's module caching.
JavaScript sources are read-only. `export()` serializes effective data into a new
document; it does not edit sources or carry comments from multiple files.
`sourceDocument(id)` returns a detached YAML document retaining comments, anchors
and import tags. Targeted persistence and config CLI commands follow this read
foundation.

## Testing Library Config

```sh
# should compose named sources and retain provenance through the installed SDK
bun config.ts
```
