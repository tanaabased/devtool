# Standalone executable

Build with `bun run build`, then run `bun run test:compiled`. The helper copies the
executable into a fresh directory with spaces and exposes only a fixture Docker
command on its PATH. It never contacts Docker. `DEVTOOL_COMPILED_CLI` can select an
exact executable; a missing artifact fails. The source tree is not used by the child.

Disposable Linux CI also runs these checks with `DEVTOOL_ISOLATE=1`: the executable
and fixtures are the only host files mounted into an Ubuntu container without Bun,
Node, node_modules or the checkout. This mode requires Docker and must not run on
the developer machine. The harness remains outside that container.

## Testing CLI

```sh
# should run independently and preserve explicit configuration
set -eu
bun ../../test/compiled-cli.ts config

# should extract executable assets and load build dependencies without source files
set -eu
bun ../../test/compiled-cli.ts assets

# should preserve argv exit status and stream output before the command finishes
set -eu
bun ../../test/compiled-cli.ts streams
```
