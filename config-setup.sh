#!/bin/bash
#
# ==============================================================================
# UNIFIED SERVER SETUP: IORI + CLIPPY (MASTER SCRIPT)
# ==============================================================================
#
# This script manages the full deployment of the server.
# It delegates the Rust application setup to 'clippy_setup.sh'.
#
# MODES:
#   bash server_setup.sh           -> Full deploy (Git Pull + Build + Config)
#   bash server_setup.sh --local   -> Skip Git pull (only sync local files & rebuild app)
#
# ==============================================================================

set -e

# --- Configuration ---
# Iori Static Site
IORI_REPO_DIR="/root/iori"
IORI_WEB_ROOT="/var/www/iori"

# Clippy Configuration (Needed for Caddy Config)
CLIPPY_PORT=3001

# Logs
LOG_FILE="/var/log/caddy/iori.log"

# --- Colors ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ==============================================================================
# 1. PRE-FLIGHT CHECKS & DEPENDENCIES
# ==============================================================================

ensure_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}Error: Please run as root.${NC}"
        exit 1
    fi
}

install_dependencies() {
    echo -e "${BLUE}--- [1/5] Ensuring System Dependencies ---${NC}"

    echo "Updating package lists..."
    apt-get update -q

    echo "Installing build tools and dependencies..."
    # Added build-essential (for linker 'cc'), libssl-dev/pkg-config (for Rust crypto deps)
    apt-get install -y -q \
        curl rsync git ufw \
        build-essential libssl-dev pkg-config \
        debian-keyring debian-archive-keyring apt-transport-https

    # Install Rust (if missing) - Required for Clippy
    if ! command -v cargo &> /dev/null; then
        echo -e "${YELLOW}Rust not found. Installing Rustup...${NC}"
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    else
        echo "Rust is already installed."
    fi

    # Install Caddy (if missing)
    if ! command -v caddy &> /dev/null; then
        echo -e "${YELLOW}Caddy not found. Installing...${NC}"
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt-get update -q
        apt-get install -y caddy
    else
        echo "Caddy is already installed."
    fi
}

# ==============================================================================
# 2. IORI DEPLOYMENT (Static Site)
# ==============================================================================

deploy_iori() {
    local mode=$1
    echo -e "${BLUE}--- [2/5] Deploying Iori (Static Site) ---${NC}"

    # 1. Git Pull (Only if not in local mode)
    if [ "$mode" == "auto" ]; then
        if [ ! -d "$IORI_REPO_DIR" ]; then
            echo -e "${RED}Error: $IORI_REPO_DIR does not exist. Clone it first.${NC}"
            exit 1
        fi
        echo "Fetching 'sandbox' branch..."
        cd "$IORI_REPO_DIR" || exit
        git fetch origin
        git reset --hard origin/sandbox
    else
        echo "Skipping Git pull (--local mode)."
    fi

    # 2. Sync Files
    echo "Syncing files to $IORI_WEB_ROOT..."
    mkdir -p "$IORI_WEB_ROOT"
    # rsync --delete ensures deleted source files are removed from web root (saves storage)
    rsync -a --delete "$IORI_REPO_DIR/" "$IORI_WEB_ROOT/"
    chown -R caddy:caddy "$IORI_WEB_ROOT"
}

# ==============================================================================
# 3. CLIPPY TRIGGER
# ==============================================================================

trigger_clippy_setup() {
    echo -e "${BLUE}--- [3/5] Triggering Clippy Setup ---${NC}"
    if [ -f "./clippy_setup.sh" ]; then
        chmod +x ./clippy_setup.sh
        # Pass the PATH so cargo works if it was just installed
        if [ -f "$HOME/.cargo/env" ]; then
             source "$HOME/.cargo/env"
        fi
        ./clippy_setup.sh
    else
        echo -e "${RED}Warning: clippy_setup.sh not found in current directory! Skipping Clippy deployment.${NC}"
    fi
}

# ==============================================================================
# 4. SERVER CONFIGURATION (Firewall & Caddy)
# ==============================================================================

configure_server() {
    echo -e "${BLUE}--- [4/5] Configuring Firewall ---${NC}"
    ufw allow http
    ufw allow https
    # Open 3001 specifically as requested backup
    ufw allow $CLIPPY_PORT
    ufw reload || echo "UFW not enabled, skipping reload."

    echo -e "${BLUE}--- [5/5] Writing Caddyfile ---${NC}"

    cat << EOF > /etc/caddy/Caddyfile
{
    log {
        output file $LOG_FILE
        format json
    }
}

# 1. Main Static Site & Clippy
iori.me {
    # A. Clippy Route (/clippy/* -> localhost:3001)

    # Redirect /clippy to /clippy/ to ensure relative paths in index.html work
    redir /clippy /clippy/

    # Handle the subpath request
    handle /clippy/* {
        uri strip_prefix /clippy
        reverse_proxy 127.0.0.1:$CLIPPY_PORT {
            flush_interval -1
        }
    }

    # B. Static Site (Default Handle)
    handle {
        root * $IORI_WEB_ROOT
        file_server {
            index web.html index.html
        }
        # SPA/Fallback routing
        try_files {path} {path}/ /web.html
    }
}

# 2. Secondary Static Site
3die.fr {
    root * $IORI_WEB_ROOT
    file_server
}
EOF

    echo -e "${BLUE}--- [5/5] Reloading Caddy ---${NC}"
    systemctl restart caddy
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

ensure_root

MODE="auto"
if [ "$1" == "--local" ]; then
    MODE="local"
fi

install_dependencies
deploy_iori "$MODE"
trigger_clippy_setup
configure_server

echo ""
echo -e "${GREEN}=== SERVER SETUP COMPLETE ===${NC}"
echo "--------------------------------------------------------"
echo "1. Iori.me   : Served from $IORI_WEB_ROOT"
echo "2. 3die.fr   : Served from $IORI_WEB_ROOT"
echo "3. Clippy    : Proxied to Port $CLIPPY_PORT"
echo "   -> Access : https://iori.me/clippy/"
echo "--------------------------------------------------------"
