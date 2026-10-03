# App configuration

The CLI discovers appfiles and supplies the root. App accepts an explicit root
and a definition object, Config, or ordered file list. File names have no special
meaning to App. SDK callers use App and Config directly; `discoverApp()` is
available when they want the CLI discovery conventions.

App retains separate `definition` and `settings` Config instances. Only the
definition's `config` section overlays global settings, below environment and
caller overrides. Product identity is protected from app input; discovery belongs to the CLI.
Host paths use their declaring source; container destinations remain unchanged.

`runCli(args, {appFile, appFiles})` takes discovery policy directly. `appFile`
is a primary filename stem; `appFiles` is the complete ordered list of stems or
`{file, optional?}` entries. Include the primary exactly once by name or `'.'`.
Each stem selects `.yaml` before `.yml`; only the primary identifies a root.
Other layers resolve there and are required unless explicitly optional. Stock
devtool uses `appFile: '.devtool'` and only that primary in `appFiles`.

Discovery returns ordered `sources` and the `primary` write target. CLI metadata
exposes its immutable policy under `system.cli`; it is not a product setting.
Product files, app config sections and environment variables cannot set discovery
policy, even with forced writes. The stock CLI has no arbitrary file flag.
SDK callers use `new App({root, definition: ['application.yaml', 'overlay.json']})`
or supply Config descriptors to choose writable sources. Plain file lists have
no writable destination. Recipes and an early list-augmentation hook remain future work.

`getMetadata()` returns the initialized definition without reading saved state,
constructing services, creating directories or contacting the engine. `prepare()`
materializes services once. Rich `getInfo()` and lifecycle methods prepare on
demand. Later Config edits require a new App to change that initialized snapshot.
Config and exec share serializable command metadata and invocation-owned execution. Full plugin registration and directory caching follow in #34 and #35.

## Setup

```sh
# should install the example dependency
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
```

## Testing CLI

```sh
# should discover the conventional primary without preparing services
rm -rf .results
devtool info --metadata --json | bun -e 'const m = await Bun.stdin.json(); if (m.definition.tooling.hello.service !== "web" || m.system.cli.appFile !== ".devtool") throw new Error("missing definition or CLI metadata")'
test ! -e .results

# should discover the primary from a nested directory
cd service
devtool info --metadata --json | bun -e 'const m = await Bun.stdin.json(); if (!m.root.endsWith("/appconfig") || !m.file.endsWith("/.devtool.yaml")) throw new Error("wrong primary root")'

# should prepare rich service information on demand
devtool info --json | bun -e 'const info = await Bun.stdin.json(); if (info.services[0].type !== "l337") throw new Error("missing service")'

# should reject arbitrary file flags
mkdir -p .results
devtool --file application.yaml info > .results/error 2>&1 && exit 1
grep -F 'Unknown option' .results/error
devtool -f application.yaml info > .results/error 2>&1 && exit 1
grep -F 'Unknown option' .results/error

# should reject product and environment attempts to redefine discovery
mkdir -p .results
devtool --config layers/discovery-rejected.yaml info --metadata > .results/error 2>&1 && exit 1
grep -F 'read-only' .results/error
DEVTOOL_APP_FILES=application.yaml devtool info --metadata > .results/error 2>&1 && exit 1
grep -F 'read-only' .results/error

# should read contextual settings from a nested directory without preparation
rm -rf .results/data .results/cache
(cd service && devtool config get cache --json) | bun -e 'if (await Bun.stdin.json() !== false) throw new Error("expected app setting")'
test ! -e .results/data
test ! -e .results/cache

# should refuse to edit through an imported primary
cp application.yaml .results/imported-before.yaml
devtool config set uid=0 > .results/error 2>&1 && exit 1
grep -F 'scalar or import' .results/error
cmp application.yaml .results/imported-before.yaml

# should edit only the primary document and preserve its comments and imports
mkdir -p .results
cp writable.yaml .results/.devtool.yaml
(cd .results && devtool config set uid=0 custom.empty= 'custom.array=[false,0,null,""]' --json) > .results/receipt.json
bun -e 'import assert from "node:assert/strict"; const receipt = await Bun.file(".results/receipt.json").json(); assert.equal(receipt.source, "app:primary"); assert.equal(receipt.edits[0].saved, 0); const text = await Bun.file(".results/.devtool.yaml").text(); for (const value of ["# Preserve this primary document.", "!import ../service/web.yaml", "&labels", "*labels", "untouched: keep"]) assert.ok(text.includes(value)); assert.ok(!text.includes("identity:"));'
test ! -e .results/data

# should reject protected and read-only app writes without touching the file
cp .results/.devtool.yaml .results/before.yaml
(cd .results && devtool config set system.cache=true) > .results/error 2>&1 && exit 1
cmp .results/before.yaml .results/.devtool.yaml
(cd .results && devtool config set system.cli.app-file=bad --force) > .results/error 2>&1 && exit 1
grep -F 'read-only' .results/error
cmp .results/before.yaml .results/.devtool.yaml

# should reject a malformed app instead of falling back to global configuration
printf 'config: [broken' > .results/.devtool.yaml
(cd .results && devtool config get cache --json) > .results/broken.json 2> .results/error && exit 1
test ! -s .results/broken.json
(cd .results && DEVTOOL_CONFIG_DIR=global devtool config get cache --global --json) | bun -e 'if (await Bun.stdin.json() !== true) throw new Error("expected global setting")'
rm .results/.devtool.yaml

```

## Testing Library

```sh
# should accept objects, Config and ordered files with isolated settings and preparation
bun app.ts

# should preserve primary writes and masking without preparation
bun contextual.ts

# should use custom CLI policy and preserve documents and snapshots across ordered layer writes
bun layers.ts
```
