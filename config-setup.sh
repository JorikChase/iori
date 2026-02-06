#!/bin/bash
#
# This is a unified script to manage the 'iori' website and 'zausi' app.
# It can be run in two modes:
#
# 1. 'Auto-Deploy' (default):
#    - Fetches and resets the 'sandbox' branch from Git.
#    - Then runs the full deployment procedure.
#    - USAGE: bash manage_iori.sh
#
# 2. 'Deploy-Only' (local sync):
#    - Syncs files from /root/iori to /var/www/iori.
#    - Rebuilds Rust app locally.
#    - Configures Caddy and restarts services.
#    - USAGE: bash manage_iori.sh --local
#
# This script is idempotent (safe to run multiple times).
# Run this script as root.

# Stop immediately if any command fails
set -e

# --- Configuration ---
SOURCE_DIR="/root/iori"
WEB_ROOT="/var/www/iori"
LOG_FILE="/var/log/caddy/iori.log"
ZAUSI_SCRIPT="./setup_zausi.sh"

# ==================================
# SCRIPT FUNCTIONS
# ==================================

show_help() {
    echo "Usage: $0 [command]"
    echo
    echo "This script manages the 'iori' website deployment."
    echo
    echo "Commands:"
    echo "  [no command]    (Default) Fetches from Git, then syncs files and reloads Caddy."
    echo "  --local         (For manual use) *Only* syncs local files and reloads Caddy. Does NOT pull from git."
    echo "  --help          Show this message."
}

pull_from_git() {
    echo "--- Task: Pulling from Git (sandbox branch) ---"

    if [ ! -d "$SOURCE_DIR" ]; then
        echo "Error: Source directory $SOURCE_DIR does not exist."
        echo "Please clone the repository first: git clone <url> $SOURCE_DIR"
        exit 1
    fi

    cd "$SOURCE_DIR" || { echo "Failed to cd into $SOURCE_DIR"; exit 1; }

    echo "Fetching latest changes from origin..."
    git fetch origin

    echo "Resetting local 'sandbox' branch to match remote 'origin/sandbox'..."
    # This is safer for automation than 'git pull' as it avoids merge conflicts
    # by discarding any local changes.
    git reset --hard origin/sandbox
    echo "Git pull and reset complete."
}

ensure_dependencies() {
    echo "--- Task: Ensuring Dependencies (Caddy, rsync) ---"

    if ! command -v caddy &> /dev/null
    then
        echo "Caddy not found. Running full install..."
        apt update
        apt install -y debian-keyring debian-archive-keyring apt-transport-https curl rsync
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt update
        apt install -y caddy
        echo "Caddy has been installed."
    else
        echo "Caddy is already installed."
        # Ensure rsync is installed even if Caddy is
        if ! command -v rsync &> /dev/null; then
            echo "rsync not found. Installing..."
            apt update
            apt install -y rsync
        else
            echo "rsync is already installed."
        fi
    fi
}

sync_website_files() {
    echo "--- Task: Syncing Website Files ---"

    # Safety check (in case git pull failed or dir was removed)
    if [ ! -d "$SOURCE_DIR" ]; then
        echo "Error: Source directory $SOURCE_DIR does not exist."
        exit 1
    fi

    # Create the new web root directory (if it doesn't exist)
    mkdir -p "$WEB_ROOT"
    echo "Ensured directory $WEB_ROOT exists."

    # Sync website files using rsync (idempotent and efficient)
    echo "Syncing files from $SOURCE_DIR/ to $WEB_ROOT/..."
    rsync -a --delete --exclude 'zausi' "$SOURCE_DIR/" "$WEB_ROOT/"
    echo "File sync complete (excluding zausi source)."

    # Give ownership to the Caddy user
    chown -R caddy:caddy "$WEB_ROOT"
    echo "Set file permissions for 'caddy' user."
}

deploy_zausi_app() {
    echo "--- Task: Deploying Zausi Rust App ---"

    # Check if the setup script exists (it should be in the repo now)
    if [ -f "$SOURCE_DIR/setup_zausi.sh" ]; then
        chmod +x "$SOURCE_DIR/setup_zausi.sh"
        # Run the Zausi setup script
        "$SOURCE_DIR/setup_zausi.sh"
    else
        echo "Warning: setup_zausi.sh not found in $SOURCE_DIR. Skipping Rust deployment."
    fi
}

configure_caddy() {
    echo "--- Task: Configuring Caddy (Caddyfile) ---"

    # Create the Caddyfile using a 'heredoc'
    tee /etc/caddy/Caddyfile > /dev/null <<EOF
{
    # Global options
    log {
        output file $LOG_FILE
        format json
    }
}

iori.me {
    # Set the web root
    root * $WEB_ROOT

    # --- ZAUSI APP CONFIGURATION ---
    # Reverse proxy /zausi to the Rust app running on port 3000
    # handle_path strips the '/zausi' prefix before sending to the app
    handle_path /zausi* {
        reverse_proxy localhost:3000
    }

    # Tell the file server to look for web.html first when
    # a directory (like /) is requested.
    file_server {
        index web.html index.html
    }

    # Fallback for non-existent files (SPA-like behavior).
    # Caddy tries {path}, then {path}/ (which uses the index above),
    # then finally falls back to /web.html.
    try_files {path} {path}/ /web.html
}

3die.fr {
    # Set the web root
    root * $WEB_ROOT

    # Enable the static file server
    # This will use Caddy's default (index.html)
    file_server
}
EOF
    echo "Caddyfile has been written with correct index for iori.me and proxy for /zausi."
}

configure_firewall() {
    echo "--- Task: Configuring Firewall (ufw) ---"

    # Allow HTTP (for SSL challenge) and HTTPS (for serving)
    ufw allow http
    ufw allow https
    # Note: We do NOT open port 3000 externally, Caddy handles it internally via localhost
    ufw reload
    echo "Firewall ports 80 (http) and 443 (https) are now open."
}

reload_caddy_service() {
    echo "--- Task: Reloading Caddy Service ---"

    systemctl daemon-reload
    systemctl enable caddy
    systemctl restart caddy

    echo "Caddy service has been restarted."
}


# ==================================
# MAIN SCRIPT LOGIC
# ==================================

# Default mode is 'auto' (includes git pull)
MODE="auto"

# Check for command-line arguments
if [ "$1" == "--local" ]; then
    MODE="deploy-only"
elif [ "$1" == "--help" ]; then
    show_help
    exit 0
elif [ -n "$1" ]; then
    echo "Error: Unknown argument '$1'"
    show_help
    exit 1
fi

# --- Run tasks based on mode ---

if [ "$MODE" == "auto" ]; then
    echo "--- [$(date)] Starting 'Auto-Deploy' Mode (Git + Deploy) ---"
    pull_from_git
else
    echo "--- [$(date)] Starting 'Deploy-Only' Mode (Local Sync Only) ---"
    echo "--- Skipping Git pull. ---"
fi

# These tasks run in *both* modes
ensure_dependencies
sync_website_files
deploy_zausi_app    # <--- NEW: Setup/Update the Rust app
configure_caddy     # <--- UPDATED: Adds the /zausi reverse proxy
configure_firewall
reload_caddy_service

echo ""
echo "--- [$(date)] Setup Complete! ---"
echo ""
echo "Caddy is now serving your sites."
echo " - https://iori.me/ (web.html)"
echo " - https://iori.me/zausi (Rust App on :3000)"
echo " - https://3die.fr/ (index.html)"
echo ""
echo "You can check the status with:"
echo "  systemctl status caddy"
echo "  systemctl status zausi"
