# devtool

Tanaab-based development environments, with a configurable TypeScript SDK and
standalone CLI. Development and SDK use require Bun; container operations require
Docker Engine, Buildx and Compose.

## Source installation

Install the Bun version in `.bun-version`. From a source checkout, install
dependencies and link the source entrypoint into a directory on your `PATH`:

```sh
bun install --frozen-lockfile --ignore-scripts
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/bin/devtool.ts" "$HOME/.local/bin/devtool"
export PATH="$HOME/.local/bin:$PATH"
devtool --help
```

Keep the checkout in place and Bun on `PATH`. Persist the `PATH` export in your
shell startup file, or use `bun run devtool --help` directly from the checkout.

A project needs a `.devtool.yml` (or `.devtool.yaml`):

```yaml
name: example
services:
  web:
    type: l337
    image: alpine:3.20
    command: [sleep, infinity]
```

With an existing Docker Engine, Buildx and Compose installation:

```sh
devtool start
devtool exec web -- cat /etc/os-release
devtool info --json
devtool stop
devtool restart
devtool rebuild
devtool destroy
```

The CLI searches upward for an app file; `--file` selects one explicitly. `exec`
passes arguments after `--` unchanged and preserves failure status. Add
`--interactive` to attach a terminal. `info` reports recorded lifecycle and
healthcheck results, rather than querying live container health.

## Package distribution

`bun run build` produces the ESM SDK and declarations in `dist/npm`, its tarball
at `dist/devtool.tgz`, and the standalone CLI at `dist/devtool`. Install the tarball
with Bun and import `@tanaab/devtool`, or copy the executable outside the checkout
and run it without Bun or `node_modules`. Distribute the executable with
`dist/THIRD_PARTY_NOTICES.txt` and [LICENSE](LICENSE).

These are local build artifacts; registry publication and release downloads are
pending. The npm package contains the SDK only; CLI installation via npm is tracked
in [#27](https://github.com/tanaabased/devtool/issues/27). Node and CommonJS consumers
are not supported.

## Library and configuration

```js
import { createDevtool } from '@tanaab/devtool';

const runtime = createDevtool({
  identity: 'wrapper',
  commandName: 'wrapper',
  envPrefix: 'WRAPPER',
  appFiles: ['.wrapper.yml'],
  dataRoot: '/path/to/wrapper-data',
  cacheRoot: '/path/to/wrapper-cache',
});

const app = runtime.loadApp({ cwd: '/path/to/project' });
await app.start();
await app.exec('web', ['echo', 'hello']);
await app.stop();
```

Imports and runtime construction perform no host initialization or engine access.
`loadApp` reads configuration and prepares service artifacts; lifecycle methods
operate Docker. Pass an `engine` when constructing a runtime to supply your own.

Configuration precedence is defaults, then an explicit `configFile`, then prefixed
environment variables, then explicit API/CLI options. Arrays replace earlier
arrays. The prefix is selected by `envPrefix` or derived from the constructor's
`identity`; it is not changed by the file being loaded. Product YAML uses ordinary
YAML parsing. App YAML additionally supports relative `!import` and `!load` inputs.

Defaults use prefix `DEVTOOL`, data under `~/.devtool`, and cache under its `cache`
directory. `--help` lists CLI overrides. `cache: false` / `--no-cache` disables
persistent cache reads and writes; Compose and build artifacts still use the data
root. Image reuse checks recorded inputs and image existence; `rebuild` forces
the build path.

Project identity includes the product and canonical project path. `destroy`
removes the project's containers, Compose networks/volumes and generated files;
external resources, source files, other projects and global storage remain.
Built image tags are retained. Supported service types are API 4 `l337` and `lando`.
Plugin loading, host engine installation, global container names and host networking
are not supported.

## Standalone CLI

The compiled CLI ignores incidental `.env`, `bunfig.toml`, `tsconfig.json` and
`package.json` files. Configure it through product YAML, prefixed environment
variables and CLI options. Embedded build inputs are written under the project's
data directory when needed.

Container lifecycle coverage runs on Ubuntu 24.04 x64. macOS arm64 has local
executable smoke coverage only; other platform baselines remain unverified.

## Testing

Run `bun run typecheck`, `bun run lint`, and `bun run test` for local validation.
The test command runs Docker-free units, builds both artifacts, and checks the
packed SDK from an external consumer.

After building, add `dist/` to `PATH`. `bun run test:cli` and `bun run test:library`
run the Docker-free [configuration example](examples/config/README.md).
`bun run test:integration` runs [L337](examples/l337/README.md),
[exec](examples/exec/README.md) and [isolation](examples/isolation/README.md)
scenarios in disposable CI only. The [service lifecycle scenario](examples/lando/README.md)
is disabled pending [#25](https://github.com/tanaabased/devtool/issues/25).
See [example guidance](examples/AGENTS.md) when adding scenarios.

The manual **Exec Timing** workflow compares source, compiled and direct Docker
calls; [baseline measurements](https://github.com/tanaabased/devtool/pull/24) guide
investigation. Timing is separate from routine PR checks.

## Service features

Set `type: lando` and `api: 4` to use mapped users, `/app`, image/app build hooks,
certificates and persistent storage. `build.image` runs while building the image;
`build.app` accepts a script path or multiline script and runs as the mapped user
before startup. `command` and `entrypoint` accept strings, arrays or scripts and
fall back to image metadata when omitted. The built-in packages are `git`, `sudo`,
`ssh-agent`, `user`, `certs` and `security`; disable optional packages explicitly
when they are unnecessary. No plugin discovery occurs.

User IDs default to the calling process. Override `username`, `uid` and `gid` in
product configuration, or `user` on a service. Certificates and their CA live under
the project's data directory and affect container trust only. `certs: false`
disables service certificates. A project-owned network supplies service aliases;
no proxy or global bridge is required.

`storage: [/data]` creates service-scoped storage. Object entries can select `scope:
app` (shared within the project) or `scope: global` (shared within this product and
data root), plus `owner` and `permissions`. Storage survives stop/restart/rebuild.
`destroy` removes owned service/app storage and preserves global or explicitly
external storage. Different products receive separate namespaces.
