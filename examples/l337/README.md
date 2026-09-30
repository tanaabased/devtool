# L337 source lifecycle

Run only in disposable CI with an existing Docker Engine, Buildx and Compose.
`DEVTOOL_FIXTURE_ROOT`, `DEVTOOL_DATA_ROOT` and `DEVTOOL_CACHE_ROOT` must identify
runner-owned temporary directories. No Lando installation or proxy is used.

## Setup

```sh
# should prepare two isolated source projects
set -eu
test "$GITHUB_ACTIONS" = true
test -n "$DEVTOOL_FIXTURE_ROOT"
! command -v lando
mkdir -p "$DEVTOOL_FIXTURE_ROOT/first" "$DEVTOOL_FIXTURE_ROOT/second"
cp .devtool.yml Dockerfile instructions marker "$DEVTOOL_FIXTURE_ROOT/first/"
cp .devtool.yml Dockerfile instructions marker "$DEVTOOL_FIXTURE_ROOT/second/"
```

## Testing

```sh
# should start both projects from source and run ordered imported image instructions
set -eu
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" start
actual=$(node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /order)
test "$actual" = "$(printf 'pre\nmain\npost')"
test "$(node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /marker)" = original

# should expose distinct project identities and one container per project
set -eu
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" info --json > "$DEVTOOL_FIXTURE_ROOT/first.json"
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" info --json > "$DEVTOOL_FIXTURE_ROOT/second.json"
node verify.js info

# should reuse a valid image across source CLI invocations
set -eu
node verify.js snapshot
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start
node verify.js reused

# should stop and restart with persisted volume contents
set -eu
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- sh -c 'echo retained > /data/value'
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" stop
node verify.js stopped
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" restart
test "$(node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /data/value)" = retained

# should rebuild when copied source content changes
set -eu
printf 'changed\n' > "$DEVTOOL_FIXTURE_ROOT/first/marker"
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start
test "$(node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /marker)" = changed
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" rebuild
node verify.js changed

# should preserve a failing container command exit code
status=0
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- sh -c 'echo deliberate-failure >&2; exit 17' 2> "$DEVTOOL_FIXTURE_ROOT/exec-error" || status=$?
test "$status" -eq 17
grep -F deliberate-failure "$DEVTOOL_FIXTURE_ROOT/exec-error"

# should reject a failed build without persisting success and recover on retry
set -eu
printf 'RUN exit 23\n' > "$DEVTOOL_FIXTURE_ROOT/first/instructions"
status=0
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" rebuild 2> "$DEVTOOL_FIXTURE_ROOT/build-error" || status=$?
test "$status" -ne 0
node verify.js failed
cp instructions "$DEVTOOL_FIXTURE_ROOT/first/instructions"
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start

# should destroy only the selected project
set -eu
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" destroy
node verify.js destroyed
test "$(node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" exec web -- cat /marker)" = original
```

## Cleanup

```sh
# should remove only these fixture projects even after failure
set -eu
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" destroy
node ../../bin/devtool.js --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" destroy
```
