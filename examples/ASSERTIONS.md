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

| Upstream assertions                                                        | devtool proof                                                                                                                        | Disposition                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `l337`: start/stop/restart/rebuild/info/exec/destroy                       | `examples/l337`, `examples/isolation` and `test/lifecycle.spec.ts`                                                                   | Retained; two projects prove bounded destruction                                                    |
| `lando-v4`: two `true` placeholders                                        | `test/lando.spec.ts`; `examples/lando` actual UID/GID, app/image markers, packages, mounts, entrypoint and state                     | Replaced with observable assertions; developer-key clone omitted                                    |
| `mounts`: placeholder verification, bind/copy and exclusions               | `test/l337.spec.ts`, `test/lando.spec.ts`; `examples/lando` copied content, read-only bind and `/app`                                | Replaced; exclusion shape unit-tested                                                               |
| `storage`: names/labels, sharing, owner/perms, persistence and destruction | `test/lando.spec.ts`; `examples/lando` service/app/global files and label-scoped cleanup                                             | Retained with product-scoped globals; API 3 database commands replaced by file assertions           |
| `command`, `entrypoint`: string, multiline/file, array and image fallback  | `test/lando.spec.ts`; `examples/lando` array command, multiline entrypoint and image CMD fallback                                    | API 4 forms retained; no API 3 builder                                                              |
| `info`: API/type/user/mount/hostnames, image/app state and health          | unit lifecycle assertions and JSON checks in both container fixtures                                                                 | Recorded API 4 state retained; legacy formatting flags excluded                                     |
| `healthcheck`: unknown/disabled, successful checks, retry/exhaustion       | `test/lando.spec.ts`; `examples/lando` app-file healthcheck                                                                          | Retained API 4 behavior; API 3 databases excluded                                                   |
| `certs`: defaults/custom destinations/disabled, SANs and issuer            | `test/lando.spec.ts`; `examples/lando` mounted certificate, SAN and CA verification                                                  | API 4 retained; proxy domains and host trust excluded                                               |
| `security`: container CA installation/environment                          | `examples/lando` CA bundle environment and certificate checks                                                                        | Alpine container path selected; other distro install branches remain unverified                     |
| `events`: API 4 build/state events and ordering                            | `test/l337.spec.ts`, `test/lando.spec.ts`; image/app markers                                                                         | Retained service events/hooks; legacy app-event dispatcher and custom CLI event aliases excluded    |
| `tooling`: service user, environment, argv, execution failures             | explicit `exec` in both container fixtures; `test/lifecycle.spec.ts`, `test/lando.spec.ts`                                           | Retained primitives; dynamic alias parser, background CLI orchestration and API 3 services excluded |
| #5 failure/cache additions                                                 | unit image/app/start/exec failures, cross-process reconstruction; container image/app/exec failures and recovery                     | Added; no success inferred from placeholders                                                        |
| #7 downstream and import boundaries                                        | `test/source-probe.ts`, `test/consumer.spec.ts`, `test/consumer-example.ts`; `examples/isolation` library product-isolation scenario | Bun source library import, host-read/write/process boundaries and independent products              |

Unimplemented upstream features stay absent: `app:first`/`app:changed`/`app:every`,
worker orchestration, extra-user installation and richer build-step shorthand.
Proxy orchestration, host engine/trust installation, plugin discovery, API 3,
publication and broader distribution compatibility remain separate work.
No inherited pending tests count as passed coverage. Container scenarios run only
on disposable Ubuntu 24 CI, with fixture-owned paths and no installed Lando runtime.

## Restored L337 assertions (#16)

Every row below runs in both `Testing CLI` and `Testing Library` in
[`l337/README.md`](l337/README.md). The CLI is the compiled executable; SDK calls
import the installed built ESM package. These are authored runtime assertions;
passing delivery evidence is recorded separately below.

| Recorded Core assertion                                                                                                          | Observable devtool proof                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unbuilt API/type/state, primary/user/app-mount metadata, reference/file/inline inputs                                            | `report unbuilt image variants and service metadata`: structured info for all 16 services and readable image files                                                                         |
| Built state and generated/custom tags                                                                                            | `report a built and running service` / library start: all built tags and actual running containers; custom `image-4` tag retained                                                          |
| Six string/object image reference, Dockerfile and inline forms; service environment                                              | `retain reference, file, inline and object image formats`: container environment for `image-1` through `image-6`, `db` and `web`                                                           |
| Array/object build arguments, buildx enabled/disabled                                                                            | `pass array and object build arguments to both builders`: actual NGINX_VERSION and VIBE in both services                                                                                   |
| Buildx/buildkit multistage COPY, numeric/named owners and chmod                                                                  | `retain buildx and buildkit multistage COPY, numeric owners and modes`: copied stage file plus five owner forms and context mode                                                           |
| Compose build context, Dockerfile-relative and inline COPY; nginx configuration/content                                          | `copy files from each Dockerfile context and serve the copied nginx configuration`: actual copied files and HTTP response                                                                  |
| Default exec user, inferred app mount, explicit working_dir from root/subdirectory, image workdir and `/` fallback               | `honor app mounts, explicit working directories and image fallbacks`: whoami/pwd through fresh processes and mounted subdirectory                                                          |
| Directory/string/src/dest/source/destination context forms, custom COPY/ENV overrides and original source paths                  | `retain context aliases, directories, destinations and instruction overrides`: all inherited paths, absent `/file4` and HALL environment                                                   |
| owner/user/group context forms and permissions                                                                                   | `preserve copied ownership and modes`: container stat results for `/file7`, `/file8`, `/file9`                                                                                             |
| URL context with default/explicit destinations and named ownership                                                               | `ADD remote inputs with default and explicit destinations and ownership`: nonempty remote files and stat; original SeaShanties source pinned at `a7e6ae5e12f32f9afac3a89d78f0afb43e5e0c1e` |
| Group names/shorthand/default/context/system/user, weights, offsets, before/after/pre/post, hyphenated groups and selected users | `order every supported group syntax and execute as the selected user`: exact 24-line `groups.expected`, extracted from PR #330; checks build metadata and actual whoami together           |
| Multiline/array instruction forms; imported Dockerfile and three imported instructions                                           | `run multiline, array and imported instruction formats`: container environment; nested YAML import retains Dockerfile-relative COPY context; lifecycle also uses `!load`                   |
| Unknown-group default and detached singleton weights                                                                             | `use the default for unknown groups and order detached groups by weight`: exact default marker and first/middle/last contents                                                              |
| Read-only short/long bind normalization, HTTP/HTTPS labels, top-level network/volume creation                                    | `mount readable files read-only and create project networks and volumes`: readable contents, rejected write, actual Docker RW/type/source/labels and attached network                      |
| start/stop/restart/rebuild/info/exec/destroy, persistent volumes, image reuse, copied-source invalidation, build failure/retry   | Existing named lifecycle scenarios retained; snapshots cover every image/fingerprint; real containers and project-owned networks/volumes are absent after destroy                          |
| argv, separate stdout/stderr, failing status and prompt streaming                                                                | [`exec/README.md`](exec/README.md), both interfaces                                                                                                                                        |
| Bounded multi-app destruction and product isolation                                                                              | [`isolation/README.md`](isolation/README.md), both interfaces                                                                                                                              |

### Deliberate adaptations and exclusions

- `db` keeps its upstream build/COPY/workdir role but uses Alpine instead of running
  MariaDB. Database behavior was never asserted by this L337 example. Other fixture
  services retain the recorded nginx images and assertion values.
- Fixture input files live under `inputs/`; destinations retain their upstream
  meaning. The existing lifecycle service also serves Core's nginx configuration
  and content. Results are a symlink into generated cache storage, already excluded
  from build staging and fingerprints; test reports cannot become image inputs.
- SSH-agent startup, developer keys, authenticated git clones, `killall ssh-agent`
  and host-wide `lando poweroff` are excluded. The buildx/buildkit fixtures retain
  multistage COPY and ownership/modes with local inputs and known container users.
  Upstream commented ADD checksum/git examples were pending, not executable proof.
- Tooling aliases and the legacy post-start event dispatcher are excluded. Explicit
  service exec retains their environment/user/workdir observations; primary metadata
  is still checked. Legacy `info --service/--path/--format` syntax is replaced by
  public JSON/SDK info, without expanding the CLI parser.
- L337 has no scanner or healthcheck orchestration; the legacy `scanner: false`
  fixture key and dispatcher-provided `healthy` value `unknown` are excluded. Lando healthcheck/app-stage/user installation remains
  disabled or absent as recorded above, pending #25. No such check counts as passed.
- API 3, additional services/discovery, host trust, platform release verification,
  signing and publication remain outside #16.

### Delivered evidence

At revision `01b4068f11c6c7de7f36c684f00c130b193fd60d`,
[Example Tests run 36961660442](https://github.com/tanaabased/devtool/actions/runs/36961660442)
passed all eight enabled feature/interface entries. L337 delivered 21 CLI assertions
and 19 SDK assertions, plus one Setup test per interface: 22 and 20 passing,
respectively. The disabled Lando entry contributes no runtime evidence.
Hosted lint/typechecking and `bun run test` also passed at that revision. No Docker
scenario was executed on the developer host.

[Manual timing run 36961477748](https://github.com/tanaabased/devtool/actions/runs/36961477748)
measured the unchanged runtime code at `9b75aa2` with the existing running Lando
fixture. Three batches of 30 paired samples per mode/target separate startup and
first output from the 20.9-second fixture setup. Across batches, compiled cold
Docker dispatch median was 27.0–27.2 ms (p95 28.3–30.1 ms), and first output median
130.5–133.1 ms (p95 134.8–138.0 ms). Warm compiled dispatch median was 27.0–27.1 ms
(p95 28.2–28.4 ms), and first output median 131.0–132.9 ms (p95 135.0–136.2 ms).
Paired direct Docker first-output medians were 105.1–108.1 ms cold and
105.7–107.6 ms warm. Source dispatch medians were 69.4–70.1 ms cold and
63.7–64.5 ms warm (p95 71.9–74.0 and 65.5–66.4 ms). These are current measured
baselines; this run does not establish a before/after regression budget or a
platform-wide latency guarantee. The full report retains every batch and tail
measurement. No timing gate was added.
