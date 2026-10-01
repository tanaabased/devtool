#!/bin/bash
set -eo pipefail

# Load container environment without reinterpreting caller arguments as shell code.
source /etc/lando/environment
exec "$@"
