# devtool agent guidance

## Current scope

We are establishing the runtime, public API and CLI/library interfaces before
alpha. This scope takes precedence over release-stage expectations in general
canon guidance; correctness, testing, licensing and host safety still apply.
Revisit it with pirog when we agree on alpha/beta readiness. An issue or PR closing
does not change scope or establish compatibility commitments.

### In scope

- Build the runtime and establish clear configuration, app, service, engine and CLI/library contracts. Preserve required behavior from Core Next while choosing devtool's own API and ownership boundaries.
- Settle ownership and input/output contracts before building dependent features. When feedback changes a contract, update the owning issue and affected callers together; do not preserve an abandoned design just because an earlier plan or test encoded it.
- Prefer the intended API and update repository callers directly. Keep durable decisions in owning issues and contracts beside their code, with executable examples and public API comments reflecting implemented behavior.
- Treat startup responsiveness as design guidance: preserve lazy initialization, narrow command paths and prompt streaming.

### Out of scope

- Backward-compatibility wrappers, obsolete aliases and deprecation machinery before beta. Establish compatibility commitments explicitly at beta/stable rather than assuming them now.
- Speculative extension points, migration layers and release infrastructure. Keep future features in their owning issues; manifest registration remains #30 and Lando completion remains #25.
- Benchmark scripts, timing workflow dispatches, performance budgets and gates during ordinary feature work. Revisit performance optimization only when command paths are established and pirog explicitly requests it; then compare cold/warm startup, dispatch and first output against direct Docker in disposable CI, separating median/tail latency from container execution before choosing budgets.
- Expanded guides before prerelease documentation work in #19. Until the first release, keep the README to status, prerequisites, one working example and validation commands. Do not add parallel architecture guides or document planned APIs as implemented.

## Architecture and ownership

- The CLI owns conventional app filenames, discovery and upward traversal, and supplies the discovered app root. App accepts an explicit root and a definition object, Config instance or ordered files; it does not discover apps or require conventional filenames.
- Config owns source composition, validation, provenance and snapshots. Keep app definitions separate from effective product settings; overlay the definition's config section through Config rather than introducing another merge system.
- Keep library imports inert and metadata available before preparation. App preparation owns service construction and host effects; engine contact requires an explicit caller action.
- Resolve known host paths relative to their defining source. Preserve container paths and image references; do not normalize arbitrary strings as host paths.
- Organize implementations and their tests by owner under services/ and engines/. Keep shared component contracts in components/ and shared runtime orchestration in lib/. Use named scope entrypoints (such as l337.ts).
- Keep container packages and shell inputs with their service. Root scripts/ contains maintainer commands; scoped test/ directories contain specs and compile-only type tests. Shared test helpers live in root utils/ with descriptive names; integration helpers and fixtures live beside their owning Leia scenario under examples/. Inline small single-spec data fixtures. Keep test helpers out of distribution artifacts. Give every utility a matching focused spec beside its owner.

## Runtime and tooling

- Always stylize the product name as `devtool` in human-facing prose.
- Use Bun for installation, development and validation; read the pin from `.bun-version` and keep `packageManager` aligned. Use frozen `bun.lock` installs. Project Node execution is reserved for npm deployment if that pipeline requires it; only then add its authoritative `.node-version`.
- Shared GitHub Actions may use runner-provided Node internally; do not add project Node setup or a development pin for action infrastructure.
- devtool-owned source is strict TypeScript ESM. Bun compatibility does not establish a Node consumer support range; `engines.node` is a separate declaration requiring evidence before publication.
- Bun execution and bundling do not typecheck. Gate artifact builds with strict TypeScript checking; keep `typecheck` available for fast feedback.
- Preserve applicable license notices. Record changes through normal commits and behavioral tests.
- Treat startup latency and time to first useful command output as primary product requirements, especially for `exec`: container commands should feel native. Stream output promptly; a banner or spinner does not substitute for command responsiveness.
- Keep command paths narrow. Make bundled dependencies statically discoverable while deferring unnecessary initialization and work until needed. Do not replace lazy loading with eager service setup, filesystem scans, or Docker calls as a side effect of migration.

## Test design

- Tests have two homes: unit tests and Leia integration scenarios. If a proposed test fits neither, ask pirog before adding another harness, probe or test category.
- Unit tests primarily exercise independently testable functions in `utils/` and owner-local utilities. Extract cohesive units from libraries where that simplifies the implementation; light library tests may cover state or orchestration that cannot honestly be separated. Do not build fake end-to-end consumers inside unit tests.
- Integration checks belong in the owning `examples/` Leia scenario, including imports, installed declarations, packaging, CLI behavior and public SDK workflows. Extend existing examples; do not add parallel packed/source consumer runners or repeat each feature through a separate smoke fixture.
- Assert stable public, configuration and safety contracts precisely. For incidental diagnostic prose, assert the owned semantic signal. Derive real versions from canonical metadata and use clearly synthetic values in fixtures.
- Keep unit tests deterministic: inject environment-sensitive boundaries instead of relying on sleeps, notifications or process timing. Test our adapter decisions rather than re-testing third-party implementations.
- Leia uses the compiled CLI and installs the SDK tarball, never the build directory or source fallback. Container and upstream host-mutating scenarios belong in disposable CI, not on the developer machine.
- Pair every active example with CLI and library sections, including `examples/package/`. Keep the feature/interface matrix complete without interface-specific exceptions. Follow `examples/AGENTS.md` for compiled/installed targets.

## Validation

- Run focused unit tests first, then `bun run lint` and `bun run test` for implementation changes. Use `bun run typecheck` for fast feedback; `bun run build` already includes it and prepares the CLI and SDK artifacts for affected Leia checks.
- `test:cli` and `test:library` select all active example READMEs for their interface and require prepared artifacts. Container scenarios require a disposable runner. Non-container scenarios may run locally. Keep the explicit Lando exclusion until #25 is complete.
- Use `git diff --check` and the relevant format checks for guidance-only edits. Keep generated artifacts, Leia harnesses, dependencies and scenario scratch state out of commits. Report skipped validation and its reason; local results do not establish hosted CI success.

## Optimization discipline

- During an authorized implementation pass, include small, directly related cleanups when their benefit is clear and validation fits existing checks. Keep audits read-only. Do not turn speculative work into scope merely because it looks small. Record deliberately skipped optimizations, their rationale and revisit conditions in `SKIPPED_OPTIMIZATIONS.md`; consult it before proposing the same change again.
