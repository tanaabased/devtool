# Lando API 4 source lifecycle

Run only in disposable CI with existing Docker Engine, Compose and Buildx.
Fixture roots are supplied by the workflow. No installed Lando, proxy, host trust
changes or developer SSH keys are needed.

## Setup

```sh
# should prepare a fixture-owned API 4 project
set -eu
test "$GITHUB_ACTIONS" = true
! command -v lando
bun verify.js setup
```

## Testing CLI

```sh
# should run mapped users, ordered builds, packages, mounts, certificates and shared storage
bun verify.js start

# should reuse images and app state across processes and preserve data across rebuilds
bun verify.js cache

# should propagate image, app and exec failures and recover on retry
bun verify.js failures

# should destroy project storage while retaining product-global storage
bun verify.js destroy
```

## Cleanup

```sh
# should remove the selected project even after a failed assertion
bun ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml" destroy
```
