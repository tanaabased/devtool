# devtool

Tanaab-based development environments, with a TypeScript SDK and standalone CLI.
Pre-release and still taking shape; expect changes before the first release.

Use the Bun version in `.bun-version`. Container operations require Docker Engine,
Buildx and Compose. From a checkout:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run devtool --help
```

Create `.devtool.yml` in your project:

```yaml
name: example
services:
  web:
    type: l337
    image: alpine:3.20
    command: [sleep, infinity]
```

With Docker available:

```sh
bun run devtool start
bun run devtool exec web -- cat /etc/os-release
bun run devtool destroy
```

`bun run build` produces `dist/devtool` and the Bun ESM SDK tarball
`dist/devtool.tgz`. Distribute the executable with `dist/THIRD_PARTY_NOTICES.txt`
and [LICENSE](LICENSE). Registry publication is pending; Node and CommonJS
consumers are not supported.

`DEBUG=devtool:*` enables development logs, including service builds and image-cache decisions.

For local validation:

```sh
bun run typecheck
bun run lint
bun run test
```

Unit tests exercise utilities and focused library behavior. `bun run build` gates
artifact generation with typechecking. Leia scenarios exercise the compiled CLI
and installed SDK tarball; container scenarios and performance measurements run
in disposable CI only.
See the executable [package](examples/package/README.md), [configuration](examples/config/README.md),
[service](examples/l337/README.md), [exec](examples/exec/README.md) and
[isolation](examples/isolation/README.md) examples for more.
