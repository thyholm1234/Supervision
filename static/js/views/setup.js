// "Forløb": workplaces (arbejdsforhold), supervisors and supervision courses (supervisionsforløb).
import { html, mount, fmtDate, fmtNum, today } from "../html.js";
import { supervision, workDuration, RULES } from "../rules.js";
import * as store from "../store.js";
import { confirmDialog, formDialog, options, readForm, toast } from "../ui.js";
import { attachmentsDialog } from "./attachments.js";

const val = (x) => x ?? "";
const checked = (b) => (b ? html`checked` : "");

// ------------------------------------------------------------------ workplace

function periodRow(p = {}) {
  return html`<div class="rowgrid period">
    <label>Fra<input type="date" data-f="from" value="${val(p.from)}" required></label>
    <label>Til <small class="muted">(tom = nu)</small><input type="date" data-f="to" value="${val(p.to)}"></label>
    <label>Timer/uge<input type="number" data-f="hoursPerWeek" min="0" max="80" step="0.5" value="${val(p.hoursPerWeek)}" required></label>
    <button type="button" class="btn ghost small del-row" aria-label="Fjern periode">✕</button></div>`;
}

function absenceRow(a = {}) {
  return html`<div class="rowgrid absence">
    <label>Fra<input type="date" data-f="from" value="${val(a.from)}" required></label>
    <label>Til<input type="date" data-f="to" value="${val(a.to)}" required></label>
    <label>Årsag<input data-f="note" value="${val(a.note)}" placeholder="fx barsel, sygdom"></label>
    <button type="button" class="btn ghost small del-row" aria-label="Fjern fravær">✕</button></div>`;
}

const readRows = (form, cls) => [...form.querySelectorAll(`.${cls}`)].map((row) => {
  const o = {};
  row.querySelectorAll("[data-f]").forEach((i) => (o[i.dataset.f] = i.type === "number" ? (i.value === "" ? null : +i.value) : i.value || null));
  return o;
});

function wireRows(form) {
  form.addEventListener("click", (ev) => {
    if (ev.target.closest(".del-row")) ev.target.closest(".rowgrid").remove();
  });
  form.querySelector("#add-period").onclick = () => form.querySelector("#periods").insertAdjacentHTML("beforeend", String(periodRow()));
  form.querySelector("#add-absence").onclick = () => form.querySelector("#absences").insertAdjacentHTML("beforeend", String(absenceRow()));
  const se = form.elements.selfEmployed;
  const toggle = () => form.querySelector("#employed-only").classList.toggle("dim", se.checked);
  se.onchange = toggle;
  toggle();
}

export async function editWorkplace(wp = {}) {
  const periods = wp.periods?.length ? wp.periods : [{ from: "", to: "", hoursPerWeek: 37 }];
  return formDialog(wp.id ? "Redigér arbejdsforhold" : "Nyt arbejdsforhold", html`
    <div class="grid2">
      <label>Arbejdssted<input name="name" value="${val(wp.name)}" required placeholder="fx Psykiatrisk Center Nord"></label>
      <label>Adresse<input name="address" value="${val(wp.address)}"></label>
      <label>Arbejdsgiver / underskriver<input name="employer" value="${val(wp.employer)}" placeholder="Navn og titel på leder"></label>
      <label>Stilling<input name="position" value="${val(wp.position)}" placeholder="fx Psykolog"></label>
    </div>
    <label class="check"><input type="checkbox" name="selfEmployed" ${checked(wp.selfEmployed)}>
      Selvstændig praksis <small class="muted">(arbejdstid opgøres ud fra konfrontationstimer: 1 time = 2 arbejdstimer, pkt. 1.4 – kræver revisorerklæring)</small></label>
    <fieldset id="employed-only"><legend>Ansættelsesperioder og ugentlig arbejdstid</legend>
      <p class="muted small">Tilføj en ny periode, hver gang timetallet ændres. ≥ ${RULES.fullTimeHours} t/uge = fuld tid; under ${RULES.minWeeklyHours} t/uge tæller ikke.</p>
      <div id="periods">${periods.map(periodRow)}</div>
      <button type="button" class="btn ghost small" id="add-period">+ Periode</button>
      <h3 class="small-h">Fravær over 8 sammenhængende uger <small class="muted">(fratrækkes, pkt. 1.5)</small></h3>
      <div id="absences">${(wp.absences || []).map(absenceRow)}</div>
      <button type="button" class="btn ghost small" id="add-absence">+ Fravær</button>
    </fieldset>
    <label>Note<textarea name="note" rows="2">${val(wp.note)}</textarea></label>`, {
    wide: true,
    onMount: wireRows,
    onSubmit: async (form) => {
      const data = readForm(form);
      const per = data.selfEmployed ? [] : readRows(form, "period").filter((p) => p.from);
      if (!data.selfEmployed && !per.length) throw new Error("Angiv mindst én ansættelsesperiode.");
      for (const p of per) if (p.to && p.to < p.from) throw new Error("En periodes slutdato ligger før startdatoen.");
      const abs = readRows(form, "absence").filter((a) => a.from && a.to);
      await store.save("workplace", { ...wp, ...data, periods: per, absences: abs });
    },
  });
}

// ------------------------------------------------------------------ supervisor

export async function editSupervisor(sup = {}) {
  return formDialog(sup.id ? "Redigér supervisor" : "Ny supervisor", html`
    <div class="grid2">
      <label>Navn<input name="name" value="${val(sup.name)}" required></label>
      <label>Uddannelsesniveau<input name="education" value="${val(sup.education)}" placeholder="fx Cand.psych., aut., specialist i psykoterapi"></label>
      <label>Arbejdserfaring<input name="experience" value="${val(sup.experience)}" placeholder="fx Cand.psych. 2008, autoriseret 2011"></label>
      <label>Arbejdsplads<input name="workplace" value="${val(sup.workplace)}"></label>
      <label>E-mail <small class="muted">(valgfri)</small><input type="email" name="email" value="${val(sup.email)}"></label>
      <label>Telefon <small class="muted">(valgfri)</small><input name="phone" value="${val(sup.phone)}"></label>
    </div>
    <label class="check"><input type="checkbox" name="qualified" ${checked(sup.qualified !== false)}>
      Supervisor har selv gennemført praksisuddannelsen og har arbejdet som psykolog i mindst 3 år efter kandidateksamen (pkt. 3.3)</label>
    <label class="check"><input type="checkbox" name="sameAddress" ${checked(sup.sameAddress)}>
      Supervisor har samme arbejdsadresse som mig <small class="muted">(kræver dokumentation, hvis supervisionen er ekstern)</small></label>`, {
    wide: true,
    onSubmit: (form) => store.save("supervisor", { ...sup, ...readForm(form) }),
  });
}

// ------------------------------------------------------------------ course

export async function editCourse(c = {}) {
  const sups = store.all("supervisor");
  const wps = store.all("workplace");
  if (!sups.length || !wps.length) {
    toast("Opret først mindst ét arbejdsforhold og én supervisor.", "error");
    return false;
  }
  return formDialog(c.id ? "Redigér supervisionsforløb" : "Nyt supervisionsforløb", html`
    <div class="grid2">
      <label>Supervisor<select name="supervisorId" required>${options(sups, c.supervisorId)}</select></label>
      <label>Arbejdsforhold supervisionen knytter sig til<select name="workplaceId" required>${options(wps, c.workplaceId)}</select></label>
      <label>Betegnelse <small class="muted">(valgfri)</small><input name="name" value="${val(c.name)}" placeholder="fx Teamsupervision børneafsnit"></label>
      <label>Startdato<input type="date" name="start" value="${val(c.start)}"></label>
    </div>
    <fieldset><legend>Type</legend>
      <label class="check"><input type="radio" name="external" value="no" ${checked(!c.external)}> Intern supervision</label>
      <label class="check"><input type="radio" name="external" value="yes" ${checked(c.external)}> Ekstern supervision <small class="muted">(supervisor uden organisatorisk tilknytning til arbejdsstedet)</small></label>
    </fieldset>
    <div class="grid2">
      <label>Standardform<select name="defaultFormat">
        <option value="individual" ${c.defaultFormat !== "group" ? html`selected` : ""}>Individuel</option>
        <option value="group" ${c.defaultFormat === "group" ? html`selected` : ""}>Gruppe</option></select></label>
      <label>Standard antal supervisander i gruppen<input type="number" name="defaultGroupSize" min="2" max="30" value="${val(c.defaultGroupSize || 4)}"></label>
    </div>
    <label>Gruppens sammensætning <small class="muted">(skal fremgå af ansøgningen ved gruppesupervision)</small>
      <textarea name="groupComposition" rows="2" placeholder="fx 4 psykologer under autorisationsforløb fra samme afdeling">${val(c.groupComposition)}</textarea></label>
    <label id="ext-doc">Begrundelse for at supervisionen er ekstern <small class="muted">(vedlægges som dokumentation, hvis supervisor har samme arbejdsadresse)</small>
      <textarea name="externalDocumentation" rows="2">${val(c.externalDocumentation)}</textarea></label>
    <label class="check"><input type="checkbox" name="closed" ${checked(c.closed)}> Forløbet er afsluttet <small class="muted">(skjules i indtastningen)</small></label>`, {
    wide: true,
    onMount: (form) => {
      const sync = () => form.querySelector("#ext-doc").hidden = form.querySelector('input[name="external"]:checked')?.value !== "yes";
      form.querySelectorAll('input[name="external"]').forEach((r) => (r.onchange = sync));
      sync();
    },
    onSubmit: (form) => {
      const d = readForm(form);
      return store.save("course", { ...c, ...d, external: d.external === "yes", defaultGroupSize: +d.defaultGroupSize || null });
    },
  });
}

export const courseLabel = (c, sup = store.get(c.supervisorId)) =>
  `${sup?.name || "Ukendt"} – ${c.external ? "ekstern" : "intern"}${c.name ? ` – ${c.name}` : ""}`;

// ------------------------------------------------------------------ view

export function setupView(root, ctx) {
  const s = store.snapshot();
  const work = workDuration(s, today());
  const sup = supervision(s);
  const supMap = new Map(s.supervisor.map((x) => [x.id, x]));
  const wpMap = new Map(s.workplace.map((x) => [x.id, x]));
  const empty = !s.workplace.length && !s.supervisor.length;

  mount(root, html`
    <h1>Forløb</h1>
    ${empty ? html`<div class="card intro"><h2>Kom i gang</h2><ol>
      <li>Opret dit/dine <strong>arbejdsforhold</strong> med perioder og ugentlig arbejdstid.</li>
      <li>Opret dine <strong>supervisorer</strong>.</li>
      <li>Opret et <strong>supervisionsforløb</strong> pr. supervisor og arbejdssted (intern/ekstern, individuel/gruppe).</li>
      <li>Registrér herefter løbende supervision og konfrontationstimer.</li></ol>
      <p class="muted">Udfyld også dine personoplysninger under <a href="#/profil">Profil</a> – de bruges kun i rapporterne og krypteres.</p></div>` : ""}

    <section class="card">
      <div class="card-head"><h2>Arbejdsforhold</h2><button class="btn primary small" id="add-wp">+ Arbejdsforhold</button></div>
      ${s.workplace.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Arbejdssted</th><th>Perioder</th><th class="num">Fuldtidsår</th><th></th></tr></thead>
        <tbody>${s.workplace.map((w) => html`<tr>
          <td><strong>${w.name}</strong><br><small class="muted">${w.address || ""}${w.selfEmployed ? " · Selvstændig" : ""}</small></td>
          <td>${w.selfEmployed ? html`<small>Ud fra ${fmtNum(work.perWorkplace[w.id]?.konf, 0)} konfrontationstimer</small>`
            : (w.periods || []).map((p) => html`<div><small>${fmtDate(p.from)} – ${p.to ? fmtDate(p.to) : "nu"}: ${fmtNum(p.hoursPerWeek)} t/uge</small></div>`)}</td>
          <td class="num">${fmtNum(work.perWorkplace[w.id]?.years || 0, 2)}</td>
          <td class="actions"><button class="btn ghost small" data-docs="${w.id}">Dokumenter (${store.attachments(w.id).length})</button>
            <button class="btn ghost small" data-edit-wp="${w.id}">Redigér</button>
            <button class="btn ghost small danger-text" data-del="${w.id}">Slet</button></td></tr>`)}</tbody></table></div>`
      : html`<p class="muted">Ingen arbejdsforhold endnu.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Supervisorer</h2><button class="btn primary small" id="add-sup">+ Supervisor</button></div>
      ${s.supervisor.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Navn</th><th>Uddannelse / erfaring</th><th class="num">Tællende timer</th><th></th></tr></thead>
        <tbody>${s.supervisor.map((x) => html`<tr>
          <td><strong>${x.name}</strong>${x.qualified === false ? html` <span class="pill bad">Ikke kvalificeret</span>` : ""}<br><small class="muted">${x.workplace || ""}</small></td>
          <td><small>${x.education || ""}${x.experience ? html`<br>${x.experience}` : ""}</small></td>
          <td class="num">${fmtNum(sup.totals.bySupervisor[x.id] || 0)}</td>
          <td class="actions"><button class="btn ghost small" data-edit-sup="${x.id}">Redigér</button>
            <button class="btn ghost small danger-text" data-del="${x.id}">Slet</button></td></tr>`)}</tbody></table></div>`
      : html`<p class="muted">Ingen supervisorer endnu.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Supervisionsforløb</h2><button class="btn primary small" id="add-course">+ Forløb</button></div>
      ${s.course.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Forløb</th><th>Arbejdsforhold</th><th class="num">Sessioner</th><th class="num">Omregnet</th><th>Status</th><th></th></tr></thead>
        <tbody>${s.course.map((c) => {
          const pc = sup.perCourse[c.id];
          return html`<tr>
          <td><strong>${supMap.get(c.supervisorId)?.name || "?"}</strong> <span class="pill">${c.external ? "Ekstern" : "Intern"}</span>
            ${c.closed ? html`<span class="pill">Afsluttet</span>` : ""}<br><small class="muted">${c.name || ""}</small></td>
          <td><small>${wpMap.get(c.workplaceId)?.name || "?"}</small></td>
          <td class="num">${pc.sessions}</td>
          <td class="num">${fmtNum(pc.converted)}</td>
          <td>${pc.eligible ? html`<span class="pill ok">Tæller</span>` : pc.sessions ? html`<span class="pill warn">Under ${RULES.minCourseHours} t</span>` : html`<span class="pill">Tomt</span>`}</td>
          <td class="actions"><a class="btn ghost small" href="#/rapport/forloeb/${c.id}">Rapport</a>
            <button class="btn ghost small" data-docs="${c.id}">Dokumenter (${store.attachments(c.id).length})</button>
            <button class="btn ghost small" data-edit-course="${c.id}">Redigér</button>
            <button class="btn ghost small danger-text" data-del="${c.id}">Slet</button></td></tr>`;
        })}</tbody></table></div>`
      : html`<p class="muted">Ingen supervisionsforløb endnu.</p>`}
    </section>`);

  const after = (ok) => ok && ctx.rerender();
  root.querySelector("#add-wp").onclick = () => editWorkplace().then(after);
  root.querySelector("#add-sup").onclick = () => editSupervisor().then(after);
  root.querySelector("#add-course").onclick = () => editCourse().then(after);
  root.querySelectorAll("[data-edit-wp]").forEach((b) => (b.onclick = () => editWorkplace(store.get(b.dataset.editWp)).then(after)));
  root.querySelectorAll("[data-edit-sup]").forEach((b) => (b.onclick = () => editSupervisor(store.get(b.dataset.editSup)).then(after)));
  root.querySelectorAll("[data-edit-course]").forEach((b) => (b.onclick = () => editCourse(store.get(b.dataset.editCourse)).then(after)));
  root.querySelectorAll("[data-docs]").forEach((b) => (b.onclick = () => {
    const x = store.get(b.dataset.docs);
    const dlg = attachmentsDialog(x.id, x.kind === "course" ? courseLabel(x) : x.name);
    dlg.addEventListener("close", () => ctx.rerender());
  }));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.del;
    const used = s.course.some((c) => c.supervisorId === id || c.workplaceId === id) || s.session.some((x) => x.courseId === id)
      || s.konf.some((k) => k.workplaceId === id) || store.attachments(id).length
      || store.all("agreement").some((a) => (a.workplaceIds || []).includes(id) || (a.courseIds || []).includes(id));
    if (used) return toast("Kan ikke slettes, fordi der er registreringer, dokumenter eller uddannelsesaftaler knyttet til den. Fjern dem først.", "error");
    if (await confirmDialog("Vil du slette denne post?")) {
      await store.remove(id);
      ctx.rerender();
    }
  }));
}
