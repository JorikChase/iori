#!/bin/bash
#
# ==============================================================================
# IORI SERVER MANAGEMENT (Unified + Clippy Integration)
# ==============================================================================
#
# This script manages the 'iori' website AND the 'clippy' background service.
#
# USAGE:
#   bash manage_iori.sh          (Default: Git pull + Build + Deploy)
#   bash manage_iori.sh --local  (Deploy local files only, skip git)
#
# ==============================================================================

# Stop immediately if any command fails
set -e

# --- Configuration ---
SOURCE_DIR="/root/iori"
WEB_ROOT="/var/www/iori"
CLIPPY_ROOT="/var/www/clippy"
LOG_FILE="/var/log/caddy/iori.log"

# ==================================
# SCRIPT FUNCTIONS
# ==================================

show_help() {
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  [no command]   Fetches Git, updates website, builds/updates Clippy."
    echo "  --local        Syncs local web files only (skips Git/Clippy build)."
    echo "  --help         Show this message."
}

pull_from_git() {
    echo "--- Task: Pulling from Git (sandbox branch) ---"
    if [ ! -d "$SOURCE_DIR" ]; then
        echo "Error: Source directory $SOURCE_DIR does not exist. Clone it first."
        exit 1
    fi
    cd "$SOURCE_DIR"
    git fetch origin
    git reset --hard origin/sandbox
}

ensure_dependencies() {
    echo "--- Task: Ensuring Dependencies ---"

    # 1. System Utils
    apt update
    apt install -y rsync curl debian-keyring debian-archive-keyring apt-transport-https pkg-config libssl-dev

    # 2. Caddy
    if ! command -v caddy &> /dev/null; then
        echo "Installing Caddy..."
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt update
        apt install -y caddy
    fi
}

sync_website_files() {
    echo "--- Task: Syncing Website Files ---"
    mkdir -p "$WEB_ROOT"
    rsync -a --delete "$SOURCE_DIR/" "$WEB_ROOT/"
    chown -R caddy:caddy "$WEB_ROOT"
}

setup_clippy_app() {
    echo "--- Task: Invoking Clippy Installer ---"

    local INSTALLER="$SOURCE_DIR/clippy_setup.sh"

    if [ -f "$INSTALLER" ]; then
        chmod +x "$INSTALLER"
        echo "Running: $INSTALLER"
        "$INSTALLER"
    else
        echo "ERROR: clippy_setup.sh not found in $SOURCE_DIR"
        exit 1
    fi
}

configure_systemd() {
    echo "--- Task: Configuring Systemd Service ---"

    cat << EOF > /etc/systemd/system/clippy.service
[Unit]
Description=Clippy Sync Server
After=network.target

[Service]
# Run as caddy so it can access the folder we chowned
User=caddy
Group=caddy
WorkingDirectory=$CLIPPY_ROOT
# Path to the compiled binary
ExecStart=$CLIPPY_ROOT/target/release/clippy_server
Restart=always
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable clippy
    systemctl restart clippy
}

configure_caddy() {
    echo "--- Task: Configuring Caddy (Caddyfile) ---"

    tee /etc/caddy/Caddyfile > /dev/null <<EOF
{
    log {
        output file $LOG_FILE
        format json
    }
}

iori.me {
    root * $WEB_ROOT

    # 1. Clippy Sub-path Logic
    # Redirect /clippy to /clippy/ to ensure relative paths (api/clips) work
    redir /clippy /clippy/

    # Proxy requests starting with /clippy to the Rust backend
    handle /clippy* {
        reverse_proxy localhost:3001
    }

    # 2. Main Website Logic
    # Everything else falls through to the file server
    handle {
        file_server {
            index web.html index.html
        }
        try_files {path} {path}/ /web.html
    }
}

3die.fr {
    root * $WEB_ROOT
    file_server
}
EOF
}

configure_firewall() {
    echo "--- Task: Configuring Firewall (ufw) ---"
    ufw allow http
    ufw allow https
    ufw reload
}

reload_caddy_service() {
    echo "--- Task: Reloading Caddy Service ---"
    systemctl restart caddy
}


# ==================================
# MAIN SCRIPT LOGIC
# ==================================

MODE="auto"

if [ "$1" == "--local" ]; then
    MODE="deploy-only"
elif [ "$1" == "--help" ]; then
    show_help
    exit 0
fi

if [ "$MODE" == "auto" ]; then
    echo "--- [$(date)] Starting 'Auto-Deploy' ---"
    pull_from_git
    setup_clippy_app # Rebuilds rust app if needed
else
    echo "--- [$(date)] Starting 'Local-Deploy' ---"
    # In local mode, we assume files are already placed or we just want to config caddy
    # We skip pulling git, but we still ensure dependecies/configs
fi

ensure_dependencies
sync_website_files
configure_systemd # Ensures clippy service is running
configure_caddy
configure_firewall
reload_caddy_service

echo ""
echo "--- [$(date)] Setup Complete! ---"
echo "Main Site:   https://iori.me/"
echo "Clippy Sync: https://iori.me/clippy/"
