#!/bin/bash
set -e

# --- CONFIGURATION ---
APP_NAME="clippy_server"
APP_DIR="clippy_app"
PORT=3001

# --- COLORS ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== CLIPPY LAUNCH SEQ ===${NC}"

# --- 1. PREREQUISITES ---
echo -e "${BLUE}[1/4] Checking Environment...${NC}"
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust/Cargo is not installed.${NC}"
    echo "Please install it via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# --- 2. SCAFFOLDING ---
echo -e "${BLUE}[2/4] Scaffolding Project in './$APP_DIR'...${NC}"
mkdir -p "$APP_DIR/src"

# --- 3. BUNDLING CODE ---
echo -e "${BLUE}[3/4] Writing Source Files...${NC}"

# >>> Cargo.toml
cat << 'EOF' > "$APP_DIR/Cargo.toml"
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

# >>> src/main.rs
cat << 'EOF' > "$APP_DIR/src/main.rs"
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

// --- Models ---
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
struct Clip {
    id: i64,
    #[serde(rename = "type")]
    clip_type: String,
    content: String, // Text or Base64 Data URI
    metadata: String, // JSON string of metadata
    timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CreateClip {
    #[serde(rename = "type")]
    clip_type: String,
    content: String,
    metadata: serde_json::Value,
}

// --- App State ---
#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    tx: broadcast::Sender<Clip>, // For real-time updates
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. Database Setup
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

    // 3. Real-time Channel
    let (tx, _rx) = broadcast::channel(100);
    let state = AppState { pool, tx };

    // 4. Router
    let app = Router::new()
        .route("/api/clips", get(get_clips).post(create_clip))
        .route("/api/clips/:id", delete(delete_clip))
        .route("/api/events", get(sse_handler))
        .nest_service("/", ServeDir::new("."))
        .with_state(state);

    // 5. Run
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

async fn create_clip(
    State(state): State<AppState>,
    Json(payload): Json<CreateClip>,
) -> impl IntoResponse {
    let timestamp = chrono::Local::now().format("%I:%M:%S %p").to_string();
    let metadata_str = payload.metadata.to_string();

    let id = sqlx::query(
        "INSERT INTO clips (type, content, metadata, timestamp) VALUES (?, ?, ?, ?)",
    )
    .bind(&payload.clip_type)
    .bind(&payload.content)
    .bind(&metadata_str)
    .bind(&timestamp)
    .execute(&state.pool)
    .await
    .unwrap()
    .last_insert_rowid();

    let new_clip = Clip {
        id,
        clip_type: payload.clip_type,
        content: payload.content,
        metadata: metadata_str,
        timestamp,
    };

    let _ = state.tx.send(new_clip);
    axum::http::StatusCode::CREATED
}

async fn delete_clip(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> impl IntoResponse {
    sqlx::query("DELETE FROM clips WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await
        .unwrap();

    let _ = state.tx.send(Clip {
        id,
        clip_type: "DELETE_SIGNAL".to_string(),
        content: "".to_string(),
        metadata: "{}".to_string(),
        timestamp: "".to_string(),
    });
    axum::http::StatusCode::OK
}

async fn sse_handler(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, axum::BoxError>>> {
    let mut rx = state.tx.subscribe();
    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(clip) => {
                let event = Event::default().json_data(clip).unwrap();
                Some((Ok(event), rx))
            }
            Err(_e) => None,
        }
    });
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(10)))
}
EOF

# >>> index.html (Note: Using 'EOF' prevents $ variable expansion in bash, preserving JS syntax)
cat << 'EOF' > "$APP_DIR/index.html"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CLIPPY // SYNC</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --surface: rgba(255, 255, 255, 0.03);
            --border: rgba(255, 255, 255, 0.1);
            --border-hover: rgba(255, 255, 255, 0.3);
            --accent: #00f0ff;
            --text-main: #e0e0e0;
            --text-dim: #666;
            --font: 'Space Grotesk', sans-serif;
            --glass: blur(10px);
        }

        * { box-sizing: border-box; outline: none; }

        body {
            margin: 0;
            background-color: var(--bg);
            background-image:
                radial-gradient(circle at 50% 50%, rgba(255,255,255,0.02) 0%, transparent 50%),
                linear-gradient(0deg, rgba(0,0,0,0.2) 50%, transparent 50%);
            background-size: 100% 100%, 4px 4px;
            color: var(--text-main);
            font-family: var(--font);
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .actions {
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            backdrop-filter: var(--glass);
            z-index: 10;
            border-bottom: 1px solid var(--border);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background-color: #333;
            border-radius: 50%;
            margin-right: 10px;
            box-shadow: 0 0 5px #333;
            transition: all 0.3s;
        }

        .status-dot.connected {
            background-color: var(--accent);
            box-shadow: 0 0 10px var(--accent);
        }

        #grid {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            grid-auto-rows: 1fr;
            gap: 20px;
            align-content: start;
        }

        #grid::-webkit-scrollbar { width: 4px; }
        #grid::-webkit-scrollbar-thumb { background: var(--border); }

        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            position: relative;
            cursor: pointer;
            overflow: hidden;
            transition: transform 0.1s, border-color 0.2s;
            animation: slideUp 0.3s ease-out;
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .card:hover {
            border-color: var(--border-hover);
            transform: translateY(-2px);
        }

        .card:active { transform: scale(0.99); }

        .preview-box {
            width: 100%;
            min-height: 150px;
            flex-grow: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.2);
            overflow: hidden;
        }

        .preview-img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .preview-text {
            padding: 20px;
            font-size: 13px;
            line-height: 1.4;
            color: var(--text-main);
            white-space: pre-wrap;
            word-break: break-all;
            flex-grow: 1;
            overflow: hidden;
            mask-image: linear-gradient(180deg, #000 85%, transparent);
        }

        .preview-file {
            padding: 40px 20px;
            text-align: center;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: center;
            justify-content: center;
            flex-grow: 1;
        }

        .file-icon { font-size: 32px; opacity: 0.6; }

        .meta {
            padding: 12px 15px;
            border-top: 1px solid var(--border);
            font-size: 10px;
            color: var(--text-dim);
            display: flex;
            justify-content: space-between;
            background: rgba(0,0,0,0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: auto;
        }

        .delete-btn {
            opacity: 0;
            color: #ff3333;
            cursor: pointer;
            font-weight: 700;
            padding: 0 5px;
            z-index: 5;
        }

        .card:hover .delete-btn { opacity: 1; }

        #drop-zone {
            position: fixed;
            top: 10px; left: 10px; right: 10px; bottom: 10px;
            border: 1px dashed var(--accent);
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(15px);
            z-index: 100;
            display: none;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }

        #drop-zone.active { display: flex; }

        .drop-msg {
            color: var(--accent);
            font-size: 14px;
            letter-spacing: 4px;
            text-transform: uppercase;
            font-weight: 700;
        }

        #toast {
            position: fixed;
            bottom: 30px; right: 30px;
            background: var(--bg);
            border: 1px solid var(--accent);
            color: var(--accent);
            padding: 12px 24px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 50;
            box-shadow: 0 0 25px rgba(0, 240, 255, 0.15);
            font-weight: 500;
        }

        #toast.visible { transform: translateY(0); opacity: 1; }

        .empty-state {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            opacity: 0.4;
            pointer-events: none;
        }
        .empty-state p { font-size: 14px; margin-bottom: 8px; letter-spacing: 1px; }
        .empty-state kbd {
            border: 1px solid var(--text-dim);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-family: monospace;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <div class="actions">
        <div style="display:flex; align-items:center; font-size:11px; letter-spacing:1px;">
            <div class="status-dot" id="statusDot"></div>
            CLIPPY // SYNC
        </div>
    </div>

    <div id="grid">
        <div class="empty-state" id="emptyState">
            <p>Paste <kbd>CTRL+V</kbd> or Drop Files</p>
        </div>
    </div>

    <div id="drop-zone">
        <span class="drop-msg">Acquire Data</span>
    </div>

    <div id="toast">Copied to System</div>

    <script>
        const blobToBase64 = (blob) => {
            return new Promise((resolve, _) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        };

        const dataURItoBlob = (dataURI) => {
            const byteString = atob(dataURI.split(',')[1]);
            const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new Blob([ab], {type: mimeString});
        };

        const API = {
            getAll: async () => {
                const res = await fetch('/api/clips');
                return res.json();
            },
            save: async (type, content, metadata = {}) => {
                let payloadContent = content;
                if (content instanceof Blob) {
                    payloadContent = await blobToBase64(content);
                }
                await fetch('/api/clips', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type,
                        content: payloadContent,
                        metadata
                    })
                });
            },
            delete: async (id) => {
                await fetch(`/api/clips/${id}`, { method: 'DELETE' });
            }
        };

        const grid = document.getElementById('grid');
        const emptyState = document.getElementById('emptyState');
        const dropZone = document.getElementById('drop-zone');
        const toast = document.getElementById('toast');
        const statusDot = document.getElementById('statusDot');

        const showToast = (msg) => {
            toast.textContent = msg;
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 2000);
        };

        const updateEmptyState = () => {
            if (grid.children.length <= 1) {
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
            }
        };

        const formatBytes = (bytes, decimals = 2) => {
            if (!+bytes) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        };

        const createCard = (clip) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = clip.id;
            let meta = {};
            try { meta = typeof clip.metadata === 'string' ? JSON.parse(clip.metadata) : clip.metadata; } catch(e){}

            let contentHTML = '';
            if (clip.type === 'text') {
                contentHTML = `<div class="preview-text">${clip.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
            } else if (clip.type === 'image') {
                contentHTML = `<div class="preview-box"><img src="${clip.content}" class="preview-img" alt="clip"></div>`;
            } else if (clip.type === 'file') {
                contentHTML = `
                    <div class="preview-file">
                        <div class="file-icon">▤</div>
                        <div style="font-size:12px; font-weight:500;">${meta.name || 'File'}</div>
                        <div style="font-size:10px; color:var(--text-dim);">${formatBytes(meta.size || 0)}</div>
                    </div>
                `;
            }

            card.innerHTML = `
                ${contentHTML}
                <div class="meta">
                    <span>${clip.type} // ${clip.timestamp || ''}</span>
                    <span class="delete-btn">DEL</span>
                </div>
            `;

            card.addEventListener('click', async (e) => {
                if (e.target.classList.contains('delete-btn')) {
                    e.stopPropagation();
                    await API.delete(clip.id);
                    return;
                }
                if (clip.type === 'text') {
                    await navigator.clipboard.writeText(clip.content);
                    showToast('Text Copied');
                } else if (clip.type === 'image') {
                    try {
                        const blob = dataURItoBlob(clip.content);
                        const isSupported = ['image/png', 'image/jpeg'].includes(blob.type);
                        if (isSupported) {
                            await navigator.clipboard.write([
                                new ClipboardItem({ [blob.type]: blob })
                            ]);
                            showToast('Image Copied');
                        } else {
                             throw new Error('Unsupported mime');
                        }
                    } catch (err) {
                        const blob = dataURItoBlob(clip.content);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = meta.name || 'image.png';
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast('Downloaded');
                    }
                } else if (clip.type === 'file') {
                    const blob = dataURItoBlob(clip.content);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = meta.name || 'download';
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('File Downloaded');
                }
            });
            return card;
        };

        const renderAll = async () => {
            const clips = await API.getAll();
            grid.innerHTML = '';
            grid.appendChild(emptyState);
            clips.forEach(clip => {
                const card = createCard(clip);
                grid.appendChild(card);
            });
            updateEmptyState();
        };

        const initSSE = () => {
            const evtSource = new EventSource("/api/events");
            evtSource.onopen = () => { statusDot.classList.add('connected'); };
            evtSource.onerror = () => { statusDot.classList.remove('connected'); };
            evtSource.onmessage = (e) => {
                renderAll();
            };
        };

        document.addEventListener('paste', async (e) => {
            const items = e.clipboardData.items;
            let hasFile = false;
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    hasFile = true;
                    const blob = items[i].getAsFile();
                    let type = blob.type.startsWith('image/') ? 'image' : 'file';
                    const name = blob.name || `pasted_item_${Date.now()}`;
                    showToast('Uploading...');
                    await API.save(type, blob, { name, size: blob.size, mime: blob.type });
                }
            }
            if (!hasFile) {
                const text = e.clipboardData.getData('text/plain');
                if (text && text.trim()) {
                    await API.save('text', text);
                }
            }
        });

        window.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
        window.addEventListener('dragleave', (e) => { if(e.clientX===0 && e.clientY===0) dropZone.classList.remove('active'); });
        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            if (e.dataTransfer.files.length) {
                showToast('Uploading...');
                for (const file of e.dataTransfer.files) {
                    let type = 'file';
                    if (file.type.startsWith('image/')) type = 'image';
                    await API.save(type, file, { name: file.name, size: file.size, mime: file.type });
                }
            }
        });

        (async () => {
            try {
                await renderAll();
                initSSE();
            } catch (err) {
                console.error("Init failed", err);
                showToast('Server Offline?');
            }
        })();
    </script>
</body>
</html>
EOF

# --- 4. LAUNCHING ---
echo -e "${BLUE}[4/4] Launching Clippy on Port $PORT...${NC}"
cd "$APP_DIR"

if lsof -i :$PORT > /dev/null; then
    echo -e "${RED}Warning: Port $PORT seems busy. Attempting to start anyway...${NC}"
fi

# Run cargo (will build if necessary)
# We use --quiet to reduce build noise, but basic cargo info will show
cargo run --release
