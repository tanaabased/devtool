# Source CLI

Check the source entrypoint's information and failure behavior. This scenario does
not initialize services or contact Docker.

## Testing

```sh
# should show source help successfully
set -eu
unset FORCE_COLOR
export NO_COLOR=1
help=$(node ../../bin/devtool.js --help)
printf '%s\n' "$help" | grep -F 'Usage: devtool'
printf '%s\n' "$help" | grep -F -- '--version'
printf '%s\n' "$help" | grep -F 'start, stop, restart, rebuild, info, exec, destroy'

# should show help when invoked without arguments
set -eu
unset FORCE_COLOR
export NO_COLOR=1
node ../../bin/devtool.js | grep -F 'Usage: devtool'

# should report the package version exactly
set -eu
unset FORCE_COLOR
export NO_COLOR=1
expected=$(node -p "require('../../package.json').version")
actual=$(node ../../bin/devtool.js --version)
test "$actual" = "$expected"

# should support help and version aliases
set -eu
unset FORCE_COLOR
export NO_COLOR=1
node ../../bin/devtool.js -h | grep -F 'Usage: devtool'
test "$(node ../../bin/devtool.js -v)" = "$(node -p "require('../../package.json').version")"

# should reject a missing app file with a nonzero exit
set -eu
unset FORCE_COLOR
export NO_COLOR=1
status=0
output=$(node ../../bin/devtool.js start 2>&1) || status=$?
test "$status" -eq 1
printf '%s\n' "$output" | grep -F 'error:'
printf '%s\n' "$output" | grep -F 'Run devtool --help'

# should reject unknown options with a nonzero exit
set -eu
unset FORCE_COLOR
export NO_COLOR=1
status=0
output=$(node ../../bin/devtool.js --unknown 2>&1) || status=$?
test "$status" -eq 1
printf '%s\n' "$output" | grep -F 'error:'
```
