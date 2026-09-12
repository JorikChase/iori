/* 3DIE_DASH — talks to api.3die.fr. No framework, no build step. */
"use strict";

const API = localStorage.getItem("dash_api") || "https://api.3die.fr";

const SWATCHES = ["", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "pink"];
const PRIORITIES = ["none", "low", "medium", "high", "urgent"];
const PRIO_GLYPH = { none: "", low: "·", medium: "!", high: "!!", urgent: "!!!" };
const PREF_DEFAULTS = {
  display_name: "", color: "", avatar: "", default_lane: "", default_view: "board",
  density: "comfortable", theme: "dark", poll: 25, lang: "en",
};

const state = {
  user: null,
  users: [],
  prefs: { ...PREF_DEFAULTS },
  board: { lanes: [], phases: [], tasks: [] },
  tab: "board",
  filters: { q: "", mine: false, overdue: false, labels: new Set(), lanes: new Set(), archived: false },
  mobilePhase: null,
  panel: null,        // { id|null, draft: {...task fields} }
};

/* ---------------- i18n ---------------- */

const STRINGS = {
  en: {},
  cs: {
    "tab.board": "NÁSTĚNKA", "tab.inbox": "ZPRÁVY", "tab.chat": "CHAT", "tab.blog": "BLOG", "tab.canvas": "PLÁTNO",
    "out": "ODHLÁSIT", "task.new": "+ ÚKOL", "lane.new": "+ ŘÁDEK", "phase.new": "+ FÁZE",
    "search.ph": "hledat úkoly", "archive.done": "ARCHIVOVAT HOTOVÉ", "export": "EXPORT .MD",
    "board.empty": "filtrům nic neodpovídá.", "chat.ph": "napiš partě…", "send": "ODESLAT",
    "canvas.hint": "tažením umísti • rohem změň velikost • rozvržení se ukládá samo",
    "prefs.title": "NASTAVENÍ", "prefs.avatar": "změnit avatar", "prefs.display": "zobrazované jméno",
    "prefs.display.ph": "místo uživatelského jména", "prefs.color": "tvoje barva", "prefs.lane": "výchozí řádek pro nové úkoly", "prefs.view": "nástěnka se otevře jako",
    "prefs.view.board": "všechno", "prefs.view.mine": "jen moje úkoly", "prefs.density": "hustota",
    "prefs.density.c": "vzdušná", "prefs.density.k": "kompaktní", "prefs.theme": "vzhled",
    "prefs.theme.dark": "tmavý", "prefs.theme.light": "světlý", "prefs.theme.system": "podle systému",
    "prefs.poll": "kontrola nových zpráv", "prefs.poll.off": "nikdy (ručně)", "prefs.poll.25": "každých 25 s",
    "prefs.poll.60": "každou minutu", "prefs.poll.300": "každých 5 minut", "prefs.lang": "jazyk",
    "save": "ULOŽIT", "pw.title": "ZMĚNA HESLA", "pw.old": "současné heslo", "pw.new": "nové heslo (min. 8 znaků)",
    "pw.new2": "nové heslo znovu", "pw.change": "ZMĚNIT", "post.new": "NOVÝ PŘÍSPĚVEK", "post.caption": "popisek / text",
    "post.drop": "přetáhni obrázky sem nebo klikni", "publish": "PUBLIKOVAT",
    "task.title.ph": "název", "task.body.ph": "poznámky / popis", "f.lane": "řádek", "f.phase": "fáze",
    "f.assignee": "kdo", "f.priority": "priorita", "p.none": "žádná", "p.low": "· nízká", "p.medium": "! střední",
    "p.high": "!! vysoká", "p.urgent": "!!! urgentní", "f.due": "termín", "f.estimate": "odhad", "f.color": "barva",
    "f.labels": "štítky", "f.labels.ph": "napiš a stiskni enter", "f.checklist": "checklist",
    "f.checklist.ph": "přidat položku, enter", "f.links": "odkazy", "f.links.ph": "https://… nebo stranka.html, enter",
    "f.pinned": "připnuto", "archive": "ARCHIVOVAT", "unarchive": "OBNOVIT", "delete": "SMAZAT",
    "kicker.new": "nový úkol", "kicker.edit": "úkol", "meta.created": "vytvořil", "meta.updated": "upravil",
    "filter.mine": "moje", "filter.overdue": "po termínu", "filter.archived": "archiv", "filter.labels": "štítky",
    "filter.lanes": "řádky", "unassigned": "nikdo", "saved": "uloženo", "saving": "ukládám…",
    "confirm.delete": "Smazat tento úkol?", "confirm.archive": "Archivovat všechny úkoly ve fázi",
    "prompt.lane": "název řádku:", "prompt.phase": "název fáze:", "prompt.rename": "nový název řádku:",
    "lane.pin": "připnout řádek", "lane.rename": "dvojklik: přejmenovat", "lane.delete": "smazat řádek",
    "nothing": "nic k archivaci", "archived.n": "archivováno", "chat.empty": "zatím žádné zprávy — napiš něco.",
    "inbox.empty": "zatím žádné zprávy.", "feed.empty": "zatím žádné příspěvky.", "pw.mismatch": "nová hesla se neshodují",
    "pw.done": "heslo změněno.", "mark.read": "označit přečtené", "mark.unread": "označit nepřečtené",
  },
};
const t = (k, fallback) => (STRINGS[state.prefs.lang] || {})[k] ?? fallback ?? k;

function applyI18n() {
  document.documentElement.lang = state.prefs.lang;
  $$("[data-i18n]").forEach((el) => {
    if (!el.dataset.en) el.dataset.en = el.textContent;
    el.textContent = t(el.dataset.i18n, el.dataset.en);
  });
  $$("[data-i18n-ph]").forEach((el) => {
    if (!el.dataset.en) el.dataset.en = el.placeholder;
    el.placeholder = t(el.dataset.i18nPh, el.dataset.en);
  });
}

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
function fmtDay(ymd) {
  const d = new Date(ymd + "T00:00:00");
  return isNaN(d) ? ymd : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function dueState(due) {
  if (!due) return "";
  const today = todayYMD();
  if (due < today) return "overdue";
  if (due === today) return "today";
  const in3 = new Date(); in3.setDate(in3.getDate() + 3);
  const soon = `${in3.getFullYear()}-${String(in3.getMonth() + 1).padStart(2, "0")}-${String(in3.getDate()).padStart(2, "0")}`;
  return due <= soon ? "soon" : "";
}
const swatchVar = (name) => (name ? `var(--sw-${name})` : "transparent");
const userOf = (name) => state.users.find((u) => u.username === name);
const userLabel = (name) => { const u = userOf(name); return (u && u.display_name) || name; };
const userColor = (name) => { const u = userOf(name); return u && u.color ? swatchVar(u.color) : ""; };
const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

/* ---------------- auth ---------------- */

async function boot() {
  try {
    state.user = await api("/auth/me");
    await showMain();
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("#login-view").classList.remove("hidden");
  $("#main-view").classList.add("hidden");
}

async function showMain() {
  $("#login-view").classList.add("hidden");
  $("#main-view").classList.remove("hidden");
  try { state.prefs = { ...PREF_DEFAULTS, ...(await api("/prefs")) }; } catch { /* old api */ }
  applyPrefs();
  if (state.prefs.default_view === "mine") state.filters.mine = true;
  renderWhoami();
  await loadBoard();
  loadInbox();
  loadFeed();
  loadChat();
  loadCanvas();
  fillPrefsForm();
}

function renderWhoami() {
  $("#whoami").textContent = state.prefs.display_name || state.user.username;
  const av = $("#me-avatar");
  av.style.setProperty("--u", state.prefs.avatar ? `url("${state.prefs.avatar}")` : (state.prefs.color ? swatchVar(state.prefs.color) : ""));
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

function switchTab(name) {
  state.tab = name;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tabpanel").forEach((p) => p.classList.add("hidden"));
  $(`#tab-${name}`).classList.remove("hidden");
}
$$(".tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

/* ---------------- board ---------------- */

async function loadBoard() {
  const q = state.filters.archived ? "?archived=1" : "";
  state.board = await api("/board" + q);
  if (state.board.users) state.users = state.board.users;
  else state.users = (await api("/users").catch(() => ({ users: [] }))).users;
  renderBoard();
}

function allLabels() {
  const s = new Set();
  state.board.tasks.forEach((tk) => (tk.labels || []).forEach((l) => s.add(l)));
  return [...s].sort();
}

function visibleTasks() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();
  return state.board.tasks.filter((tk) => {
    if (f.mine && tk.assignee !== state.user.username) return false;
    if (f.overdue && dueState(tk.due) !== "overdue") return false;
    if (f.labels.size && ![...f.labels].every((l) => (tk.labels || []).includes(l))) return false;
    if (f.lanes.size && !f.lanes.has(tk.lane)) return false;
    if (q) {
      const hay = [tk.title, tk.body, tk.assignee, tk.lane, tk.phase, ...(tk.labels || []),
        ...(tk.checklist || []).map((c) => c.text)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderFilters() {
  const row = $("#filter-row");
  const f = state.filters;
  row.innerHTML = "";
  const chip = (label, on, fn, color) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (on ? " on" : "");
    b.innerHTML = (color ? `<span class="dot" style="--c:${color}"></span>` : "") + esc(label);
    b.addEventListener("click", () => { fn(); renderBoard(); });
    row.appendChild(b);
  };
  chip(t("filter.mine", "mine"), f.mine, () => { f.mine = !f.mine; });
  chip(t("filter.overdue", "overdue"), f.overdue, () => { f.overdue = !f.overdue; });
  chip(t("filter.archived", "archived"), f.archived, () => { f.archived = !f.archived; loadBoard(); });
  const labels = allLabels();
  if (labels.length) {
    const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = t("filter.labels", "labels"); row.appendChild(sep);
    labels.forEach((l) => chip(l, f.labels.has(l), () => { f.labels.has(l) ? f.labels.delete(l) : f.labels.add(l); }));
  }
  if (state.board.lanes.length > 1) {
    const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = t("filter.lanes", "lanes"); row.appendChild(sep);
    state.board.lanes.forEach((l) => chip(l.name, f.lanes.has(l.name), () => { f.lanes.has(l.name) ? f.lanes.delete(l.name) : f.lanes.add(l.name); }));
  }
}

function renderBoard() {
  renderFilters();
  const tasks = visibleTasks();
  $("#board-empty").classList.toggle("hidden", tasks.length > 0 || state.board.tasks.length === 0);
  if (isMobile()) {
    $("#board-table").classList.add("hidden");
    $("#board-mobile").classList.remove("hidden");
    $("#phase-tabs").classList.remove("hidden");
    renderBoardMobile(tasks);
  } else {
    $("#board-table").classList.remove("hidden");
    $("#board-mobile").classList.add("hidden");
    $("#phase-tabs").classList.add("hidden");
    renderBoardTable(tasks);
  }
  $("#label-list").innerHTML = allLabels().map((l) => `<option value="${esc(l)}">`).join("");
}

function renderBoardTable(tasks) {
  const { lanes, phases } = state.board;
  const f = state.filters;
  const table = $("#board-table");
  table.innerHTML = "";

  const thead = document.createElement("tr");
  thead.appendChild(document.createElement("th"));
  for (const ph of phases) {
    const th = document.createElement("th");
    th.className = "phase-head";
    const n = tasks.filter((tk) => tk.phase === ph.name).length;
    th.innerHTML = `${esc(ph.name)}<span class="count">${n}</span>`;
    thead.appendChild(th);
  }
  table.appendChild(thead);

  for (const lane of lanes) {
    if (f.lanes.size && !f.lanes.has(lane.name)) continue;
    const row = document.createElement("tr");
    row.appendChild(renderLaneHead(lane));
    for (const ph of phases) {
      const cell = document.createElement("td");
      cell.className = "cell";
      cell.dataset.lane = lane.name;
      cell.dataset.phase = ph.name;
      attachCellDrop(cell, lane.name, ph.name);
      for (const task of tasks.filter((tk) => tk.lane === lane.name && tk.phase === ph.name)) {
        cell.appendChild(renderCard(task));
      }
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
}

function renderLaneHead(lane) {
  const head = document.createElement("th");
  head.className = "lane-head" + (lane.pinned ? " pinned" : "");
  head.draggable = true;
  head.innerHTML =
    `<span class="pin-toggle" title="${esc(t("lane.pin", "pin lane"))}">${lane.pinned ? "◉" : "○"}</span>` +
    `<span class="lane-name" title="${esc(t("lane.rename", "double-click to rename"))}">${esc(lane.name)}</span>` +
    `<span class="lane-del" title="${esc(t("lane.delete", "delete lane"))}">×</span>`;
  head.querySelector(".pin-toggle").addEventListener("click", async () => {
    await api(`/lanes/${encodeURIComponent(lane.name)}`, { method: "PATCH", body: JSON.stringify({ pinned: !lane.pinned }) });
    loadBoard();
  });
  head.querySelector(".lane-name").addEventListener("dblclick", async () => {
    const name = prompt(t("prompt.rename", "new lane name:"), lane.name);
    if (!name || name.trim().toLowerCase() === lane.name) return;
    try {
      await api(`/lanes/${encodeURIComponent(lane.name)}`, { method: "PATCH", body: JSON.stringify({ name }) });
      loadBoard();
    } catch (err) { alert(err.message); }
  });
  head.querySelector(".lane-del").addEventListener("click", async () => {
    try {
      await api(`/lanes/${encodeURIComponent(lane.name)}`, { method: "DELETE" });
      loadBoard();
    } catch (err) { alert(err.message); }
  });
  // lanes reorder by dragging their header onto another header
  head.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/lane", lane.name); });
  head.addEventListener("dragover", (e) => {
    if (e.dataTransfer.types.includes("text/lane")) { e.preventDefault(); head.classList.add("dragover"); }
  });
  head.addEventListener("dragleave", () => head.classList.remove("dragover"));
  head.addEventListener("drop", async (e) => {
    head.classList.remove("dragover");
    const from = e.dataTransfer.getData("text/lane");
    if (!from || from === lane.name) return;
    e.preventDefault();
    const lanes = state.board.lanes;
    const idx = lanes.findIndex((l) => l.name === lane.name);
    const before = e.offsetY < head.offsetHeight / 2;
    const neighbour = before ? lanes[idx - 1] : lanes[idx + 1];
    const position = neighbour ? (neighbour.position + lane.position) / 2 : lane.position + (before ? -1 : 1);
    await api(`/lanes/${encodeURIComponent(from)}`, { method: "PATCH", body: JSON.stringify({ position }) });
    loadBoard();
  });
  return head;
}

/* drag + drop of cards, with a drop indicator and a real position */
function attachCellDrop(cell, laneName, phaseName) {
  let line = null;
  const clear = () => { cell.classList.remove("dragover"); if (line) { line.remove(); line = null; } };
  cell.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/task-id")) return;
    e.preventDefault();
    cell.classList.add("dragover");
    if (!line) { line = document.createElement("div"); line.className = "drop-line"; }
    const cards = [...cell.querySelectorAll(".card:not(.dragging)")];
    const after = cards.find((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (after) cell.insertBefore(line, after); else cell.appendChild(line);
  });
  cell.addEventListener("dragleave", (e) => { if (!cell.contains(e.relatedTarget)) clear(); });
  cell.addEventListener("drop", async (e) => {
    e.preventDefault();
    const id = +e.dataTransfer.getData("text/task-id");
    const cards = [...cell.querySelectorAll(".card:not(.dragging)")];
    const idx = line ? cards.indexOf(line.nextElementSibling) : -1;   // -1 = at the end
    clear();
    if (!id) return;
    const siblings = state.board.tasks
      .filter((tk) => tk.lane === laneName && tk.phase === phaseName && tk.id !== id)
      .sort((a, b) => (b.pinned - a.pinned) || (a.position - b.position) || (a.id - b.id));
    let position;
    if (!siblings.length) position = 1;
    else if (idx <= 0 && idx !== -1) position = siblings[0].position - 1;
    else if (idx === -1 || idx >= siblings.length) position = siblings[siblings.length - 1].position + 1;
    else position = (siblings[idx - 1].position + siblings[idx].position) / 2;
    await api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ lane: laneName, phase: phaseName, position }) });
    loadBoard();
  });
}

function renderCard(task) {
  const el = document.createElement("div");
  el.className = "card" + (task.pinned ? " pinned" : "") + (task.archived ? " archived" : "");
  el.style.setProperty("--c", swatchVar(task.color));
  el.draggable = !task.archived;
  el.tabIndex = 0;
  const ds = dueState(task.due);
  const done = (task.checklist || []).filter((c) => c.done).length, total = (task.checklist || []).length;
  const labels = (task.labels || []).map((l) => `<span class="lbl">${esc(l)}</span>`).join("");
  el.innerHTML =
    `<div class="card-top">` +
      (task.priority && task.priority !== "none" ? `<span class="prio ${task.priority}" title="${task.priority}">${PRIO_GLYPH[task.priority]}</span>` : "") +
      `<div class="card-title">${task.pinned ? "◉ " : ""}${esc(task.title)}</div></div>` +
    (labels ? `<div class="card-labels">${labels}</div>` : "") +
    `<div class="card-meta">` +
      (task.assignee ? `<span class="who"><span class="dot" style="--u:${userColor(task.assignee) || "var(--dim)"}"></span>${esc(userLabel(task.assignee))}</span>` : "") +
      (task.due ? `<span class="due ${ds}">⌛ ${esc(fmtDay(task.due))}</span>` : "") +
      (total ? `<span class="check${done === total ? " done" : ""}">☑ ${done}/${total}</span>` : "") +
      (task.estimate ? `<span>${esc(task.estimate)}</span>` : "") +
      ((task.links || []).length ? `<span>↗ ${task.links.length}</span>` : "") +
    `</div>`;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/task-id", task.id);
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  el.addEventListener("click", () => openTask(task));
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") openTask(task); });
  return el;
}

/* mobile: one section per lane, phase chosen by tabs */
function renderBoardMobile(tasks) {
  const { lanes, phases } = state.board;
  if (!state.mobilePhase || !phases.some((p) => p.name === state.mobilePhase)) state.mobilePhase = phases[0]?.name;
  const tabs = $("#phase-tabs");
  tabs.innerHTML = "";
  for (const ph of phases) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (ph.name === state.mobilePhase ? " on" : "");
    const n = tasks.filter((tk) => tk.phase === ph.name).length;
    b.textContent = `${ph.name} ${n}`;
    b.addEventListener("click", () => { state.mobilePhase = ph.name; renderBoard(); });
    tabs.appendChild(b);
  }
  const wrap = $("#board-mobile");
  wrap.innerHTML = "";
  const pi = phases.findIndex((p) => p.name === state.mobilePhase);
  for (const lane of lanes) {
    if (state.filters.lanes.size && !state.filters.lanes.has(lane.name)) continue;
    const mine = tasks.filter((tk) => tk.lane === lane.name && tk.phase === state.mobilePhase);
    if (!mine.length && state.filters.q) continue;
    const sec = document.createElement("section");
    sec.className = "mlane";
    sec.innerHTML = `<div class="mlane-head">${lane.pinned ? "◉ " : ""}${esc(lane.name)}<span class="count">${mine.length}</span></div><div class="mlane-body"></div>`;
    const body = sec.querySelector(".mlane-body");
    for (const task of mine) {
      const card = renderCard(task);
      card.draggable = false;
      const move = document.createElement("div");
      move.className = "move";
      const mk = (label, target) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "ghost-btn"; b.textContent = label;
        b.addEventListener("click", async (e) => {
          e.stopPropagation();
          await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ phase: target }) });
          loadBoard();
        });
        move.appendChild(b);
      };
      if (pi > 0) mk("← " + phases[pi - 1].name, phases[pi - 1].name);
      if (pi < phases.length - 1) mk(phases[pi + 1].name + " →", phases[pi + 1].name);
      card.appendChild(move);
      body.appendChild(card);
    }
    wrap.appendChild(sec);
  }
}

window.addEventListener("resize", (() => { let was = isMobile(); return () => { if (isMobile() !== was) { was = isMobile(); renderBoard(); } }; })());

/* ---------------- task panel ---------------- */

function blankTask() {
  const lane = state.prefs.default_lane && state.board.lanes.some((l) => l.name === state.prefs.default_lane)
    ? state.prefs.default_lane : (state.board.lanes[0]?.name || "general");
  return { id: null, title: "", body: "", lane, phase: state.board.phases[0]?.name || "idea",
    assignee: "", due: "", pinned: false, color: "", priority: "none", labels: [], checklist: [], links: [], estimate: "", archived: false };
}

function openTask(task) {
  const d = task ? JSON.parse(JSON.stringify(task)) : blankTask();
  d.labels = d.labels || []; d.checklist = d.checklist || []; d.links = d.links || [];
  state.panel = { id: d.id, draft: d, source: task };
  $("#panel-kicker").textContent = d.id ? `${t("kicker.edit", "task")} #${d.id}` : t("kicker.new", "new task");
  $("#task-title").value = d.title;
  $("#task-body").value = d.body;
  fillSelect($("#task-lane"), state.board.lanes.map((l) => l.name), d.lane);
  fillSelect($("#task-phase"), state.board.phases.map((p) => p.name), d.phase);
  const people = [["", t("unassigned", "nobody")], ...state.users.map((u) => [u.username, u.display_name ? `${u.display_name} (${u.username})` : u.username])];
  if (d.assignee && !state.users.some((u) => u.username === d.assignee)) people.push([d.assignee, d.assignee]);
  fillSelect($("#task-assignee"), people, d.assignee);
  $("#task-priority").value = d.priority || "none";
  $("#task-due").value = d.due || "";
  $("#task-estimate").value = d.estimate || "";
  $("#task-pinned").checked = !!d.pinned;
  renderSwatches($("#task-color"), d.color, (c) => { d.color = c; });
  renderLabelChips();
  renderChecklist();
  renderLinks();
  $("#task-archive").textContent = d.archived ? t("unarchive", "UNARCHIVE") : t("archive", "ARCHIVE");
  $("#task-archive").classList.toggle("hidden", !d.id);
  $("#task-delete").classList.toggle("hidden", !d.id);
  $("#task-meta").innerHTML = d.id
    ? `${esc(t("meta.created", "created by"))} ${esc(userLabel(d.created_by))} · ${esc(fmtTime(d.created_at))}<br>` +
      (d.updated_by ? `${esc(t("meta.updated", "updated by"))} ${esc(userLabel(d.updated_by))} · ${esc(fmtTime(d.updated_at))}` : "")
    : "";
  $("#task-status").textContent = "";
  $("#task-backdrop").classList.remove("hidden");
  $("#task-panel").classList.remove("hidden");
  $("#task-title").focus();
}

function fillSelect(sel, items, value) {
  sel.innerHTML = items.map((it) => {
    const [v, label] = Array.isArray(it) ? it : [it, it];
    return `<option value="${esc(v)}">${esc(label)}</option>`;
  }).join("");
  if (value && ![...sel.options].some((o) => o.value === value)) sel.insertAdjacentHTML("beforeend", `<option value="${esc(value)}">${esc(value)}</option>`);
  sel.value = value || "";
}

function renderSwatches(wrap, current, onPick) {
  wrap.innerHTML = "";
  for (const c of SWATCHES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (c ? "" : " none") + (c === (current || "") ? " on" : "");
    b.title = c || "none";
    if (c) b.style.setProperty("--c", swatchVar(c));
    b.addEventListener("click", () => { onPick(c); renderSwatches(wrap, c, onPick); });
    wrap.appendChild(b);
  }
}

function renderLabelChips() {
  const d = state.panel.draft;
  const wrap = $("#task-labels");
  wrap.querySelectorAll(".lbl").forEach((n) => n.remove());
  const input = $("#task-label-input");
  d.labels.forEach((l, i) => {
    const s = document.createElement("span");
    s.className = "lbl";
    s.innerHTML = `${esc(l)}<button type="button" title="remove">×</button>`;
    s.querySelector("button").addEventListener("click", () => { d.labels.splice(i, 1); renderLabelChips(); });
    wrap.insertBefore(s, input);
  });
}
$("#task-label-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== ",") return;
  e.preventDefault();
  const v = e.target.value.trim().toLowerCase();
  if (v && !state.panel.draft.labels.includes(v)) state.panel.draft.labels.push(v);
  e.target.value = "";
  renderLabelChips();
});
$("#task-label-input").addEventListener("change", (e) => {   // datalist pick
  const v = e.target.value.trim().toLowerCase();
  if (v && !state.panel.draft.labels.includes(v)) { state.panel.draft.labels.push(v); e.target.value = ""; renderLabelChips(); }
});

function renderChecklist() {
  const d = state.panel.draft;
  const ul = $("#task-checklist");
  ul.innerHTML = "";
  d.checklist.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = item.done ? "done" : "";
    li.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}><span class="txt">${esc(item.text)}</span><button type="button" title="remove">×</button>`;
    li.querySelector("input").addEventListener("change", (e) => { item.done = e.target.checked; renderChecklist(); });
    li.querySelector("button").addEventListener("click", () => { d.checklist.splice(i, 1); renderChecklist(); });
    ul.appendChild(li);
  });
  const done = d.checklist.filter((c) => c.done).length;
  $("#checklist-progress").textContent = d.checklist.length ? `${done}/${d.checklist.length}` : "";
}
$("#task-check-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = e.target.value.trim();
  if (v) state.panel.draft.checklist.push({ text: v, done: false });
  e.target.value = "";
  renderChecklist();
});

function renderLinks() {
  const d = state.panel.draft;
  const ul = $("#task-links");
  ul.innerHTML = "";
  d.links.forEach((url, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><button type="button" title="remove">×</button>`;
    li.querySelector("button").addEventListener("click", () => { d.links.splice(i, 1); renderLinks(); });
    ul.appendChild(li);
  });
}
$("#task-link-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = e.target.value.trim();
  if (v) state.panel.draft.links.push(v);
  e.target.value = "";
  renderLinks();
});

function collectDraft() {
  const d = state.panel.draft;
  d.title = $("#task-title").value.trim();
  d.body = $("#task-body").value;
  d.lane = $("#task-lane").value || "general";
  d.phase = $("#task-phase").value || "idea";
  d.assignee = $("#task-assignee").value;
  d.priority = $("#task-priority").value;
  d.due = $("#task-due").value;
  d.estimate = $("#task-estimate").value.trim();
  d.pinned = $("#task-pinned").checked;
  return d;
}

function closeTask() {
  $("#task-panel").classList.add("hidden");
  $("#task-backdrop").classList.add("hidden");
  state.panel = null;
}

async function saveTask() {
  if (!state.panel) return;
  const d = collectDraft();
  if (!d.title) { $("#task-title").focus(); return; }
  const payload = { title: d.title, body: d.body, lane: d.lane, phase: d.phase, assignee: d.assignee, due: d.due,
    pinned: d.pinned, color: d.color, priority: d.priority, labels: d.labels, checklist: d.checklist, links: d.links, estimate: d.estimate };
  $("#task-status").textContent = t("saving", "saving…");
  try {
    if (d.id) await api(`/tasks/${d.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    else await api("/tasks", { method: "POST", body: JSON.stringify(payload) });
    closeTask();
    loadBoard();
  } catch (err) {
    $("#task-status").textContent = err.message;
  }
}

$("#add-task-btn").addEventListener("click", () => openTask(null));
$("#task-close").addEventListener("click", closeTask);
$("#task-backdrop").addEventListener("click", closeTask);
$("#task-save").addEventListener("click", saveTask);
$("#task-archive").addEventListener("click", async () => {
  const d = state.panel?.draft;
  if (!d?.id) return;
  await api(`/tasks/${d.id}`, { method: "PATCH", body: JSON.stringify({ archived: !d.archived }) });
  closeTask();
  loadBoard();
});
$("#task-delete").addEventListener("click", async () => {
  const d = state.panel?.draft;
  if (!d?.id) return;
  if (!confirm(t("confirm.delete", "Delete this task?"))) return;
  await api(`/tasks/${d.id}`, { method: "DELETE" });
  closeTask();
  loadBoard();
});

$("#add-lane-btn").addEventListener("click", async () => {
  const name = prompt(t("prompt.lane", "lane name:"));
  if (!name) return;
  await api("/lanes", { method: "POST", body: JSON.stringify({ name }) }).catch((e) => alert(e.message));
  loadBoard();
});

$("#add-phase-btn").addEventListener("click", async () => {
  const name = prompt(t("prompt.phase", "phase name:"));
  if (!name) return;
  await api("/phases", { method: "POST", body: JSON.stringify({ name }) }).catch((e) => alert(e.message));
  loadBoard();
});

/* the "done" phase is the one literally named done; only if there is none does
   the last column count (boards can carry extra phases after it, e.g. "music") */
function donePhase() {
  const { phases } = state.board;
  return (phases.find((p) => p.name === "done") || phases[phases.length - 1] || {}).name;
}

$("#archive-done-btn").addEventListener("click", async () => {
  const phase = donePhase();
  if (!phase) return;
  const n = state.board.tasks.filter((tk) => tk.phase === phase && !tk.archived).length;
  if (!n) { alert(t("nothing", "nothing to archive")); return; }
  if (!confirm(`${t("confirm.archive", "Archive all tasks in phase")} "${phase}" (${n})?`)) return;
  const r = await api("/tasks/archive", { method: "POST", body: JSON.stringify({ phase }) });
  alert(`${r.archived} ${t("archived.n", "archived")}`);
  loadBoard();
});

$("#board-search").addEventListener("input", (e) => { state.filters.q = e.target.value; renderBoard(); });

/* Markdown export — the same shape as BACKLOG.md, one section per lane */
function boardMarkdown() {
  const { lanes, phases } = state.board;
  const tasks = visibleTasks();
  const lines = [`# 3DIE board — ${todayYMD()}`, ""];
  for (const lane of lanes) {
    const mine = tasks.filter((tk) => tk.lane === lane.name);
    if (!mine.length) continue;
    lines.push(`## ${lane.name}${lane.pinned ? " (pinned)" : ""}`, "");
    for (const ph of phases) {
      const cell = mine.filter((tk) => tk.phase === ph.name);
      if (!cell.length) continue;
      lines.push(`### ${ph.name}`, "");
      for (const tk of cell) {
        const bits = [];
        if (tk.priority && tk.priority !== "none") bits.push(tk.priority);
        if (tk.assignee) bits.push("@" + tk.assignee);
        if (tk.due) bits.push("due " + tk.due);
        if (tk.estimate) bits.push(tk.estimate);
        if ((tk.labels || []).length) bits.push(tk.labels.map((l) => "#" + l).join(" "));
        const done = ph.name === donePhase() || ph.name.endsWith(" done");
        lines.push(`- [${done ? "x" : " "}] ${tk.pinned ? "◉ " : ""}${tk.title}${bits.length ? " — " + bits.join(", ") : ""}`);
        if (tk.body) tk.body.split("\n").forEach((l) => lines.push("  " + l));
        (tk.checklist || []).forEach((c) => lines.push(`  - [${c.done ? "x" : " "}] ${c.text}`));
        (tk.links || []).forEach((l) => lines.push(`  - ${l}`));
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
$("#export-btn").addEventListener("click", async () => {
  const md = boardMarkdown();
  try { await navigator.clipboard.writeText(md); } catch { /* clipboard may be blocked */ }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  a.download = `3die-board-${todayYMD()}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* keyboard: n = new task, / = search, esc = close, ⌘/ctrl+enter = save */
document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (e.key === "Escape" && state.panel) { closeTask(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && state.panel) { e.preventDefault(); saveTask(); return; }
  if (typing || !state.user || state.tab !== "board") return;
  if (e.key === "n" && !state.panel) { e.preventDefault(); openTask(null); }
  if (e.key === "/") { e.preventDefault(); $("#board-search").focus(); }
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
  list.innerHTML = messages.length ? "" : `<div class='msg'>${esc(t("inbox.empty", "no messages yet."))}</div>`;
  for (const m of messages) {
    const el = document.createElement("div");
    el.className = "msg" + (m.read ? "" : " unread");
    el.innerHTML =
      `<div class="msg-head">` +
      `<span class="msg-author">${esc(m.author || "anonymous")} ${m.email ? "&lt;" + esc(m.email) + "&gt;" : ""}</span>` +
      `<span class="msg-time">${fmtTime(m.created_at)}</span></div>` +
      (m.subject ? `<div><b>${esc(m.subject)}</b></div>` : "") +
      `<div class="msg-body">${esc(m.body)}</div>` +
      `<div class="msg-actions"><button class="ghost-btn">${esc(m.read ? t("mark.unread", "mark unread") : t("mark.read", "mark read"))}</button></div>`;
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
  $("#file-drop-label").textContent = files.length ? `${files.length} file(s) selected` : t("post.drop", "drop images here or click to choose");
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
  list.innerHTML = posts.length ? "" : `<div class='msg'>${esc(t("feed.empty", "no posts yet."))}</div>`;
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
        ? `<div class="msg-actions"><button class="ghost-btn">${esc(t("delete", "delete"))}</button></div>` : "");
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
  list.innerHTML = messages.length ? "" : `<div class='msg'>${esc(t("chat.empty", "no messages yet — say something."))}</div>`;
  // API returns newest-first; render oldest-first for chat flow
  for (const m of [...messages].reverse()) {
    const el = document.createElement("div");
    el.className = "chatmsg" + (m.author === state.user?.username ? " own" : "");
    el.innerHTML =
      `<div class="chat-meta"><span>@${esc(userLabel(m.author))}</span><span>${fmtTime(m.created_at)}</span></div>` +
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

/* ---------------- preferences ---------------- */

function applyPrefs() {
  const p = state.prefs;
  const root = document.documentElement;
  const theme = p.theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : p.theme;
  root.dataset.theme = theme;
  root.dataset.density = p.density;
  applyI18n();
  restartPolling();
}
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (state.prefs.theme === "system") applyPrefs(); });

function fillPrefsForm() {
  const p = state.prefs;
  $("#pref-display").value = p.display_name;
  renderSwatches($("#pref-color"), p.color, (c) => { p.color = c; });
  $("#prefs-avatar").style.setProperty("--u", p.avatar ? `url("${p.avatar}")` : (p.color ? swatchVar(p.color) : ""));
  fillSelect($("#pref-lane"), [["", "—"], ...state.board.lanes.map((l) => [l.name, l.name])], p.default_lane);
  $("#pref-view").value = p.default_view;
  $("#pref-density").value = p.density;
  $("#pref-theme").value = p.theme;
  $("#pref-poll").value = String(p.poll);
  $("#pref-lang").value = p.lang;
}

$("#profile-btn").addEventListener("click", () => {
  state.tab = "profile";
  $$(".tab").forEach((b) => b.classList.remove("active"));
  $$(".tabpanel").forEach((p) => p.classList.add("hidden"));
  $("#tab-profile").classList.remove("hidden");
  fillPrefsForm();
});

$("#prefs-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#prefs-status");
  const body = {
    display_name: $("#pref-display").value.trim(),
    color: state.prefs.color,
    default_lane: $("#pref-lane").value,
    default_view: $("#pref-view").value,
    density: $("#pref-density").value,
    theme: $("#pref-theme").value,
    poll: parseInt($("#pref-poll").value, 10),
    lang: $("#pref-lang").value,
  };
  status.textContent = t("saving", "saving…");
  try {
    state.prefs = { ...state.prefs, ...(await api("/prefs", { method: "PUT", body: JSON.stringify(body) })) };
    applyPrefs();
    renderWhoami();
    renderBoard();
    fillPrefsForm();
    status.textContent = t("saved", "saved");
  } catch (err) {
    status.textContent = err.message;
  }
});

$("#prefs-avatar-file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  try {
    state.prefs = { ...state.prefs, ...(await api("/prefs/avatar", { method: "POST", body: fd })) };
    renderWhoami();
    fillPrefsForm();
  } catch (err) { $("#prefs-status").textContent = err.message; }
  e.target.value = "";
});

$("#pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#pw-status");
  status.textContent = "";
  if ($("#pw-new").value !== $("#pw-new2").value) {
    status.textContent = t("pw.mismatch", "new passwords don't match");
    return;
  }
  try {
    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: $("#pw-old").value, new_password: $("#pw-new").value }),
    });
    status.textContent = t("pw.done", "password changed.");
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

/* ---------------- notifications (polling, interval from prefs) ---------------- */

let inboxUnread = 0;
let pollTimer = null;

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

function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const secs = Number(state.prefs.poll) || 0;
  if (secs > 0) pollTimer = setInterval(pollNotifications, secs * 1000);
}

/* ---------------- go ---------------- */
boot();
