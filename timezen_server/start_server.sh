#!/bin/bash

[[ "${BEEBOARD_CODEBASE}" == "unstable" ]] && tag="beeboard-dev" || tag="beeboard"
logit="logger --id --tag ${tag} --priority daemon.warn"
/usr/bin/node server.js 2>&1 | ${logit}
echo "server.js exited with status $?" | ${logit}
