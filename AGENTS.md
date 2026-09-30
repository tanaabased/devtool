# devtool agent guidance

- Always stylize the product name as `devtool` in human-facing prose.
- Use Node.js and npm; read the pinned upstream runtime from `.node-version`. Bun belongs to a later milestone.
- Keep the extraction baseline in JavaScript. TypeScript conversion, compilation, and publication belong to later work.
- Retained Core source lives in devtool-owned directories. Preserve source notices and record intentional adaptations in `extraction.json` and `EXTRACTION.md`.
- Core Next is a structural reference only. Do not use its `bun-me` checkout or staged changes as extraction input.
- Keep library imports inert. Initialize services, inspect host configuration, or contact Docker only after an explicit caller action.
- Run `npm test` for source/package smoke checks. Container and upstream host-mutating scenarios belong in disposable CI, not on the developer machine.
