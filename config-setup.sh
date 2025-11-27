#!/bin/bash
#
# ==============================================================================
# UNIFIED SERVER SETUP: IORI + CLIPPY
# ==============================================================================
#
# This script manages the full deployment of the server.
# It is idempotent (safe to run multiple times).
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

# Clippy Rust App
CLIPPY_DIR="/opt/clippy"
CLIPPY_PORT=3001
CLIPPY_DB_PATH="$CLIPPY_DIR/clippy.db"

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
    echo -e "${BLUE}--- [1/6] Ensuring System Dependencies ---${NC}"

    # Basic tools
    if ! command -v rsync &> /dev/null || ! command -v curl &> /dev/null; then
        echo "Installing basic tools..."
        apt-get update -q
        apt-get install -y -q curl rsync git ufw debian-keyring debian-archive-keyring apt-transport-https
    fi

    # Install Rust (if missing)
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
    echo -e "${BLUE}--- [2/6] Deploying Iori (Static Site) ---${NC}"

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
# 3. CLIPPY DEPLOYMENT (Rust App)
# ==============================================================================

deploy_clippy() {
    echo -e "${BLUE}--- [3/6] Deploying Clippy (Rust App) ---${NC}"

    mkdir -p "$CLIPPY_DIR/src"

    # 1. Write Source Files (Idempotent: Overwrites code to ensure latest version)

    # Cargo.toml
    cat << 'EOF' > "$CLIPPY_DIR/Cargo.toml"
[package]
name = "clippy_server"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = { version = "0.7", features = ["macros"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.7", features = ["runtime-tokio-native-tls", "sqlite"] }
tower-http = { version = "0.5", features = ["fs", "cors", "trace"] }
futures = "0.3"
tokio-stream = "0.1"
tracing = "0.1"
tracing-subscriber = "0.3"
chrono = "0.4"
anyhow = "1.0"
EOF

    # src/main.rs
    cat << 'EOF' > "$CLIPPY_DIR/src/main.rs"
use axum::{
    extract::State,
    response::{sse::{Event, Sse}, IntoResponse},
    routing::{get, post, delete},
    Json, Router,
};
use futures::stream::{self, Stream};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
struct Clip {
    id: i64,
    #[serde(rename = "type")]
    clip_type: String,
    content: String,
    metadata: String,
    timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CreateClip {
    #[serde(rename = "type")]
    clip_type: String,
    content: String,
    metadata: serde_json::Value,
}

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    tx: broadcast::Sender<Clip>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = "sqlite:clippy.db";
    if !std::path::Path::new("clippy.db").exists() {
        std::fs::File::create("clippy.db")?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(db_url)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS clips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
        "#,
    )
    .execute(&pool)
    .await?;

    let (tx, _rx) = broadcast::channel(100);
    let state = AppState { pool, tx };

    let app = Router::new()
        .route("/api/clips", get(get_clips).post(create_clip))
        .route("/api/clips/:id", delete(delete_clip))
        .route("/api/events", get(sse_handler))
        .nest_service("/", ServeDir::new("."))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    tracing::info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn get_clips(State(state): State<AppState>) -> Json<Vec<Clip>> {
    let clips = sqlx::query_as::<_, Clip>("SELECT * FROM clips ORDER BY id DESC")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();
    Json(clips)
}

async fn create_clip(State(state): State<AppState>, Json(payload): Json<CreateClip>) -> impl IntoResponse {
    let timestamp = chrono::Local::now().format("%I:%M:%S %p").to_string();
    let metadata_str = payload.metadata.to_string();

    let id = sqlx::query("INSERT INTO clips (type, content, metadata, timestamp) VALUES (?, ?, ?, ?)")
        .bind(&payload.clip_type)
        .bind(&payload.content)
        .bind(&metadata_str)
        .bind(&timestamp)
        .execute(&state.pool)
        .await
        .unwrap()
        .last_insert_rowid();

    let new_clip = Clip {
        id, clip_type: payload.clip_type, content: payload.content, metadata: metadata_str, timestamp,
    };
    let _ = state.tx.send(new_clip);
    axum::http::StatusCode::CREATED
}

async fn delete_clip(State(state): State<AppState>, axum::extract::Path(id): axum::extract::Path<i64>) -> impl IntoResponse {
    sqlx::query("DELETE FROM clips WHERE id = ?").bind(id).execute(&state.pool).await.unwrap();
    let _ = state.tx.send(Clip { id, clip_type: "DELETE_SIGNAL".to_string(), content: "".to_string(), metadata: "{}".to_string(), timestamp: "".to_string() });
    axum::http::StatusCode::OK
}

async fn sse_handler(State(state): State<AppState>) -> Sse<impl Stream<Item = Result<Event, axum::BoxError>>> {
    let mut rx = state.tx.subscribe();
    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(clip) => Some((Ok(Event::default().json_data(clip).unwrap()), rx)),
            Err(_e) => None,
        }
    });
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(10)))
}
EOF

    # index.html
    cat << 'EOF' > "$CLIPPY_DIR/index.html"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CLIPPY // SYNC</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        :root { --bg: #050505; --surface: rgba(255, 255, 255, 0.03); --border: rgba(255, 255, 255, 0.1); --accent: #00f0ff; --text-main: #e0e0e0; --font: 'Space Grotesk', sans-serif; }
        * { box-sizing: border-box; outline: none; }
        body { margin: 0; background: var(--bg); background-image: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.02) 0%, transparent 50%), linear-gradient(0deg, rgba(0,0,0,0.2) 50%, transparent 50%); background-size: 100% 100%, 4px 4px; color: var(--text-main); font-family: var(--font); height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
        .actions { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); backdrop-filter: blur(10px); }
        .status-dot { width: 8px; height: 8px; background-color: #333; border-radius: 50%; margin-right: 10px; box-shadow: 0 0 5px #333; transition: all 0.3s; }
        .status-dot.connected { background-color: var(--accent); box-shadow: 0 0 10px var(--accent); }
        #grid { flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); grid-auto-rows: 1fr; gap: 20px; align-content: start; }
        .card { background: var(--surface); border: 1px solid var(--border); cursor: pointer; overflow: hidden; transition: transform 0.1s; display: flex; flex-direction: column; height: 100%; position: relative; }
        .card:hover { border-color: rgba(255, 255, 255, 0.3); transform: translateY(-2px); }
        .preview-box { width: 100%; flex-grow: 1; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); overflow: hidden; min-height: 150px; }
        .preview-img { width: 100%; height: 100%; object-fit: cover; }
        .preview-text { padding: 20px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-break: break-all; overflow: hidden; mask-image: linear-gradient(180deg, #000 85%, transparent); flex-grow: 1; }
        .meta { padding: 12px 15px; border-top: 1px solid var(--border); font-size: 10px; color: #666; display: flex; justify-content: space-between; background: rgba(0,0,0,0.4); text-transform: uppercase; margin-top: auto; }
        .delete-btn { opacity: 0; color: #ff3333; font-weight: 700; }
        .card:hover .delete-btn { opacity: 1; }
        #toast { position: fixed; bottom: 30px; right: 30px; background: var(--bg); border: 1px solid var(--accent); color: var(--accent); padding: 12px 24px; font-size: 12px; text-transform: uppercase; opacity: 0; transition: all 0.3s; transform: translateY(100px); z-index: 50; box-shadow: 0 0 25px rgba(0, 240, 255, 0.15); }
        #toast.visible { transform: translateY(0); opacity: 1; }
        .empty-state { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.4; pointer-events: none; text-align: center; }
        kbd { border: 1px solid #666; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 11px; }
    </style>
</head>
<body>
    <div class="actions">
        <div style="display:flex; align-items:center; font-size:11px; letter-spacing:1px;">
            <div class="status-dot" id="statusDot"></div> CLIPPY // SYNC
        </div>
    </div>
    <div id="grid">
        <div class="empty-state" id="emptyState"><p>Paste <kbd>CTRL+V</kbd> or Drop Files</p></div>
    </div>
    <div id="toast">Copied</div>
    <script>
        const API={getAll:async()=>await(await fetch('/api/clips')).json(),save:async(t,c,m={})=>{let b=c;if(c instanceof Blob)b=await new Promise(r=>{const q=new FileReader();q.onloadend=()=>r(q.result);q.readAsDataURL(c)});await fetch('/api/clips',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:t,content:b,metadata:m})})},del:async(i)=>await fetch(`/api/clips/${i}`,{method:'DELETE'})};
        const g=document.getElementById('grid'),e=document.getElementById('emptyState'),t=document.getElementById('toast'),s=document.getElementById('statusDot');
        const showToast=m=>{t.textContent=m;t.classList.add('visible');setTimeout(()=>t.classList.remove('visible'),2000)};
        const createCard=c=>{
            const d=document.createElement('div');d.className='card';let m={};try{m=JSON.parse(c.metadata)}catch(x){}
            d.innerHTML=(c.type==='image'?`<div class="preview-box"><img src="${c.content}" class="preview-img"></div>`:`<div class="preview-text">${c.content.replace(/</g,"&lt;")}</div>`)+`<div class="meta"><span>${c.type}</span><span class="delete-btn" onclick="API.del(${c.id});event.stopPropagation()">DEL</span></div>`;
            d.onclick=async()=>{
                if(c.type==='text'){await navigator.clipboard.writeText(c.content);showToast('Text Copied')}
                else if(c.type==='image'){try{const res=await fetch(c.content);const blob=await res.blob();await navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})]);showToast('Image Copied')}catch(e){showToast('Download started');const a=document.createElement('a');a.href=c.content;a.download=m.name||'img.png';a.click()}}
            };
            return d;
        };
        const render=async()=>{const cs=await API.getAll();g.innerHTML='';g.appendChild(e);cs.forEach(c=>g.appendChild(createCard(c)));e.style.display=g.children.length>1?'none':'block'};
        document.onpaste=async(v)=>{
            const i=v.clipboardData.items; let h=false;
            for(let x=0;x<i.length;x++){if(i[x].kind==='file'){h=true;const f=i[x].getAsFile();showToast('Uploading...');await API.save(f.type.startsWith('image/')?'image':'file',f,{name:f.name});}}
            if(!h){const txt=v.clipboardData.getData('text/plain');if(txt)await API.save('text',txt);}
        };
        (async()=>{await render();const es=new EventSource("/api/events");es.onopen=()=>s.classList.add('connected');es.onerror=()=>s.classList.remove('connected');es.onmessage=()=>render();})();
    </script>
</body>
</html>
EOF

    # 2. Build Rust Binary (Incremental)
    cd "$CLIPPY_DIR"
    echo "Building Clippy (Release mode)..."
    # This might take a moment, but Cargo caches dependencies in target/
    cargo build --release

    # 3. Setup Systemd Service (Persistence)
    echo "Configuring Systemd Service..."
    cat << EOF > /etc/systemd/system/clippy.service
[Unit]
Description=Clippy Persistence Service
After=network.target

[Service]
# Simple execution
Type=simple
User=root
WorkingDirectory=$CLIPPY_DIR
ExecStart=$CLIPPY_DIR/target/release/clippy_server
Restart=always
RestartSec=3

# Basic hardening
ProtectSystem=full
# We need write access to the DB in the working dir
ReadWritePaths=$CLIPPY_DIR

[Install]
WantedBy=multi-user.target
EOF

    # 4. Enable & Restart Service
    systemctl daemon-reload
    systemctl enable clippy
    systemctl restart clippy
    echo "Clippy service restarted."
}

# ==============================================================================
# 4. SERVER CONFIGURATION (Firewall & Caddy)
# ==============================================================================

configure_server() {
    echo -e "${BLUE}--- [4/6] Configuring Firewall ---${NC}"
    ufw allow http
    ufw allow https
    # Open 3001 specifically as requested backup, even though Caddy proxies it
    ufw allow $CLIPPY_PORT
    ufw reload || echo "UFW not enabled, skipping reload."

    echo -e "${BLUE}--- [5/6] Writing Caddyfile ---${NC}"

    # Check if we should setup c.iori.me
    cat << EOF > /etc/caddy/Caddyfile
{
    log {
        output file $LOG_FILE
        format json
    }
}

# 1. Main Static Site
iori.me {
    root * $IORI_WEB_ROOT
    file_server {
        index web.html index.html
    }
    # SPA/Fallback routing
    try_files {path} {path}/ /web.html
}

# 2. Secondary Static Site
3die.fr {
    root * $IORI_WEB_ROOT
    file_server
}

# 3. Clippy App (Subdomain Strategy)
# Ensure you set an A record for c.iori.me -> Server IP
c.iori.me {
    reverse_proxy localhost:$CLIPPY_PORT
}
EOF

    echo -e "${BLUE}--- [6/6] Reloading Caddy ---${NC}"
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
deploy_clippy
configure_server

echo ""
echo -e "${GREEN}=== SETUP COMPLETE ===${NC}"
echo "--------------------------------------------------------"
echo "1. Iori.me   : Served from $IORI_WEB_ROOT"
echo "2. 3die.fr   : Served from $IORI_WEB_ROOT"
echo "3. Clippy    : Running as 'clippy.service' on Port $CLIPPY_PORT"
echo "   -> Access : https://c.iori.me (Requires DNS A Record)"
echo "   -> Backup : http://<YOUR_IP>:$CLIPPY_PORT (Direct access)"
echo "--------------------------------------------------------"
echo "To check logs: journalctl -u clippy -f"
