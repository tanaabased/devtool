# Extraction provenance

[extraction.json](extraction.json) records each retained source path, original Git
blob and executable mode. Adapted files also record their current blob and reason;
the provenance tests check both inventory and dependency resolution.

| Source                                                                                                    | Revision                                   | Use                                                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| [Core main](https://github.com/lando/core/tree/7a87f80576c5cdb5c7d616108bc9aff81150d463)                  | `7a87f80576c5cdb5c7d616108bc9aff81150d463` | Service source, engine, assets and utility regressions         |
| [Core PR #330](https://github.com/lando/core/pull/330)                                                    | `3aaa8aaf3f4adae5683897644e8e848fe54aa2cb` | Bounded L337 changes reconciled onto the newer source          |
| [Core Next main](https://github.com/lando/core-next/tree/9cc398d21bf35b8662a199fb9815024d24d599c1)        | `9cc398d21bf35b8662a199fb9815024d24d599c1` | Structural reference only                                      |
| [Core Next cli-combine](https://github.com/lando/core-next/tree/9ec49e3bd7a946c5570616d2b53cba0301550636) | `9ec49e3bd7a946c5570616d2b53cba0301550636` | Configuration/product/app/storage boundaries; no copied source |

## Ownership and adaptations

Retained code, adapted to strict TypeScript ESM, now lives directly in `components/`, `builders/`, `lib/`,
`utils/`, `packages/` and `scripts/`. There is no duplicate vendor implementation.
The upstream MIT notice remains in [LICENSE](LICENSE).

Development and source validation use Bun 1.4.2, a frozen Bun lockfile, Mocha
running explicitly under Bun, and Leia 2.0.0. Original source revisions and blob hashes remain recorded alongside renamed paths and adaptation hashes. The exists-sync regression traps warnings directly
in its child process instead of relying on Node's `--throw-deprecation` flag,
which Bun ignores. The source import probe also verifies its Bun runtime.

The bounded PR #330 port includes pre/post group syntax, group stage/default
behavior, imported image instructions, constructor-time reconstruction of built
Compose image data, and the app-level built-image guard. The guard additionally
checks input fingerprints and image existence. Newer Core bind-source safeguards
remain intact.

Runtime adaptations remove import-time executable discovery and global listener
changes, isolate app YAML parsing, inject engines per service, and move Compose
assembly/cache persistence into the app lifecycle. Failed builds propagate errors
instead of producing fallback containers. Integration fixes preserve Compose build
arguments and relative contexts, imported image contexts, and long-form mount
handling. Repeated context generation deduplicates sources.

The previously deferred build path required `utils/run-command.ts` and
`utils/get-buildx-error.ts`; both come from the pinned Core revision. All original
shell assets remain inventoried. YAML, write-file and exists-sync regression tests
are ported to native assertions and owned temporary fixtures.

## Boundaries

The retained `builders/lando-v4.ts` is registered explicitly as API 4 `lando`;
its source-library helpers resolve from this checkout; the CLI embeds them. There is no API 3 bootstrap.

Excluded: the legacy CLI/product/app/plugin bootstrap, API 3 builders and recipes,
external plugin discovery/installation, host engine installation, proxy orchestration,
update/telemetry machinery and publication. Core Next's
`bun-me` checkout and staged changes are not extraction input.

Local validation uses temporary fixtures and injected engines/processes. Real
container lifecycle scenarios run only in disposable CI. The enabled L337 and exec scenarios run on Ubuntu 24 CI;
other platforms are not claimed by this milestone.

## API 4 completion (#5–#7)

Only API 4 `l337` and `lando` services are registered. Lando extends the extracted
L337 implementation. Legacy logger/YAML facades, installed-engine discovery and
proxy helpers have been removed; `extraction.json` records the excluded paths.
Shared YAML/file helpers and container scripts remain because API 4 uses them.

Lando receives instance-owned user metadata, a project network, an injected engine
and project-owned certificates. The `mkcert` library generates certificates without
installing host trust. Packages are prepared before image fingerprinting; completed
images reconstruct their command/entrypoint and package mounts on reuse. App hooks
run after all images, before startup. Healthchecks record `unknown`, `true` or
`false`; an unhealthy running service remains running, matching the retained warning
semantics. Build and exec failures propagate to the caller.

Storage names and labels distinguish service, app and product-global scope. Project
destruction removes only its owned service/app storage; global and explicitly
external storage survive. Disposable CI separately removes its own global namespace.
The API 4 exec wrapper loads container environment without evaluating caller argv;
use an explicit shell when shell expansion is intended.

[The assertion map](examples/ASSERTIONS.md) separates executable coverage from
excluded and absent behavior. Library examples import the source package by its public name. CLI examples use
the compiled executable. The retained Lando example is disabled pending #25.

## TypeScript ESM migration (#12)

Owned modules, tests and helpers use TypeScript ESM without moving their owning directories.
Public exports expose the Bun source entrypoint and its configuration, engine, lifecycle and
state types; distribution declarations and compiled artifacts remain later work. ESLint,
standalone Prettier and strict `tsc --noEmit` run separately.

Engine and certificate dependencies load through literal dynamic imports when explicitly needed.
The retained Docker adapter uses composition for its image-build paths; unused legacy
pull/run helpers are removed, and app execution belongs to Compose. Lodash calls use
individual `lodash-es` modules so source loading stays narrow and bundlers can tree-shake them.
Color formatting uses the existing `ansis` dependency instead of the unused Listr task runner.
Module-relative shell assets remain ordinary
files. Package metadata uses a static JSON import. The synchronous file reader retains one
explicit `createRequire` boundary for caller-selected JavaScript data files; npmrc paths are
parsed as JSON. Neither path is service discovery. The import audit parses TypeScript syntax,
including literal dynamic imports, instead of searching for CommonJS calls.

## Standalone compilation (#13)

The explicit `lib/shell-assets.ts` registry imports the 19 retained shell files
with Bun's built-in file loader. Their source bytes and executable modes remain
unchanged. Library calls resolve ordinary module-relative paths; the compiled CLI
materializes only requested files under service-owned temporary storage before
image fingerprinting. Atomic replacement preserves exact bytes and mode `0755`,
including repair after corruption. Changes feed the existing build fingerprint.

Lando boot inputs and image hook registration now run in `prepare()` alongside
package installation, keeping extraction off `exec` and `info`. Builder and
package adaptations are recorded in `extraction.json`. No prototype or Core Next
source was imported.
