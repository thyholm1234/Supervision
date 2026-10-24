// "Profil": personal details for reports, password change, export/import and account deletion.
import { api } from "../api.js";
import { deriveKeys, passwordValid, unwrapDek } from "../crypto.js";
import { html, mount, today } from "../html.js";
import { clearKey, saveKey } from "../keystore.js";
import * as store from "../store.js";
import { busy, confirmDialog, formDialog, readForm, showError, toast } from "../ui.js";
import { passwordField, passwordMaterial, wirePasswordChecks } from "./auth.js";
import { createBackup, readBackup, restoreBackup, unlockBackup } from "../backup.js";
import { ACTIVITIES, TARGETS, convertedHours } from "../rules.js";

function download(name, content, type) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
const dec = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

export function profileView(root, { me, rerender }) {
  const p = store.profile();
  mount(root, html`
    <h1>Profil</h1>
    <form class="card stack" id="f-profile">
      <h2>Personoplysninger <small class="muted">(til rapporterne – krypteres)</small></h2>
      <div class="grid2">
        <label>Fulde navn<input name="name" value="${p.name || ""}" autocomplete="name"></label>
        <label>Fødselsdato<input type="date" name="birthdate" value="${p.birthdate || ""}" autocomplete="bday"></label>
        <label>Adresse<input name="address" value="${p.address || ""}" autocomplete="street-address"></label>
        <label>E-mail<input type="email" name="email" value="${p.email || ""}" autocomplete="email"></label>
        <label>Telefon<input name="phone" value="${p.phone || ""}" autocomplete="tel"></label>
        <label>Dato for autorisation<input type="date" name="authorizedDate" value="${p.authorizedDate || ""}"></label>
      </div>
      <div><button class="btn primary">Gem</button></div>
    </form>

    <form class="card stack" id="f-pw">
      <h2>Skift adgangskode</h2>
      <input type="text" name="username" value="${me.username}" autocomplete="username" hidden>
      <label>Nuværende adgangskode<input type="password" name="old" required autocomplete="current-password"></label>
      <label>Ny adgangskode<input type="password" name="password" required autocomplete="new-password"></label>
      <ul class="pw-checks" data-for="password"><li>Mindst 12 tegn</li><li>Små bogstaver (a-z)</li><li>Store bogstaver (A-Z)</li><li>Tal (0-9)</li><li>Specialtegn (fx ! ? # % & @)</li></ul>
      <label>Gentag ny adgangskode<input type="password" name="password2" required autocomplete="new-password"></label>
      <p class="form-error" hidden></p>
      <p class="muted small">Dine data skal ikke krypteres om – kun nøglen pakkes ind med den nye adgangskode. Andre enheder logges ud. Din gendannelseskode gælder fortsat.</p>
      <div><button class="btn primary">Skift adgangskode</button></div>
    </form>

    <section class="card stack">
      <h2>Backup</h2>
      <p class="muted">Backuppen er en ZIP-fil med alle dine registreringer og uploadede dokumenter, krypteret med AES-256-GCM
        under en backup-adgangskode, som du vælger. Den kan gendannes på denne eller en anden konto – også hvis du har mistet adgangen til kontoen.</p>
      <div class="row wrap">
        <button class="btn primary" id="exp-zip">Download krypteret backup (ZIP)</button>
        <label class="btn ghost file-btn">Importér backup<input type="file" id="imp" accept=".zip,application/zip,application/json,.json" hidden></label>
      </div>
      <h3>Eksport til regneark</h3>
      <p class="muted small">CSV-filer er <strong>ikke</strong> krypterede – opbevar dem forsvarligt.</p>
      <div class="row wrap">
        <button class="btn ghost" id="exp-sup">Supervision (CSV)</button>
        <button class="btn ghost" id="exp-konf">Konfrontation (CSV)</button>
      </div>
    </section>

    <section class="card stack">
      <h2>Sikkerhed</h2>
      <ul class="small">
        <li>Data krypteres med AES-256-GCM i din browser. Nøglen afledes af din adgangskode (PBKDF2-SHA256, 600.000 iterationer) og forlader aldrig din enhed.</li>
        <li>Serveren gemmer kun krypterede data, dit brugernavn og tekniske tidsstempler. Hverken serverens ejer eller administratorer kan læse dine registreringer.</li>
        <li>Appen låser sig selv efter 30 minutters inaktivitet.</li>
        <li>Mister du både adgangskode og gendannelseskode, kan dine data ikke gendannes af nogen.</li>
      </ul>
    </section>

    <form class="card stack danger-zone" id="f-del">
      <h2>Slet konto</h2>
      <p>Sletter din konto og alle dine krypterede data på serveren permanent.</p>
      <input type="text" name="username" value="${me.username}" autocomplete="username" hidden>
      <label>Bekræft med adgangskode<input type="password" name="password" required autocomplete="current-password"></label>
      <p class="form-error" hidden></p>
      <div><button class="btn danger">Slet min konto</button></div>
    </form>`);

  const fp = root.querySelector("#f-profile");
  fp.addEventListener("submit", (ev) => {
    ev.preventDefault();
    busy(ev.submitter, async () => {
      await store.save("profile", { ...store.profile(), ...readForm(fp) });
      toast("Profil gemt");
    });
  });

  const fpw = root.querySelector("#f-pw");
  wirePasswordChecks(fpw);
  fpw.addEventListener("submit", (ev) => {
    ev.preventDefault();
    busy(ev.submitter, async () => {
      showError(fpw, "");
      const { old, password, password2 } = readForm(fpw);
      if (!passwordValid(password)) return showError(fpw, "Den nye adgangskode opfylder ikke kravene.");
      if (password !== password2) return showError(fpw, "Adgangskoderne er ikke ens.");
      try {
        const cur = await api("GET", "/api/me");
        const oldKeys = await deriveKeys(old, cur.salt, cur.iterations);
        let dek;
        try { dek = await unwrapDek(cur.wrapped_dek, cur.dek_iv, oldKeys.kek, true); } catch { throw new Error("Den nuværende adgangskode er forkert."); }
        const mat = await passwordMaterial(password, dek);
        await api("POST", "/api/password", { old_auth_key: oldKeys.authKey, ...mat });
        const { kek } = await deriveKeys(password, mat.salt, mat.iterations);
        const sealed = await unwrapDek(mat.wrapped_dek, mat.dek_iv, kek);
        store.setKey(sealed);
        await saveKey(me.username, sealed);
        Object.assign(me, { salt: mat.salt, iterations: mat.iterations, wrapped_dek: mat.wrapped_dek, dek_iv: mat.dek_iv });
        fpw.reset();
        toast("Adgangskoden er skiftet");
      } catch (e) {
        showError(fpw, e.message);
      }
    });
  });

  const backupPassword = (title, body, onSubmit, submitLabel) => formDialog(title, body, { onSubmit, submitLabel,
    onMount: (f) => f.elements.password2 && wirePasswordChecks(f) });

  root.querySelector("#exp-zip").onclick = () => backupPassword("Krypteret backup", html`
    <p>Vælg en adgangskode til backuppen. Du skal bruge den for at gendanne – <strong>uden den kan backuppen ikke åbnes af nogen</strong>.
      Du kan godt bruge din login-adgangskode.</p>
    ${passwordField("password", "Backup-adgangskode")}
    <label>Gentag adgangskode<input type="password" name="password2" required autocomplete="new-password"></label>
    <p class="muted small progress" aria-live="polite"></p>`, async (f) => {
    const { password, password2 } = readForm(f);
    if (!passwordValid(password)) throw new Error("Adgangskoden opfylder ikke kravene.");
    if (password !== password2) throw new Error("Adgangskoderne er ikke ens.");
    const progress = f.querySelector(".progress");
    progress.textContent = "Afleder nøgle…";
    const res = await createBackup(password, (t) => (progress.textContent = t));
    download(`supervisionsregnskab-backup-${today()}.zip`, res.blob, "application/zip");
    toast(`Backup lavet: ${res.items} poster og ${res.files} dokumenter`);
    if (res.missing) toast(`${res.missing} dokument(er) kunne ikke hentes fra serveren og er ikke med.`, "error");
  }, "Lav backup");

  root.querySelector("#exp-sup").onclick = () => {
    const rows = [["Dato", "Supervisor", "Type", "Form", "Antal supervisander", "Timer", "Omregnet", "Video", "Emne"]];
    for (const x of store.all("session").sort((a, b) => a.date.localeCompare(b.date))) {
      const c = store.get(x.courseId);
      rows.push([x.date, store.get(c?.supervisorId)?.name, c?.external ? "Ekstern" : "Intern", x.format === "group" ? "Gruppe" : "Individuel",
        x.groupSize || "", dec(x.hours), dec(convertedHours(x)), x.video ? "Ja" : "Nej", x.topic]);
    }
    download(`supervision-${today()}.csv`, csv(rows), "text/csv");
  };
  root.querySelector("#exp-konf").onclick = () => {
    const rows = [["Dato", "Arbejdsforhold", "Aktivitet", "Målgruppe", "Timer", "Indirekte", "Video", "Note"]];
    for (const k of store.all("konf").sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([k.date, store.get(k.workplaceId)?.name, ACTIVITIES[k.activity], TARGETS[k.target], dec(k.hours), k.indirect ? "Ja" : "Nej", k.video ? "Ja" : "Nej", k.note]);
    }
    download(`konfrontation-${today()}.csv`, csv(rows), "text/csv");
  };
  root.querySelector("#imp").onchange = async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    try {
      if (/\.json$/i.test(file.name) || file.type === "application/json") return await importLegacyJSON(file);
      const backup = await readBackup(file);
      await backupPassword("Gendan backup", html`
        <p>Indtast adgangskoden til <strong>${file.name}</strong>. Poster, der allerede findes, springes over.</p>
        <label>Backup-adgangskode<input type="password" name="password" required autocomplete="off"></label>
        <p class="muted small progress" aria-live="polite"></p>`, async (f) => {
        const progress = f.querySelector(".progress");
        progress.textContent = "Dekrypterer…";
        const unlocked = await unlockBackup(backup, f.elements.password.value);
        const res = await restoreBackup(backup, unlocked, (t) => (progress.textContent = t));
        toast(`Gendannet fra backup lavet ${unlocked.data.exported?.slice(0, 10) || ""}: ${res.items} nye poster, ${res.files} nye dokumenter`);
        if (res.failed.length) toast(`${res.failed.length} dokument(er) kunne ikke gendannes: ${res.failed.slice(0, 3).join("; ")}`, "error");
        rerender();
      }, "Gendan");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  async function importLegacyJSON(file) {
    const data = JSON.parse(await file.text());
    if (data.format !== "supervisionsregnskab/v1" || !Array.isArray(data.items)) throw new Error("Filen er ikke en gyldig backup.");
    if (!(await confirmDialog(`Importér ${data.items.length} poster fra en ældre JSON-backup? Eksisterende poster med samme id springes over.`, { ok: "Importér", danger: false }))) return;
    await store.importAll(data.items);
    toast("Import gennemført");
    rerender();
  }

  const fdel = root.querySelector("#f-del");
  fdel.addEventListener("submit", (ev) => {
    ev.preventDefault();
    busy(ev.submitter, async () => {
      showError(fdel, "");
      if (!(await confirmDialog("Er du helt sikker? Alle dine data slettes permanent og kan ikke gendannes.", { ok: "Slet alt" }))) return;
      try {
        const cur = await api("GET", "/api/me");
        const { authKey } = await deriveKeys(fdel.elements.password.value, cur.salt, cur.iterations);
        await api("POST", "/api/account/delete", { auth_key: authKey });
        await clearKey();
        location.hash = "";
        location.reload();
      } catch (e) {
        showError(fdel, e.message);
      }
    });
  });
}
