# Extraction assertion map

Source revisions are recorded in [extraction.json](../extraction.json). This map
covers Core `7a87f805` and the bounded PR #330 port at `3aaa8aaf`. A test listed here
is executable coverage, not a claim that a particular CI revision has passed.
Final acceptance requires unit tests and every enabled feature/interface matrix entry
at the delivered revision. CLI examples use the compiled executable; library examples
consume the installed ESM distribution under Bun. The Docker-free packed-package
checks separately install the SDK tarball outside the checkout and verify
declarations, inert imports, ordinary assets and the library-only package boundary.

The `lando` matrix entry is commented out, and its files are retained unchanged.
All Lando-example runtime assertions listed below are **disabled**, pending the
service audit, specification, completion and rename in
[#25](https://github.com/tanaabased/devtool/issues/25). Its unit tests remain active.
The config CLI scenario retains the isolated executable probe for embedded assets;
L337 itself does not exercise those Lando helpers.

| Upstream assertions                                                                                                                                  | devtool proof                                                                                                                        | Disposition                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `l337`: image references/files/inline content, COPY context, build args, imports, ownership/modes, ports, working directories and bind normalization | `test/l337.spec.ts`; `examples/l337` copied marker and imported instructions                                                         | Unit characterization retained; most variants lack container proof                                   |
| `l337` + #330: pre/post groups, weights, users, hyphenated names, stages, imported instructions, built-image guard                                   | `test/l337.spec.ts`, `test/lifecycle.spec.ts`; `examples/l337` pre/main/post output and cache invalidation                           | Unit characterization retained; container proof covers only pre/main/post ordering and cache changes |
| `l337`: start/stop/restart/rebuild/info/exec/destroy                                                                                                 | `examples/l337`, `examples/isolation` and `test/lifecycle.spec.ts`                                                                   | Retained; two projects prove bounded destruction                                                     |
| `lando-v4`: two `true` placeholders                                                                                                                  | `test/lando.spec.ts`; `examples/lando` actual UID/GID, app/image markers, packages, mounts, entrypoint and state                     | Replaced with observable assertions; developer-key clone omitted                                     |
| `mounts`: placeholder verification, bind/copy and exclusions                                                                                         | `test/l337.spec.ts`, `test/lando.spec.ts`; `examples/lando` copied content, read-only bind and `/app`                                | Replaced; exclusion shape unit-tested                                                                |
| `storage`: names/labels, sharing, owner/perms, persistence and destruction                                                                           | `test/lando.spec.ts`; `examples/lando` service/app/global files and label-scoped cleanup                                             | Retained with product-scoped globals; API 3 database commands replaced by file assertions            |
| `command`, `entrypoint`: string, multiline/file, array and image fallback                                                                            | `test/lando.spec.ts`; `examples/lando` array command, multiline entrypoint and image CMD fallback                                    | API 4 forms retained; no API 3 builder                                                               |
| `info`: API/type/user/mount/hostnames, image/app state and health                                                                                    | unit lifecycle assertions and JSON checks in both container fixtures                                                                 | Recorded API 4 state retained; legacy formatting flags excluded                                      |
| `healthcheck`: unknown/disabled, successful checks, retry/exhaustion                                                                                 | `test/lando.spec.ts`; `examples/lando` app-file healthcheck                                                                          | Retained API 4 behavior; API 3 databases excluded                                                    |
| `certs`: defaults/custom destinations/disabled, SANs and issuer                                                                                      | `test/lando.spec.ts`; `examples/lando` mounted certificate, SAN and CA verification                                                  | API 4 retained; proxy domains and host trust excluded                                                |
| `security`: container CA installation/environment                                                                                                    | `examples/lando` CA bundle environment and certificate checks                                                                        | Alpine container path selected; other distro install branches remain unverified                      |
| `events`: API 4 build/state events and ordering                                                                                                      | `test/l337.spec.ts`, `test/lando.spec.ts`; image/app markers                                                                         | Retained service events/hooks; legacy app-event dispatcher and custom CLI event aliases excluded     |
| `tooling`: service user, environment, argv, execution failures                                                                                       | explicit `exec` in both container fixtures; `test/lifecycle.spec.ts`, `test/lando.spec.ts`                                           | Retained primitives; dynamic alias parser, background CLI orchestration and API 3 services excluded  |
| #5 failure/cache additions                                                                                                                           | unit image/app/start/exec failures, cross-process reconstruction; container image/app/exec failures and recovery                     | Added; no success inferred from placeholders                                                         |
| #7 downstream and import boundaries                                                                                                                  | `test/source-probe.ts`, `test/consumer.spec.ts`, `test/consumer-example.ts`; `examples/isolation` library product-isolation scenario | Bun source library import, host-read/write/process boundaries and independent products               |

Unimplemented upstream features stay absent: `app:first`/`app:changed`/`app:every`,
worker orchestration, extra-user installation and richer build-step shorthand.
Proxy orchestration, host engine/trust installation, plugin discovery, API 3,
publication and broader distribution compatibility remain separate work.
No inherited pending tests count as passed coverage. Container scenarios run only
on disposable Ubuntu 24 CI, with fixture-owned paths and no installed Lando runtime.

## L337 runtime gaps

Core PR #330's `examples/l337/README.md` has 242 lines and directly exercises
image reference/file/inline variants, build arguments, COPY and context options,
file ownership, working-directory fallbacks, read-only mounts, network/volume
creation, and group ordering/users/formats. The extracted example reduced that to
selected lifecycle, import, cache and failure checks. The generated-output unit
assertions above do **not** establish equivalent runtime coverage.

Restoring those applicable Core assertions remains necessary coverage work; the
current readability/matrix change does not claim parity. Reuse the upstream fixture
services and visible assertions, adapting them to devtool's public interfaces.
Omit legacy tooling aliases, API 3, host-wide `lando poweroff`, and developer SSH keys.
The layout contract is in [AGENTS.md](AGENTS.md).
