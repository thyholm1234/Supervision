// "Uddannelsesforløb": uddannelsesaftaler generated from templates, with status meetings, learning activities and documentation.
import { html, mount, fmtDate, fmtNum, today } from "../html.js";
import { agreementStatus, parseHours, PPU, RULES } from "../rules.js";
import * as store from "../store.js";
import { generateAgreement, SECTIONS, TEMPLATES } from "../templates.js";
import { confirmDialog, formDialog, readForm, toast } from "../ui.js";
import { attachmentsBlock, wireAttachments } from "./attachments.js";
import { courseLabel } from "./setup.js";

const val = (x) => x ?? "";
const checked = (b) => (b ? html`checked` : "");
const selected = (b) => (b ? html`selected` : "");
export const SCHEMES = { overgang: "Overgangsordning (bilag 2)", ppu: "Ny praksisuddannelse (kap. 3)" };
export const STATUS = { draft: "Kladde", active: "Underskrevet", ended: "Afsluttet" };
const ICON = { ok: "✓", warn: "!", bad: "✕", info: "i" };

const absenceRow = (a = {}) => html`<div class="rowgrid absence">
  <label>Fra<input type="date" data-f="from" value="${val(a.from)}" required></label>
  <label>Til<input type="date" data-f="to" value="${val(a.to)}" required></label>
  <label>Årsag<input data-f="note" value="${val(a.note)}" placeholder="fx sygdom, orlov"></label>
  <button type="button" class="btn ghost small del-row" aria-label="Fjern fravær">✕</button></div>`;

export const agreementPeriod = (a) => `${a.start ? fmtDate(a.start) : "?"} – ${a.endDate ? fmtDate(a.endDate) : a.expectedEnd ? `${fmtDate(a.expectedEnd)} (forventet)` : "?"}`;

// ------------------------------------------------------------------ generator

function newAgreementDialog() {
  const s = store.snapshot();
  if (!s.workplace.length) {
    toast("Opret først dit arbejdsforhold/praksissted under Forløb.", "error");
    location.hash = "#/forloeb";
    return Promise.resolve(false);
  }
  let createdId = null;
  return formDialog("Ny uddannelsesaftale", html`
    <fieldset><legend>Skabelon</legend><div class="template-grid">
      ${Object.entries(TEMPLATES).map(([k, t], i) => html`<label class="template-card">
        <input type="radio" name="template" value="${k}" ${checked(i === 0)} required>
        <strong>${t.label}</strong><small class="muted">${t.description}</small></label>`)}
    </div></fieldset>
    <fieldset><legend>Ordning</legend>
      <label class="check"><input type="radio" name="scheme" value="overgang" checked> ${SCHEMES.overgang} <small class="muted">– gælder til 31.12.2028</small></label>
      <label class="check"><input type="radio" name="scheme" value="ppu"> ${SCHEMES.ppu} <small class="muted">– målbeskrivelsen er endnu ikke udgivet</small></label>
    </fieldset>
    <fieldset><legend>Praksissted(er)</legend>
      ${s.workplace.map((w, i) => html`<label class="check"><input type="checkbox" name="wp" value="${w.id}" ${checked(i === 0)}> ${w.name}
        ${w.selfEmployed ? html`<small class="muted">(selvstændig)</small>` : ""}</label>`)}
    </fieldset>
    <label>Uddannelsesansvarlig <small class="muted" id="resp-hint"></small><input name="respName" placeholder="Navn"></label>`, {
    wide: true,
    submitLabel: "Generér aftale",
    onMount: (form) => {
      const hint = form.querySelector("#resp-hint");
      const sync = () => (hint.textContent = `– typisk: ${TEMPLATES[form.querySelector('input[name="template"]:checked').value].responsible}`);
      form.querySelectorAll('input[name="template"]').forEach((r) => (r.onchange = sync));
      sync();
    },
    onSubmit: async (form) => {
      const d = readForm(form);
      const wpIds = [...form.querySelectorAll('input[name="wp"]:checked')].map((x) => x.value);
      if (!wpIds.length) throw new Error("Vælg mindst ét praksissted.");
      const draft = generateAgreement(d.template, {
        profile: s.profile, workplaces: s.workplace.filter((w) => wpIds.includes(w.id)), courses: s.course, scheme: d.scheme, respName: d.respName,
      });
      createdId = (await store.save("agreement", draft)).id;
    },
  }).then((ok) => {
    if (ok && createdId) location.hash = `#/aftaler/${createdId}`;
    return ok;
  });
}

// ------------------------------------------------------------------ editor

export function editAgreement(a) {
  const s = store.snapshot();
  const t = TEMPLATES[a.template] || TEMPLATES.ppr;
  return formDialog("Redigér uddannelsesaftale", html`
    <div class="grid2">
      <label class="span2">Titel<input name="title" value="${val(a.title)}" required></label>
      <label>Skabelon<select name="template">${Object.entries(TEMPLATES).map(([k, x]) => html`<option value="${k}" ${selected(k === a.template)}>${x.label} – ${x.long}</option>`)}</select></label>
      <label>Ordning<select name="scheme">${Object.entries(SCHEMES).map(([k, l]) => html`<option value="${k}" ${selected(k === a.scheme)}>${l}</option>`)}</select></label>
    </div>
    <fieldset><legend>Periode og omfang (§ 4, stk. 2)</legend><div class="grid3">
      <label>Startdato<input type="date" name="start" value="${val(a.start)}" required></label>
      <label>Forventet slutdato<input type="date" name="expectedEnd" value="${val(a.expectedEnd)}"></label>
      <label>Ugentlig arbejdstid <small class="muted">(timer)</small><input type="number" name="hoursPerWeek" min="0" max="80" step="0.5" value="${val(a.hoursPerWeek)}"></label>
      <label>Status<select name="status">${Object.entries(STATUS).map(([k, l]) => html`<option value="${k}" ${selected(k === (a.status || "draft"))}>${l}</option>`)}</select></label>
      <label>Underskrevet dato<input type="date" name="signedDate" value="${val(a.signedDate)}"></label>
      <label>Faktisk slutdato<input type="date" name="endDate" value="${val(a.endDate)}"></label>
    </div></fieldset>
    <fieldset><legend>Praksissted(er)</legend>
      ${s.workplace.map((w) => html`<label class="check"><input type="checkbox" name="wp" value="${w.id}" ${checked((a.workplaceIds || []).includes(w.id))}> ${w.name}</label>`)}
      <label>Arbejdsgiver / underskriver for praksisstedet<input name="employerSigner" value="${val(a.employerSigner)}" placeholder="Navn og titel"></label>
    </fieldset>
    <fieldset><legend>Uddannelsesansvarlig (§ 11)</legend>
      <p class="muted small">Typisk: ${t.responsible}.</p>
      <div class="grid2">
        <label>Navn<input name="respName" value="${val(a.respName)}"></label>
        <label>Stilling/titel<input name="respTitle" value="${val(a.respTitle)}" placeholder="fx Ledende psykolog, specialist i psykoterapi"></label>
        <label>Arbejdssted/organisation<input name="respOrg" value="${val(a.respOrg)}"></label>
        <label>Autorisations-ID <small class="muted">(valgfri)</small><input name="respAuthId" value="${val(a.respAuthId)}"></label>
        <label>E-mail <small class="muted">(valgfri)</small><input type="email" name="respEmail" value="${val(a.respEmail)}"></label>
        <label>Telefon <small class="muted">(valgfri)</small><input name="respPhone" value="${val(a.respPhone)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="respQualified" ${checked(a.respQualified)}> Opfylder kravene til supervisor: klinisk psykolog med mindst 3 års erfaring efter kandidatgraden (§ 12, stk. 2)</label>
      <label class="check"><input type="checkbox" name="respInstruction" ${checked(a.respInstruction)}> Har instruktionsbeføjelse eller et tilsvarende fagligt ansvar over for psykologen (§ 11, stk. 2)</label>
      <label class="check"><input type="checkbox" name="respExternal" ${checked(a.respExternal)}> Ekstern uddannelsesansvarlig <small class="muted">(selvstændige, § 4, stk. 5)</small></label>
    </fieldset>
    <fieldset><legend>Supervisionsforløb knyttet til aftalen</legend>
      ${s.course.length ? s.course.map((c) => html`<label class="check"><input type="checkbox" name="course" value="${c.id}" ${checked((a.courseIds || []).includes(c.id))}> ${courseLabel(c)}</label>`)
        : html`<p class="muted small">Ingen supervisionsforløb endnu – opret dem under <a href="#/forloeb">Forløb</a>.</p>`}
    </fieldset>
    <fieldset><legend>Aftalens indhold</legend>
      <p class="muted small">Teksterne kommer fra skabelonen "${t.label}". Tilpas dem til dit forløb – erstat [klammer] med konkrete oplysninger.
        <button type="button" class="btn ghost small" id="reset-sections">Indsæt skabelontekster igen</button></p>
      ${SECTIONS.map((sec) => html`<label data-scheme="${sec.scheme || ""}">${sec.label}${sec.hint ? html` <small class="muted">– ${sec.hint}</small>` : ""}
        <textarea name="sec_${sec.key}" rows="5">${val(a.sections?.[sec.key])}</textarea></label>`)}
    </fieldset>
    <fieldset><legend>Fravær ud over ferie</legend>
      <p class="muted small">Ny praksisuddannelse: over 10 % fravær (ud over ferie) af aftaleperioden indgår ikke (§ 6, stk. 3).
        Overgangsordningen: fravær over 8 sammenhængende uger registreres på arbejdsforholdet.</p>
      <div id="absences">${(a.absences || []).map(absenceRow)}</div>
      <button type="button" class="btn ghost small" id="add-absence">+ Fravær</button>
    </fieldset>
    <label>Note<textarea name="note" rows="2">${val(a.note)}</textarea></label>`, {
    wide: true,
    onMount: (form) => {
      form.addEventListener("click", (ev) => {
        if (ev.target.closest(".del-row")) ev.target.closest(".rowgrid").remove();
      });
      form.querySelector("#add-absence").onclick = () => form.querySelector("#absences").insertAdjacentHTML("beforeend", String(absenceRow()));
      const syncScheme = () => form.querySelectorAll('[data-scheme="overgang"]').forEach((el) => (el.hidden = form.elements.scheme.value !== "overgang"));
      form.elements.scheme.onchange = syncScheme;
      syncScheme();
      form.querySelector("#reset-sections").onclick = async () => {
        if (!(await confirmDialog("Erstat alle tekstafsnit med skabelonens tekst? Dine ændringer i teksterne går tabt.", { ok: "Erstat", danger: true }))) return;
        const wps = s.workplace.filter((w) => [...form.querySelectorAll('input[name="wp"]:checked')].some((x) => x.value === w.id));
        const fresh = generateAgreement(form.elements.template.value, { profile: s.profile, workplaces: wps, respName: form.elements.respName.value });
        for (const sec of SECTIONS) form.elements[`sec_${sec.key}`].value = fresh.sections[sec.key];
      };
    },
    onSubmit: async (form) => {
      const d = readForm(form);
      if (d.expectedEnd && d.expectedEnd < d.start) throw new Error("Den forventede slutdato ligger før startdatoen.");
      if (d.endDate && d.endDate < d.start) throw new Error("Slutdatoen ligger før startdatoen.");
      const sections = {};
      const out = {};
      for (const [k, v] of Object.entries(d)) {
        if (k.startsWith("sec_")) sections[k.slice(4)] = v;
        else if (k !== "wp" && k !== "course") out[k] = v;
      }
      const absences = [...form.querySelectorAll(".absence")].map((row) => Object.fromEntries(
        [...row.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, i.value || null]))).filter((x) => x.from && x.to);
      await store.save("agreement", {
        ...a, ...out, sections, absences,
        hoursPerWeek: d.hoursPerWeek === "" ? null : +d.hoursPerWeek,
        workplaceIds: [...form.querySelectorAll('input[name="wp"]:checked')].map((x) => x.value),
        courseIds: [...form.querySelectorAll('input[name="course"]:checked')].map((x) => x.value),
      });
    },
  });
}

// ------------------------------------------------------------------ log (status meetings and learning activities)

function editLog(agreementId, entry = {}) {
  return formDialog(entry.id ? "Redigér registrering" : "Ny registrering", html`
    <fieldset><legend>Type</legend>
      <label class="check"><input type="radio" name="type" value="status" ${checked(entry.type !== "activity")}> Statussamtale med uddannelsesansvarlig</label>
      <label class="check"><input type="radio" name="type" value="activity" ${checked(entry.type === "activity")}> Læringsaktivitet <small class="muted">(kursus, metode- og færdighedstræning m.m.)</small></label>
    </fieldset>
    <div class="grid2">
      <label>Dato<input type="date" name="date" value="${val(entry.date || today())}" required></label>
      <label>Timer <small class="muted">(valgfri for statussamtaler)</small><input name="hours" inputmode="decimal" value="${val(entry.hours)}" placeholder="fx 1,5 eller 1:30"></label>
      <label class="span2">Titel<input name="title" value="${val(entry.title)}" required placeholder="fx 3-måneders status / Kursus i WISC-V"></label>
    </div>
    <label>Referat / indhold<textarea name="note" rows="5" placeholder="Hvad blev drøftet, vurderet og aftalt? Hvilke kompetencer blev trænet?">${val(entry.note)}</textarea></label>`, {
    onSubmit: (form) => {
      const d = readForm(form);
      const hours = d.hours ? parseHours(d.hours) : null;
      if (d.hours && !(hours > 0 && hours <= 100)) throw new Error("Ugyldigt timetal.");
      return store.save("agreementlog", { ...entry, ...d, hours, agreementId });
    },
  });
}

// ------------------------------------------------------------------ views

function listView(root, ctx) {
  const s = store.snapshot();
  const t = today();
  const rows = s.agreement.slice().sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  mount(root, html`
    <div class="page-head"><h1>Uddannelsesforløb</h1><button class="btn primary" id="new-agr">+ Ny uddannelsesaftale</button></div>
    <div class="card intro">
      <p>En <strong>uddannelsesaftale</strong> er en skriftlig aftale med arbejdsgiveren (eller en ekstern uddannelsesansvarlig, hvis du er selvstændig).
        Den skal angive start, forventet slut, uddannelsesansvarlig og praksissted og være indgået <em>før</em> den periode, den dækker (BEK 247/2026, § 4).</p>
      <p class="muted small">Vælg en skabelon (PPR, psykiatri, arbejds- og organisationspsykologi, HR eller selvstændig), tilpas teksten og print aftalen til underskrift.
        Gem den underskrevne aftale, statusreferater og anden dokumentation krypteret på forløbet, og lav en forløbsrapport, når perioden afsluttes.</p>
    </div>
    ${rows.length ? html`<section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Aftale</th><th>Periode</th><th>Status</th><th class="num">Fuldtidsår</th><th class="num">Dokumenter</th><th>Bemærkninger</th><th></th></tr></thead>
      <tbody>${rows.map((a) => {
        const st = agreementStatus(a, s, t);
        const bad = st.warnings.filter((w) => w.level === "bad" || w.level === "warn").length;
        return html`<tr>
          <td><a href="#/aftaler/${a.id}"><strong>${a.title || "Uden titel"}</strong></a><br>
            <span class="pill">${TEMPLATES[a.template]?.label || "?"}</span> <span class="pill">${a.scheme === "ppu" ? "PPU" : "Overgang"}</span></td>
          <td><small>${agreementPeriod(a)}</small></td>
          <td><span class="pill ${a.status === "active" ? "ok" : ""}">${STATUS[a.status || "draft"]}</span></td>
          <td class="num">${fmtNum(st.years, 2)}</td>
          <td class="num">${store.attachments(a.id).length}</td>
          <td>${bad ? html`<span class="pill warn">${bad} punkt${bad > 1 ? "er" : ""}</span>` : html`<span class="pill ok">OK</span>`}</td>
          <td class="actions"><a class="btn ghost small" href="#/aftaler/${a.id}">Åbn</a></td></tr>`;
      })}</tbody></table></div></section>`
    : html`<section class="card"><p class="muted">Ingen uddannelsesaftaler endnu.</p></section>`}`);
  root.querySelector("#new-agr").onclick = () => newAgreementDialog().then((ok) => ok && ctx.rerender());
}

function detailView(root, ctx, a) {
  const s = store.snapshot();
  const st = agreementStatus(a, s, today());
  const t = TEMPLATES[a.template] || TEMPLATES.ppr;
  const ppu = a.scheme === "ppu";
  const wps = s.workplace.filter((w) => (a.workplaceIds || []).includes(w.id));
  const log = st.log.slice().sort((x, y) => y.date.localeCompare(x.date));
  const statusCount = log.filter((x) => x.type !== "activity").length;
  document.title = `${a.title} – Supervisionsregnskab`;

  mount(root, html`
    <p class="no-print"><a href="#/aftaler">← Alle uddannelsesforløb</a></p>
    <div class="page-head"><h1>${a.title || "Uddannelsesaftale"}</h1>
      <span class="row wrap">
        <span class="pill">${t.label}</span><span class="pill">${SCHEMES[a.scheme] || SCHEMES.overgang}</span>
        <span class="pill ${a.status === "active" ? "ok" : ""}">${STATUS[a.status || "draft"]}</span></span></div>
    <div class="row wrap toolbar">
      <button class="btn primary" id="edit">Redigér aftale</button>
      <a class="btn ghost" href="#/rapport/aftale/${a.id}">Aftale til underskrift</a>
      <a class="btn ghost" href="#/rapport/uddannelsesforloeb/${a.id}">Forløbsrapport til underskrift</a>
      <button class="btn ghost danger-text" id="del">Slet</button>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="kpi-label">Periode</span><span class="kpi-value small-v">${agreementPeriod(a)}</span>
        <span class="kpi-sub">${wps.map((w) => w.name).join(", ") || "Intet praksissted"}</span></div>
      <div class="kpi"><span class="kpi-label">Arbejdstid i perioden</span><span class="kpi-value">${fmtNum(st.years, 2)}<small> fuldtidsår</small></span>
        <span class="kpi-sub">${st.selfEmployed ? "Ud fra konfrontationstimer" : `${fmtNum(a.hoursPerWeek)} t/uge aftalt`}</span></div>
      <div class="kpi"><span class="kpi-label">${ppu ? "Læringsaktiviteter" : "Supervision i perioden"}</span>
        <span class="kpi-value">${fmtNum(ppu ? st.learningHours : st.supTotals.individual + st.supTotals.groupConverted)}<small> ${ppu ? `/ ${PPU.learningHours} t` : "t omregnet"}</small></span>
        <span class="kpi-sub">${ppu ? `Heraf supervision ${fmtNum(st.supTotals.actual)} t` : `Individuel ${fmtNum(st.supTotals.individual)} · gruppe ${fmtNum(st.supTotals.groupConverted)}`}</span></div>
      <div class="kpi"><span class="kpi-label">Ekstern supervision</span><span class="kpi-value">${fmtNum(st.supTotals.external)}<small> / ${PPU.externalHours} t</small></span>
        <span class="kpi-sub">${statusCount} statussamtale${statusCount === 1 ? "" : "r"} · ${store.attachments(a.id).length} dokumenter</span></div>
    </div>

    <div class="grid-agr">
      <section class="card">
        <h2>Opmærksomhedspunkter</h2>
        ${st.warnings.length ? html`<ul class="warnings">${st.warnings.map((w) => html`<li class="${w.level}">
          <span class="w-icon" aria-hidden="true">${ICON[w.level]}</span><span>${w.text}</span></li>`)}</ul>`
        : html`<p class="muted">Ingen bemærkninger til aftalen.</p>`}
      </section>
      <section class="card">
        <h2>Gode råd – ${t.long}</h2>
        <ul class="tips">${t.tips.map((x) => html`<li>${x}</li>`)}</ul>
        ${!ppu && a.expectedEnd ? html`<p class="muted small">Overgangsordningen udløber ${fmtDate(RULES.deadline)}.</p>` : ""}
      </section>

      <section class="card full">
        <div class="card-head"><h2>Statussamtaler og læringsaktiviteter</h2><button class="btn primary small" id="add-log">+ Registrér</button></div>
        ${log.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Dato</th><th>Type</th><th>Titel</th><th class="num">Timer</th><th></th></tr></thead>
          <tbody>${log.map((x) => html`<tr>
            <td>${fmtDate(x.date)}</td><td><span class="pill">${x.type === "activity" ? "Læringsaktivitet" : "Statussamtale"}</span></td>
            <td><strong>${x.title}</strong>${x.note ? html`<br><small class="muted topic">${x.note}</small>` : ""}</td>
            <td class="num">${x.hours ? fmtNum(x.hours, 2) : ""}</td>
            <td class="actions"><button class="btn ghost small" data-edit-log="${x.id}">Redigér</button>
              <button class="btn ghost small danger-text" data-del-log="${x.id}">Slet</button></td></tr>`)}</tbody></table></div>`
        : html`<p class="muted">Ingen registreringer endnu. Skriv et kort referat efter hver statussamtale (fx hver 3. måned).</p>`}
      </section>

      <section class="card full">
        <h2>Dokumentation</h2>
        <p class="muted small">Forventede dokumenter for skabelonen "${t.label}":</p>
        ${attachmentsBlock(a.id, { expected: t.docs })}
      </section>

      <section class="card full">
        <h2>Aftalens indhold</h2>
        ${SECTIONS.filter((sec) => (!sec.scheme || sec.scheme === a.scheme) && a.sections?.[sec.key]).map((sec) => html`<details class="section-text">
          <summary>${sec.label}</summary><p class="pre">${a.sections[sec.key]}</p></details>`)}
      </section>
    </div>`);

  root.querySelector("#edit").onclick = () => editAgreement(a).then((ok) => ok && ctx.rerender());
  root.querySelector("#add-log").onclick = () => editLog(a.id).then((ok) => ok && ctx.rerender());
  root.querySelectorAll("[data-edit-log]").forEach((b) => (b.onclick = () => editLog(a.id, store.get(b.dataset.editLog)).then((ok) => ok && ctx.rerender())));
  root.querySelectorAll("[data-del-log]").forEach((b) => (b.onclick = async () => {
    if (await confirmDialog("Slet denne registrering?")) { await store.remove(b.dataset.delLog); ctx.rerender(); }
  }));
  root.querySelector("#del").onclick = async () => {
    const atts = store.attachments(a.id);
    const msg = `Slet uddannelsesaftalen${st.log.length || atts.length ? ` sammen med ${st.log.length} registrering(er) og ${atts.length} dokument(er)` : ""}? Det kan ikke fortrydes.`;
    if (!(await confirmDialog(msg))) return;
    try {
      for (const att of atts) await store.removeAttachment(att);
      for (const x of st.log) await store.remove(x.id);
      await store.remove(a.id);
      location.hash = "#/aftaler";
    } catch (e) {
      toast(e.message, "error");
    }
  };
  wireAttachments(root, ctx.rerender);
}

export function agreementsView(root, ctx) {
  const a = ctx.args[0] && store.get(ctx.args[0]);
  if (a?.kind === "agreement") return detailView(root, ctx, a);
  return listView(root, ctx);
}
