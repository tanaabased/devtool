# devtool agent guidance

- Always stylize the product name as `devtool` in human-facing prose.
- Use Bun for installation, development and validation; read the pin from `.bun-version` and keep `packageManager` aligned. Use frozen `bun.lock` installs. Project Node execution is reserved for npm deployment if that pipeline requires it; only then add its authoritative `.node-version`.
- Shared GitHub Actions may use runner-provided Node internally; do not add project Node setup or a development pin for action infrastructure.
- devtool-owned source is strict TypeScript ESM. Bun compatibility does not establish a Node consumer support range; `engines.node` is a separate declaration requiring evidence before publication.
- Keep strict typechecking separate from Bun execution and bundling. Publication belongs to later work.
- Preserve applicable license notices. Record changes through normal commits and behavioral tests.
- Keep library imports inert. Initialize services, inspect host configuration, or contact Docker only after an explicit caller action.
- Treat startup latency and time to first useful command output as primary product requirements, especially for `exec`: container commands should feel native. Stream output promptly; a banner or spinner does not substitute for command responsiveness.
- Keep command paths narrow. Make bundled dependencies statically discoverable while deferring unnecessary initialization and work until needed. Do not replace lazy loading with eager service setup, filesystem scans, or Docker calls as a side effect of migration.
- For changes affecting startup, compare cold and warm invocations of the shipped CLI, using Bun for source and the compiled launcher when available. Measure time to Docker dispatch and first command output against the equivalent direct Docker invocation in a disposable fixture; report median and tail latency separately from container startup and command execution time. Establish measured baselines and regression budgets rather than guessing thresholds; help/version timings alone do not prove `exec` responsiveness.
- `exec` timing is an optimization requirement. Defer a timing CI gate until repeated, paired measurements on the same runner establish useful budgets and runner variability; favor detecting large regressions over brittle absolute cutoffs. Keep timing investigations out of routine pull-request scenario jobs.
- Run `bun run test` for source/package smoke checks. Container and upstream host-mutating scenarios belong in disposable CI, not on the developer machine.
- Follow `examples/AGENTS.md` for CLI/library scenarios and source/compiled/installed targets.

- Until the first release, keep the README to status, prerequisites, one working example and validation commands. Defer expanded guides to prerelease issue #19; keep executable examples and public API comments accurate meanwhile.
- Organize implementations and their tests by owner under services/ and engines/. Keep shared component contracts in components/ and shared runtime orchestration in lib/. Use named scope entrypoints (such as l337.ts), not index.ts; defer manifest registration to #30.
- Keep container packages and shell inputs with their service. Root scripts/ contains maintainer commands; scoped test/ directories contain specs, fixtures and fakes. Give nontrivial utilities focused specs beside their owner.
