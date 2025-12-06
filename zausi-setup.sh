#!/bin/bash
#
# setup_zausi.sh
# Handles the building and systemd service creation for the 'zausi' Rust app.
#

set -e

# Configuration
APP_SOURCE_DIR="/root/iori/zausi"
BINARY_DEST="/usr/local/bin/zausi"
SERVICE_FILE="/etc/systemd/system/zausi.service"

echo "--- Task: Setting up Zausi Rust App ---"

# 1. Check if source exists
if [ ! -d "$APP_SOURCE_DIR" ]; then
    echo "Error: Zausi source directory ($APP_SOURCE_DIR) not found."
    exit 1
fi

# 2. Ensure Rust/Cargo is installed
if ! command -v cargo &> /dev/null; then
    echo "Cargo not found. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust/Cargo is already installed."
fi

# 3. Build the application
echo "Building Zausi in release mode..."
cd "$APP_SOURCE_DIR"
cargo build --release

# 4. Move binary to execution path
# We move it to ensure the running service uses a stable path
if [ -f "$APP_SOURCE_DIR/target/release/zausi" ]; then
    echo "Installing binary to $BINARY_DEST..."
    # Stop service if running to allow binary overwrite
    systemctl stop zausi || true
    cp "$APP_SOURCE_DIR/target/release/zausi" "$BINARY_DEST"
    chmod +x "$BINARY_DEST"
else
    echo "Error: Build artifact not found."
    exit 1
fi

# 5. Create/Update Systemd Service
echo "Configuring Systemd service..."
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Zausi Rust Application
After=network.target

[Service]
# Run as root (or change to a dedicated user like www-data)
User=root
WorkingDirectory=$APP_SOURCE_DIR
ExecStart=$BINARY_DEST
Restart=always
RestartSec=5
Environment=PORT=3000
# Add other env vars here if needed, e.g.:
# Environment=DATABASE_URL=postgres://...

[Install]
WantedBy=multi-user.target
EOF

# 6. Reload and Restart Service
echo "Reloading daemon and restarting Zausi..."
systemctl daemon-reload
systemctl enable zausi
systemctl restart zausi

echo "--- Zausi Setup Complete (Running on :3000) ---"
