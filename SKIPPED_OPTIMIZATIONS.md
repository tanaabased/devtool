# Skipped optimizations

Record deliberate decisions here so the next optimization pass does not reopen
them without new evidence. This is not a feature backlog; planned work belongs
in its GitHub issue.

## Removing lint from the example jobs

Keep `bun run lint` before artifact builds and Leia in each example job, alongside
the dedicated lint job. The repetition is deliberate: invalid code should fail
each example job before expensive builds and scenarios begin. Fix lint and push
again, without waiting for those scenarios to finish first.

This is a gate within each example job, not cross-job cancellation: the matrix
uses `fail-fast: false`, and the unit job runs independently. Revisit only if a
shared lint prerequisite can preserve that early gate and measured CI savings
justify changing the workflow.
