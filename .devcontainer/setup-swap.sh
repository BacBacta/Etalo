#!/usr/bin/env bash
# Recreate /tmp/swapfile on Codespace start. /tmp is ephemeral so the
# swap file does not survive across stop → start; the file is recreated
# every postStartCommand. Skip if swap is already active (idempotent).
#
# Codespaces default = 0 swap on a 2-vCPU / 8 GiB box, which OOM-kills
# under Next.js build + npm install peaks. 4 GiB swap on /tmp gives a
# soft buffer; swappiness lowered to 20 so the kernel only spills under
# real pressure, not as a routine policy.

set -euo pipefail

SWAPFILE=/tmp/swapfile
SIZE=4G

if swapon --show | grep -q "$SWAPFILE"; then
    echo "[setup-swap] $SWAPFILE already active, skipping"
    exit 0
fi

if [[ ! -f $SWAPFILE ]]; then
    sudo fallocate -l $SIZE $SWAPFILE
    sudo chmod 600 $SWAPFILE
    sudo mkswap $SWAPFILE >/dev/null
fi

sudo swapon $SWAPFILE
sudo sysctl -q vm.swappiness=20

echo "[setup-swap] activated $SIZE swap on $SWAPFILE (swappiness=20)"
free -h | grep -E "Mem|Swap"
