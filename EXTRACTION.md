# Extraction provenance

[extraction.json](extraction.json) records each retained source path, original Git
blob and executable mode. Adapted files also record their current blob and reason;
the provenance tests check both inventory and dependency resolution.

| Source | Revision | Use |
| --- | --- | --- |
| [Core main](https://github.com/lando/core/tree/7a87f80576c5cdb5c7d616108bc9aff81150d463) | `7a87f80576c5cdb5c7d616108bc9aff81150d463` | Service source, engine, assets and utility regressions |
| [Core PR #330](https://github.com/lando/core/pull/330) | `3aaa8aaf3f4adae5683897644e8e848fe54aa2cb` | Bounded L337 changes reconciled onto the newer source |
| [Core Next main](https://github.com/lando/core-next/tree/9cc398d21bf35b8662a199fb9815024d24d599c1) | `9cc398d21bf35b8662a199fb9815024d24d599c1` | Structural reference only |
| [Core Next cli-combine](https://github.com/lando/core-next/tree/9ec49e3bd7a946c5570616d2b53cba0301550636) | `9ec49e3bd7a946c5570616d2b53cba0301550636` | Configuration/product/app/storage boundaries; no copied source |

## Ownership and adaptations

Retained CommonJS code now lives directly in `components/`, `builders/`, `lib/`,
`utils/`, `packages/` and `scripts/`. There is no duplicate vendor implementation.
The upstream MIT notice remains in [LICENSE](LICENSE).

Development and source validation use Bun 1.4.2, a frozen Bun lockfile, Mocha
running explicitly under Bun, and Leia 2.0.0. JavaScript/CommonJS and the original
source revisions remain intact. The exists-sync regression traps warnings directly
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

The previously deferred build path required `utils/run-command.js` and
`utils/get-buildx-error.js`; both come from the pinned Core revision. All original
shell assets remain inventoried. YAML, write-file and exists-sync regression tests
are ported to native assertions and owned temporary fixtures.

## Boundaries

The retained `builders/lando-v4.js` is registered explicitly as API 4 `lando`;
its container helpers resolve from this checkout. There is no API 3 bootstrap.

Excluded: the legacy CLI/product/app/plugin bootstrap, API 3 builders and recipes,
external plugin discovery/installation, host engine installation, proxy orchestration,
update/telemetry machinery, compiled artifacts and publication. Core Next's
`bun-me` checkout and staged changes are not extraction input.

Local validation uses temporary fixtures and injected engines/processes. Real
container lifecycle scenarios run only in disposable CI. The selected API 4 scenarios and downstream consumer run on Ubuntu 24 CI;
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
excluded and absent behavior. The downstream example imports the source package
from outside its checkout; it makes no compiled-distribution or publication claim.
