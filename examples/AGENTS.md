# Example and scenario guidance

- Keep one folder and README per feature. Share fixture inputs; use separate
  project, data and cache roots for each interface or target run. Do not create
  parallel `feature-cli` and `feature-library` folders.
- Use `## Testing CLI` for commands through the actual CLI and
  `## Testing Library` for calls through the package's public exports. Each section must be
  runnable on its own with its setup and cleanup. Add both only when they prove
  useful interface behavior; copying every assertion buys little.
- CLI assertions own argv, stdout/stderr and exit status. Library assertions own
  configuration, returned values, errors, isolated instances and inert imports.
  Shared lifecycle expectations can reuse fixtures and assertion helpers, but a
  library test must not route its calls through the CLI.
- Interface and target are independent choices. Current scenarios use source
  under Bun. Compiled CLI and installed package targets belong to #16; select
  those explicitly when introduced, without changing the feature directory.
- Run Leia under Bun via `bun run leia`. Select sections with
  `--test-header 'Testing CLI'` or `--test-header 'Testing Library'`; those are
  case-sensitive header prefixes. Keep common `Setup` and `Cleanup` sections,
  with interface-specific preparation in helpers when needed. Separate CLI and
  library invocations must receive isolated run roots.
- Keep lifecycle commands visible in Markdown and give each observable contract
  a named test. Use helpers for structured JSON, certificates and snapshots.
- Every Leia test runs in a fresh shell. Put required environment and shell
  options in each test or pass them from the caller; do not rely on a preceding
  test's shell state. Keep meaningful assertions and failure diagnostics.
- `bun run test` is Docker-free. Run `bun run test:integration` only in disposable
  CI with fixture-owned paths and an existing Docker Engine, Buildx and Compose.
  Preserve cleanup after failure and keep resources scoped to the fixture.
- Invoke CLI scenarios as `devtool`, through the prepared source symlink.
  `bun run test:cli` and `bun run test:integration:cli` prepare that alias; CI
  runs `bun run prepare:source-cli` and adds `node_modules/.bin` to `PATH`.
  Keep `bin/devtool.js` as the compiler input. Use Bun explicitly for helper
  scripts and library examples. Keep CommonJS examples until the module migration
  in #12. Do not imply that Bun test results
  prove a Node support range or compiled/installed compatibility.
