# Example and scenario guidance

- Write examples as instructions a person can follow from that directory. Keep
  ordinary `devtool` commands visible, with short `# should ...` assertions in
  Leia's Markdown blocks. Do not turn the README into a fixture-management script.
- Organize folders by functionality. Use multiple services for image, build,
  mount or command variants. When a behavior needs genuinely separate projects
  or app files, check those fixtures into named directories; do not clone an
  example into temporary roots during setup.
- Keep multi-app and product-isolation assertions in `isolation/`. Other feature
  examples use one app unless the feature itself requires more.
- Model scenarios on the corresponding Lando Core examples. Carry forward each
  applicable observable assertion, adapting command names and public API usage.
  Record exclusions and runtime gaps in `ASSERTIONS.md`; generated-output unit
  tests do not replace proof that the behavior works in a container.
- Each feature README has independently runnable `## Testing CLI` and
  `## Testing Library` sections for the Cartesian feature/interface matrix.
  Shared `## Setup` installs the required dependencies. Keep library code beside the
  README and import `@tanaab/devtool` by its public package export, never
  through a relative path into implementation source. Setup installs the built
  ESM package through `examples/package.json` and its frozen lockfile. Force the
  local file dependency to refresh so repeated builds cannot use stale output.
- CLI examples invoke the compiled `devtool` already on `PATH`. Library examples
  use the installed ESM SDK under Bun. Missing
  artifacts must fail; never fall back to another target. Do not route library
  tests through a CLI wrapper just to share assertions.
- Use the example directory as the app root. Set fixed environment values in the
  workflow or invocation, without `GITHUB_ENV` bookkeeping. Runtime data and
  cache paths may point to disposable runner storage. Avoid fixture-root variables,
  repeated `set -eu`, CI guards, executable-discovery assertions and unrelated
  environment checks in the README. Harness restrictions belong in the harness.
- Every Leia test runs in a fresh shell. Do not depend on shell variables or `cd`
  from another test. Keep related commands in one test and let Leia report failures.
- Prefer visible output assertions. Use small, named helpers only for checks
  that would obscure the example, such as certificate validation or structured
  snapshots. Do not hide an entire lifecycle behind `verify.ts`.
- Container scenarios run only in disposable CI with Docker Engine, Buildx and
  Compose. Do not use developer SSH keys, install host trust or manage unrelated
  applications. The runner owns final cleanup; keep explicit destroy assertions
  when they verify product behavior. Unit tests and typechecking stay separate.
- Run Leia under Bun with `--test-header 'Testing CLI'` or
  `--test-header 'Testing Library'`. These are case-sensitive header prefixes.
  Use TypeScript ESM for library examples. Bun execution does not prove Node
  compatibility or published-package behavior.
