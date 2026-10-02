# Service lifecycle

Run only in disposable CI with existing Docker Engine, Compose and Buildx.
Fixture roots and the selected `devtool` command on `PATH` are supplied by the
workflow.

This scenario is disabled in the CLI/library CI matrix pending
[#25](https://github.com/tanaabased/devtool/issues/25), which owns the service audit,
completion and rename. Unit tests remain active; they do not establish container
coverage for users, hooks, packages, mounts, storage, certificates or healthchecks.
The certificate/security fixture targets Alpine; other distribution installers
remain unverified. Mount exclusions currently have unit coverage only.
`app:first`/`app:changed`/`app:every`, worker orchestration, extra-user installation
and richer build-step shorthand remain unimplemented. Proxy orchestration and
host trust installation are outside this scenario.

## Setup

```sh
# should prepare a fixture-owned api 4 project
set -eu
test "$GITHUB_ACTIONS" = true
! command -v lando
bun verify.ts setup
```

## Testing CLI

```sh
# should start healthy services with mapped users and completed build state
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" start
bun verify.ts state
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
bun verify.ts entrypoint

# should provide packages container trust and unchanged exec arguments
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" exec web -- git --version | grep -F 'git version'
test "$(devtool --file "$file" exec web -- sudo -n id -u)" = 0
test "$(devtool --file "$file" exec web -- printenv LANDO_CA_BUNDLE)" = /etc/ssl/certs/ca-certificates.crt
test "$(devtool --file "$file" exec web -- printf '%s' 'a b;$HOME')" = 'a b;$HOME'

# should mount certificates signed by the project ca with the service hostname
set -eu
bun verify.ts certificates

# should share storage with the declared ownership and permissions
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
test "$(devtool --file "$file" exec web -- stat -c '%u' /data)" = "$(id -u)"
test "$(devtool --file "$file" exec web -- stat -c '%u:%g' /shared)" = "$(id -u):$(id -g)"
test "$(devtool --file "$file" exec web -- stat -c '%a' /shared)" = 770
devtool --file "$file" exec web -- sh -c 'echo shared > /shared/value; echo global > /global/value; echo persisted > /data/value'
test "$(devtool --file "$file" exec peer -- cat /shared/value)" = shared
bun verify.ts snapshot

# should reuse images and app state across cli invocations
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" start
test "$(devtool --file "$file" exec web -- cat /app/app-proof)" = app
bun verify.ts cached

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
bun verify.ts failed
cp app.sh "$DEVTOOL_FIXTURE_ROOT/lando/app.sh"
devtool --file "$file" start

# should propagate image failure without successful state and recover on retry
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
bun verify.ts break-image
status=0
devtool --file "$file" rebuild > "$DEVTOOL_FIXTURE_ROOT/lando/failure.log" 2>&1 || status=$?
test "$status" -ne 0
bun verify.ts failed
bun verify.ts restore-image
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
bun verify.ts destroyed

# should recover retained global contents without restoring destroyed service storage
set -eu
file="$DEVTOOL_FIXTURE_ROOT/lando/.devtool.yml"
devtool --file "$file" start
test "$(devtool --file "$file" exec web -- cat /global/value)" = global
devtool --file "$file" exec web -- sh -c '! test -f /data/value'
devtool --file "$file" destroy
```
