#!/bin/bash
#
# This is a unified script to manage the 'iori' website and 'zausi' app.
# It can be run in two modes:
#
# 1. 'Auto-Deploy' (default):
#    - Fetches and resets the 'main' branch from Git.
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
# We'll detect the script name dynamically below
ZAUSI_SCRIPT_NAME="setup_zausi.sh"

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
    echo "--- Task: Pulling from Git (main branch) ---"
    
    if [ ! -d "$SOURCE_DIR" ]; then
        echo "Error: Source directory $SOURCE_DIR does not exist."
        echo "Please clone the repository first: git clone <url> $SOURCE_DIR"
        exit 1
    fi
    
    cd "$SOURCE_DIR" || { echo "Failed to cd into $SOURCE_DIR"; exit 1; }

    echo "Fetching latest changes from origin..."
    git fetch origin

    echo "Resetting local 'main' branch to match remote 'origin/main'..."
    # This is safer for automation than 'git pull' as it avoids merge conflicts
    # by discarding any local changes.
    git reset --hard origin/main
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
    # Excludes: .git (repo internals must never be public), zausi (server-only),
    #           splats + heavy unreferenced assets (production slimming — files
    #           stay in the local repo), OS junk, session logs.
    # TODO: git history rewrite pending for large binaries (see BACKLOG.md)
    echo "Syncing files from $SOURCE_DIR/ to $WEB_ROOT/..."
    rsync -a --delete \
        --exclude '.git' \
        --exclude 'zausi' \
        --exclude 'splats/' \
        --exclude 'assets/pdf-full.pdf' \
        --exclude 'images/autoportrait copy.mp4' \
        --exclude '.DS_Store' \
        --exclude 'session-*.md' \
        --exclude 'sandbox.md' \
        "$SOURCE_DIR/" "$WEB_ROOT/"
    echo "File sync complete (excluding .git, zausi, splats, heavy assets)."

    # Give ownership to the Caddy user
    chown -R caddy:caddy "$WEB_ROOT"
    echo "Set file permissions for 'caddy' user."
}

deploy_api() {
    echo "--- Task: Deploying iori-api (Python backend) ---"

    # Python runtime
    if ! dpkg -l python3-venv &> /dev/null || ! dpkg -l python3-pip &> /dev/null; then
        echo "Installing python3-venv / python3-pip..."
        apt update
        apt install -y python3-venv python3-pip
    fi

    # Service user (non-root)
    if ! id ioriapi &> /dev/null; then
        useradd --system --no-create-home --shell /usr/sbin/nologin ioriapi
        echo "Created service user 'ioriapi'."
    fi

    # Directories
    mkdir -p /opt/iori-api /var/lib/iori-api /var/www/media /var/www/iori-dash

    # Deploy API source (exclude local dev artifacts)
    rsync -a --delete \
        --exclude 'venv/' \
        --exclude '__pycache__/' \
        --exclude '*.db*' \
        --exclude 'media/' \
        --exclude 'initial-passwords.txt' \
        --exclude '.gitignore' \
        "$SOURCE_DIR/api/" /opt/iori-api/

    # Deploy dashboard static files
    rsync -a --delete "$SOURCE_DIR/dash/" /var/www/iori-dash/

    # Python environment
    if [ ! -f /opt/iori-api/venv/bin/python ]; then
        python3 -m venv /opt/iori-api/venv
    fi
    /opt/iori-api/venv/bin/pip install -q --upgrade pip
    /opt/iori-api/venv/bin/pip install -q -r /opt/iori-api/requirements.txt

    # Permissions
    chown -R ioriapi:ioriapi /opt/iori-api /var/lib/iori-api /var/www/media
    chown -R caddy:caddy /var/www/iori-dash

    # systemd unit
    cp /opt/iori-api/iori-api.service /etc/systemd/system/iori-api.service

    # Retire zausi (archived 2026-07-27; replaced by iori-api)
    if systemctl list-unit-files | grep -q '^zausi.service'; then
        systemctl stop zausi || true
        systemctl disable zausi || true
        rm -f /etc/systemd/system/zausi.service
        echo "Zausi service stopped and disabled."
    fi

    systemctl daemon-reload
    systemctl enable iori-api
    systemctl restart iori-api
    echo "iori-api deployed and running on 127.0.0.1:3000."
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

    # Block dotfiles (repo internals, env files) — never serve these.
    # NOTE: must be a handle block (not bare respond) so it wins over the
    # catch-all handle below — handle blocks are mutually exclusive.
    @dotfiles path /.git* /.env* /.DS_Store
    handle @dotfiles {
        respond 404
    }

    # Cross-domain 301s (generated by site.py — pages canonical on 3die.fr)
    import /etc/caddy/redirects-iori.caddy

    # Legacy rename: catalog -> portfolio
    redir /catalog.html /portfolio.html permanent

    # Route specific sitemap and robots
    rewrite /sitemap.xml /sitemap-iori.xml
    rewrite /robots.txt /robots-iori.txt

    # --- MAIN SITE CONFIGURATION ---
    handle {
        # Static files; missing paths fall through to the error handlers
        # (real 404 status, designed page) — no soft-404 SPA fallback.
        file_server {
            index iori_INDEX.html web.html index.html
        }
    }

    # Real 404 status + designed page (SEO: no soft-404s)
    handle_errors {
        @404 expression {http.error.status_code} == 404
        rewrite @404 /404.html
        file_server
    }
}

3die.fr {
    # Set the web root
    root * $WEB_ROOT

    # Block dotfiles (repo internals, env files) — never serve these.
    @dotfiles path /.git* /.env* /.DS_Store
    handle @dotfiles {
        respond 404
    }

    # Cross-domain 301s (generated by site.py — pages canonical on iori.me)
    import /etc/caddy/redirects-3die.caddy

    # Media uploads (photos etc. — served by Caddy, stored outside git)
    handle_path /media/* {
        root * /var/www/media
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }

    # Route specific sitemap and robots
    rewrite /sitemap.xml /sitemap-3die.xml
    rewrite /robots.txt /robots-3die.txt

    # Enable the static file server
    # This will use Caddy's default (index.html)
    file_server

    # Real 404 status + designed page (SEO: no soft-404s)
    handle_errors {
        @404 expression {http.error.status_code} == 404
        rewrite @404 /404.html
        file_server
    }
}

api.3die.fr {
    # Python backend (iori-api on 127.0.0.1:3000)
    reverse_proxy localhost:3000
}

dash.3die.fr {
    # Task/communication dashboard (static SPA, talks to api.3die.fr)
    root * /var/www/iori-dash
    encode zstd gzip
    file_server
}
EOF
    # Install the generated cross-domain redirect maps (from site.py)
    cp -f "$SOURCE_DIR/redirects-iori.caddy" /etc/caddy/redirects-iori.caddy
    cp -f "$SOURCE_DIR/redirects-3die.caddy" /etc/caddy/redirects-3die.caddy
    echo "Caddyfile written (dotfile protection, cross-domain 301s, api + dash)."
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
deploy_api
configure_caddy
configure_firewall
reload_caddy_service

echo ""
echo "--- [$(date)] Setup Complete! ---"
echo ""
echo "Caddy is now serving your sites."
echo " - https://iori.me/ (web.html)"
echo " - https://3die.fr/ (index.html)"
echo " - https://3die.fr/media/ (uploaded media)"
echo " - https://api.3die.fr/ (Python API on :3000)"
echo " - https://dash.3die.fr/ (dashboard)"
echo ""
echo "You can check the status with:"
echo "  systemctl status caddy"
echo "  systemctl status iori-api"
