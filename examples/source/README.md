# Source interfaces

Check the source CLI's information and failure behavior and the library's inert
import. These scenarios do not initialize services or contact Docker.

Select `Testing CLI` or `Testing Library` independently through Leia. Both use
source under Bun; neither requires mutable fixture state.

## Testing CLI

```sh
# should show source help successfully
set -eu
unset FORCE_COLOR
export NO_COLOR=1
help=$(devtool --help)
printf '%s\n' "$help" | grep -F 'Usage: devtool'
printf '%s\n' "$help" | grep -F -- '--version'
printf '%s\n' "$help" | grep -F 'start, stop, restart, rebuild, info, exec, destroy'

# should show help when invoked without arguments
set -eu
unset FORCE_COLOR
export NO_COLOR=1
devtool | grep -F 'Usage: devtool'

# should report the package version exactly
set -eu
unset FORCE_COLOR
export NO_COLOR=1
expected=$(bun -p "require('../../package.json').version")
actual=$(devtool --version)
test "$actual" = "$expected"

# should support help and version aliases
set -eu
unset FORCE_COLOR
export NO_COLOR=1
devtool -h | grep -F 'Usage: devtool'
test "$(devtool -v)" = "$(bun -p "require('../../package.json').version")"

# should resolve the prepared source command and launch through its bun shebang
set -eu
unset FORCE_COLOR
export NO_COLOR=1
expected=$(bun -p "require('node:path').resolve('../../node_modules/.bin/devtool')")
test "$(command -v devtool)" = "$expected"
test "$(devtool --version)" = "$(bun -p "require('../../package.json').version")"

# should reject a missing app file with a nonzero exit
set -eu
unset FORCE_COLOR
export NO_COLOR=1
status=0
output=$(devtool start 2>&1) || status=$?
test "$status" -eq 1
printf '%s\n' "$output" | grep -F 'error:'
printf '%s\n' "$output" | grep -F 'Run devtool --help'

# should reject unknown options with a nonzero exit
set -eu
unset FORCE_COLOR
export NO_COLOR=1
status=0
output=$(devtool --unknown 2>&1) || status=$?
test "$status" -eq 1
printf '%s\n' "$output" | grep -F 'error:'
```

## Testing Library

```sh
# should import the public package and create a runtime without host side effects
set -eu
bun ../../test/source-probe.js | grep -Fx 'import stayed inert; consumer continued'
```
