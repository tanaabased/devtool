# App configuration

The CLI discovers appfiles and supplies the root. App accepts an explicit root
and a definition object, Config, or ordered file list. File names have no special
meaning to App. SDK callers use App and Config directly; `discoverApp()` is
available when they want the CLI discovery conventions.

App retains separate `definition` and `settings` Config instances. Only the
definition's `config` section overlays global settings, below environment and
caller overrides. Identity and discovery settings are protected from app input.
Host paths use their declaring source; container destinations remain unchanged.

Product `preFiles` and `postFiles` contain ordered `{file, optional?}` layers.
They resolve at the discovered root and do not identify roots themselves. Missing
layers fail unless marked optional; defaults are empty. Discovery returns ordered
`sources` and the `primary` write target. Explicit `--file` changes the primary
and root while retaining this layer policy. SDK callers choose writable sources
through Config file descriptors; a plain file list has no writable destination.

`getMetadata()` returns the initialized definition without reading saved state,
constructing services, creating directories or contacting the engine. `prepare()`
materializes services once. Rich `getInfo()` and lifecycle methods prepare on
demand. Later Config edits require a new App to change that initialized snapshot.
Command descriptors and directory caching follow in #34 and #35.

## Setup

```sh
# should install the example dependency
rm -rf ../.tmp/install-cache
bun install --cwd .. --frozen-lockfile --ignore-scripts --force --cache-dir .tmp/install-cache
```

## Testing CLI

```sh
# should read arbitrary appfiles without preparing services
rm -rf .results
devtool --file application.yaml info --metadata --json | bun -e 'const m = await Bun.stdin.json(); if (m.definition.tooling.hello.service !== "web") throw new Error("missing tooling metadata")'
test ! -e .results

# should discover a configured filename from a nested directory
cd service
DEVTOOL_APP_FILES=application.yaml devtool info --metadata --json | bun -e 'const m = await Bun.stdin.json(); if (!m.root.endsWith("/appconfig")) throw new Error("wrong root")'

# should prepare rich service information on demand
devtool --file application.yaml info --json | bun -e 'const info = await Bun.stdin.json(); if (info.services[0].type !== "l337") throw new Error("missing service")'

# should compile pre and post layers and read saved overrides without preparing services
bun layers.ts
devtool --config layers/product.yaml info --metadata --json | bun -e 'const m = await Bun.stdin.json(); if (m.definition.config.uid !== 0 || m.definition.tooling.hello.cmd !== "echo saved") throw new Error("missing saved layer")'

# should retain layer policy when the primary is selected explicitly
bun layers.ts
devtool --config layers/product.yaml --file application.yaml info --metadata --json | bun -e 'const m = await Bun.stdin.json(); if (m.definition.config.system.cache !== true) throw new Error("missing system override")'
```

## Testing Library

```sh
# should accept objects, Config and ordered files with isolated settings and preparation
bun app.ts

# should preserve documents, imports and snapshots across targeted layer writes
bun layers.ts
```
