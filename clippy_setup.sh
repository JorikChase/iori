#!/bin/bash
#
# ==============================================================================
# CLIPPY LOCAL DEV SETUP (FIXED)
# ==============================================================================
#
# This script sets up the 'Clippy' Rust application in your CURRENT directory.
#
# UPDATES:
# - FIXED: Resolved mapping conflict. removed #[sqlx(rename)] attribute and
#   relying on explicit SQL aliasing (SELECT type as clip_type) to handle
#   the reserved keyword 'type' safely.
#
# ==============================================================================

set -e

# --- Configuration ---
PROJECT_NAME="clippy_dev"
BASE_DIR="$(pwd)/$PROJECT_NAME"

# --- Colors ---
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== STARTING CLIPPY LOCAL SETUP (FIXED) ===${NC}"
echo -e "Target Directory: ${YELLOW}$BASE_DIR${NC}"

# 1. Check Rust
if ! command -v cargo &> /dev/null; then
    echo -e "${YELLOW}Rust is not installed.${NC}"
    echo "Please install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# 2. Scaffold Directory
if [ -d "$BASE_DIR" ]; then
    echo -e "${YELLOW}Directory $PROJECT_NAME already exists. backing up...${NC}"
    mv "$BASE_DIR" "${BASE_DIR}_backup_$(date +%s)"
fi

echo "Creating project structure..."
mkdir -p "$BASE_DIR"
cd "$BASE_DIR"
cargo init --bin --name clippy_server

# 3. Create .gitignore
cat << 'EOF' > .gitignore
/target
/clippy.db
/clippy.db-shm
/clippy.db-wal
**/*.rs.bk
EOF

# 4. Write Cargo.toml
echo "Configuring dependencies..."
cat << 'EOF' > Cargo.toml
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
tower-http = { version = "0.5", features = ["fs", "cors", "trace", "limit"] }
futures = "0.3"
tokio-stream = "0.1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
chrono = "0.4"
anyhow = "1.0"
EOF

# 5. Write src/main.rs (FIXED MAPPING)
echo "Writing backend logic..."
cat << 'EOF' > src/main.rs
use axum::{
    extract::{DefaultBodyLimit, State},
    response::{sse::{Event, Sse}, IntoResponse},
    routing::{get, delete},
    Json, Router,
};
use futures::stream::{self, Stream};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::{net::SocketAddr, time::Duration};
use tokio::sync::broadcast;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
struct Clip {
    id: i64,
    #[serde(rename = "type")]
    // FIXED: Removed #[sqlx(rename = "type")] to prevent conflict with SQL alias
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
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=debug,clippy_server=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = "sqlite:clippy.db";
    if !std::path::Path::new("clippy.db").exists() {
        tracing::info!("Database not found. Creating clippy.db...");
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

    let app_logic = Router::new()
        .route("/api/clips", get(get_clips).post(create_clip))
        .route("/api/clips/:id", delete(delete_clip))
        .route("/api/events", get(sse_handler))
        .nest_service("/", ServeDir::new("."))
        .layer(TraceLayer::new_for_http())
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .layer(CorsLayer::permissive());

    let app = Router::new()
        .nest("/clippy", app_logic.clone())
        .merge(app_logic)
        .with_state(state);

    let port = 3001;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Clippy is listening on http://0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn get_clips(State(state): State<AppState>) -> Json<Vec<Clip>> {
    tracing::debug!("Fetching all clips");
    // FIXED: Query explicitly aliases 'type' to 'clip_type' to match the struct field
    let result = sqlx::query_as::<_, Clip>("SELECT id, type as clip_type, content, metadata, timestamp FROM clips ORDER BY id DESC")
        .fetch_all(&state.pool)
        .await;

    match result {
        Ok(clips) => Json(clips),
        Err(e) => {
            tracing::error!("CRITICAL: Failed to fetch clips from DB: {:?}", e);
            Json(vec![])
        }
    }
}

async fn create_clip(State(state): State<AppState>, Json(payload): Json<CreateClip>) -> impl IntoResponse {
    tracing::info!("Received new clip type: {}, size: {} chars", payload.clip_type, payload.content.len());

    let timestamp = chrono::Local::now().format("%I:%M:%S %p").to_string();
    let metadata_str = payload.metadata.to_string();

    // Note: INSERT uses raw column name 'type', which is correct for SQL
    let result = sqlx::query("INSERT INTO clips (type, content, metadata, timestamp) VALUES (?, ?, ?, ?)")
        .bind(&payload.clip_type)
        .bind(&payload.content)
        .bind(&metadata_str)
        .bind(&timestamp)
        .execute(&state.pool)
        .await;

    match result {
        Ok(res) => {
            let id = res.last_insert_rowid();
            let new_clip = Clip {
                id, clip_type: payload.clip_type, content: payload.content, metadata: metadata_str, timestamp,
            };
            tracing::info!("Broadcasting clip ID: {}", id);
            let _ = state.tx.send(new_clip);
            axum::http::StatusCode::CREATED
        }
        Err(e) => {
            tracing::error!("Failed to insert clip: {:?}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

async fn delete_clip(State(state): State<AppState>, axum::extract::Path(id): axum::extract::Path<i64>) -> impl IntoResponse {
    tracing::info!("Deleting clip ID: {}", id);
    if let Err(e) = sqlx::query("DELETE FROM clips WHERE id = ?").bind(id).execute(&state.pool).await {
        tracing::error!("Database delete error: {:?}", e);
        return axum::http::StatusCode::INTERNAL_SERVER_ERROR;
    }
    let _ = state.tx.send(Clip { id, clip_type: "DELETE_SIGNAL".to_string(), content: "".to_string(), metadata: "{}".to_string(), timestamp: "".to_string() });
    axum::http::StatusCode::OK
}

async fn sse_handler(State(state): State<AppState>) -> Sse<impl Stream<Item = Result<Event, axum::BoxError>>> {
    tracing::debug!("New SSE connection established");
    let rx = state.tx.subscribe();
    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(clip) => Some((Ok(Event::default().json_data(clip).unwrap()), rx)),
            Err(_e) => None,
        }
    });
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(10)))
}
EOF

# 6. Write index.html
echo "Writing frontend..."
cat << 'EOF' > index.html
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
        <div style="font-size: 11px; opacity: 0.5;">DEBUG ENABLED</div>
    </div>
    <div id="grid">
        <div class="empty-state" id="emptyState"><p>Paste <kbd>CTRL+V</kbd> or Drop Files</p></div>
    </div>
    <div id="toast">Copied</div>
    <script>
        const API={
            getAll: async() => {
                console.log('Fetching clips...');
                const res = await fetch('api/clips');
                if(!res.ok) throw new Error(res.statusText);
                return await res.json();
            },
            save: async(t,c,m={}) => {
                console.log(`Saving ${t}...`);
                let b=c;
                if(c instanceof Blob) {
                    b = await new Promise(r => {
                        const q = new FileReader();
                        q.onloadend = () => r(q.result);
                        q.readAsDataURL(c);
                    });
                }
                const res = await fetch('api/clips', {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({type:t,content:b,metadata:m})
                });
                if(!res.ok) {
                    const txt = await res.text();
                    throw new Error(`Upload Failed: ${res.status} ${txt}`);
                }
            },
            del: async(i) => await fetch(`api/clips/${i}`,{method:'DELETE'})
        };

        const g=document.getElementById('grid'),e=document.getElementById('emptyState'),t=document.getElementById('toast'),s=document.getElementById('statusDot');

        const showToast = m => {
            t.textContent = m;
            t.classList.add('visible');
            console.log('Toast:', m);
            setTimeout(() => t.classList.remove('visible'), 3000);
        };

        const createCard = c => {
            const d=document.createElement('div');d.className='card';
            let m={}; try{m=JSON.parse(c.metadata)}catch(x){}

            d.innerHTML = (c.type==='image'
                ? `<div class="preview-box"><img src="${c.content}" class="preview-img"></div>`
                : `<div class="preview-text">${c.content.replace(/</g,"&lt;")}</div>`) +
                `<div class="meta"><span>${c.type}</span><span class="delete-btn" onclick="API.del(${c.id});event.stopPropagation()">DEL</span></div>`;

            d.onclick = async() => {
                if(c.type==='text'){
                    await navigator.clipboard.writeText(c.content);
                    showToast('Text Copied');
                } else if(c.type==='image'){
                    try {
                        const res=await fetch(c.content);
                        const blob=await res.blob();
                        await navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})]);
                        showToast('Image Copied');
                    } catch(err) {
                        console.error(err);
                        showToast('Copy failed, downloading...');
                        const a=document.createElement('a');
                        a.href=c.content;
                        a.download=m.name||'img.png';
                        a.click();
                    }
                }
            };
            return d;
        };

        const render = async() => {
            try {
                const cs = await API.getAll();
                g.innerHTML = '';
                g.appendChild(e);
                cs.forEach(c => g.appendChild(createCard(c)));
                e.style.display = g.children.length > 1 ? 'none' : 'block';
            } catch(err) {
                showToast(`Error: ${err.message}`);
                console.error('Render error:', err);
            }
        };

        document.onpaste = async(v) => {
            console.log('Paste event triggered');
            const i = v.clipboardData.items;
            let h = false;
            try {
                for(let x=0; x<i.length; x++) {
                    if(i[x].kind === 'file') {
                        h = true;
                        const f = i[x].getAsFile();
                        showToast('Uploading File...');
                        console.log('Uploading file:', f.name, f.size);
                        await API.save(f.type.startsWith('image/') ? 'image' : 'file', f, {name:f.name});
                    }
                }
                if(!h) {
                    const txt = v.clipboardData.getData('text/plain');
                    if(txt) {
                        console.log('Uploading text:', txt.length, 'chars');
                        await API.save('text', txt);
                    }
                }
            } catch(err) {
                showToast(`Upload Error: ${err.message}`);
                console.error('Paste error:', err);
            }
        };

        (async() => {
            await render();
            const es = new EventSource("api/events");
            es.onopen = () => {
                s.classList.add('connected');
                console.log('SSE Connected');
            };
            es.onerror = (err) => {
                s.classList.remove('connected');
                console.error('SSE Error:', err);
            };
            es.onmessage = (msg) => {
                console.log('SSE Message received');
                render();
            };
        })();
    </script>
</body>
</html>
EOF

echo -e "${GREEN}Setup Complete!${NC}"
echo -e "To start the server, run:"
echo -e "  ${YELLOW}cd $PROJECT_NAME && cargo run${NC}"
echo -e "Then open your browser to: ${BLUE}http://localhost:3001${NC}"
