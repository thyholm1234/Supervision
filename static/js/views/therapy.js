// "Egenterapi": own therapy, up to 25 hours count towards the 160 supervision hours (pkt. 4).
import { html, mount, fmtDate, fmtNum, today } from "../html.js";
import { parseHours, RULES, therapy } from "../rules.js";
import * as store from "../store.js";
import { confirmDialog, formDialog, readForm } from "../ui.js";

function fields(x = {}) {
  return html`<div class="grid2">
    <label>Dato<input type="date" name="date" value="${x.date || today()}" max="${today()}" required></label>
    <label>Timer<input name="hours" required inputmode="decimal" value="${x.hours != null ? String(x.hours).replace(".", ",") : ""}"></label>
    <label>Terapeutens navn<input name="therapist" value="${x.therapist || ""}" required></label>
    <label>Terapeutens autorisation<input name="therapistAuth" value="${x.therapistAuth || ""}" placeholder="fx Autoriseret psykolog"></label>
  </div>
  <fieldset class="inline"><legend>Form</legend>
    <label class="check"><input type="radio" name="format" value="individual" ${x.format !== "group" ? html`checked` : ""}> Individuel</label>
    <label class="check"><input type="radio" name="format" value="group" ${x.format === "group" ? html`checked` : ""}> Gruppe</label></fieldset>`;
}

function parse(form) {
  const d = readForm(form);
  const hours = parseHours(d.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 12) throw new Error("Angiv et gyldigt antal timer.");
  return { ...d, hours: Math.round(hours * 100) / 100 };
}

export function therapyView(root, ctx) {
  const items = store.all("therapy").sort((a, b) => b.date.localeCompare(a.date));
  const t = therapy({ therapy: items });
  const last = items[0] || {};
  mount(root, html`
    <h1>Egenterapi</h1>
    <section class="card">
      <p>Egenterapi kan medregnes med op til <strong>${RULES.therapyMax} timer</strong> og reducerer det samlede krav om 160 timers supervision,
        men erstatter ikke kravene om individuel, gruppe- og ekstern supervision (bilag 2, pkt. 4).</p>
      <div class="kpis small-kpis">
        <div class="kpi"><span class="kpi-label">Registreret</span><span class="kpi-value">${fmtNum(t.total)} t</span></div>
        <div class="kpi"><span class="kpi-label">Medregnes</span><span class="kpi-value">${fmtNum(t.counted)} t</span></div>
        <div class="kpi"><span class="kpi-label">Individuel / gruppe</span><span class="kpi-value">${fmtNum(t.individual)} / ${fmtNum(t.group)}</span></div>
      </div>
    </section>
    <section class="card"><h2>Registrér egenterapi</h2>
      <form id="f-th" class="stack">${fields({ therapist: last.therapist, therapistAuth: last.therapistAuth, format: last.format })}
        <p class="form-error" hidden></p><div><button class="btn primary">Gem</button></div></form></section>
    <section class="card"><h2>Oversigt</h2>
      ${items.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Dato</th><th>Terapeut</th><th>Form</th><th class="num">Timer</th><th></th></tr></thead>
      <tbody>${items.map((x) => html`<tr><td>${fmtDate(x.date)}</td><td>${x.therapist}<br><small class="muted">${x.therapistAuth || ""}</small></td>
        <td>${x.format === "group" ? "Gruppe" : "Individuel"}</td><td class="num">${fmtNum(x.hours, 2)}</td>
        <td class="actions"><button class="btn ghost small" data-edit="${x.id}">Redigér</button>
        <button class="btn ghost small danger-text" data-del="${x.id}">Slet</button></td></tr>`)}</tbody></table></div>`
      : html`<p class="muted">Ingen registreringer.</p>`}</section>`);

  const form = root.querySelector("#f-th");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await store.save("therapy", parse(form));
      ctx.rerender();
    } catch (e) {
      const box = form.querySelector(".form-error");
      box.hidden = false;
      box.textContent = e.message;
    }
  });
  root.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
    const x = store.get(b.dataset.edit);
    formDialog("Redigér egenterapi", fields(x), { onSubmit: (f) => store.save("therapy", { ...x, ...parse(f) }) })
      .then((ok) => ok && ctx.rerender());
  }));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (await confirmDialog("Slet denne registrering?")) { await store.remove(b.dataset.del); ctx.rerender(); }
  }));
}
