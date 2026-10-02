# devtool

Tanaab-based development environments. This extraction assembles the existing
TypeScript ESM runtime and API 4 L337 and Lando services into one configurable library
and compiled CLI. Development and consumer validation run on Bun. A local npm SDK artifact
is available; registry publication belongs to later work.

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

## Package distribution

`bun run build` stages the typed ESM SDK in `dist/npm`, packs it as
`dist/devtool.tgz`, and compiles the standalone CLI as `dist/devtool`. Install the
SDK tarball with Bun to use the library, or run the executable directly to use
the CLI. These artifacts are local; npm publication and executable release
downloads belong to later release work.

The library's only public export is `@tanaab/devtool`. It includes declarations,
ordinary package-relative shell assets and retained source notices. The SDK tarball
and `dist/THIRD_PARTY_NOTICES.txt` carry notices collected from the compiled
dependency graph. The source checkout stays
private; the staged distribution has its own explicit exports and file allowlist.

The npm package provides the SDK only. npm CLI installation is deferred to
[#27](https://github.com/tanaabased/devtool/issues/27); the CLI
uses standalone executables. No Node library support range or CommonJS build is
claimed. Platform support follows the runtime evidence listed below.

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

## Standalone CLI

With the pinned Bun installed, `bun run build` produces `dist/devtool` for the
current platform with embedded Bun bytecode and all 19 retained shell assets.
Copy the executable outside the checkout and invoke it directly; no separately
installed JavaScript runtime or `node_modules` is required. Docker Engine,
Compose and Buildx remain explicit host prerequisites for lifecycle commands.

The compiled CLI ignores incidental `.env`, `bunfig.toml`, `tsconfig.json` and
`package.json` files. Use product YAML, prefixed environment variables and CLI
options through the existing configuration contract. Build inputs materialize
only when preparing a Lando image, under the selected project's data directory;
unchanged files are reused and damaged bytes or modes are restored atomically.
Library operations continue to use ordinary module-relative asset files.

The config and exec CLI scenarios check executable isolation, embedded assets and
streaming through `test/compiled-cli.ts` without contacting Docker.
Disposable CI additionally isolates it from the checkout, dependencies and
installed runtimes, then runs the existing L337/Lando lifecycle scenarios.
The verified lifecycle target is Linux x64 on the Ubuntu 24.04 hosted runner
(kernel 6.17.0-1022-azure), with the same executable passing runtime-free isolation
in an Ubuntu 24.04 container. macOS 27.0.1 arm64 has local executable smoke evidence
only. Older OS/kernel/CPU baselines, other architectures and Windows have not been
validated; cross-compilation alone does not establish support.

The manual **Exec Timing** workflow compares source, compiled and direct Docker
calls on one disposable runner. [Initial measurements](https://github.com/tanaabased/devtool/pull/24)
set provisional investigation budgets for paired compiled overhead over direct
Docker: 25 ms median for dispatch and first output, 26 ms dispatch p95 and 36 ms
first-output p95. These round up the worst observed values across three batches;
exceeding them calls for another paired investigation, not an automatic CI failure.
Runner-to-runner variance remains unmeasured. Timing stays outside routine PR jobs.

## Testing

`bun run test` runs Docker-free source units, builds and packs the distribution,
then installs it into an external temporary consumer for strict declaration, inert
import and asset checks. `bun run build`
creates the CLI used by the [config](examples/config/README.md),
[L337](examples/l337/README.md), [exec](examples/exec/README.md) and
[isolation](examples/isolation/README.md) examples.
Add `dist/` to `PATH` before running the CLI scenarios. Each example installs its
dependencies in Leia's Setup section from the built ESM package.
An example-local package boundary prevents source self-reference.

`bun run test:cli` and `bun run test:library` select the Docker-free config example.
`bun run test:integration` selects the container examples and runs only in disposable
CI. The PR workflow builds the CLI in each feature/interface job, with unit tests
and typechecking kept separate. The Lando example remains checked in but is disabled
pending [#25](https://github.com/tanaabased/devtool/issues/25).

The [example guidance](examples/AGENTS.md) defines the layout. Each scenario records
its relevant exclusions and runtime gaps. Bun tests do not establish Node compatibility.

## Attribution

devtool adapts API 4 service, engine, shell and utility code from
[Lando Core](https://github.com/lando/core/tree/7a87f80576c5cdb5c7d616108bc9aff81150d463),
with L337 group, image-import, built-state and fixture changes from
[Core PR #330](https://github.com/lando/core/tree/3aaa8aaf3f4adae5683897644e8e848fe54aa2cb).
The upstream MIT notice is preserved in [LICENSE](LICENSE). Core Next informed
the structure; no Core Next source was copied. Commit history records subsequent adaptations.

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
