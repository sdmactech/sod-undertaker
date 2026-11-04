#!/bin/bash
# Deploy a branch to MFV and restart its container. No password needed.
# Usage: bin/deploy-nas.sh [branch] [slot]   main app -> v1 :8094  |  v2 app-v2 -> v2 :8095  |  v3 app-v3 -> v3 :8096  |  v4 app-v4 -> v4 :8097 (test)
# Transport is tar over ssh (DSM SFTP and rsync server mode are off). The NAS never holds a GitHub credential.
# Only `sudo /usr/local/bin/docker` and `sudo /usr/local/bin/docker-compose` are used: both are NOPASSWD for MFVadmin.
set -euo pipefail
BRANCH=${1:-main}
SLOT=${2:-app}
case "$SLOT" in
  app)    SERVICE=sod-undertaker ;;
  app-v2) SERVICE=sod-undertaker-v2 ;;
  app-v3) SERVICE=sod-undertaker-v3 ;;
  app-v4) SERVICE=sod-undertaker-v4 ;;
  *) echo "Unknown slot $SLOT (use app, app-v2, app-v3 or app-v4)" >&2; exit 1 ;;
esac
STACK=/volume1/docker/sod-undertaker
DOCKER="sudo -n /usr/local/bin/docker"
COMPOSE="sudo -n /usr/local/bin/docker-compose"
cd "$(dirname "$0")/.."

ssh mfv "mkdir -p $STACK/data/v1 $STACK/data/v2 $STACK/data/v3 $STACK/data/v4 && rm -rf $STACK/$SLOT.new && mkdir -p $STACK/$SLOT.new"
git archive "$BRANCH" | ssh mfv "tar -x -C $STACK/$SLOT.new"
ssh mfv "cat > $STACK/docker-compose.yml" < deploy/docker-compose.yml

# Packages go into the new tree before it goes live, installed as MFVadmin so later deploys can replace them
ssh mfv "$DOCKER run --rm -u 1026:100 -e HOME=/tmp -v $STACK/$SLOT.new:/app -w /app python:3.12-slim \
  pip install --quiet --disable-pip-version-check --no-warn-script-location --target /app/.deps -r requirements.txt"

ssh mfv "cd $STACK && rm -rf $SLOT.old && { [ -d $SLOT ] && mv $SLOT $SLOT.old || true; } && mv $SLOT.new $SLOT && rm -rf $SLOT.old
  [ -f .env ] || { umask 077; printf 'SECRET_KEY=%s\n' \"\$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')\" > .env; chmod 600 .env; }
  $COMPOSE up -d --remove-orphans $SERVICE && $COMPOSE restart $SERVICE"

case "$SLOT" in app) PORT=8094 ;; app-v2) PORT=8095 ;; app-v3) PORT=8096 ;; app-v4) PORT=8097 ;; esac
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://192.168.7.217:$PORT/api/stats" || true)
  [ "$code" = 200 ] && { echo "Deployed $BRANCH -> $SERVICE, live at http://MFV.local:$PORT"; exit 0; }
  sleep 2
done
echo "Deployed $BRANCH -> $SERVICE but :$PORT is not answering" >&2; exit 1
