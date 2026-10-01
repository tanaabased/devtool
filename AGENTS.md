# devtool agent guidance

- Always stylize the product name as `devtool` in human-facing prose.
- Use Bun for installation, development and validation; read the pin from `.bun-version` and keep `packageManager` aligned. Use frozen `bun.lock` installs. Node is reserved for npm deployment if that pipeline requires it; only then add its authoritative `.node-version`.
- JavaScript/CommonJS source remains the baseline. Bun compatibility does not establish a Node consumer support range; `engines.node` is a separate declaration requiring evidence before publication.
- Keep the extraction baseline in JavaScript. TypeScript conversion, compilation, and publication belong to later work.
- Retained Core source lives in devtool-owned directories. Preserve source notices and record intentional adaptations in `extraction.json` and `EXTRACTION.md`.
- Core Next is a structural reference only. Do not use its `bun-me` checkout or staged changes as extraction input.
- Keep library imports inert. Initialize services, inspect host configuration, or contact Docker only after an explicit caller action.
- Treat startup latency and time to first useful command output as primary product requirements, especially for `exec`: container commands should feel native. Stream output promptly; a banner or spinner does not substitute for command responsiveness.
- Keep command paths narrow. Make bundled dependencies statically discoverable while deferring unnecessary initialization and work until needed. Do not replace lazy loading with eager service setup, filesystem scans, or Docker calls as a side effect of migration.
- For changes affecting startup, compare cold and warm invocations of the shipped CLI, using Bun for source and the compiled launcher when available. Measure time to Docker dispatch and first command output against the equivalent direct Docker invocation in a disposable fixture; report median and tail latency separately from container startup and command execution time. Establish measured baselines and regression budgets rather than guessing thresholds; help/version timings alone do not prove `exec` responsiveness.
- Run `bun run test` for source/package smoke checks. Container and upstream host-mutating scenarios belong in disposable CI, not on the developer machine.
- Follow `examples/AGENTS.md` for CLI/library scenarios and source/compiled/installed targets.
