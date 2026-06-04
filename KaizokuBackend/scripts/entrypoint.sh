#!/bin/sh
set -e

PUID=${PUID:-99}
PGID=${PGID:-100}
USERNAME=kaizoku

# Resolve group name from PGID if it already exists
existing_group=$(getent group "$PGID" | cut -d: -f1)
if [ -z "$existing_group" ]; then
    echo "Creating group '$USERNAME' with GID $PGID"
    groupadd -g "$PGID" "$USERNAME"
    group_name="$USERNAME"
else
    echo "Group with GID $PGID already exists: $existing_group"
    group_name="$existing_group"
fi

# Resolve user name from PUID if it already exists
existing_user=$(getent passwd "$PUID" | cut -d: -f1)
if [ -z "$existing_user" ]; then
    echo "Creating user '$USERNAME' with UID $PUID"
    useradd -u "$PUID" -g "$PGID" -d /config --no-log-init -G audio,video "$USERNAME"
    user_name="$USERNAME"
else
    echo "User with UID $PUID already exists: $existing_user"
    user_name="$existing_user"
fi

# Fix permissions
echo "Setting permissions on/config"
chown -R "$user_name:$group_name" /config
chmod -R 777 /config

# Detect architecture and add IKVM library path
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    IKVM_LIB_PATH="/app/ikvm/linux-x64/bin"
elif [ "$ARCH" = "aarch64" ]; then
    IKVM_LIB_PATH="/app/ikvm/linux-arm64/bin"
else
    echo "Warning: Unknown architecture $ARCH, IKVM libs may not be found"
    IKVM_LIB_PATH="/app/ikvm/linux-x64/bin"
fi

# Add IKVM library directories to LD_LIBRARY_PATH
export LD_LIBRARY_PATH="${IKVM_LIB_PATH}:${LD_LIBRARY_PATH}"

# Thread-resource backstop: IKVM JVM + JCEF Chromium + Xvfb are thread-heavy;
# without these limits the kernel can refuse pthread_create and OOM the process.
# ulimit -s 1024 (1024 KB) is the tested baseline that allows CLR/JVM/JCEF/Chromium
# to start cleanly on aarch64; operators may lower toward 512 only after validating
# that Chromium, JCEF, and the CLR all start without abort on their specific kernel.
# ulimit -u 4096 caps nproc so refusal is bounded and catchable.
# These are set here (before exec gosu) so they are inherited by the privilege-
# dropped process tree that gosu hands off to.
ulimit -s 1024 || echo "warn: could not set thread stack ulimit (non-fatal)"
ulimit -u 4096 || echo "warn: could not set nproc ulimit (non-fatal)"

# Run the app as the correct user
exec gosu "$user_name" xvfb-run --auto-servernum /app/KaizokuBackend
