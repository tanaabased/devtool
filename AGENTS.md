# devtool agent guidance

- Always stylize the product name as `devtool` in human-facing prose.
- Use Bun as the source runtime and package manager; read the version from `.bun-version`.
- Keep the extraction baseline in JavaScript. TypeScript conversion, compilation, and publication belong to later work.
- `vendor/core/` contains pinned upstream CommonJS source. Preserve relative paths and source notices; record intentional adaptations in `extraction.json` and `EXTRACTION.md`.
- Core Next is a structural reference only. Do not use its `bun-me` checkout or staged changes as extraction input.
- Keep library imports inert. Initialize services, inspect host configuration, or contact Docker only after an explicit caller action.
- Run `bun run test` for source/package smoke checks. Container and upstream host-mutating scenarios belong in disposable CI, not on the developer machine.
