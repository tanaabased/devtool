# Downstream source consumer

This wrapper imports the source package's public entrypoint, changes identity and
configuration roots, and runs the same API 4 runtime as the CLI. Run the container
proof only in disposable CI. Unit tests exercise it with an injected engine.

## Setup

```sh
# should copy the consumer outside the source checkout
set -eu
test "$GITHUB_ACTIONS" = true
mkdir -p "$DEVTOOL_FIXTURE_ROOT/consumer"
cp index.js .wrapper.yml "$DEVTOOL_FIXTURE_ROOT/consumer/"
```

## Testing

```sh
# should isolate two downstream products through the actual engine
node "$DEVTOOL_FIXTURE_ROOT/consumer/index.js" "$PWD/../.." "$DEVTOOL_FIXTURE_ROOT/consumer"
```

## Cleanup

```sh
# should remove both downstream projects even after failure
node ../cleanup.js consumer
```
