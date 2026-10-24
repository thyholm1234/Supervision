// Login, sign-up, recovery and unlock screens.
import { api } from "../api.js";
import {
  b64e, deriveKeys, generateDek, generateRecoveryCode, ITERATIONS, normalizeRecoveryCode, passwordChecks,
  passwordValid, randomBytes, unwrapDek, wrapDek,
} from "../crypto.js";
import { html, mount } from "../html.js";
import { busy, readForm, showError } from "../ui.js";

const brand = html`<div class="auth-brand"><img src="/static/icons/icon.svg" alt="" width="48" height="48">
  <div><h1>Supervisionsregnskab</h1><p class="muted">Hold styr på supervision og konfrontationstimer frem mod autorisation som klinisk psykolog</p></div></div>`;

const e2eNote = html`<p class="e2e-note"><span aria-hidden="true">🔒</span> Dine data krypteres i browseren, før de sendes.
  Serveren gemmer kun krypterede data og kan ikke læse dem – heller ikke serverens ejer.</p>`;

export function passwordField(name = "password", label = "Adgangskode", autocomplete = "new-password") {
  return html`<label>${label}<input type="password" name="${name}" required autocomplete="${autocomplete}" minlength="12"></label>
    <ul class="pw-checks" data-for="${name}">${passwordChecks("").map((c) => html`<li>${c.label}</li>`)}</ul>`;
}

export function wirePasswordChecks(form, name = "password") {
  const input = form.elements[name];
  const list = form.querySelector(`.pw-checks[data-for="${name}"]`);
  const update = () => {
    passwordChecks(input.value).forEach((c, i) => list.children[i].classList.toggle("ok", c.ok));
  };
  input.addEventListener("input", update);
  update();
}

/** Material the server needs for a (new) password: salt, iterations, auth key, wrapped DEK. */
export async function passwordMaterial(password, dek) {
  const salt = b64e(randomBytes(16));
  const { authKey, kek } = await deriveKeys(password, salt, ITERATIONS);
  return { salt, iterations: ITERATIONS, auth_key: authKey, ...(await wrapDek(dek, kek)) };
}

export function loginView(root, { onAuthenticated }) {
  mount(root, html`<main class="auth">
    ${brand}
    <div class="card auth-card">
      <div class="tabs" role="tablist">
        <button role="tab" class="tab active" data-tab="login">Log ind</button>
        <button role="tab" class="tab" data-tab="signup">Opret bruger</button>
        <button role="tab" class="tab" data-tab="recover">Glemt adgangskode</button>
      </div>
      <form id="f-login" class="stack" autocomplete="on">
        <label>Brugernavn<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label>Adgangskode<input type="password" name="password" required autocomplete="current-password"></label>
        <p class="form-error" hidden></p>
        <button class="btn primary">Log ind</button>
      </form>
      <form id="f-signup" class="stack" hidden>
        <label>Brugernavn<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"
          pattern="[A-Za-z0-9._\\-]{3,40}" title="3-40 tegn: bogstaver a-z, tal, punktum, bindestreg eller understreg">
          <small class="muted">Brug gerne et pseudonym – brugernavnet er det eneste serveren kan se. Navn og adresse til rapporter indtastes senere og krypteres.</small></label>
        ${passwordField()}
        <label>Gentag adgangskode<input type="password" name="password2" required autocomplete="new-password"></label>
        <p class="form-error" hidden></p>
        <button class="btn primary">Opret bruger</button>
      </form>
      <form id="f-recover" class="stack" hidden>
        <p class="muted">Pga. end-to-end-krypteringen kan ingen nulstille din adgangskode for dig. Brug den gendannelseskode, du fik, da du oprettede dig.</p>
        <label>Brugernavn<input name="username" required autocomplete="username" autocapitalize="none"></label>
        <label>Gendannelseskode<input name="code" required autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label>
        ${passwordField("password", "Ny adgangskode")}
        <label>Gentag ny adgangskode<input type="password" name="password2" required autocomplete="new-password"></label>
        <p class="form-error" hidden></p>
        <button class="btn primary">Gendan adgang</button>
      </form>
      ${e2eNote}
    </div>
  </main>`);

  const forms = { login: root.querySelector("#f-login"), signup: root.querySelector("#f-signup"), recover: root.querySelector("#f-recover") };
  root.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    root.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    Object.entries(forms).forEach(([k, f]) => (f.hidden = k !== t.dataset.tab));
  }));
  wirePasswordChecks(forms.signup);
  wirePasswordChecks(forms.recover);

  forms.login.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    busy(btn, async () => {
      showError(forms.login, "");
      btn.textContent = "Beregner nøgler…";
      try {
        const { username, password } = readForm(forms.login);
        const pre = await api("POST", "/api/prelogin", { username });
        const { authKey, kek } = await deriveKeys(password, pre.salt, pre.iterations);
        const me = await api("POST", "/api/login", { username, auth_key: authKey });
        const dek = await unwrapDek(me.wrapped_dek, me.dek_iv, kek);
        await onAuthenticated(me, dek);
      } catch (e) {
        showError(forms.login, e.message);
      }
    });
  });

  forms.signup.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    busy(btn, async () => {
      showError(forms.signup, "");
      const { username, password, password2 } = readForm(forms.signup);
      if (!passwordValid(password)) return showError(forms.signup, "Adgangskoden opfylder ikke kravene.");
      if (password !== password2) return showError(forms.signup, "Adgangskoderne er ikke ens.");
      btn.textContent = "Opretter krypteringsnøgler…";
      try {
        const dek = await generateDek();
        const code = generateRecoveryCode();
        const rec_salt = b64e(randomBytes(16));
        const rec = await deriveKeys(normalizeRecoveryCode(code), rec_salt, ITERATIONS);
        const recWrap = await wrapDek(dek, rec.kek);
        const pw = await passwordMaterial(password, dek);
        const me = await api("POST", "/api/signup", {
          username, ...pw, rec_salt, rec_auth_key: rec.authKey, rec_wrapped_dek: recWrap.wrapped_dek, rec_dek_iv: recWrap.dek_iv,
        });
        // Keep only a non-extractable copy of the DEK from here on.
        const { kek } = await deriveKeys(password, pw.salt, pw.iterations);
        const sealed = await unwrapDek(pw.wrapped_dek, pw.dek_iv, kek);
        showRecoveryCode(root, username, code, () => onAuthenticated(me, sealed, { firstRun: true }));
      } catch (e) {
        showError(forms.signup, e.message);
      }
    });
  });

  forms.recover.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    busy(btn, async () => {
      showError(forms.recover, "");
      const { username, code, password, password2 } = readForm(forms.recover);
      if (!passwordValid(password)) return showError(forms.recover, "Den nye adgangskode opfylder ikke kravene.");
      if (password !== password2) return showError(forms.recover, "Adgangskoderne er ikke ens.");
      btn.textContent = "Gendanner…";
      try {
        const pre = await api("POST", "/api/prerecover", { username });
        const rec = await deriveKeys(normalizeRecoveryCode(code), pre.salt, pre.iterations);
        const start = await api("POST", "/api/recover/start", { username, rec_auth_key: rec.authKey });
        const dek = await unwrapDek(start.rec_wrapped_dek, start.rec_dek_iv, rec.kek, true);
        const pw = await passwordMaterial(password, dek);
        const me = await api("POST", "/api/recover/finish", { token: start.token, ...pw });
        const { kek } = await deriveKeys(password, pw.salt, pw.iterations);
        await onAuthenticated(me, await unwrapDek(pw.wrapped_dek, pw.dek_iv, kek));
      } catch (e) {
        showError(forms.recover, e.message);
      }
    });
  });
}

function showRecoveryCode(root, username, code, next) {
  mount(root, html`<main class="auth">
    ${brand}
    <div class="card auth-card stack">
      <h2>Din gendannelseskode</h2>
      <p>Gem koden et sikkert sted (fx i en adgangskodemanager eller printet). Det er <strong>den eneste måde</strong> at komme ind igen,
        hvis du glemmer din adgangskode. Den vises kun denne ene gang.</p>
      <p class="recovery-code" id="code">${code}</p>
      <div class="row">
        <button class="btn ghost" id="copy" type="button">Kopiér</button>
        <button class="btn ghost" id="dl" type="button">Download som tekstfil</button>
      </div>
      <label class="check"><input type="checkbox" id="ack"> Jeg har gemt min gendannelseskode</label>
      <button class="btn primary" id="go" disabled>Fortsæt</button>
    </div></main>`);
  root.querySelector("#copy").onclick = () => navigator.clipboard?.writeText(code);
  root.querySelector("#dl").onclick = () => {
    const blob = new Blob([`Supervisionsregnskab – gendannelseskode\nBrugernavn: ${username}\nKode: ${code}\n`], { type: "text/plain" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "supervisionsregnskab-gendannelseskode.txt" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const ack = root.querySelector("#ack");
  const go = root.querySelector("#go");
  ack.onchange = () => (go.disabled = !ack.checked);
  go.onclick = () => busy(go, next);
}

export function unlockView(root, me, { onUnlocked, onLogout }) {
  mount(root, html`<main class="auth">
    ${brand}
    <form class="card auth-card stack" id="f-unlock">
      <h2>Låst</h2>
      <p class="muted">Du er logget ind som <strong>${me.username}</strong>. Indtast din adgangskode for at låse dine krypterede data op.</p>
      <input type="text" name="username" value="${me.username}" autocomplete="username" hidden>
      <label>Adgangskode<input type="password" name="password" required autocomplete="current-password" autofocus></label>
      <p class="form-error" hidden></p>
      <button class="btn primary">Lås op</button>
      <button class="btn ghost" type="button" id="logout">Log ud</button>
    </form></main>`);
  const form = root.querySelector("#f-unlock");
  root.querySelector("#logout").onclick = onLogout;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    busy(ev.submitter, async () => {
      try {
        const { kek } = await deriveKeys(form.elements.password.value, me.salt, me.iterations);
        await onUnlocked(await unwrapDek(me.wrapped_dek, me.dek_iv, kek));
      } catch (e) {
        showError(form, e.name === "OperationError" ? "Forkert adgangskode." : e.message);
      }
    });
  });
}
