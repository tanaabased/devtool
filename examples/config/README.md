# Configuration example

Configure devtool with global files, environment variables and explicit options.
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

# should prefer an explicit config file to the environment
DEVTOOL_COMMAND_NAME=custom devtool --config product.yml --help | grep -F 'Usage: example'

# should read user overrides and prefer environment settings to global files
DEVTOOL_CONFIG_DIR=global devtool --help | grep -F 'Usage: user-example'
DEVTOOL_CONFIG_DIR=global DEVTOOL_COMMAND_NAME=custom devtool --help | grep -F 'Usage: custom'

# should show help without seeding missing configuration
DEVTOOL_CONFIG_DIR=.results/unseeded devtool --help | grep -F 'Usage: devtool'
test ! -e .results/unseeded

# should read explicitly seeded managed configuration without changing it
bun assembly.ts
cp .results/seeded/config.json .results/seed-before.json
DEVTOOL_CONFIG_DIR=.results/seeded devtool --help | grep -F 'Usage: seeded-example'
cmp .results/seed-before.json .results/seeded/config.json

# should load an imported service definition
devtool --config product.yml info --json | bun -e 'const info = await Bun.stdin.json(); if (info.services[0].type !== "l337") throw new Error("expected l337 service")'

# should read targeted SDK writes without persisting the masking environment value
bun persistence.ts
DEVTOOL_CONFIG_DIR=.results/edited devtool --help | grep -F 'Usage: saved-example'

```

## Testing Library

```sh
# should read product configuration
bun -e '
import assert from "node:assert/strict";
import { createProductConfig } from "@tanaab/devtool";
const config = createProductConfig({ configFile: "product.yml" }).compile().values;
assert.equal(config.commandName, "example");
'

# should prefer explicit options to environment and file values
bun -e '
import assert from "node:assert/strict";
import { createProductConfig } from "@tanaab/devtool";
const config = createProductConfig({
  configFile: "product.yml",
  env: { DEVTOOL_COMMAND_NAME: "environment" },
  commandName: "explicit",
}).compile().values;
assert.equal(config.commandName, "explicit");
'

# should load an imported service definition
bun -e '
import assert from "node:assert/strict";
import { App, createProductConfig } from "@tanaab/devtool";
const app = new App({ root: process.cwd(), definition: [".devtool.yml"], config: createProductConfig({ configFile: "product.yml" }) });
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
and import tags. `writeSource(id, edits, {force, create})` applies a batch of `set`
or `delete` operations to an explicitly writable JSON/YAML source and atomically
publishes a validated revision. Deletion reveals lower layers; `null` remains a
value. A write never saves the merged snapshot. `create` permits a missing file;
`force` permits protected writes, including `system.*`, but cannot bypass app
identity restrictions or read-only CLI discovery metadata. Changed files require an explicit reload before writing.
Edits through imports, anchors or aliases are rejected rather than flattened.
Config commands remain #38.

## Testing Library Config

```sh
# should compose sources, preserve imported scalar types and resolve source-relative paths
bun config.ts

# should assemble product sources and seed persistent settings explicitly
bun assembly.ts

# should persist only requested overrides and retain source and snapshot isolation
bun persistence.ts
```

## Product sources and seeds

`createProductConfig(options, context)` captures environment and path context,
then returns an uncompiled Config. It evaluates the defaults template when called;
files load only when configuration is compiled.

Sources merge in this order: defaults, system, managed, user, app settings, environment,
explicit config file, caller options. Source roles describe ownership; array order controls
precedence.

System configuration defaults to `/etc/<identity>/config.yaml` on Unix or
`%ProgramData%/<identity>/config.yaml` on Windows. If ProgramData is unavailable,
Windows falls back to the user's `AppData/Local` directory. Managed `config.json`
and user `config.yaml` live under `~/.<identity>` by default. Select their directory
with `configDir` or `<PREFIX>_CONFIG_DIR`; use `configFiles` to override individual
locations or set one to `false`. These files are optional and reads never create
them. An explicitly selected `configFile` must exist.

The `defaults` option accepts an object, file path or synchronous function. A
function receives the product identity, config directory, root, home, platform and
captured environment. File defaults retain source-relative paths; object defaults
use the supplied root. There is no generated base file.

`seedConfigFile(file, template, {context, root, schema})` explicitly creates a
complete JSON/YAML seed file, returning `true` when created and `false` when the
destination already exists. Existing destinations are never replaced, including
when another initializer creates one concurrently. Seed files contain only the
template's values, not a flattened effective configuration. Existing Config
instances need an explicit source reload to observe a newly seeded file.
