// Encrypted documentation files (bilag) attached to an uddannelsesaftale, arbejdsforhold or supervisionsforløb.
import { api } from "../api.js";
import { html, mount, fmtDate } from "../html.js";
import * as store from "../store.js";
import { DOC_TYPES } from "../templates.js";
import { busy, confirmDialog, toast } from "../ui.js";

const ACCEPT = "application/pdf,image/*,.doc,.docx,.odt,.txt,.xlsx,.ods,.csv";

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Markup for the attachment list + upload form. Call wireAttachments() after mounting. */
export function attachmentsBlock(parentId, { expected = [] } = {}) {
  const list = store.attachments(parentId);
  const have = new Set(list.map((a) => a.docType));
  return html`<div class="attachments" data-parent="${parentId}">
    ${expected.length ? html`<ul class="doc-checklist">${expected.map((d) => html`<li class="${have.has(d) ? "ok" : ""}">
      <span class="req-icon ${have.has(d) ? "ok" : "todo"}" aria-label="${have.has(d) ? "Uploadet" : "Mangler"}">${have.has(d) ? "✓" : ""}</span>${d}</li>`)}</ul>` : ""}
    ${list.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Dokument</th><th>Type</th><th>Dato</th><th class="num">Størrelse</th><th></th></tr></thead>
      <tbody>${list.map((a) => html`<tr>
        <td><strong>${a.name}</strong>${a.note ? html`<br><small class="muted">${a.note}</small>` : ""}</td>
        <td><span class="pill">${a.docType || "Andet"}</span></td>
        <td><small>${fmtDate(a.docDate || a.createdAt?.slice(0, 10))}</small></td>
        <td class="num"><small>${fmtBytes(a.size || 0)}</small></td>
        <td class="actions"><button type="button" class="btn ghost small" data-open-att="${a.id}">Hent</button>
          <button type="button" class="btn ghost small danger-text" data-del-att="${a.id}">Slet</button></td></tr>`)}</tbody></table></div>`
    : html`<p class="muted">Ingen dokumenter endnu.</p>`}
    <form class="upload rowgrid">
      <label>Type<select name="docType">${DOC_TYPES.map((d) => html`<option>${d}</option>`)}</select></label>
      <label>Dato <small class="muted">(valgfri)</small><input type="date" name="docDate"></label>
      <label>Note <small class="muted">(valgfri)</small><input name="note" maxlength="300"></label>
      <label class="btn primary small file-btn self-end">+ Upload fil<input type="file" name="file" accept="${ACCEPT}" multiple hidden></label>
    </form>
    <p class="muted small">Filer krypteres i din browser, før de sendes. Serveren kan hverken se filnavn, type eller indhold. <span class="max-file"></span></p>
  </div>`;
}

export function wireAttachments(root, onChange) {
  root.querySelectorAll(".attachments").forEach((box) => {
    const parentId = box.dataset.parent;
    let maxFile = Infinity;
    api("GET", "/api/storage").then((st) => {
      maxFile = st.max_file - 64 * 1024;
      const el = box.querySelector(".max-file");
      if (el) el.textContent = `Maks. ${fmtBytes(maxFile)} pr. fil · brugt ${fmtBytes(st.bytes)} af ${fmtBytes(st.quota)}.`;
    }).catch(() => {});
    const form = box.querySelector("form.upload");
    const input = form.elements.file;
    const btn = form.querySelector(".file-btn");
    input.onchange = async () => {
      const files = [...input.files];
      let ok = 0;
      btn.classList.add("busy");
      for (const f of files) {
        if (f.size > maxFile) {
          toast(`${f.name}: filen er for stor (maks. ${fmtBytes(maxFile)}).`, "error");
          continue;
        }
        try {
          await store.attach(parentId, f, { docType: form.elements.docType.value, docDate: form.elements.docDate.value || null, note: form.elements.note.value.trim() || null });
          ok++;
        } catch (e) {
          toast(`${f.name}: ${e.message}`, "error");
        }
      }
      input.value = "";
      btn.classList.remove("busy");
      if (ok) {
        toast(ok === 1 ? "Dokumentet er gemt krypteret" : `${ok} dokumenter er gemt krypteret`);
        onChange?.();
      }
    };
    box.querySelectorAll("[data-open-att]").forEach((b) => (b.onclick = () => busy(b, async () => {
      const att = store.get(b.dataset.openAtt);
      try {
        const blob = await store.openAttachment(att);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = att.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch (e) {
        toast(e.message || "Filen kunne ikke dekrypteres.", "error");
      }
    })));
    box.querySelectorAll("[data-del-att]").forEach((b) => (b.onclick = async () => {
      const att = store.get(b.dataset.delAtt);
      if (!(await confirmDialog(`Slet dokumentet "${att.name}" permanent?`))) return;
      try {
        await store.removeAttachment(att);
        onChange?.();
      } catch (e) {
        toast(e.message, "error");
      }
    }));
  });
}

/** Modal with the attachments of one record (used for arbejdsforhold and supervisionsforløb). */
export function attachmentsDialog(parentId, title, opts) {
  const dlg = document.createElement("dialog");
  dlg.className = "dialog wide";
  const render = () => {
    mount(dlg, html`<div class="stack">
      <div class="dialog-head"><h2>Dokumentation – ${title}</h2><button type="button" class="btn ghost small" data-close aria-label="Luk">✕</button></div>
      ${attachmentsBlock(parentId, opts)}
      <div class="row end"><button type="button" class="btn ghost" data-close>Luk</button></div></div>`);
    dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dlg.close()));
    wireAttachments(dlg, render);
  };
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  render();
  dlg.showModal();
  return dlg;
}
