/* 3DIE_DASH — talks to api.3die.fr. No framework, no build step. */
"use strict";

const API = localStorage.getItem("dash_api") || "https://api.3die.fr";

const state = {
  user: null,
  board: { lanes: [], phases: [], tasks: [] },
  tab: "board",
  editingTaskId: null,
};

/* ---------------- helpers ---------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: opts.body && !(opts.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : undefined,
    ...opts,
  });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    showLogin();
    throw new Error("unauthorized");
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `error ${res.status}`);
  return data;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/* ---------------- auth ---------------- */

async function boot() {
  try {
    state.user = await api("/auth/me");
    showMain();
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("#login-view").classList.remove("hidden");
  $("#main-view").classList.add("hidden");
}

function showMain() {
  $("#login-view").classList.add("hidden");
  $("#main-view").classList.remove("hidden");
  $("#whoami").textContent = state.user.username;
  loadBoard();
  loadInbox();
  loadFeed();
  loadChat();
  loadCanvas();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#login-user").value.trim(),
        password: $("#login-pass").value,
      }),
    });
    state.user = data;
    $("#login-pass").value = "";
    showMain();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  showLogin();
});

/* ---------------- tabs ---------------- */

$$(".tab").forEach((btn) => btn.addEventListener("click", () => {
  state.tab = btn.dataset.tab;
  $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
  $$(".tabpanel").forEach((p) => p.classList.add("hidden"));
  $(`#tab-${state.tab}`).classList.remove("hidden");
}));

/* ---------------- board ---------------- */

async function loadBoard() {
  state.board = await api("/board");
  renderBoard();
}

function renderBoard() {
  const { lanes, phases, tasks } = state.board;
  const table = $("#board-table");
  table.innerHTML = "";

  const thead = document.createElement("tr");
  thead.appendChild(document.createElement("th"));
  for (const ph of phases) {
    const th = document.createElement("th");
    th.textContent = ph.name;
    thead.appendChild(th);
  }
  table.appendChild(thead);

  for (const lane of lanes) {
    const row = document.createElement("tr");
    const head = document.createElement("th");
    head.className = "lane-head" + (lane.pinned ? " pinned" : "");
    head.innerHTML =
      `<span class="pin-toggle" title="pin lane">${lane.pinned ? "◉" : "○"}</span>` +
      `<span>${esc(lane.name)}</span>` +
      `<span class="lane-del" title="delete lane">×</span>`;
    head.querySelector(".pin-toggle").addEventListener("click", async () => {
      await api(`/lanes/${encodeURIComponent(lane.name)}`, {
        method: "PATCH", body: JSON.stringify({ pinned: !lane.pinned }),
      });
      loadBoard();
    });
    head.querySelector(".lane-del").addEventListener("click", async () => {
      try {
        await api(`/lanes/${encodeURIComponent(lane.name)}`, { method: "DELETE" });
        loadBoard();
      } catch (err) { alert(err.message); }
    });
    row.appendChild(head);

    for (const ph of phases) {
      const cell = document.createElement("td");
      cell.className = "cell";
      cell.dataset.lane = lane.name;
      cell.dataset.phase = ph.name;

      cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("dragover"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("dragover"));
      cell.addEventListener("drop", async (e) => {
        e.preventDefault();
        cell.classList.remove("dragover");
        const id = e.dataTransfer.getData("text/task-id");
        if (!id) return;
        const siblings = tasks.filter(
          (t) => t.lane === lane.name && t.phase === ph.name && t.id !== +id);
        await api(`/tasks/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ lane: lane.name, phase: ph.name, position: siblings.length + 1 }),
        });
        loadBoard();
      });

      const cellTasks = tasks.filter((t) => t.lane === lane.name && t.phase === ph.name);
      for (const task of cellTasks) {
        cell.appendChild(renderCard(task));
      }
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  $("#lane-list").innerHTML = lanes.map((l) => `<option value="${esc(l.name)}">`).join("");
  $("#phase-list").innerHTML = phases.map((p) => `<option value="${esc(p.name)}">`).join("");
}

function renderCard(task) {
  const el = document.createElement("div");
  el.className = "card" + (task.pinned ? " pinned" : "");
  el.draggable = true;
  el.innerHTML =
    `<div class="card-title">${task.pinned ? "◉ " : ""}${esc(task.title)}</div>` +
    `<div class="card-meta">` +
    (task.assignee ? `<span class="card-assignee">@${esc(task.assignee)}</span>` : "") +
    (task.due ? `<span>⌛ ${esc(task.due)}</span>` : "") +
    `</div>`;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/task-id", task.id);
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  el.addEventListener("click", () => openTaskModal(task));
  return el;
}

/* ---------------- task modal ---------------- */

function openTaskModal(task) {
  state.editingTaskId = task ? task.id : null;
  $("#task-title").value = task ? task.title : "";
  $("#task-body").value = task ? task.body : "";
  $("#task-lane").value = task ? task.lane : "general";
  $("#task-phase").value = task ? task.phase : (state.board.phases[0]?.name || "idea");
  $("#task-assignee").value = task ? task.assignee : "";
  $("#task-due").value = task ? task.due : "";
  $("#task-pinned").checked = task ? !!task.pinned : false;
  $("#task-delete").classList.toggle("hidden", !task);
  $("#task-modal").classList.remove("hidden");
  $("#task-title").focus();
}

function closeTaskModal() {
  $("#task-modal").classList.add("hidden");
  state.editingTaskId = null;
}

$("#add-task-btn").addEventListener("click", () => openTaskModal(null));
$("#task-cancel").addEventListener("click", closeTaskModal);
$("#task-modal").addEventListener("click", (e) => {
  if (e.target === $("#task-modal")) closeTaskModal();
});

$("#task-save").addEventListener("click", async () => {
  const payload = {
    title: $("#task-title").value.trim(),
    body: $("#task-body").value,
    lane: $("#task-lane").value.trim() || "general",
    phase: $("#task-phase").value.trim() || "idea",
    assignee: $("#task-assignee").value.trim(),
    due: $("#task-due").value,
    pinned: $("#task-pinned").checked,
  };
  if (!payload.title) { $("#task-title").focus(); return; }
  if (state.editingTaskId) {
    await api(`/tasks/${state.editingTaskId}`, { method: "PATCH", body: JSON.stringify(payload) });
  } else {
    await api("/tasks", { method: "POST", body: JSON.stringify(payload) });
  }
  closeTaskModal();
  loadBoard();
});

$("#task-delete").addEventListener("click", async () => {
  if (!state.editingTaskId) return;
  await api(`/tasks/${state.editingTaskId}`, { method: "DELETE" });
  closeTaskModal();
  loadBoard();
});

$("#add-lane-btn").addEventListener("click", async () => {
  const name = prompt("lane name:");
  if (!name) return;
  await api("/lanes", { method: "POST", body: JSON.stringify({ name }) }).catch((e) => alert(e.message));
  loadBoard();
});

$("#add-phase-btn").addEventListener("click", async () => {
  const name = prompt("phase name:");
  if (!name) return;
  await api("/phases", { method: "POST", body: JSON.stringify({ name }) }).catch((e) => alert(e.message));
  loadBoard();
});

/* ---------------- inbox ---------------- */

async function loadInbox() {
  try {
    const { messages } = await api("/messages?kind=contact");
    renderInbox(messages);
    const unread = messages.filter((m) => !m.read).length;
    $("#inbox-badge").textContent = unread || "";
    $("#inbox-badge").classList.toggle("hidden", !unread);
  } catch { /* not logged in yet */ }
}

function renderInbox(messages) {
  const list = $("#inbox-list");
  list.innerHTML = messages.length ? "" : "<div class='msg'>no messages yet.</div>";
  for (const m of messages) {
    const el = document.createElement("div");
    el.className = "msg" + (m.read ? "" : " unread");
    el.innerHTML =
      `<div class="msg-head">` +
      `<span class="msg-author">${esc(m.author || "anonymous")} ${m.email ? "&lt;" + esc(m.email) + "&gt;" : ""}</span>` +
      `<span class="msg-time">${fmtTime(m.created_at)}</span></div>` +
      (m.subject ? `<div><b>${esc(m.subject)}</b></div>` : "") +
      `<div class="msg-body">${esc(m.body)}</div>` +
      `<div class="msg-actions"><button class="ghost-btn">${m.read ? "mark unread" : "mark read"}</button></div>`;
    el.querySelector("button").addEventListener("click", async () => {
      await api(`/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ read: !m.read }) });
      loadInbox();
    });
    list.appendChild(el);
  }
}

/* ---------------- blog ---------------- */

$("#file-drop").addEventListener("dragover", (e) => {
  e.preventDefault();
  $("#file-drop").classList.add("dragover");
});
$("#file-drop").addEventListener("dragleave", () => $("#file-drop").classList.remove("dragover"));
$("#file-drop").addEventListener("drop", (e) => {
  e.preventDefault();
  $("#file-drop").classList.remove("dragover");
  $("#post-files").files = e.dataTransfer.files;
  renderPreview();
});
$("#post-files").addEventListener("change", renderPreview);

function renderPreview() {
  const row = $("#post-preview");
  row.innerHTML = "";
  const files = $("#post-files").files;
  $("#file-drop-label").textContent = files.length ? `${files.length} file(s) selected` : "drop images here or click to choose";
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);
    row.appendChild(img);
  }
}

$("#post-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#post-status");
  status.textContent = "";
  const fd = new FormData();
  fd.append("caption", $("#post-caption").value);
  for (const f of $("#post-files").files) fd.append("files", f);
  $("#post-submit").disabled = true;
  try {
    await api("/posts", { method: "POST", body: fd });
    $("#post-caption").value = "";
    $("#post-files").value = "";
    renderPreview();
    status.textContent = "";
    loadFeed();
  } catch (err) {
    status.textContent = err.message;
  } finally {
    $("#post-submit").disabled = false;
  }
});

async function loadFeed() {
  try {
    const { posts } = await api("/posts");
    renderFeed(posts);
  } catch { /* not logged in */ }
}

function renderFeed(posts) {
  const list = $("#feed-list");
  list.innerHTML = posts.length ? "" : "<div class='msg'>no posts yet.</div>";
  for (const p of posts) {
    const el = document.createElement("div");
    el.className = "msg";
    const mediaHtml = p.media.map((u) =>
      u.match(/\.(mp4|webm|mov)$/i)
        ? `<video src="${esc(u)}" controls muted></video>`
        : `<img src="${esc(u)}" loading="lazy" alt="">`
    ).join("");
    el.innerHTML =
      `<div class="msg-head"><span class="msg-author">@${esc(p.author)}</span>` +
      `<span class="msg-time">${fmtTime(p.created_at)}</span></div>` +
      (p.caption ? `<div class="msg-body">${esc(p.caption)}</div>` : "") +
      (mediaHtml ? `<div class="feed-media">${mediaHtml}</div>` : "") +
      (p.author === state.user?.username || state.user?.role === "admin"
        ? `<div class="msg-actions"><button class="ghost-btn">delete</button></div>` : "");
    const del = el.querySelector("button");
    if (del) del.addEventListener("click", async () => {
      await api(`/posts/${p.id}`, { method: "DELETE" });
      loadFeed();
    });
    list.appendChild(el);
  }
}

/* ---------------- chat ---------------- */

let chatLastId = 0;
let chatSeenId = parseInt(localStorage.getItem("chat_seen") || "0", 10);

async function loadChat() {
  const { messages } = await api("/messages?kind=thread");
  renderChat(messages);
  if (messages.length) {
    chatLastId = messages[0].id;
    markChatSeen();
  }
}

function markChatSeen() {
  chatSeenId = Math.max(chatSeenId, chatLastId);
  localStorage.setItem("chat_seen", String(chatSeenId));
  updateBadges();
}

function renderChat(messages) {
  const list = $("#chat-list");
  list.innerHTML = messages.length ? "" : "<div class='msg'>no messages yet — say something.</div>";
  // API returns newest-first; render oldest-first for chat flow
  for (const m of [...messages].reverse()) {
    const el = document.createElement("div");
    el.className = "chatmsg" + (m.author === state.user?.username ? " own" : "");
    el.innerHTML =
      `<div class="chat-meta"><span>@${esc(m.author)}</span><span>${fmtTime(m.created_at)}</span></div>` +
      `<div class="chat-text">${esc(m.body)}</div>`;
    list.appendChild(el);
  }
  list.scrollTop = list.scrollHeight;
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#chat-input").value.trim();
  if (!text) return;
  $("#chat-input").value = "";
  await api("/messages", { method: "POST", body: JSON.stringify({ body: text }) });
  loadChat();
});

/* ---------------- profile ---------------- */

$("#profile-btn").addEventListener("click", () => {
  state.tab = "profile";
  $$(".tab").forEach((b) => b.classList.remove("active"));
  $$(".tabpanel").forEach((p) => p.classList.add("hidden"));
  $("#tab-profile").classList.remove("hidden");
});

$("#pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#pw-status");
  status.textContent = "";
  if ($("#pw-new").value !== $("#pw-new2").value) {
    status.textContent = "new passwords don't match";
    return;
  }
  try {
    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: $("#pw-old").value, new_password: $("#pw-new").value }),
    });
    status.textContent = "password changed.";
    $("#pw-form").reset();
  } catch (err) {
    status.textContent = err.message;
  }
});

/* ---------------- canvas (freeform layout editor) ---------------- */

const CANVAS_W = 1200;
let canvasPosts = [];
let maxZ = 1;

async function loadCanvas() {
  const { posts } = await api(`/posts?author=${encodeURIComponent(state.user.username)}&limit=200`);
  canvasPosts = posts;
  maxZ = Math.max(1, ...posts.map(p => (p.layout && p.layout.z) || 1));
  renderCanvas();
}

function renderCanvas() {
  const area = $("#canvas-area");
  area.innerHTML = "";
  let autoX = 30, autoY = 30;
  for (const p of canvasPosts) {
    const el = document.createElement("div");
    el.className = "canvas-item";
    const lay = p.layout || {};
    const hasLay = lay.x != null;
    const x = hasLay ? lay.x : autoX;
    const y = hasLay ? lay.y : autoY;
    const w = (hasLay && lay.w) || 260;
    const z = (hasLay && lay.z) || 1;
    if (!hasLay) { autoX += 40; autoY += 40; if (autoX > CANVAS_W - 300) { autoX = 30; autoY += 40; } }
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = w + "px";
    el.style.zIndex = z;
    const first = p.media[0];
    el.innerHTML =
      (first
        ? (/\.(mp4|webm|mov)$/i.test(first)
            ? `<video src="${esc(first)}" muted></video>`
            : `<img src="${esc(first)}" draggable="false" alt="">`)
        : `<div class="msg">${esc(p.caption).slice(0, 140)}</div>`) +
      (p.caption && first ? `<div class="cap">${esc(p.caption).slice(0, 60)}</div>` : "") +
      `<div class="resize-handle"></div>`;
    attachCanvasDrag(el, p);
    area.appendChild(el);
  }
  // grow canvas to fit content
  let maxBottom = 800;
  canvasPosts.forEach(p => {
    if (p.layout && p.layout.y != null) maxBottom = Math.max(maxBottom, p.layout.y + 500);
  });
  area.style.minHeight = maxBottom + "px";
}

function attachCanvasDrag(el, post) {
  let mode = null, startX = 0, startY = 0, origX = 0, origY = 0, origW = 0;

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $$(".canvas-item").forEach(i => i.classList.remove("active"));
    el.classList.add("active");
    // bring to front
    maxZ += 1;
    el.style.zIndex = maxZ;
    mode = e.target.classList.contains("resize-handle") ? "resize" : "drag";
    startX = e.clientX; startY = e.clientY;
    origX = parseFloat(el.style.left); origY = parseFloat(el.style.top);
    origW = el.offsetWidth;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  });

  el.addEventListener("pointermove", (e) => {
    if (!mode) return;
    const scale = el.parentElement.getBoundingClientRect().width / CANVAS_W || 1;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    if (mode === "drag") {
      el.style.left = Math.max(0, Math.min(CANVAS_W - 40, origX + dx)) + "px";
      el.style.top = Math.max(0, origY + dy) + "px";
    } else {
      el.style.width = Math.max(80, Math.min(CANVAS_W, origW + dx)) + "px";
    }
  });

  el.addEventListener("pointerup", async () => {
    if (!mode) return;
    mode = null;
    el.style.cursor = "grab";
    const layout = {
      x: Math.round(parseFloat(el.style.left)),
      y: Math.round(parseFloat(el.style.top)),
      w: Math.round(el.offsetWidth),
      z: parseInt(el.style.zIndex, 10),
    };
    post.layout = layout;
    try {
      await api(`/posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ layout }) });
    } catch (err) { console.error("layout save failed", err); }
  });
}

/* ---------------- notifications (polling) ---------------- */

let inboxUnread = 0;

function updateBadges() {
  $("#inbox-badge").textContent = inboxUnread || "";
  $("#inbox-badge").classList.toggle("hidden", !inboxUnread);
  const chatNew = Math.max(0, chatLastId - chatSeenId);
  $("#chat-badge").textContent = chatNew || "";
  $("#chat-badge").classList.toggle("hidden", !chatNew);
  const total = inboxUnread + chatNew;
  document.title = total ? `(${total}) 3DIE — DASH` : "3DIE — DASH";
}

async function pollNotifications() {
  if (!state.user) return;
  try {
    const { messages: inbox } = await api("/messages?kind=contact");
    inboxUnread = inbox.filter((m) => !m.read).length;
    const { messages: chat } = await api("/messages?kind=thread");
    if (chat.length) {
      chatLastId = Math.max(chatLastId, chat[0].id);
      if (state.tab === "chat") { renderChat(chat); markChatSeen(); }
    }
    updateBadges();
  } catch { /* session may have expired */ }
}
setInterval(pollNotifications, 25000);

/* ---------------- go ---------------- */
boot();
