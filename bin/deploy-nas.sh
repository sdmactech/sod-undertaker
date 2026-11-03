#!/bin/bash
# Push the committed tree of a branch to MFV and stage it for docker-compose.
# Usage: bin/deploy-nas.sh [branch] [slot]   e.g. bin/deploy-nas.sh main app  |  bin/deploy-nas.sh v2 app-v2
# Transport is tar over ssh (DSM rsync refuses --server mode). The NAS never holds a GitHub credential.
set -euo pipefail
BRANCH=${1:-main}
SLOT=${2:-app}
STACK=/volume1/docker/sod-undertaker
cd "$(dirname "$0")/.."
ssh mfv "mkdir -p $STACK/data/v1 $STACK/data/v2 && rm -rf $STACK/$SLOT.new && mkdir -p $STACK/$SLOT.new"
git archive "$BRANCH" | ssh mfv "tar -x -C $STACK/$SLOT.new"
ssh mfv "cat > $STACK/docker-compose.yml" < deploy/docker-compose.yml
ssh mfv "cd $STACK && rm -rf $SLOT.old && { [ -d $SLOT ] && mv $SLOT $SLOT.old || true; } && mv $SLOT.new $SLOT && rm -rf $SLOT.old
  [ -f .env ] || { umask 077; printf 'SECRET_KEY=%s\n' \"\$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')\" > .env; }
  ls -la"
echo "Staged $BRANCH -> $STACK/$SLOT. Start it on the NAS (asks for the MFVadmin password):"
echo "  ssh -t mfv 'cd $STACK && sudo env DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 /usr/local/bin/docker-compose up -d --build'"
