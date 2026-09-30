# Extraction baseline

The exact source revisions and every retained file's original Git blob and mode
are recorded in [extraction.json](./extraction.json). The source checks verify those
bytes without consulting another checkout or GitHub.

| Source | Revision | Use |
| --- | --- | --- |
| [Core main](https://github.com/lando/core/tree/7a87f80576c5cdb5c7d616108bc9aff81150d463) | `7a87f80576c5cdb5c7d616108bc9aff81150d463` | Pristine service source and supporting assets |
| [Core PR #330](https://github.com/lando/core/pull/330) | `3aaa8aaf3f4adae5683897644e8e848fe54aa2cb` | Recorded, not applied; closed without merging |
| [Core Next main](https://github.com/lando/core-next/tree/9cc398d21bf35b8662a199fb9815024d24d599c1) | `9cc398d21bf35b8662a199fb9815024d24d599c1` | Structural reference only |
| [Core Next cli-combine](https://github.com/lando/core-next/tree/9ec49e3bd7a946c5570616d2b53cba0301550636) | `9ec49e3bd7a946c5570616d2b53cba0301550636` | CLI/product/app/configuration boundaries; no copied source |

## Retained source

Upstream paths are preserved beneath `vendor/core/`, with a CommonJS package
boundary. The upstream MIT notice is retained in [LICENSE](./LICENSE).

| Upstream area | Purpose |
| --- | --- |
| `components/l337-v4.js`, `components/docker-engine.js`, `builders/lando-v4.js` | Service and engine source, deferred behind `loadCore()` |
| `components/error.js`, `components/yaml.js`, selected `lib/` and `utils/` files | Import closure, Compose output, YAML tags, errors, mounts, storage, execution, and executable resolution |
| `scripts/` | Boot, entrypoint, exec/multiline exec, hook runner, shell environment, lash, and required in-container installation scripts |
| `packages/{certs,git,security,ssh-agent,sudo,user}/` | Required container helpers and their shell assets |
| `packages/proxy/` helpers | Hardcoded builder imports; no proxy service or orchestration is enabled |

All copied files are unmodified at this step. Root entrypoints, tests, and package
metadata are authored for devtool. Runtime dependencies are declared directly in
`package.json`; built-in modules need no npm dependency.

## Deferred behavior and exclusions

PR #330's pre/post group syntax, stage/default changes, imported image instructions,
and reconstruction of Compose image data belong to [issue #3](https://github.com/tanaabased/devtool/issues/3).
Its built-image guard belongs to [issue #4](https://github.com/tanaabased/devtool/issues/4).
Reconcile these changes onto the pinned newer Core source; preserve its bind-source
safeguards rather than replacing the file with the older branch version.

The configurable runtime, service registration, app loading, lifecycle commands,
certificate/network wiring, and container behavior checks remain in issues #2–#7.
Source loading here is not evidence that services can run.

Excluded: Core's legacy CLI/product/app/plugin bootstrap, API 3 builders and recipes,
plugin discovery/installation, host engine installation, proxy orchestration,
update/telemetry machinery, inherited scenario suites, compiled artifacts, publication,
and the Core Next `bun-me` prototype. Required in-container install scripts remain;
host installers do not. No Core Next source or staged user changes were copied.
