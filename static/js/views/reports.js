// Printable reports for signature. Generated entirely in the browser from decrypted data.
import { html, mount, fmtDate, fmtNum, today } from "../html.js";
import { ACTIVITIES, TARGETS, agreementStatus, confrontation, convertedHours, evaluate, inRange, PPU, RULES, supervision, therapy, workDuration } from "../rules.js";
import * as store from "../store.js";
import { SECTIONS, TEMPLATES } from "../templates.js";
import { agreementPeriod, SCHEMES } from "./agreements.js";
import { fmtBytes } from "./attachments.js";
import { courseLabel } from "./setup.js";

// ------------------------------------------------------------------ chooser

export function reportsView(root) {
  const s = store.snapshot();
  const p = s.profile;
  const missing = ["name", "birthdate", "address"].filter((k) => !p[k]);
  const therapists = [...new Set(s.therapy.map((x) => x.therapist))];
  mount(root, html`
    <h1>Rapporter</h1>
    ${missing.length ? html`<div class="card notice">Dine personoplysninger (navn, fødselsdato, adresse) mangler – de skal fremgå af dokumentationen.
      <a href="#/profil">Udfyld under Profil</a>.</div>` : ""}
    <form class="card stack" id="f-rep">
      <h2>Lav rapport</h2>
      <div class="grid3">
        <label class="span2">Rapport<select name="type" required>
          <option value="samlet">Samlet opgørelse (alle krav)</option>
          ${s.agreement.length ? html`<optgroup label="Uddannelsesaftaler – til underskrift">
            ${s.agreement.map((a) => html`<option value="aftale/${a.id}">Aftale: ${a.title}</option>
              <option value="uddannelsesforloeb/${a.id}">Forløbsrapport: ${a.title}</option>`)}</optgroup>` : ""}
          <optgroup label="Supervisionsforløb – til underskrift af supervisor">
            ${s.course.map((c) => html`<option value="forloeb/${c.id}">${courseLabel(c)}</option>`)}</optgroup>
          <optgroup label="Arbejdsforhold – til underskrift af arbejdsgiver">
            ${s.workplace.map((w) => html`<option value="arbejde/${w.id}">${w.name}</option>`)}</optgroup>
          ${therapists.length ? html`<optgroup label="Egenterapi – til underskrift af terapeut">
            ${therapists.map((t) => html`<option value="egenterapi/${encodeURIComponent(t)}">${t}</option>`)}</optgroup>` : ""}
        </select></label>
        <label class="check self-end"><input type="checkbox" name="detail" checked> Medtag liste over enkeltregistreringer</label>
        <label>Fra dato <small class="muted">(valgfri)</small><input type="date" name="from"></label>
        <label>Til dato <small class="muted">(valgfri)</small><input type="date" name="to"></label>
        <label class="check self-end"><input type="checkbox" name="topics"> Medtag emner/noter</label>
      </div>
      <div><button class="btn primary">Vis rapport</button></div>
      <p class="muted small">Rapporten åbnes som en printvenlig side. Vælg <em>Udskriv → Gem som PDF</em> for at gemme eller sende den.
        Rapporterne dannes lokalt i din browser – intet sendes til serveren.</p>
    </form>
    <section class="card"><h2>Om dokumentationen</h2>
      <p>Ved ansøgning efter overgangsordningen anvendes Sundhedsstyrelsens standardiserede uddannelsesskema (bilag 2, pkt. 6).
      Rapporterne her samler de tal, skemaet efterspørger, så de nemt kan overføres og underskrives:</p>
      <ul>
        <li><strong>Uddannelsesaftale:</strong> selve aftalen (start, forventet slut, uddannelsesansvarlig, praksissted, plan for supervision og
          læringsaktiviteter) til underskrift af psykolog, uddannelsesansvarlig og arbejdsgiver (BEK 247/2026, § 4).</li>
        <li><strong>Forløbsrapport:</strong> opgørelse over et uddannelsesforløb – arbejdstid, konfrontation, supervision, statussamtaler,
          læringsaktiviteter og bilagsfortegnelse – til underskrift af den uddannelsesansvarlige (§ 6, stk. 4 og § 11, stk. 3).</li>
        <li><strong>Supervisionsforløb:</strong> supervisors navn, uddannelsesniveau, arbejdserfaring og arbejdsplads, tilknyttet arbejdsforhold,
          intern/ekstern, timer fordelt på individuel og gruppe (faktisk og omregnet) og dateret underskrift fra supervisor (pkt. 6.3).</li>
        <li><strong>Arbejdsforhold:</strong> arbejdssted og adresse, perioder, timer pr. uge, fravær over 8 uger, konfrontationstimer fordelt på
          udredning/intervention og individer/grupper/organisationer samt dateret underskrift fra arbejdsgiver (pkt. 6.2).</li>
        <li><strong>Egenterapi:</strong> terapeutens navn og autorisation, timer fordelt på individuel og gruppe samt terapeutens underskrift (pkt. 6.4).</li>
      </ul></section>`);
  const form = root.querySelector("#f-rep");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const q = new URLSearchParams();
    for (const k of ["from", "to"]) if (f.get(k)) q.set(k, f.get(k));
    if (f.get("topics")) q.set("topics", "1");
    if (!f.get("detail")) q.set("detail", "0");
    location.hash = `#/rapport/${f.get("type")}${q.toString() ? `?${q}` : ""}`;
  });
}

// ------------------------------------------------------------------ building blocks

function applicant(p) {
  return html`<table class="kv"><tbody>
    <tr><th>Navn</th><td>${p.name || "—"}</td><th>Fødselsdato</th><td>${fmtDate(p.birthdate) || "—"}</td></tr>
    <tr><th>Adresse</th><td>${p.address || "—"}</td><th>Kontakt</th><td>${[p.email, p.phone].filter(Boolean).join(" · ") || "—"}</td></tr>
    ${p.authorizedDate ? html`<tr><th>Autoriseret</th><td colspan="3">${fmtDate(p.authorizedDate)}</td></tr>` : ""}
  </tbody></table>`;
}

const signature = (role, name) => html`<div class="sig">
  <div class="sig-line"><span>Dato</span></div>
  <div class="sig-line wide"><span>Underskrift – ${role}${name ? `: ${name}` : ""}</span></div></div>`;

function periodText(from, to) {
  if (!from && !to) return "Hele perioden";
  return `${from ? fmtDate(from) : "start"} – ${to ? fmtDate(to) : fmtDate(today())}`;
}

function konfMatrix(c, counted = false) {
  const m = counted ? c.matrix : c.rawMatrix;
  const sumA = (a) => Object.values(m[a]).reduce((x, y) => x + y, 0);
  return html`<table class="table matrix"><thead><tr><th></th>${Object.values(TARGETS).map((t) => html`<th class="num">${t}</th>`)}<th class="num">I alt</th></tr></thead>
    <tbody>${Object.entries(ACTIVITIES).map(([a, l]) => html`<tr><th>${l}</th>${Object.keys(TARGETS).map((t) => html`<td class="num">${fmtNum(m[a][t])}</td>`)}
      <td class="num"><strong>${fmtNum(sumA(a))}</strong></td></tr>`)}</tbody>
    <tfoot><tr><th>I alt</th>${Object.keys(TARGETS).map((t) => html`<td class="num">${fmtNum(m.udredning[t] + m.intervention[t])}</td>`)}
      <td class="num"><strong>${fmtNum(sumA("udredning") + sumA("intervention"))}</strong></td></tr></tfoot></table>`;
}

function supervisorBlock(sup) {
  return html`<table class="kv"><tbody>
    <tr><th>Supervisor</th><td>${sup?.name || "—"}</td><th>Uddannelsesniveau</th><td>${sup?.education || "—"}</td></tr>
    <tr><th>Arbejdserfaring</th><td>${sup?.experience || "—"}</td><th>Arbejdsplads</th><td>${sup?.workplace || "—"}</td></tr>
    ${sup?.email || sup?.phone ? html`<tr><th>Kontakt</th><td colspan="3">${[sup.email, sup.phone].filter(Boolean).join(" · ")}</td></tr>` : ""}
  </tbody></table>`;
}

// ------------------------------------------------------------------ report types

function courseReport(s, c, o) {
  const sup = store.get(c.supervisorId);
  const wp = store.get(c.workplaceId);
  const full = supervision(s).perCourse[c.id];
  const pc = supervision(s, o).perCourse[c.id];
  const sessions = s.session.filter((x) => x.courseId === c.id && inRange(x.date, o.from, o.to)).sort((a, b) => a.date.localeCompare(b.date));
  return html`
    <h1>Dokumentation for supervision</h1>
    <p class="doc-sub">Psykologers praksisuddannelse – overgangsordning (BEK nr. 247 af 5. februar 2026, bilag 2, pkt. 3 og 6.3)</p>
    <h2>Ansøger</h2>${applicant(s.profile)}
    <h2>Supervisor</h2>${supervisorBlock(sup)}
    <h2>Forløb</h2>
    <table class="kv"><tbody>
      <tr><th>Arbejdsforhold</th><td>${wp?.name || "—"}${wp?.address ? `, ${wp.address}` : ""}</td><th>Type</th><td><strong>${c.external ? "Ekstern" : "Intern"} supervision</strong></td></tr>
      <tr><th>Periode</th><td>${pc.first ? `${fmtDate(pc.first)} – ${fmtDate(pc.last)}` : "—"}</td><th>Opgørelsesperiode</th><td>${periodText(o.from, o.to)}</td></tr>
      ${c.groupComposition ? html`<tr><th>Gruppens sammensætning</th><td colspan="3">${c.groupComposition}</td></tr>` : ""}
      ${c.external && (sup?.sameAddress || c.externalDocumentation) ? html`<tr><th>Ekstern – bemærkning</th><td colspan="3">
        ${sup?.sameAddress ? "Supervisor har samme arbejdsadresse som ansøger. " : ""}${c.externalDocumentation || ""}</td></tr>` : ""}
    </tbody></table>
    <h2>Timer</h2>
    <table class="table"><thead><tr><th class="num">Individuel</th><th class="num">Gruppe – faktisk</th><th class="num">Gruppe – omregnet</th>
      <th class="num">Heraf via video</th><th class="num">I alt (omregnet)</th></tr></thead>
      <tbody><tr><td class="num">${fmtNum(pc.individual, 2)}</td><td class="num">${fmtNum(pc.groupActual, 2)}</td><td class="num">${fmtNum(pc.groupConverted, 2)}</td>
        <td class="num">${fmtNum(pc.video, 2)}</td><td class="num"><strong>${fmtNum(pc.converted, 2)}</strong></td></tr></tbody></table>
    <p class="small muted">Gruppesupervision omregnes efter pkt. 3.4: 2 supervisander = fuldt, 3–5 = 2/3, 6–12 = 1/2, 13+ medregnes ikke.
      ${!full.eligible ? html`<strong> Bemærk: forløbet har under ${RULES.minCourseHours} omregnede timer i alt og kan ikke medregnes (pkt. 3.5).</strong>` : ""}</p>
    ${o.detail ? html`<h2>Sessioner (${sessions.length})</h2>
      <table class="table"><thead><tr><th>Dato</th><th>Form</th><th class="num">Faktisk</th><th class="num">Omregnet</th>${o.topics ? html`<th>Emne</th>` : ""}</tr></thead>
      <tbody>${sessions.map((x) => html`<tr><td>${fmtDate(x.date)}</td><td>${x.format === "group" ? `Gruppe (${x.groupSize} supervisander)` : "Individuel"}${x.video ? " · video" : ""}</td>
        <td class="num">${fmtNum(x.hours, 2)}</td><td class="num">${fmtNum(convertedHours(x), 2)}</td>${o.topics ? html`<td>${x.topic || ""}</td>` : ""}</tr>`)}</tbody></table>` : ""}
    <h2>Underskrift</h2>
    <p>Undertegnede supervisor bekræfter, at ovenstående supervision er givet som angivet, og at supervisor selv har gennemgået
      praksisuddannelsen og har arbejdet som psykolog i mindst 3 år efter kandidateksamen.</p>
    ${signature("supervisor", sup?.name)}
    ${signature("ansøger", s.profile.name)}`;
}

function workplaceReport(s, wp, o) {
  const c = confrontation(s, { ...o, workplaceId: wp.id });
  const work = workDuration(s, today()).perWorkplace[wp.id] || { years: 0 };
  const entries = c.entries.slice().sort((a, b) => a.date.localeCompare(b.date));
  const courses = s.course.filter((x) => x.workplaceId === wp.id);
  const perCourse = supervision(s, o).perCourse;
  const byMonth = new Map();
  for (const k of entries) {
    const m = k.date.slice(0, 7);
    const r = byMonth.get(m) || { udredning: 0, intervention: 0 };
    r[k.activity] += +k.hours;
    byMonth.set(m, r);
  }
  return html`
    <h1>Dokumentation for arbejdsforhold og konfrontationstimer</h1>
    <p class="doc-sub">Psykologers praksisuddannelse – overgangsordning (BEK nr. 247 af 5. februar 2026, bilag 2, pkt. 1, 2 og 6.2)</p>
    <h2>Ansøger</h2>${applicant(s.profile)}
    <h2>Arbejdsforhold</h2>
    <table class="kv"><tbody>
      <tr><th>Arbejdssted</th><td>${wp.name}</td><th>Adresse</th><td>${wp.address || "—"}</td></tr>
      <tr><th>Stilling</th><td>${wp.position || "—"}</td><th>Arbejdsgiver</th><td>${wp.employer || "—"}</td></tr>
      <tr><th>Opgørelsesperiode</th><td>${periodText(o.from, o.to)}</td><th>Svarer til</th><td>${fmtNum(work.years, 2)} fuldtidsår</td></tr>
    </tbody></table>
    ${wp.selfEmployed ? html`<p><strong>Selvstændig praksis.</strong> Arbejdstiden opgøres ud fra konfrontationstimer (1 time = 2 arbejdstimer, pkt. 1.4).
      Der skal vedlægges revisorerklæring.</p>`
    : html`<h3>Ansættelsesperioder og ugentlig arbejdstid</h3>
      <table class="table"><thead><tr><th>Fra</th><th>Til</th><th class="num">Timer pr. uge</th></tr></thead>
      <tbody>${(wp.periods || []).map((p) => html`<tr><td>${fmtDate(p.from)}</td><td>${p.to ? fmtDate(p.to) : "Igangværende"}</td><td class="num">${fmtNum(p.hoursPerWeek)}</td></tr>`)}</tbody></table>
      <h3>Fravær over 8 sammenhængende uger</h3>
      ${(wp.absences || []).length ? html`<table class="table"><thead><tr><th>Fra</th><th>Til</th><th>Årsag</th></tr></thead>
        <tbody>${wp.absences.map((a) => html`<tr><td>${fmtDate(a.from)}</td><td>${fmtDate(a.to)}</td><td>${a.note || ""}</td></tr>`)}</tbody></table>`
      : html`<p>Intet.</p>`}`}
    <h2>Konfrontationstimer (faktiske)</h2>
    ${konfMatrix(c)}
    <p class="small muted">Heraf indirekte (supervision af andres arbejde): ${fmtNum(c.raw.indirect)} t · via video: ${fmtNum(c.raw.video.udredning)} t udredning, ${fmtNum(c.raw.video.intervention)} t intervention.</p>
    ${o.detail && byMonth.size ? html`<h3>Fordeling pr. måned</h3><table class="table"><thead><tr><th>Måned</th><th class="num">Udredning</th><th class="num">Intervention</th></tr></thead>
      <tbody>${[...byMonth].map(([m, r]) => html`<tr><td>${m}</td><td class="num">${fmtNum(r.udredning)}</td><td class="num">${fmtNum(r.intervention)}</td></tr>`)}</tbody></table>` : ""}
    ${courses.length ? html`<h2>Supervision knyttet til arbejdsforholdet</h2>
      <table class="table"><thead><tr><th>Supervisor</th><th>Type</th><th class="num">Individuel</th><th class="num">Gruppe (omregnet)</th></tr></thead>
      <tbody>${courses.map((x) => html`<tr><td>${store.get(x.supervisorId)?.name || "?"}</td><td>${x.external ? "Ekstern" : "Intern"}</td>
        <td class="num">${fmtNum(perCourse[x.id].individual)}</td><td class="num">${fmtNum(perCourse[x.id].groupConverted)}</td></tr>`)}</tbody></table>` : ""}
    <h2>Underskrift</h2>
    <p>Undertegnede arbejdsgiver bekræfter oplysningerne om ansættelsesperioder, arbejdstid, fravær og konfrontationstimer.</p>
    ${signature("arbejdsgiver", wp.employer)}
    ${signature("ansøger", s.profile.name)}`;
}

function therapyReport(s, therapist, o) {
  const t = therapy({ therapy: s.therapy.filter((x) => x.therapist === therapist) }, o);
  const auth = t.items.find((x) => x.therapistAuth)?.therapistAuth;
  return html`
    <h1>Dokumentation for egenterapi</h1>
    <p class="doc-sub">Psykologers praksisuddannelse – overgangsordning (BEK nr. 247 af 5. februar 2026, bilag 2, pkt. 4 og 6.4)</p>
    <h2>Ansøger</h2>${applicant(s.profile)}
    <h2>Terapeut</h2>
    <table class="kv"><tbody><tr><th>Navn</th><td>${therapist}</td><th>Autorisation</th><td>${auth || "—"}</td></tr>
      <tr><th>Opgørelsesperiode</th><td colspan="3">${periodText(o.from, o.to)}</td></tr></tbody></table>
    <table class="table"><thead><tr><th class="num">Individuel</th><th class="num">Gruppe</th><th class="num">I alt</th></tr></thead>
      <tbody><tr><td class="num">${fmtNum(t.individual, 2)}</td><td class="num">${fmtNum(t.group, 2)}</td><td class="num"><strong>${fmtNum(t.total, 2)}</strong></td></tr></tbody></table>
    ${o.detail ? html`<h3>Sessioner</h3><table class="table"><thead><tr><th>Dato</th><th>Form</th><th class="num">Timer</th></tr></thead>
      <tbody>${t.items.sort((a, b) => a.date.localeCompare(b.date)).map((x) => html`<tr><td>${fmtDate(x.date)}</td><td>${x.format === "group" ? "Gruppe" : "Individuel"}</td><td class="num">${fmtNum(x.hours, 2)}</td></tr>`)}</tbody></table>` : ""}
    <h2>Underskrift</h2>
    ${signature("terapeut", therapist)}
    ${signature("ansøger", s.profile.name)}`;
}

function totalReport(s, o) {
  const scoped = {
    ...s,
    session: s.session.filter((x) => inRange(x.date, o.from, o.to)),
    konf: s.konf.filter((x) => inRange(x.date, o.from, o.to)),
    therapy: s.therapy.filter((x) => inRange(x.date, o.from, o.to)),
  };
  const ev = evaluate(scoped, today());
  const supMap = new Map(s.supervisor.map((x) => [x.id, x]));
  const wpMap = new Map(s.workplace.map((x) => [x.id, x]));
  const unit = (r) => (r.unit === "" ? "" : ` ${r.unit ?? "t"}`);
  const reqVal = (r) => `${fmtNum(r.value, r.decimals ?? 1)}${unit(r)}`;
  return html`
    <h1>Samlet opgørelse – praksisuddannelse</h1>
    <p class="doc-sub">Overgangsordning efter BEK nr. 247 af 5. februar 2026, bilag 2 · Udskrevet ${fmtDate(today())} · ${periodText(o.from, o.to)}</p>
    <h2>Ansøger</h2>${applicant(s.profile)}
    <h2>Status for krav</h2>
    <table class="table"><thead><tr><th>Krav</th><th class="num">Opnået</th><th class="num">Krav</th><th>Status</th><th>Regel</th></tr></thead>
      <tbody>${ev.requirements.map((r) => html`<tr><td>${r.label}${r.note ? html`<br><small>${r.note}</small>` : ""}</td><td class="num">${reqVal(r)}</td>
        <td class="num">${fmtNum(r.target, r.decimals ?? 0)}${unit(r)}</td><td>${r.ok ? "✓ Opfyldt" : "Ikke opfyldt"}</td><td><small>${r.rule}</small></td></tr>`)}</tbody></table>
    ${ev.warnings.length ? html`<h3>Bemærkninger</h3><ul class="small">${ev.warnings.map((w) => html`<li>${w.text}</li>`)}</ul>` : ""}

    <h2>Arbejdsforhold</h2>
    <table class="table"><thead><tr><th>Arbejdssted</th><th>Perioder (timer/uge)</th><th class="num">Fuldtidsår</th>
      <th class="num">Udredning</th><th class="num">Intervention</th></tr></thead>
      <tbody>${s.workplace.map((w) => {
        const c = confrontation(scoped, { workplaceId: w.id });
        return html`<tr><td>${w.name}<br><small>${w.address || ""}</small></td>
          <td><small>${w.selfEmployed ? "Selvstændig praksis" : (w.periods || []).map((p) => `${fmtDate(p.from)}–${p.to ? fmtDate(p.to) : "nu"} (${fmtNum(p.hoursPerWeek)})`).join("; ")}</small></td>
          <td class="num">${fmtNum(ev.work.perWorkplace[w.id]?.years || 0, 2)}</td>
          <td class="num">${fmtNum(c.counted.udredning)}</td><td class="num">${fmtNum(c.counted.intervention)}</td></tr>`;
      })}</tbody></table>
    <h3>Konfrontationstimer i alt (medregnede)</h3>
    ${konfMatrix(ev.konf, true)}

    <h2>Supervision</h2>
    <table class="table"><thead><tr><th>Supervisor</th><th>Arbejdsforhold</th><th>Type</th><th class="num">Individuel</th>
      <th class="num">Gruppe faktisk</th><th class="num">Gruppe omregnet</th><th class="num">Video</th><th>Tæller</th></tr></thead>
      <tbody>${s.course.map((c) => {
        const pc = ev.sup.perCourse[c.id];
        if (!pc.sessions) return "";
        const sup = supMap.get(c.supervisorId);
        return html`<tr><td>${sup?.name || "?"}<br><small>${sup?.education || ""}</small></td><td><small>${wpMap.get(c.workplaceId)?.name || ""}</small></td>
          <td>${c.external ? "Ekstern" : "Intern"}</td><td class="num">${fmtNum(pc.individual)}</td><td class="num">${fmtNum(pc.groupActual)}</td>
          <td class="num">${fmtNum(pc.groupConverted)}</td><td class="num">${fmtNum(pc.video)}</td><td>${pc.eligible ? "Ja" : "Nej"}</td></tr>`;
      })}</tbody>
      <tfoot><tr><th colspan="3">Medregnet i alt</th><td class="num">${fmtNum(ev.sup.totals.individual)}</td><td class="num">${fmtNum(ev.sup.totals.groupActual)}</td>
        <td class="num">${fmtNum(ev.sup.totals.group)}</td><td class="num">${fmtNum(ev.sup.totals.video)}</td><td>${fmtNum(ev.sup.totals.total)} t</td></tr></tfoot></table>
    <p class="small">Egenterapi: ${fmtNum(ev.therapy.total)} t registreret, heraf ${fmtNum(ev.therapy.counted)} t medregnet (maks. ${RULES.therapyMax}).</p>

    <h2>Erklæring på tro og love</h2>
    <p>Undertegnede erklærer på tro og love, at de afgivne oplysninger er korrekte.</p>
    ${signature("ansøger", s.profile.name)}`;
}

// ------------------------------------------------------------------ uddannelsesaftaler

const box = (on) => (on ? "☒" : "☐");

function responsibleBlock(a) {
  return html`<table class="kv"><tbody>
    <tr><th>Navn</th><td>${a.respName || "—"}</td><th>Stilling/titel</th><td>${a.respTitle || "—"}</td></tr>
    <tr><th>Arbejdssted</th><td>${a.respOrg || "—"}</td><th>Autorisations-ID</th><td>${a.respAuthId || "—"}</td></tr>
    ${a.respEmail || a.respPhone ? html`<tr><th>Kontakt</th><td colspan="3">${[a.respEmail, a.respPhone].filter(Boolean).join(" · ")}</td></tr>` : ""}
  </tbody></table>
  <p class="small">${box(a.respQualified)} Opfylder kravene til supervisor (§ 12, stk. 2)<br>${box(a.respInstruction)} Har instruktionsbeføjelse/tilsvarende fagligt ansvar (§ 11, stk. 2)<br>
    ${box(a.respExternal)} Ekstern uddannelsesansvarlig (§ 4, stk. 5)</p>`;
}

function agreementSignatures(a, wps, selfEmployed) {
  const employer = !selfEmployed && a.employerSigner && a.employerSigner.trim().toLowerCase() !== (a.respName || "").trim().toLowerCase();
  return html`${signature("uddannelsessøgende psykolog", store.profile().name)}
    ${signature(a.respExternal ? "ekstern uddannelsesansvarlig" : "uddannelsesansvarlig", a.respName)}
    ${employer ? signature(`arbejdsgiver${wps.length === 1 ? ` (${wps[0].name})` : ""}`, a.employerSigner) : ""}`;
}

function agreementReport(s, a) {
  const wps = s.workplace.filter((w) => (a.workplaceIds || []).includes(w.id));
  const selfEmployed = wps.some((w) => w.selfEmployed);
  const courses = s.course.filter((c) => (a.courseIds || []).includes(c.id));
  const t = TEMPLATES[a.template];
  const sections = SECTIONS.filter((sec) => (!sec.scheme || sec.scheme === a.scheme) && a.sections?.[sec.key]);
  let n = 4;
  return html`
    <h1>Uddannelsesaftale</h1>
    <p class="doc-sub">Psykologers praksisuddannelse – BEK nr. 247 af 5. februar 2026, § 4 · ${SCHEMES[a.scheme] || SCHEMES.overgang}${t ? ` · ${t.long}` : ""}</p>
    <h2>1. Uddannelsessøgende psykolog</h2>${applicant(s.profile)}
    <h2>2. Praksissted${wps.length > 1 ? "er" : ""}</h2>
    <table class="table"><thead><tr><th>Praksissted</th><th>Adresse</th><th>Arbejdsgiver/kontakt</th></tr></thead>
      <tbody>${wps.map((w) => html`<tr><td>${w.name}${w.selfEmployed ? " (selvstændig praksis)" : ""}</td><td>${w.address || "—"}</td><td>${w.employer || "—"}</td></tr>`)}</tbody></table>
    <h2>3. Uddannelsesansvarlig</h2>${responsibleBlock(a)}
    <h2>4. Periode og omfang</h2>
    <table class="kv"><tbody>
      <tr><th>Startdato</th><td>${fmtDate(a.start) || "—"}</td><th>Forventet slutdato</th><td>${fmtDate(a.expectedEnd) || "—"}</td></tr>
      <tr><th>Ugentlig arbejdstid</th><td colspan="3">${selfEmployed ? "Selvstændig praksis – opgøres ud fra konfrontationstimer" : a.hoursPerWeek ? `${fmtNum(a.hoursPerWeek)} timer` : "—"}</td></tr>
    </tbody></table>
    ${sections.map((sec) => html`<h2>${++n}. ${sec.label}</h2><p class="pre">${a.sections[sec.key]}</p>`)}
    ${courses.length ? html`<h2>${++n}. Supervisionsforløb</h2>
      <table class="table"><thead><tr><th>Supervisor</th><th>Uddannelse</th><th>Type</th><th>Form</th></tr></thead>
      <tbody>${courses.map((c) => { const sup = store.get(c.supervisorId); return html`<tr><td>${sup?.name || "?"}</td><td><small>${sup?.education || ""}</small></td>
        <td>${c.external ? "Ekstern" : "Intern"}</td><td>${c.defaultFormat === "group" ? `Gruppe (${c.defaultGroupSize || "?"} supervisander)` : "Individuel"}</td></tr>`; })}</tbody></table>` : ""}
    ${a.note ? html`<h2>${++n}. Øvrige aftaler</h2><p class="pre">${a.note}</p>` : ""}
    <h2>Underskrifter</h2>
    <p>Parterne har indgået denne uddannelsesaftale forud for den periode, aftalen omfatter. Aftalen ændrer ikke i sig selv ansættelsesforholdet.</p>
    ${agreementSignatures(a, wps, selfEmployed)}`;
}

function progressReport(s, a, o) {
  const st = agreementStatus(a, s, today());
  const from = o.from || a.start;
  const to = o.to || st.end;
  const wps = s.workplace.filter((w) => (a.workplaceIds || []).includes(w.id));
  const wpIds = wps.map((w) => w.id);
  const work = workDuration(s, today(), { from, to, workplaceIds: wpIds });
  const konf = confrontation({ ...s, konf: s.konf.filter((k) => wpIds.includes(k.workplaceId)) }, { from, to });
  const perCourse = supervision(s, { from, to }).perCourse;
  const courses = st.courses;
  const log = st.log.filter((x) => inRange(x.date, from, to)).sort((x, y) => x.date.localeCompare(y.date));
  const atts = store.attachments(a.id).slice().sort((x, y) => (x.docDate || x.createdAt || "").localeCompare(y.docDate || y.createdAt || ""));
  const ppu = a.scheme === "ppu";
  const sum = (k) => courses.reduce((t, c) => t + (perCourse[c.id]?.[k] || 0), 0);
  const actHours = log.filter((x) => x.type === "activity").reduce((t, x) => t + (+x.hours || 0), 0);
  const extHours = courses.filter((c) => c.external).reduce((t, c) => t + perCourse[c.id].individual + perCourse[c.id].groupActual, 0);
  const final = !!(a.endDate && to >= a.endDate);
  return html`
    <h1>${final ? "Afsluttende forløbsrapport" : "Forløbsrapport"} – praksisuddannelse</h1>
    <p class="doc-sub">Dokumentation for varighed og forløb (BEK nr. 247 af 5. februar 2026, § 6, stk. 4 og § 11, stk. 3) · ${SCHEMES[a.scheme] || SCHEMES.overgang} · Opgørelse ${periodText(from, to)}</p>
    <h2>Uddannelsessøgende psykolog</h2>${applicant(s.profile)}
    <h2>Uddannelsesaftale</h2>
    <table class="kv"><tbody>
      <tr><th>Aftale</th><td>${a.title}</td><th>Aftaleperiode</th><td>${agreementPeriod(a)}</td></tr>
      <tr><th>Praksissted(er)</th><td>${wps.map((w) => w.name).join(", ") || "—"}</td><th>Underskrevet</th><td>${fmtDate(a.signedDate) || "—"}</td></tr>
      <tr><th>Uddannelsesansvarlig</th><td colspan="3">${a.respName || "—"}${a.respTitle ? `, ${a.respTitle}` : ""}${a.respOrg ? ` (${a.respOrg})` : ""}</td></tr>
    </tbody></table>

    <h2>Arbejdstid</h2>
    <table class="table"><thead><tr><th>Praksissted</th><th>Perioder (timer/uge)</th><th class="num">Fuldtidsår i opgørelsen</th></tr></thead>
      <tbody>${wps.map((w) => html`<tr><td>${w.name}</td>
        <td><small>${w.selfEmployed ? "Selvstændig – 600 konfrontationstimer = 1 fuldtidsår" : (w.periods || []).filter((p) => (!to || p.from <= to) && (!p.to || !from || p.to >= from))
          .map((p) => `${fmtDate(p.from)}–${p.to ? fmtDate(p.to) : "nu"} (${fmtNum(p.hoursPerWeek)})`).join("; ")}</small></td>
        <td class="num">${fmtNum(work.perWorkplace[w.id]?.years || 0, 2)}</td></tr>`)}</tbody>
      <tfoot><tr><th colspan="2">I alt (samtidige ansættelser højst fuld tid)</th><td class="num"><strong>${fmtNum(work.years, 2)}</strong></td></tr></tfoot></table>
    ${(a.absences || []).length ? html`<h3>Fravær ud over ferie</h3>
      <table class="table"><thead><tr><th>Fra</th><th>Til</th><th>Årsag</th></tr></thead>
      <tbody>${a.absences.map((x) => html`<tr><td>${fmtDate(x.from)}</td><td>${fmtDate(x.to)}</td><td>${x.note || ""}</td></tr>`)}</tbody></table>
      <p class="small">Fravær i alt: ${st.absenceDays} dage = ${fmtNum(st.absenceShare * 100, 1)} % af aftaleperioden${ppu ? " (over 10 % indgår ikke, § 6, stk. 3)" : ""}.</p>` : ""}

    <h2>Konfrontationstimer i perioden</h2>
    ${konfMatrix(konf)}
    <p class="small muted">Faktiske timer. Heraf indirekte: ${fmtNum(konf.raw.indirect)} t · via video: ${fmtNum(konf.raw.video.udredning)} t udredning, ${fmtNum(konf.raw.video.intervention)} t intervention.</p>

    <h2>Supervision i perioden</h2>
    ${courses.length ? html`<table class="table"><thead><tr><th>Supervisor</th><th>Type</th><th class="num">Individuel</th><th class="num">Gruppe faktisk</th>
      <th class="num">Gruppe omregnet</th><th class="num">Video</th></tr></thead>
      <tbody>${courses.map((c) => { const pc = perCourse[c.id]; return html`<tr><td>${store.get(c.supervisorId)?.name || "?"}</td><td>${c.external ? "Ekstern" : "Intern"}</td>
        <td class="num">${fmtNum(pc.individual)}</td><td class="num">${fmtNum(pc.groupActual)}</td><td class="num">${fmtNum(pc.groupConverted)}</td><td class="num">${fmtNum(pc.video)}</td></tr>`; })}</tbody>
      <tfoot><tr><th colspan="2">I alt</th><td class="num">${fmtNum(sum("individual"))}</td><td class="num">${fmtNum(sum("groupActual"))}</td>
        <td class="num">${fmtNum(sum("groupConverted"))}</td><td class="num">${fmtNum(sum("video"))}</td></tr></tfoot></table>`
    : html`<p>Ingen supervisionsforløb er knyttet til aftalen.</p>`}

    ${ppu ? html`<h2>Læringsaktiviteter (§ 9, stk. 3 og § 10)</h2>
      <table class="table"><tbody>
        <tr><td>Supervision (faktiske timer)</td><td class="num">${fmtNum(sum("individual") + sum("groupActual"))} t</td></tr>
        <tr><td>Øvrige læringsaktiviteter</td><td class="num">${fmtNum(actHours)} t</td></tr>
        <tr><th>Læringsaktiviteter i alt <small>(krav for hele uddannelsen: ${PPU.learningHours} t)</small></th><td class="num"><strong>${fmtNum(sum("individual") + sum("groupActual") + actHours)} t</strong></td></tr>
        <tr><td>Heraf ekstern supervision <small>(krav: ${PPU.externalHours} t, jf. dog § 10, stk. 2)</small></td><td class="num">${fmtNum(extHours)} t</td></tr>
      </tbody></table>` : ""}

    <h2>Statussamtaler og læringsaktiviteter</h2>
    ${log.length ? html`<table class="table"><thead><tr><th>Dato</th><th>Type</th><th>Titel</th><th class="num">Timer</th></tr></thead>
      <tbody>${log.map((x) => html`<tr><td>${fmtDate(x.date)}</td><td>${x.type === "activity" ? "Læringsaktivitet" : "Statussamtale"}</td>
        <td>${x.title}${o.topics && x.note ? html`<br><small class="pre">${x.note}</small>` : ""}</td><td class="num">${x.hours ? fmtNum(x.hours, 2) : ""}</td></tr>`)}</tbody></table>`
    : html`<p>Ingen registreret i perioden.</p>`}

    ${o.detail ? html`<h2>Bilagsfortegnelse</h2>
      ${atts.length ? html`<table class="table"><thead><tr><th>Nr.</th><th>Dokument</th><th>Type</th><th>Dato</th><th class="num">Størrelse</th></tr></thead>
        <tbody>${atts.map((x, i) => html`<tr><td>${i + 1}</td><td>${x.name}${x.note ? html`<br><small>${x.note}</small>` : ""}</td><td>${x.docType || ""}</td>
          <td>${fmtDate(x.docDate || x.createdAt?.slice(0, 10))}</td><td class="num">${fmtBytes(x.size || 0)}</td></tr>`)}</tbody></table>`
      : html`<p>Ingen bilag.</p>`}` : ""}

    ${st.warnings.length ? html`<h3>Bemærkninger</h3><ul class="small">${st.warnings.map((w) => html`<li>${w.text}</li>`)}</ul>` : ""}

    <h2>Den uddannelsesansvarliges vurdering</h2>
    <p>Undertegnede uddannelsesansvarlige bekræfter, at ovenstående giver et retvisende billede af varighed og forløb af praksisuddannelsen
      i den pågældende uddannelsesaftale${final ? ", og at forløbet er afsluttet" : ""}.</p>
    <div class="write-lines"><span></span><span></span><span></span></div>
    ${signature(a.respExternal ? "ekstern uddannelsesansvarlig" : "uddannelsesansvarlig", a.respName)}
    ${signature("uddannelsessøgende psykolog", s.profile.name)}`;
}

// ------------------------------------------------------------------ view

export function reportView(root, { args, query }) {
  const s = store.snapshot();
  const o = { from: query.get("from") || null, to: query.get("to") || null, topics: query.get("topics") === "1", detail: query.get("detail") !== "0" };
  const [type, id] = args;
  let body;
  let title = "Rapport";
  if (type === "aftale" && store.get(id)?.kind === "agreement") { body = agreementReport(s, store.get(id)); title = store.get(id).title; }
  else if (type === "uddannelsesforloeb" && store.get(id)?.kind === "agreement") { body = progressReport(s, store.get(id), o); title = `Forløbsrapport – ${store.get(id).title}`; }
  else if (type === "forloeb" && store.get(id)?.kind === "course") { body = courseReport(s, store.get(id), o); title = `Supervision – ${courseLabel(store.get(id))}`; }
  else if (type === "arbejde" && store.get(id)?.kind === "workplace") { body = workplaceReport(s, store.get(id), o); title = `Arbejdsforhold – ${store.get(id).name}`; }
  else if (type === "egenterapi" && id) { body = therapyReport(s, id, o); title = `Egenterapi – ${id}`; }
  else { body = totalReport(s, o); title = "Samlet opgørelse"; }
  document.title = `${title} – Supervisionsregnskab`;
  mount(root, html`
    <div class="report-toolbar no-print">
      <a class="btn ghost" href="${(type === "aftale" || type === "uddannelsesforloeb") && id ? `#/aftaler/${id}` : "#/rapporter"}">← Tilbage</a>
      <button class="btn primary" id="print">Udskriv / Gem som PDF</button>
    </div>
    <article class="report">${body}
      <footer class="report-foot">Dannet med Supervisionsregnskab ${fmtDate(today())}. Beregningerne er vejledende; Styrelsen for Patientsikkerhed træffer afgørelse.</footer>
    </article>`);
  root.querySelector("#print").onclick = () => window.print();
}
