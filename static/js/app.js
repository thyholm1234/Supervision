// Application shell: session bootstrap, hash router, auto-lock.
import { api, setUnauthorizedHandler } from "./api.js";
import { html, mount } from "./html.js";
import { clearKey, loadKey, saveKey } from "./keystore.js";
import * as store from "./store.js";
import { toast } from "./ui.js";
import { loginView, unlockView } from "./views/auth.js";
import { dashboardView } from "./views/dashboard.js";
import { supervisionView } from "./views/supervision.js";
import { konfView } from "./views/konfrontation.js";
import { setupView } from "./views/setup.js";
import { agreementsView } from "./views/agreements.js";
import { therapyView } from "./views/therapy.js";
import { reportsView, reportView } from "./views/reports.js";
import { profileView } from "./views/profile.js";
import { adminView } from "./views/admin.js";

const AUTO_LOCK_MIN = 30;
const root = document.getElementById("app");
let me = null;
let lastActivity = Date.now();

const NAV = [
  { path: "", label: "Overblik", icon: "◧" },
  { path: "supervision", label: "Supervision", icon: "◉" },
  { path: "konfrontation", label: "Konfrontation", icon: "◈" },
  { path: "forloeb", label: "Forløb", icon: "▤" },
  { path: "aftaler", label: "Uddannelse", icon: "✎" },
  { path: "egenterapi", label: "Egenterapi", icon: "◌" },
  { path: "rapporter", label: "Rapporter", icon: "▦" },
  { path: "profil", label: "Profil", icon: "◍" },
];

const ROUTES = {
  "": dashboardView,
  supervision: supervisionView,
  konfrontation: konfView,
  forloeb: setupView,
  aftaler: agreementsView,
  egenterapi: therapyView,
  rapporter: reportsView,
  rapport: reportView,
  profil: profileView,
  admin: adminView,
};

function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [name, ...rest] = path.split("/");
  return { name, args: rest.map(decodeURIComponent), query: new URLSearchParams(query) };
}

function shell() {
  const items = [...NAV, ...(me.is_admin ? [{ path: "admin", label: "Admin", icon: "⚙" }] : [])];
  mount(root, html`
    <a class="skip" href="#main">Spring til indhold</a>
    <header class="topbar">
      <a class="logo" href="#/"><img src="/static/icons/icon.svg" alt="" width="28" height="28"> Supervisionsregnskab</a>
      <span class="topbar-user"><span class="lock-badge" title="End-to-end-krypteret">🔒 ${me.username}</span>
        <button class="btn ghost small" id="lock" title="Lås">Lås</button>
        <button class="btn ghost small" id="logout">Log ud</button></span>
    </header>
    <nav class="nav" aria-label="Hovedmenu">${items.map((n) => html`<a href="#/${n.path}" data-path="${n.path}">
      <span class="nav-icon" aria-hidden="true">${n.icon}</span><span>${n.label}</span></a>`)}</nav>
    <main id="main" class="content" tabindex="-1"></main>`);
  root.querySelector("#logout").onclick = logout;
  root.querySelector("#lock").onclick = lock;
}

async function route() {
  if (!me) return;
  const main = root.querySelector("#main");
  if (!main) return;
  const { name, args, query } = parseHash();
  document.querySelectorAll("dialog[open]").forEach((d) => d.close()); // e.g. browser back while a modal is open
  const view = ROUTES[name] || dashboardView;
  root.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.path === (name === "rapport" ? "rapporter" : name)));
  document.body.classList.toggle("print-mode", name === "rapport");
  document.title = "Supervisionsregnskab";
  try {
    await view(main, { me, args, query, rerender: route });
  } catch (e) {
    console.error(e);
    mount(main, html`<div class="card"><h2>Noget gik galt</h2><p>${e.message}</p></div>`);
  }
  main.focus({ preventScroll: true });
}

async function enter(meData, dek, { firstRun = false } = {}) {
  me = meData;
  store.setKey(dek);
  await saveKey(me.username, dek);
  const { failed } = await store.loadAll();
  if (failed) toast(`${failed} post(er) kunne ikke dekrypteres og er sprunget over.`, "error");
  lastActivity = Date.now();
  shell();
  if (firstRun) location.hash = "#/forloeb";
  route();
}

async function lock() {
  await clearKey();
  store.reset();
  unlockView(root, me, { onUnlocked: (dek) => enter(me, dek), onLogout: logout });
}

async function logout() {
  try { await api("POST", "/api/logout"); } catch { /* offline: cookie expires anyway */ }
  await clearKey();
  store.reset();
  me = null;
  location.hash = "";
  loginView(root, { onAuthenticated: enter });
}

async function boot() {
  setUnauthorizedHandler(async () => {
    if (!me) return;
    await clearKey();
    store.reset();
    me = null;
    loginView(root, { onAuthenticated: enter });
    toast("Din session er udløbet. Log ind igen.", "error");
  });
  let meData = null;
  try {
    meData = await api("GET", "/api/me");
  } catch (e) {
    if (e.status === 0) {
      mount(root, html`<main class="auth"><div class="card auth-card"><h2>Offline</h2><p>Der er ingen forbindelse til serveren. Prøv igen, når du er online.</p>
        <button class="btn primary" id="retry">Prøv igen</button></div></main>`);
      root.querySelector("#retry").onclick = boot;
      return;
    }
  }
  if (!meData) return loginView(root, { onAuthenticated: enter });
  const dek = await loadKey(meData.username);
  if (dek) {
    try { return await enter(meData, dek); } catch { await clearKey(); }
  }
  me = meData;
  unlockView(root, me, { onUnlocked: (k) => enter(me, k), onLogout: logout });
}

// Auto-lock after inactivity: the key is wiped from memory and IndexedDB.
["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) =>
  addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
setInterval(() => {
  if (me && root.querySelector("#main") && Date.now() - lastActivity > AUTO_LOCK_MIN * 60000) lock();
}, 30000);

addEventListener("hashchange", route);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

boot();
