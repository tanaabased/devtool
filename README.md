# devtool

Tanaab-based development environments. This extraction assembles the existing
Node.js runtime and API 4 L337 and Lando services into one configurable library
and source CLI. Bun, compilation and publication belong to later work.

Use the Node.js version in `.node-version` and npm:

```sh
npm ci
npm test
node bin/devtool.js --help
```

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
node /path/to/devtool/bin/devtool.js start
node /path/to/devtool/bin/devtool.js exec web -- cat /etc/os-release
node /path/to/devtool/bin/devtool.js info --json
node /path/to/devtool/bin/devtool.js stop
node /path/to/devtool/bin/devtool.js restart
node /path/to/devtool/bin/devtool.js rebuild
node /path/to/devtool/bin/devtool.js destroy
```

The CLI searches upward for an app file; `--file` selects one explicitly. `exec`
passes arguments after `--` unchanged and returns the container command's failure
status. Add `--interactive` to attach a terminal. `info` reports recorded lifecycle and healthcheck results; it does not
query live container health.

## Library and configuration

```js
const {createDevtool} = require('@tanaab/devtool');

const runtime = createDevtool({
  identity: 'wrapper',
  commandName: 'wrapper',
  envPrefix: 'WRAPPER',
  appFiles: ['.wrapper.yml'],
  dataRoot: '/path/to/wrapper-data',
  cacheRoot: '/path/to/wrapper-cache',
});

const app = runtime.loadApp({cwd: '/path/to/project'});
await app.start();
await app.exec('web', ['echo', 'hello']);
await app.stop();
```

Importing the library and creating a runtime performs no host initialization or
engine access. `loadApp` reads configuration and prepares service artifacts;
lifecycle methods explicitly operate Docker. Each runtime can receive an injected
`engine` for embedding or tests. The CLI adapter in `lib/cli.js` accepts that same
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

`npm test` runs unit/provenance checks and Docker-free source CLI scenarios. The
[L337](examples/l337/README.md), [Lando](examples/lando/README.md) and
[downstream consumer](examples/consumer/README.md) scenarios run only in disposable
CI with `npm run test:integration`; do not run them on the developer machine.
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
