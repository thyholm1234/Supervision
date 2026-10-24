// "Konfrontation": confrontation hours entry + overview.
import { html, mount, fmtDate, fmtNum, today } from "../html.js";
import { ACTIVITIES, TARGETS, confrontation, parseHours } from "../rules.js";
import * as store from "../store.js";
import { confirmDialog, formDialog, options, readForm, toast } from "../ui.js";
import { editWorkplace } from "./setup.js";

let sticky = { workplaceId: null, activity: "udredning", target: "individ" };
let filter = { workplaceId: "", year: "", activity: "" };

const radios = (name, map, sel) => Object.entries(map).map(([k, label]) =>
  html`<label class="check"><input type="radio" name="${name}" value="${k}" ${k === sel ? html`checked` : ""}> ${label}</label>`);

function konfFields(x, wps) {
  return html`
    <div class="grid3">
      <label>Dato<input type="date" name="date" value="${x.date || today()}" max="${today()}" required></label>
      <label class="span2">Arbejdsforhold<select name="workplaceId" required>${options(wps, x.workplaceId)}</select></label>
      <label>Timer<input name="hours" required inputmode="decimal" autocomplete="off" placeholder="fx 6,5"
        value="${x.hours != null ? String(x.hours).replace(".", ",") : ""}"></label>
      <fieldset class="inline"><legend>Aktivitet</legend>${radios("activity", ACTIVITIES, x.activity || "udredning")}</fieldset>
      <fieldset class="inline"><legend>Målgruppe</legend>${radios("target", TARGETS, x.target || "individ")}</fieldset>
    </div>
    <div class="row wrap">
      <label class="check"><input type="checkbox" name="indirect" ${x.indirect ? html`checked` : ""}> Indirekte
        <small class="muted">(supervision af andres arbejde – højst halvdelen, pkt. 2.3)</small></label>
      <label class="check"><input type="checkbox" name="video" ${x.video ? html`checked` : ""}> Via videolink
        <small class="muted">(højst 250 t pr. aktivitet)</small></label>
    </div>
    <label>Note <small class="muted">(valgfri – ingen klientoplysninger)</small><input name="note" value="${x.note || ""}"></label>`;
}

function parseKonf(form) {
  const d = readForm(form);
  const hours = parseHours(d.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 300) throw new Error("Angiv et gyldigt antal timer, fx 6,5.");
  if (d.date > today()) throw new Error("Datoen ligger i fremtiden.");
  return { date: d.date, workplaceId: d.workplaceId, hours: Math.round(hours * 100) / 100, activity: d.activity, target: d.target,
    indirect: d.indirect, video: d.video, note: d.note };
}

export function konfView(root, ctx) {
  const s = store.snapshot();
  const wps = s.workplace;
  const wpMap = new Map(wps.map((w) => [w.id, w]));
  const years = [...new Set(s.konf.map((x) => x.date.slice(0, 4)))].sort().reverse();
  const rows = s.konf
    .filter((k) => (!filter.workplaceId || k.workplaceId === filter.workplaceId) && (!filter.year || k.date.startsWith(filter.year))
      && (!filter.activity || k.activity === filter.activity))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  const c = confrontation({ ...s, konf: rows });

  mount(root, html`
    <h1>Konfrontationstimer</h1>
    <section class="card">
      <h2>Indtast konfrontation</h2>
      ${wps.length ? html`<form id="f-konf" class="stack">${konfFields(sticky, wps)}
        <p class="form-error" hidden></p>
        <div class="row"><button class="btn primary">Gem</button>
          <span class="muted small">Tip: registrér gerne samlet pr. dag eller uge. Aktivitet og målgruppe huskes til næste registrering.</span></div></form>`
      : html`<p>Opret først et arbejdsforhold.</p><button class="btn primary" id="new-wp">+ Arbejdsforhold</button>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Oversigt</h2>
        <div class="row filters">
          <select id="flt-wp" aria-label="Arbejdsforhold"><option value="">Alle arbejdsforhold</option>${options(wps, filter.workplaceId)}</select>
          <select id="flt-act" aria-label="Aktivitet"><option value="">Alle aktiviteter</option>
            ${Object.entries(ACTIVITIES).map(([k, v]) => html`<option value="${k}" ${filter.activity === k ? html`selected` : ""}>${v}</option>`)}</select>
          <select id="flt-year" aria-label="År"><option value="">Alle år</option>
            ${years.map((y) => html`<option ${filter.year === y ? html`selected` : ""}>${y}</option>`)}</select>
        </div></div>
      <div class="table-wrap"><table class="table matrix">
        <thead><tr><th>Faktiske timer</th>${Object.values(TARGETS).map((t) => html`<th class="num">${t}</th>`)}<th class="num">I alt</th></tr></thead>
        <tbody>${Object.entries(ACTIVITIES).map(([a, label]) => html`<tr><th>${label}</th>
          ${Object.keys(TARGETS).map((t) => html`<td class="num">${fmtNum(c.rawMatrix[a][t])}</td>`)}
          <td class="num"><strong>${fmtNum(Object.values(c.rawMatrix[a]).reduce((x, y) => x + y, 0))}</strong></td></tr>`)}</tbody>
      </table></div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Dato</th><th>Arbejdsforhold</th><th>Aktivitet</th><th>Målgruppe</th><th class="num">Timer</th><th>Note</th><th></th></tr></thead>
        <tbody>${rows.map((k) => html`<tr>
          <td class="nowrap">${fmtDate(k.date)}</td>
          <td><small>${wpMap.get(k.workplaceId)?.name || "?"}</small></td>
          <td>${ACTIVITIES[k.activity]}${k.indirect ? html` <span class="pill">Indirekte</span>` : ""}${k.video ? html` <span class="pill">Video</span>` : ""}</td>
          <td>${TARGETS[k.target]}</td>
          <td class="num">${fmtNum(k.hours, 2)}</td>
          <td class="topic">${k.note || ""}</td>
          <td class="actions"><button class="btn ghost small" data-edit="${k.id}">Redigér</button>
            <button class="btn ghost small danger-text" data-del="${k.id}">Slet</button></td></tr>`)}</tbody>
        <tfoot><tr><th colspan="4">I alt (${rows.length})</th><th class="num">${fmtNum(c.raw.total, 2)}</th><th colspan="2"></th></tr></tfoot>
      </table></div>` : html`<p class="muted">Ingen registreringer.</p>`}
    </section>`);

  root.querySelector("#new-wp")?.addEventListener("click", () => editWorkplace().then((ok) => ok && ctx.rerender()));
  const form = root.querySelector("#f-konf");
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    btn.disabled = true;
    try {
      const data = parseKonf(form);
      await store.save("konf", data);
      sticky = { workplaceId: data.workplaceId, activity: data.activity, target: data.target, indirect: data.indirect, video: data.video, date: data.date };
      toast(`${fmtNum(data.hours, 2)} timer ${ACTIVITIES[data.activity].toLowerCase()} gemt`);
      ctx.rerender();
    } catch (e) {
      const box = form.querySelector(".form-error");
      box.hidden = false;
      box.textContent = e.message;
      btn.disabled = false;
    }
  });
  root.querySelector("#flt-wp").onchange = (e) => { filter.workplaceId = e.target.value; ctx.rerender(); };
  root.querySelector("#flt-act").onchange = (e) => { filter.activity = e.target.value; ctx.rerender(); };
  root.querySelector("#flt-year").onchange = (e) => { filter.year = e.target.value; ctx.rerender(); };
  root.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
    const x = store.get(b.dataset.edit);
    formDialog("Redigér konfrontation", konfFields(x, wps), {
      wide: true, onSubmit: (f) => store.save("konf", { ...x, ...parseKonf(f) }),
    }).then((ok) => ok && ctx.rerender());
  }));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (await confirmDialog("Slet denne registrering?")) { await store.remove(b.dataset.del); ctx.rerender(); }
  }));
}
