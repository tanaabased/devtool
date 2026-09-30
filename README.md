# devtool

Tanaab-based development environments. This source extraction baseline provides
package entrypoints and pinned L337/Lando 4 source. Service lifecycle commands are
not available yet.

Use the Bun version declared in `.bun-version`:

```sh
bun install --frozen-lockfile
bun run devtool --help
bun run devtool --version
bun run test
```

The source library can be imported without running the CLI or initializing the host:

```js
import { name, version, loadCore } from '@tanaab/devtool';

console.log(name, version);
// Explicitly load the unadapted source modules when needed.
const { L337, DockerEngine, lando } = loadCore();
```

`loadCore()` loads upstream modules, including their global listener and executable
discovery behavior. It does not construct services or provide the configurable
runtime planned for the next extraction step. Constructing those services requires
the upstream app/product context.

See [EXTRACTION.md](./EXTRACTION.md) for source revisions, retained assets, and exclusions.
