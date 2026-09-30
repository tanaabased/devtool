#!/bin/sh
set -eu
test "$(id -un)" = fixture
test "$(cat /tmp/image-proof)" = image
printf 'app\n' >> /app/app-proof
printf 'owned\n' > /data/owner-proof
