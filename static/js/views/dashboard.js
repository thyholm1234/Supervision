// "Overblik": live statistics against the requirements.
import { applyWidths, hBars, stackedBars } from "../charts.js";
import { html, mount, raw, fmtDate, fmtMonth, fmtNum, today } from "../html.js";
import { ACTIVITIES, TARGETS, agreementStatus, convertedHours, evaluate, forecast, monthlySeries, recentActivity, RULES } from "../rules.js";
import * as store from "../store.js";

const ICON = { ok: "✓", warn: "!", bad: "✕", info: "i" };

function requirementRow(r) {
  const dec = r.decimals ?? 1;
  const unit = r.unit ?? "t";
  return html`<li class="req ${r.ok ? "ok" : ""}">
    <span class="req-icon ${r.ok ? "ok" : "todo"}" aria-label="${r.ok ? "Opfyldt" : "Ikke opfyldt"}">${r.ok ? "✓" : ""}</span>
    <span class="req-label">${r.label}${r.note ? html`<small class="muted"> · ${r.note}</small>` : ""}<small class="rule">${r.rule}</small></span>
    <span class="req-bar"><span class="bar-fill ${r.ok ? "ok" : ""}" data-w="${r.pct * 100}"></span></span>
    <span class="req-value">${fmtNum(r.value, dec)} / ${fmtNum(r.target, dec)}${unit ? ` ${unit}` : ""}</span></li>`;
}

function workEta(s, remainingYears, t) {
  if (remainingYears <= 0) return null;
  let frac = 0;
  for (const w of s.workplace) {
    if (w.selfEmployed) continue;
    const p = (w.periods || []).filter((x) => x.from <= t && (!x.to || x.to >= t)).pop();
    if (p && +p.hoursPerWeek >= RULES.minWeeklyHours) frac += Math.min(1, +p.hoursPerWeek / RULES.fullTimeHours);
  }
  frac = Math.min(1, frac);
  if (!frac) return null;
  const d = new Date(t + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.ceil((remainingYears * 365.25) / frac));
  return d.toISOString().slice(0, 10);
}

export function dashboardView(root) {
  const s = store.snapshot();
  const t = today();
  const ev = evaluate(s, t);
  const R = Object.fromEntries(ev.requirements.map((r) => [r.key, r]));
  const met = ev.requirements.filter((r) => r.ok).length;
  const months = monthlySeries(s, t, 18);
  const recent = recentActivity(s, t, 30);
  const supRemaining = RULES.supervisionTotal - R.supTotal.value;
  const konfRemaining = RULES.konfTotal - ev.konf.counted.total;
  const fSup = forecast(s.session, supRemaining, t, 90, convertedHours);
  const fKonf = forecast(s.konf, konfRemaining, t, 90);
  const wEta = workEta(s, RULES.fteYears - ev.work.years, t);
  const isEmpty = !s.session.length && !s.konf.length;
  const bySup = Object.entries(ev.sup.totals.bySupervisor).map(([id, v]) => ({ label: store.get(id)?.name || "?", value: v }))
    .sort((a, b) => b.value - a.value);
  const ext = Object.entries(ev.sup.totals.external).map(([id, v]) => ({ label: store.get(id)?.name || "?", value: v }))
    .sort((a, b) => b.value - a.value);
  const eta = (f) => (f?.eta ? fmtDate(f.eta) : "ingen aktivitet de seneste 90 dage");
  const deadlineClass = ev.daysLeft < 120 ? "bad" : ev.daysLeft < 365 ? "warn" : "";
  const name = store.profile().name;
  for (const a of s.agreement.filter((x) => x.status !== "ended")) {
    for (const w of agreementStatus(a, s, t).warnings) {
      if (w.level === "bad" || w.level === "warn") ev.warnings.push({ ...w, text: `${a.title}: ${w.text}` });
    }
  }

  mount(root, html`
    <div class="page-head"><h1>Overblik${name ? html` <small class="muted">· ${name}</small>` : ""}</h1>
      <span class="status-pill ${ev.done ? "ok" : ""}">${ev.done ? "Alle krav opfyldt 🎉" : `${met} af ${ev.requirements.length} krav opfyldt`}</span></div>

    ${isEmpty ? html`<div class="card intro"><h2>Velkommen</h2>
      <p>Start med at oprette arbejdsforhold, supervisorer og supervisionsforløb under <a href="#/forloeb">Forløb</a>.
      Herefter registrerer du løbende <a href="#/supervision">supervision</a> og <a href="#/konfrontation">konfrontationstimer</a>,
      og overblikket opdateres automatisk.</p></div>` : ""}

    <div class="kpis">
      <a class="kpi" href="#/supervision"><span class="kpi-label">Supervision</span>
        <span class="kpi-value">${fmtNum(R.supTotal.value)}<small> / ${RULES.supervisionTotal} t</small></span>
        <span class="kpi-bar"><span class="bar-fill ${R.supTotal.ok ? "ok" : ""}" data-w="${R.supTotal.pct * 100}"></span></span>
        <span class="kpi-sub">${R.supTotal.ok ? "Opfyldt" : `Prognose: ${eta(fSup)}`}</span></a>
      <a class="kpi" href="#/konfrontation"><span class="kpi-label">Konfrontation</span>
        <span class="kpi-value">${fmtNum(ev.konf.counted.total, 0)}<small> / ${RULES.konfTotal} t</small></span>
        <span class="kpi-bar"><span class="bar-fill ${konfRemaining <= 0 ? "ok" : ""}" data-w="${Math.min(100, ev.konf.counted.total / RULES.konfTotal * 100)}"></span></span>
        <span class="kpi-sub">${konfRemaining <= 0 ? "Timetal nået" : `Prognose: ${eta(fKonf)}`}</span></a>
      <a class="kpi" href="#/forloeb"><span class="kpi-label">Arbejdstid</span>
        <span class="kpi-value">${fmtNum(ev.work.years, 2)}<small> / ${RULES.fteYears} år</small></span>
        <span class="kpi-bar"><span class="bar-fill ${R.work.ok ? "ok" : ""}" data-w="${R.work.pct * 100}"></span></span>
        <span class="kpi-sub">${R.work.ok ? "Opfyldt" : wEta ? `Ved nuværende ansættelse: ${fmtDate(wEta)}` : "Ingen aktiv ansættelse"}</span></a>
      <div class="kpi ${deadlineClass}"><span class="kpi-label">Overgangsordningen udløber</span>
        <span class="kpi-value">${fmtNum(ev.daysLeft, 0)}<small> dage</small></span>
        <span class="kpi-sub">${fmtDate(RULES.deadline)}</span></div>
    </div>

    <div class="grid-dash">
      <section class="card span2">
        <h2>Krav til autorisation <small class="muted">(BEK 247/2026, bilag 2)</small></h2>
        <ul class="reqs">${ev.requirements.map(requirementRow)}</ul>
        <p class="muted small">Beregningen er forsigtig: timer over loftet for video og indirekte arbejde fratrækkes forholdsmæssigt,
          og forløb under ${RULES.minCourseHours} omregnede timer tælles ikke. Styrelsen for Patientsikkerhed træffer den endelige afgørelse.</p>
      </section>

      <section class="card">
        <h2>Opmærksomhedspunkter</h2>
        ${ev.warnings.length ? html`<ul class="warnings">${ev.warnings.map((w) => html`<li class="${w.level}">
          <span class="w-icon" aria-hidden="true">${ICON[w.level]}</span><span>${w.text}</span></li>`)}</ul>`
        : html`<p class="muted">Ingen bemærkninger. 👍</p>`}
      </section>

      <section class="card">
        <h2>Seneste 30 dage</h2>
        <dl class="stats">
          <div><dt>Supervision</dt><dd>${fmtNum(recent.supHours)} t <small class="muted">(${recent.supSessions} sessioner)</small></dd></div>
          <div><dt>Konfrontation</dt><dd>${fmtNum(recent.konfHours)} t</dd></div>
          <div><dt>Tempo supervision (90 dage)</dt><dd>${fSup.perWeek != null ? `${fmtNum(fSup.perWeek)} t/uge` : "–"}</dd></div>
          <div><dt>Tempo konfrontation (90 dage)</dt><dd>${fKonf.perWeek != null ? `${fmtNum(fKonf.perWeek)} t/uge` : "–"}</dd></div>
          <div><dt>Gns. sessionslængde</dt><dd>${fmtNum(recent.avgSessionLength, 2)} t</dd></div>
          <div><dt>Supervision via video</dt><dd>${fmtNum(ev.sup.totals.videoRaw)} / ${RULES.supVideoMax} t</dd></div>
          <div><dt>Egenterapi medregnet</dt><dd>${fmtNum(ev.therapy.counted)} / ${RULES.therapyMax} t</dd></div>
        </dl>
      </section>

      <section class="card span2">
        <h2>Supervision pr. måned <small class="muted">(omregnede timer)</small></h2>
        ${raw(stackedBars(months, [{ key: "supInd", label: "Individuel", cls: "s1" }, { key: "supGrp", label: "Gruppe (omregnet)", cls: "s2" }]))}
        ${months.length ? tableFallback(months, [["supInd", "Individuel"], ["supGrp", "Gruppe"]]) : ""}
      </section>

      <section class="card span2">
        <h2>Konfrontationstimer pr. måned</h2>
        ${raw(stackedBars(months, [{ key: "udredning", label: "Udredning", cls: "s1" }, { key: "intervention", label: "Intervention", cls: "s2" }]))}
        ${months.length ? tableFallback(months, [["udredning", "Udredning"], ["intervention", "Intervention"]]) : ""}
      </section>

      <section class="card">
        <h2>Tællende timer pr. supervisor</h2>
        ${raw(hBars(bySup))}
        <h3 class="small-h">Ekstern supervision <small class="muted">(krav: ${RULES.supExternalSame} t hos samme)</small></h3>
        ${raw(hBars(ext, { target: RULES.supExternalSame }))}
      </section>

      <section class="card">
        <h2>Konfrontation – medregnede timer</h2>
        <div class="table-wrap"><table class="table matrix">
          <thead><tr><th></th>${Object.values(TARGETS).map((x) => html`<th class="num">${x}</th>`)}<th class="num">I alt</th></tr></thead>
          <tbody>${Object.entries(ACTIVITIES).map(([a, label]) => html`<tr><th>${label}</th>
            ${Object.keys(TARGETS).map((x) => html`<td class="num">${fmtNum(ev.konf.matrix[a][x], 0)}</td>`)}
            <td class="num"><strong>${fmtNum(ev.konf.counted[a], 0)}</strong></td></tr>`)}</tbody>
          <tfoot><tr><th>I alt</th>${Object.keys(TARGETS).map((x) => html`<td class="num">${fmtNum(ev.konf.matrix.udredning[x] + ev.konf.matrix.intervention[x], 0)}</td>`)}
            <td class="num"><strong>${fmtNum(ev.konf.counted.total, 0)}</strong></td></tr></tfoot>
        </table></div>
        <p class="muted small">Indirekte timer medregnet: ${fmtNum(ev.konf.indirectCounted, 0)} t · Video: ${fmtNum(ev.konf.raw.video.udredning, 0)} / ${fmtNum(ev.konf.raw.video.intervention, 0)} t (udredning / intervention)</p>
      </section>
    </div>`);
  applyWidths(root);
}

function tableFallback(rows, cols) {
  return html`<details class="table-fallback"><summary>Vis som tabel</summary><div class="table-wrap"><table class="table">
    <thead><tr><th>Måned</th>${cols.map(([, l]) => html`<th class="num">${l}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr><td>${fmtMonth(r.month)}</td>${cols.map(([k]) => html`<td class="num">${fmtNum(r[k])}</td>`)}</tr>`)}</tbody>
  </table></div></details>`;
}
