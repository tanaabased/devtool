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

The source runtime uses the pinned Core Node.js version and npm. The source CLI
harness uses Core's Leia 1 release because Leia 2 requires Node 24. Bun is deferred.

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

The retained `builders/lando-v4.js` and its container helpers are reserved for #5;
they are not registered or initialized by the L337 runtime. Hardcoded proxy helper
imports remain in that future builder, with no proxy service or orchestration.

Excluded: the legacy CLI/product/app/plugin bootstrap, API 3 builders and recipes,
external plugin discovery/installation, host engine installation, proxy orchestration,
update/telemetry machinery, compiled artifacts and publication. Core Next's
`bun-me` checkout and staged changes are not extraction input.

Local validation uses temporary fixtures and injected engines/processes. Real
container lifecycle scenarios run only in disposable CI. Broader service and
platform coverage remains in #5–#7.
