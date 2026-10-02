# Standalone CLI

Run the compiled devtool executable. Config behavior lives in `../config`;
this example owns command discovery and standalone executable checks.

## Setup

```sh
# should install the SDK tarball for the matching version assertion
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
