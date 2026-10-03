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

# should preserve typed values and sorted human tables
DEVTOOL_CONFIG_DIR=.results/typed devtool --config typed.yaml config get values --global --json > .results/typed.json
bun -e 'import assert from "node:assert/strict"; const v = await Bun.file(".results/typed.json").json(); assert.deepEqual(v, {boolean:false, zero:0, nullable:null, empty:"", array:[false,0,null,""], "empty-array":[], "empty-object":{}, text:"false"});'
DEVTOOL_CONFIG_DIR=.results/typed devtool --config typed.yaml config get values --global > .results/table
bun -e 'import assert from "node:assert/strict"; const lines = (await Bun.file(".results/table").text()).trim().split("\n").slice(1); const keys = lines.map(line => line.split(/ +/)[0]); assert.deepEqual(keys, [...keys].sort()); assert.match(lines.join("\n"), /nullable +null/); assert.match(lines.join("\n"), /empty +""/);'

# should write a missing global managed file outside an app
rm -rf .results/contextual
(cd ../package && DEVTOOL_CONFIG_DIR=../config/.results/contextual devtool config set cache=false uid=0 'custom.text=a=b=c' 'custom.empty=' 'custom.string="false"' 'custom.array=[false,0,null,""]' --json) > .results/receipt.json
bun -e 'import assert from "node:assert/strict"; const receipt = await Bun.file(".results/receipt.json").json(); assert.equal(receipt.context, "global"); const saved = await Bun.file(".results/contextual/config.json").json(); assert.equal(saved.cache, false); assert.equal(saved.uid, 0); assert.deepEqual(saved.custom, {text:"a=b=c", empty:"", string:"false", array:[false,0,null,""]}); assert.equal(saved.identity, undefined);'

# should report the saved destination and a masking source
DEVTOOL_CONFIG_DIR=.results/contextual DEVTOOL_CACHE=true devtool config set cache=false --global > .results/saved
grep -F 'config.json' .results/saved
grep -F 'masked by environment' .results/saved
DEVTOOL_CONFIG_DIR=.results/contextual DEVTOOL_CACHE=true devtool config get cache --global --extended | grep -F 'environment'

# should enforce protection and preserve the file on failure
cp .results/contextual/config.json .results/before.json
DEVTOOL_CONFIG_DIR=.results/contextual devtool config set system.cache=false --global > .results/error 2>&1 && exit 1
cmp .results/before.json .results/contextual/config.json
DEVTOOL_CONFIG_DIR=.results/contextual devtool config set system.cache=false --global --force
DEVTOOL_CONFIG_DIR=.results/contextual devtool config set system.cli.app-files='[]' --global --force > .results/error 2>&1 && exit 1
grep -F 'read-only' .results/error

# should isolate debug diagnostics from JSON and omit configuration values
DEVTOOL_CONFIG_DIR=.results/contextual devtool config set custom.secret=DO_NOT_LOG_ME --global --debug --json > .results/debug.json 2> .results/debug.stderr
bun -e 'import assert from "node:assert/strict"; assert.equal((await Bun.file(".results/debug.json").json()).edits[0].saved, "DO_NOT_LOG_ME"); const log = await Bun.file(".results/debug.stderr").text(); assert.match(log, /write succeeded/); assert.doesNotMatch(log, /DO_NOT_LOG_ME/);'
DEVTOOL_CONFIG_DIR=.results/contextual devtool config get missing-key --global --json > .results/missing.json 2> .results/error && exit 1
test ! -s .results/missing.json

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
`config get [key]` selects the nearest app or global settings outside an app;
`--global` selects global settings anywhere. Missing keys fail; empty values do not.
`--extended` adds provenance to human output, while `--json` always returns typed data.
`config set key=value [key=value...]` edits the primary appfile's `config` section or
the global managed file. It reports the destination and any higher-priority source
masking a saved setting. `--config` remains a read overlay, never the write target.

Values use JSON literals for booleans, numbers, null, arrays and objects; ordinary
text and an empty right-hand side are strings. Use a JSON-quoted value such as
`'label="false"'` to force a string. Assignments split at the first equals sign.
`--force` permits protected writes but never overrides read-only discovery metadata.
`--debug` sends diagnostics to stderr; `DEBUG` filters namespaces when supplied.

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
