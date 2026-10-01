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

## Testing CLI

```sh
# should start both projects from source and run ordered imported image instructions
set -eu
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start
devtool --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" start
actual=$(devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /order)
test "$actual" = "$(printf 'pre\nmain\npost')"
test "$(devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /marker)" = original

# should expose distinct project identities and one container per project
set -eu
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" info --json > "$DEVTOOL_FIXTURE_ROOT/first.json"
devtool --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" info --json > "$DEVTOOL_FIXTURE_ROOT/second.json"
bun verify.ts info

# should reuse a valid image across source CLI invocations
set -eu
bun verify.ts snapshot
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start
bun verify.ts reused

# should stop and restart with persisted volume contents
set -eu
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- sh -c 'echo retained > /data/value'
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" stop
bun verify.ts stopped
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" restart
test "$(devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /data/value)" = retained

# should rebuild when copied source content changes
set -eu
printf 'changed\n' > "$DEVTOOL_FIXTURE_ROOT/first/marker"
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start
test "$(devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- cat /marker)" = changed
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" rebuild
bun verify.ts changed

# should preserve a failing container command exit code
status=0
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" exec web -- sh -c 'echo deliberate-failure >&2; exit 17' 2> "$DEVTOOL_FIXTURE_ROOT/exec-error" || status=$?
test "$status" -eq 17
grep -F deliberate-failure "$DEVTOOL_FIXTURE_ROOT/exec-error"

# should reject a failed build without persisting success and recover on retry
set -eu
printf 'RUN exit 23\n' > "$DEVTOOL_FIXTURE_ROOT/first/instructions"
status=0
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" rebuild 2> "$DEVTOOL_FIXTURE_ROOT/build-error" || status=$?
test "$status" -ne 0
bun verify.ts failed
cp instructions "$DEVTOOL_FIXTURE_ROOT/first/instructions"
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" start

# should destroy only the selected project
set -eu
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" destroy
bun verify.ts destroyed
test "$(devtool --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" exec web -- cat /marker)" = original
```

## Cleanup

```sh
# should remove only these fixture projects even after failure
set -eu
devtool --file "$DEVTOOL_FIXTURE_ROOT/second/.devtool.yml" destroy
devtool --file "$DEVTOOL_FIXTURE_ROOT/first/.devtool.yml" destroy
```
