# Source CLI

Check the source entrypoint's information and failure behavior. This scenario does
not initialize services or contact Docker.

## Testing

```sh
# should show source help successfully
help=$(bun ../../bin/devtool.js --help)
printf '%s\n' "$help" | grep -F 'Usage: devtool'
printf '%s\n' "$help" | grep -F -- '--version'
printf '%s\n' "$help" | grep -F 'service commands are not available yet'

# should show help when invoked without arguments
bun ../../bin/devtool.js | grep -F 'Usage: devtool'

# should report the package version exactly
expected=$(bun -p "require('../../package.json').version")
actual=$(bun ../../bin/devtool.js --version)
test "$actual" = "$expected"

# should support help and version aliases
bun ../../bin/devtool.js -h | grep -F 'Usage: devtool'
test "$(bun ../../bin/devtool.js -v)" = "$(bun -p "require('../../package.json').version")"

# should reject unavailable service commands with a nonzero exit
status=0
output=$(bun ../../bin/devtool.js start 2>&1) || status=$?
test "$status" -eq 1
printf '%s\n' "$output" | grep -F 'error:'
printf '%s\n' "$output" | grep -F 'Run devtool --help'

# should reject unknown options with a nonzero exit
status=0
output=$(bun ../../bin/devtool.js --unknown 2>&1) || status=$?
test "$status" -eq 1
printf '%s\n' "$output" | grep -F 'error:'
```
