#!/bin/bash
# Push the committed tree of a branch to MFV and stage it for docker-compose.
# Usage: bin/deploy-nas.sh [branch] [slot]   e.g. bin/deploy-nas.sh main app  |  bin/deploy-nas.sh v2 app-v2
# Transport is tar over ssh (DSM rsync refuses --server mode). The NAS never holds a GitHub credential.
set -euo pipefail
BRANCH=${1:-main}
SLOT=${2:-app}
STACK=/volume1/docker/sod-undertaker
cd "$(dirname "$0")/.."
ssh mfv "mkdir -p $STACK/data && rm -rf $STACK/$SLOT.new && mkdir -p $STACK/$SLOT.new"
git archive "$BRANCH" | ssh mfv "tar -x -C $STACK/$SLOT.new"
scp -q deploy/docker-compose.yml mfv:$STACK/docker-compose.yml
ssh mfv "cd $STACK && rm -rf $SLOT.old && { [ -d $SLOT ] && mv $SLOT $SLOT.old || true; } && mv $SLOT.new $SLOT && rm -rf $SLOT.old
  [ -f .env ] || { umask 077; printf 'SECRET_KEY=%s\n' \"\$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')\" > .env; }
  ls -la"
echo "Staged $BRANCH -> $STACK/$SLOT. Now on the NAS: cd $STACK && sudo docker-compose up -d --build"
