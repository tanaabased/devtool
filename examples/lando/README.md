# Lando API 4 source lifecycle

Run only in disposable CI with existing Docker Engine, Compose and Buildx.
Fixture roots and the source `devtool` command on `PATH` are supplied by the
workflow. No installed Lando, proxy, host trust changes or developer SSH keys
are needed.

## Setup

```sh
# should prepare a fixture-owned api 4 project
set -eu
test "$GITHUB_ACTIONS" = true
! command -v lando
bun verify.js setup
```

## Testing CLI

```sh
# should start healthy services with mapped users and completed build state
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" start
bun verify.js state
test "$(devtool --file "$file" exec web -- id -u)" = "$(id -u)"
test "$(devtool --file "$file" exec web -- id -g)" = "$(id -g)"
test "$(devtool --file "$file" exec web -- pwd)" = /app

# should copy files and preserve read-only mounts
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
test "$(devtool --file "$file" exec web -- cat /copied)" = copied
test "$(devtool --file "$file" exec web -- cat /read-only)" = 'read only'
devtool --file "$file" exec web -- sh -c '! printf overwritten > /read-only'
test "$(devtool --file "$file" exec web -- cat /read-only)" = 'read only'

# should complete image and app hooks and the custom entrypoint
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
test "$(devtool --file "$file" exec web -- cat /tmp/image-proof)" = image
test "$(devtool --file "$file" exec web -- cat /app/app-proof)" = app
bun verify.js entrypoint

# should provide packages container trust and unchanged exec arguments
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" exec web -- git --version | grep -F 'git version'
test "$(devtool --file "$file" exec web -- sudo -n id -u)" = 0
test "$(devtool --file "$file" exec web -- printenv LANDO_CA_BUNDLE)" = /etc/ssl/certs/ca-certificates.crt
test "$(devtool --file "$file" exec web -- printf '%s' 'a b;$HOME')" = 'a b;$HOME'

# should mount certificates signed by the project ca with the service hostname
set -eu
bun verify.js certificates

# should share storage with the declared ownership and permissions
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
test "$(devtool --file "$file" exec web -- stat -c '%u' /data)" = "$(id -u)"
test "$(devtool --file "$file" exec web -- stat -c '%u:%g' /shared)" = "$(id -u):$(id -g)"
test "$(devtool --file "$file" exec web -- stat -c '%a' /shared)" = 770
devtool --file "$file" exec web -- sh -c 'echo shared > /shared/value; echo global > /global/value; echo persisted > /data/value'
test "$(devtool --file "$file" exec peer -- cat /shared/value)" = shared
bun verify.js snapshot

# should reuse images and app state across cli invocations
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" start
test "$(devtool --file "$file" exec web -- cat /app/app-proof)" = app
bun verify.js cached

# should preserve volume contents and app state across stop and restart
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" stop
devtool --file "$file" restart
test "$(devtool --file "$file" exec web -- cat /data/value)" = persisted
test "$(devtool --file "$file" exec web -- cat /app/app-proof)" = app

# should preserve storage and repeat app hooks on rebuild
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" rebuild
test "$(devtool --file "$file" exec web -- cat /data/value)" = persisted
test "$(devtool --file "$file" exec web -- cat /app/app-proof)" = "$(printf 'app\napp')"

# should propagate app failure without successful state and recover on retry
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
printf '#!/bin/sh\nexit 19\n' > "$DEVTOOL_FIXTURE_ROOT/lando/app.sh"
status=0
devtool --file "$file" start > "$DEVTOOL_FIXTURE_ROOT/lando/failure.log" 2>&1 || status=$?
test "$status" -eq 19
bun verify.js failed
cp app.sh "$DEVTOOL_FIXTURE_ROOT/lando/app.sh"
devtool --file "$file" start

# should propagate image failure without successful state and recover on retry
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
bun verify.js break-image
status=0
devtool --file "$file" rebuild > "$DEVTOOL_FIXTURE_ROOT/lando/failure.log" 2>&1 || status=$?
test "$status" -ne 0
bun verify.js failed
bun verify.js restore-image
devtool --file "$file" start

# should preserve a failing exec exit code
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
status=0
devtool --file "$file" exec web -- sh -c 'exit 17' > "$DEVTOOL_FIXTURE_ROOT/lando/failure.log" 2>&1 || status=$?
test "$status" -eq 17

# should destroy project resources while retaining global storage and source files
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" destroy
devtool --file "$file" destroy
bun verify.js destroyed

# should recover retained global contents without restoring destroyed service storage
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" start
test "$(devtool --file "$file" exec web -- cat /global/value)" = global
devtool --file "$file" exec web -- sh -c '! test -f /data/value'
devtool --file "$file" destroy
```

## Cleanup

```sh
# should remove the selected project even after a failed assertion
devtool --file "$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml" destroy
```
