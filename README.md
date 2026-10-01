# devtool

Tanaab-based development environments. This extraction assembles the existing
TypeScript ESM runtime and API 4 L337 and Lando services into one configurable library
and source CLI. Development and validation run on Bun; compilation and publication
belong to later work.

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

Keep the checkout in place: the symlink points to its Bun entrypoint. Add the
`PATH` export to your shell startup file to keep the command available in later
shells; Bun must also be on `PATH`. From the checkout, `bun run devtool --help`
uses the package script directly.

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
passes arguments after `--` unchanged and returns the container command's failure
status. Add `--interactive` to attach a terminal. `info` reports recorded lifecycle and healthcheck results; it does not
query live container health.

## Library and configuration

```js
import { createDevtool } from '/path/to/devtool/lib/devtool.ts';

const runtime = createDevtool({
  identity: 'wrapper',
  commandName: 'wrapper',
  envPrefix: 'WRAPPER',
  appFiles: ['.wrapper.yml'],
  dataRoot: '/path/to/wrapper-data',
  cacheRoot: '/path/to/wrapper-cache',
});

async function main() {
  const app = runtime.loadApp({ cwd: '/path/to/project' });
  await app.start();
  await app.exec('web', ['echo', 'hello']);
  await app.stop();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Importing the library and creating a runtime performs no host initialization or
engine access. `loadApp` reads configuration and prepares service artifacts;
lifecycle methods explicitly operate Docker. Each runtime can receive an injected
`engine` for embedding or tests. The CLI adapter in `lib/cli.ts` accepts that same
runtime.

Configuration precedence is defaults, then an explicit `configFile`, then prefixed
environment variables, then explicit API/CLI options. Arrays replace earlier
arrays. The prefix is selected by `envPrefix` or derived from the constructor's
`identity`; it is not changed by the file being loaded. Product YAML uses ordinary
YAML parsing. App YAML additionally supports relative `!import` and `!load` inputs.

Defaults use product `devtool`, command `devtool`, prefix `DEVTOOL`, data under
`~/.devtool`, and cache under its `cache` directory. `--help` lists CLI overrides.
`cache: false` / `--no-cache` disables persistent cache reads and writes without
removing existing cache. Necessary Compose and build artifacts still use the data
root. Image reuse checks recorded inputs and image existence; `rebuild` forces the
build path, including refreshing mutable remote inputs through Docker's normal
build behavior.

Project identity includes the product and canonical project path. `destroy`
removes the project's containers, Compose networks/volumes and generated files;
external resources, source files, other projects and global storage remain.
Built image tags are retained. Only API 4 `l337` and `lando` services are registered; API 3 is rejected. Plugin loading,
host engine installation, global container names and host networking are excluded.

## Testing

`bun run test` runs unit/provenance checks and Docker-free source CLI/library scenarios. The
[L337](examples/l337/README.md), [Lando](examples/lando/README.md) and
[downstream consumer](examples/consumer/README.md) scenarios run only in disposable
CI with `bun run test:integration`; do not run them on the developer machine.
`bun run test:cli` and `bun run test:library` select the interfaces independently.
The CLI scripts prepare a source symlink in `node_modules/.bin`, which Bun puts on
the test command’s `PATH`. CI runs source and container CLI/library scenarios in
parallel jobs, with unit tests in their own job.
The [example guidance](examples/AGENTS.md) defines CLI/library sections and target
selection. The existing `engines.node` declaration is retained; this Bun suite
does not verify Node consumer compatibility.
The [assertion map](examples/ASSERTIONS.md) records retained and excluded behavior.

[EXTRACTION.md](EXTRACTION.md) records source revisions, adaptations and exclusions.

## Lando service

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
