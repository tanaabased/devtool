# devtool agent guidance

## Early-stage development

These temporary rules guide foundation work while we establish the API. They take
precedence over release-stage compatibility, documentation and performance
expectations in general canon guidance. Existing correctness, testing, licensing
and host-safety requirements still apply. Review and remove this section when
pirog explicitly agrees that the beta/stable API and release commitments are
established; do not infer that transition from an issue or PR closing.

- We are building toward a stable API. Before beta, prefer the intended API and update repository callers directly; do not retain obsolete interfaces, compatibility wrappers, aliases or deprecation machinery for backward compatibility. Establish compatibility commitments explicitly when we reach beta/stable, rather than assuming them during foundation work.
- Settle ownership and input/output contracts before building dependent features. When feedback changes a contract, update the owning issue and affected callers together; do not preserve an abandoned design just because an earlier plan or test encoded it.
- Implement the current agreed scope. Keep future features in their owning issues instead of adding speculative extension points, migration layers or release infrastructure. Preserve required behavior from Core Next while choosing devtool's own API and ownership boundaries.
- During foundation work, startup performance is design guidance, not a benchmarking or delivery gate. Preserve lazy initialization and prompt streaming; do not add timing scripts, workflow dispatches, benchmarks or performance budgets to ordinary feature work.
- Defer performance optimization and gates until the architecture and command paths are established and pirog explicitly requests that work. At that point, measure cold/warm startup, Docker dispatch and first useful output against direct Docker in disposable CI, separating median/tail latency from container startup and execution time before choosing any regression budget.
- Until the first release, keep the README to status, prerequisites, one working example and validation commands. Defer expanded guides to prerelease issue #19; keep executable examples and public API comments accurate meanwhile.
- Keep durable decisions in the owning issues and contracts beside their code. Update examples and public API comments with implementation changes; do not create parallel architecture guides or document planned APIs as if they already exist.

## Repository guidance

- Always stylize the product name as `devtool` in human-facing prose.
- Use Bun for installation, development and validation; read the pin from `.bun-version` and keep `packageManager` aligned. Use frozen `bun.lock` installs. Project Node execution is reserved for npm deployment if that pipeline requires it; only then add its authoritative `.node-version`.
- Shared GitHub Actions may use runner-provided Node internally; do not add project Node setup or a development pin for action infrastructure.
- devtool-owned source is strict TypeScript ESM. Bun compatibility does not establish a Node consumer support range; `engines.node` is a separate declaration requiring evidence before publication.
- Bun execution and bundling do not typecheck. Gate artifact builds with strict TypeScript checking; keep `typecheck` available for fast feedback.
- Preserve applicable license notices. Record changes through normal commits and behavioral tests.
- Keep library imports inert. Initialize services, inspect host configuration, or contact Docker only after an explicit caller action.
- Treat startup latency and time to first useful command output as primary product requirements, especially for `exec`: container commands should feel native. Stream output promptly; a banner or spinner does not substitute for command responsiveness.
- Keep command paths narrow. Make bundled dependencies statically discoverable while deferring unnecessary initialization and work until needed. Do not replace lazy loading with eager service setup, filesystem scans, or Docker calls as a side effect of migration.
- Tests have two homes: unit tests and Leia integration scenarios. If a proposed test fits neither, ask pirog before adding another harness, probe or test category.
- Unit tests primarily exercise independently testable functions in `utils/` and owner-local utilities. Extract cohesive units from libraries where that simplifies the implementation; light library tests may cover state or orchestration that cannot honestly be separated. Do not build fake end-to-end consumers inside unit tests.
- Integration checks belong in the owning `examples/` Leia scenario, including imports, installed declarations, packaging, CLI behavior and public SDK workflows. Extend existing examples; do not add parallel packed/source consumer runners or repeat each feature through a separate smoke fixture.
- Run `bun run test` for unit tests. Leia uses the compiled CLI and installs the SDK tarball, never the build directory or source fallback. Container and upstream host-mutating scenarios belong in disposable CI, not on the developer machine.
- Pair every active example with CLI and library sections, including `examples/package/`. Keep the feature/interface matrix complete without interface-specific exceptions. Follow `examples/AGENTS.md` for compiled/installed targets.

- Organize implementations and their tests by owner under services/ and engines/. Keep shared component contracts in components/ and shared runtime orchestration in lib/. Use named scope entrypoints (such as l337.ts), not index.ts; defer manifest registration to #30.
- Keep container packages and shell inputs with their service. Root scripts/ contains maintainer commands; scoped test/ directories contain specs and compile-only type tests. Shared test helpers live in root utils/ with descriptive names; integration helpers and fixtures live beside their owning Leia scenario under examples/. Inline small single-spec data fixtures. Keep test helpers out of distribution artifacts. Give every utility a matching focused spec beside its owner.

- `test:cli` and `test:library` select all active example READMEs for their interface and require prepared artifacts. Container scenarios require a disposable runner. Non-container scenarios may run locally. Keep the explicit Lando exclusion until #25 is complete.

- During an optimization pass, implement small, directly related cleanups when their benefit is clear and validation fits the existing checks. Do not turn speculative work into scope merely because it looks small. Record deliberately skipped optimizations, their rationale and revisit conditions in `SKIPPED_OPTIMIZATIONS.md`; consult it before proposing the same change again.
