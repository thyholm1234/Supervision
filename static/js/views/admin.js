// Superadmin panel: anonymous, aggregate usage statistics only. No per-user data is ever exposed.
import { api } from "../api.js";
import { applyWidths, hBars, stackedBars } from "../charts.js";
import { html, mount, raw, fmtNum } from "../html.js";

const fmtBytes = (b) => (b > 1e6 ? `${fmtNum(b / 1e6, 1)} MB` : `${fmtNum(b / 1e3, 0)} kB`);

export async function adminView(root, { me }) {
  if (!me.is_admin) return mount(root, html`<div class="card"><p>Ingen adgang.</p></div>`);
  mount(root, html`<h1>Administration</h1><p class="muted">Henter statistik…</p>`);
  const st = await api("GET", "/api/admin/stats");
  // Fill gaps so the chart always shows 30 consecutive days.
  const byDay = new Map(st.daily.map((d) => [d.day, d]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
    return { month: day, logins: 0, signups: 0, ...byDay.get(day) };
  });
  const sum = (k) => st.daily.slice(-30).reduce((a, d) => a + d[k], 0);
  mount(root, html`
    <h1>Administration</h1>
    <p class="muted">Anonym, aggregeret statistik. Brugerdata er end-to-end-krypteret og kan ikke ses her – heller ikke af serverens ejer.
      Der vises ingen brugernavne eller oplysninger om enkeltpersoner.</p>
    <div class="kpis">
      <div class="kpi"><span class="kpi-label">Brugere i alt</span><span class="kpi-value">${fmtNum(st.users_total, 0)}</span>
        <span class="kpi-sub">${fmtNum(st.new_30d, 0)} nye seneste 30 dage</span></div>
      <div class="kpi"><span class="kpi-label">Aktive</span><span class="kpi-value">${fmtNum(st.active_7d, 0)}<small> / 7 dage</small></span>
        <span class="kpi-sub">${fmtNum(st.active_1d, 0)} i dag · ${fmtNum(st.active_30d, 0)} seneste 30 dage</span></div>
      <div class="kpi"><span class="kpi-label">Krypterede poster</span><span class="kpi-value">${fmtNum(st.items_total, 0)}</span>
        <span class="kpi-sub">Median ${fmtNum(st.items_median, 0)} pr. bruger · ${fmtBytes(st.bytes_total)}</span></div>
      <div class="kpi"><span class="kpi-label">Database</span><span class="kpi-value">${fmtBytes(st.db_bytes)}</span>
        <span class="kpi-sub">${fmtNum(st.sessions_open, 0)} åbne sessioner · ${fmtNum(st.dormant_180d, 0)} inaktive &gt; 180 dage</span></div>
    </div>
    <div class="grid-dash">
      <section class="card span2"><h2>Logins og nye brugere – seneste 30 dage</h2>
        ${raw(stackedBars(days, [{ key: "logins", label: "Logins", cls: "s1" }, { key: "signups", label: "Nye brugere", cls: "s2" }],
          { unit: "", label: (d) => `${+d.slice(8)}/${+d.slice(5, 7)}` }))}
      </section>
      <section class="card"><h2>Seneste 30 dage</h2>
        <dl class="stats">
          <div><dt>Logins</dt><dd>${fmtNum(sum("logins"), 0)}</dd></div>
          <div><dt>Nye brugere</dt><dd>${fmtNum(sum("signups"), 0)}</dd></div>
          <div><dt>Skrivninger (gem/slet)</dt><dd>${fmtNum(sum("writes"), 0)}</dd></div>
          <div><dt>Mislykkede logins</dt><dd>${fmtNum(sum("failed"), 0)}</dd></div>
          <div><dt>Slettede konti</dt><dd>${fmtNum(sum("deletions"), 0)}</dd></div>
        </dl></section>
      <section class="card"><h2>Brugere fordelt på antal poster</h2>
        ${raw(hBars(Object.entries(st.item_buckets).map(([label, value]) => ({ label: `${label} poster`, value })), { unit: "" }))}</section>
    </div>`);
  applyWidths(root);
}
