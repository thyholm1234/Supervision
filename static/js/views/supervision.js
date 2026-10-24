// "Supervision": entry form + overview, mirroring "Indtast supervision" / "Oversigt supervision".
import { html, mount, fmtDate, fmtNum, today } from "../html.js";
import { convertedHours, groupFactor, parseHours, supervision } from "../rules.js";
import * as store from "../store.js";
import { confirmDialog, formDialog, readForm, toast } from "../ui.js";
import { courseLabel, editCourse } from "./setup.js";

let lastCourse = null;
let filter = { courseId: "", year: "" };

function sessionFields(x, courses) {
  const course = courses.find((c) => c.id === x.courseId) || courses[0];
  const format = x.format || course?.defaultFormat || "individual";
  return html`
    <div class="grid3">
      <label>Dato<input type="date" name="date" value="${x.date || today()}" max="${today()}" required></label>
      <label class="span2">Supervisionsforløb<select name="courseId" required>${courses.map((c) =>
        html`<option value="${c.id}" ${c.id === course?.id ? html`selected` : ""}>${courseLabel(c)}</option>`)}</select></label>
      <label>Varighed (timer)<input name="hours" value="${x.hours != null ? String(x.hours).replace(".", ",") : ""}" required
        inputmode="decimal" placeholder="fx 1,5 eller 1:30" autocomplete="off"></label>
      <fieldset class="inline"><legend>Form</legend>
        <label class="check"><input type="radio" name="format" value="individual" ${format === "individual" ? html`checked` : ""}> Individuel</label>
        <label class="check"><input type="radio" name="format" value="group" ${format === "group" ? html`checked` : ""}> Gruppe</label></fieldset>
      <label class="group-only">Antal supervisander<input type="number" name="groupSize" min="2" max="40"
        value="${x.groupSize || course?.defaultGroupSize || 4}"></label>
    </div>
    <p class="muted small conv-hint" aria-live="polite"></p>
    <label class="check"><input type="checkbox" name="video" ${x.video ? html`checked` : ""}> Via videolink <small class="muted">(højst 80 timer tæller)</small></label>
    <label>Emne / tema <small class="muted">(valgfrit – undgå personhenførbare klientoplysninger)</small>
      <textarea name="topic" rows="2">${x.topic || ""}</textarea></label>`;
}

function wireSessionForm(form, courses) {
  const sync = () => {
    const fmt = form.querySelector('input[name="format"]:checked')?.value;
    form.querySelector(".group-only").hidden = fmt !== "group";
    const h = parseHours(form.elements.hours.value);
    const size = +form.elements.groupSize.value;
    const hint = form.querySelector(".conv-hint");
    if (fmt === "group" && Number.isFinite(h) && size) {
      const f = groupFactor(size);
      hint.textContent = f === 0 ? "Grupper med 13 eller flere supervisander kan ikke medregnes."
        : `Tæller ${fmtNum(h * f, 2)} omregnede timer (faktor ${fmtNum(f, 2)} ved ${size} supervisander).`;
    } else hint.textContent = "";
  };
  form.elements.courseId.addEventListener("change", () => {
    const c = courses.find((x) => x.id === form.elements.courseId.value);
    if (!c) return;
    form.querySelector(`input[name="format"][value="${c.defaultFormat || "individual"}"]`).checked = true;
    if (c.defaultGroupSize) form.elements.groupSize.value = c.defaultGroupSize;
    sync();
  });
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  sync();
}

function parseSession(form) {
  const d = readForm(form);
  const hours = parseHours(d.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 12) throw new Error("Angiv en varighed mellem 0 og 12 timer, fx 1,5 eller 1:30.");
  if (d.date > today()) throw new Error("Datoen ligger i fremtiden.");
  const out = { date: d.date, courseId: d.courseId, hours: Math.round(hours * 100) / 100, format: d.format, video: d.video, topic: d.topic };
  if (d.format === "group") {
    out.groupSize = Math.round(+d.groupSize);
    if (!(out.groupSize >= 2)) throw new Error("En gruppe har mindst 2 supervisander.");
  }
  return out;
}

async function editSession(x) {
  const courses = store.all("course");
  return formDialog("Redigér supervision", sessionFields(x, courses), {
    wide: true,
    onMount: (f) => wireSessionForm(f, courses),
    onSubmit: (f) => store.save("session", { ...x, ...parseSession(f) }),
  });
}

export function supervisionView(root, ctx) {
  const s = store.snapshot();
  const active = s.course.filter((c) => !c.closed);
  const courseMap = new Map(s.course.map((c) => [c.id, c]));
  const sup = supervision(s);
  const years = [...new Set(s.session.map((x) => x.date.slice(0, 4)))].sort().reverse();
  const rows = s.session
    .filter((x) => (!filter.courseId || x.courseId === filter.courseId) && (!filter.year || x.date.startsWith(filter.year)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  const sum = rows.reduce((a, x) => ({ h: a.h + x.hours, c: a.c + convertedHours(x) }), { h: 0, c: 0 });

  mount(root, html`
    <h1>Supervision</h1>
    <section class="card">
      <h2>Indtast supervision</h2>
      ${active.length ? html`<form id="f-session" class="stack">${sessionFields({ courseId: lastCourse }, active)}
        <p class="form-error" hidden></p>
        <div class="row"><button class="btn primary">Gem</button>
          <span class="muted small">Gemmes krypteret. Forløb, supervisor og standardform vælges under <a href="#/forloeb">Forløb</a>.</span></div></form>`
      : html`<p>Du skal oprette et supervisionsforløb, før du kan registrere supervision.</p>
        <button class="btn primary" id="new-course">+ Opret supervisionsforløb</button>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>Oversigt</h2>
        <div class="row filters">
          <select id="flt-course" aria-label="Filtrér på forløb"><option value="">Alle forløb</option>
            ${s.course.map((c) => html`<option value="${c.id}" ${filter.courseId === c.id ? html`selected` : ""}>${courseLabel(c)}</option>`)}</select>
          <select id="flt-year" aria-label="Filtrér på år"><option value="">Alle år</option>
            ${years.map((y) => html`<option ${filter.year === y ? html`selected` : ""}>${y}</option>`)}</select>
        </div></div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Dato</th><th>Supervisor</th><th>Form</th><th class="num">Timer</th><th class="num">Omregnet</th><th>Emne</th><th></th></tr></thead>
        <tbody>${rows.map((x) => {
          const c = courseMap.get(x.courseId);
          const pc = sup.perCourse[x.courseId];
          return html`<tr>
            <td class="nowrap">${fmtDate(x.date)}</td>
            <td>${store.get(c?.supervisorId)?.name || "?"} <span class="pill">${c?.external ? "Ekstern" : "Intern"}</span>
              ${pc && !pc.eligible ? html`<span class="pill warn" title="Forløbet tæller ikke endnu">!</span>` : ""}</td>
            <td>${x.format === "group" ? `Gruppe (${x.groupSize})` : "Individuel"}${x.video ? html` <span class="pill">Video</span>` : ""}</td>
            <td class="num">${fmtNum(x.hours, 2)}</td>
            <td class="num">${fmtNum(convertedHours(x), 2)}</td>
            <td class="topic">${x.topic || ""}</td>
            <td class="actions"><button class="btn ghost small" data-edit="${x.id}">Redigér</button>
              <button class="btn ghost small danger-text" data-del="${x.id}">Slet</button></td></tr>`;
        })}</tbody>
        <tfoot><tr><th colspan="3">I alt (${rows.length} sessioner)</th><th class="num">${fmtNum(sum.h, 2)}</th><th class="num">${fmtNum(sum.c, 2)}</th><th colspan="2"></th></tr></tfoot>
      </table></div>` : html`<p class="muted">Ingen registreringer${filter.courseId || filter.year ? " med dette filter" : ""}.</p>`}
    </section>`);

  root.querySelector("#new-course")?.addEventListener("click", () => editCourse().then((ok) => ok && ctx.rerender()));
  const form = root.querySelector("#f-session");
  if (form) {
    wireSessionForm(form, active);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = ev.submitter;
      btn.disabled = true;
      try {
        const data = parseSession(form);
        await store.save("session", data);
        lastCourse = data.courseId;
        toast(`Supervision ${fmtDate(data.date)} gemt`);
        ctx.rerender();
      } catch (e) {
        form.querySelector(".form-error").hidden = false;
        form.querySelector(".form-error").textContent = e.message;
        btn.disabled = false;
      }
    });
  }
  root.querySelector("#flt-course").onchange = (e) => { filter.courseId = e.target.value; ctx.rerender(); };
  root.querySelector("#flt-year").onchange = (e) => { filter.year = e.target.value; ctx.rerender(); };
  root.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editSession(store.get(b.dataset.edit)).then((ok) => ok && ctx.rerender())));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (await confirmDialog("Slet denne supervisionsregistrering?")) { await store.remove(b.dataset.del); ctx.rerender(); }
  }));
}
