# Configuration example

Configure devtool with a product file, environment variables and explicit options.
The library imports the SDK tarball installed by Setup.

## Setup

```sh
# should install the example dependency
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
mkdir -p .results
```

## Testing CLI

```sh
# should read product configuration
devtool --config product.yml --help | grep -F 'Usage: example'

# should prefer the environment to the product file
DEVTOOL_COMMAND_NAME=custom devtool --config product.yml --help | grep -F 'Usage: custom'

# should load an imported service definition
devtool --config product.yml info --json | bun -e 'const info = await Bun.stdin.json(); if (info.services[0].type !== "l337") throw new Error("expected l337 service")'

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

Imported JSON/YAML scalars retain their native types, including `false`, `0` and
`null`. Schema-declared paths resolve relative to the file supplying the value,
including an imported file; provenance records that origin.

Objects merge recursively. Arrays of objects with `id` merge by that ID, retaining
unaffected entries in order and appending new IDs. IDs must be unique strings or
numbers within each source array; every member of an ID-matched array needs one.
An empty overlay retains an existing ID-matched array. Other arrays are replaced
by the later source. The same rule applies to nested arrays.

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
# should compose sources, preserve imported scalar types and resolve source-relative paths
bun config.ts
```
