// Small UI helpers: toasts, confirm dialog, form reading.
import { html, mount } from "./html.js";

export function toast(message, kind = "ok") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.textContent = message;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.classList.add("out"), 3500);
  setTimeout(() => el.remove(), 4000);
}

export function confirmDialog(message, { ok = "Slet", danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dialog";
    mount(dlg, html`<form method="dialog">
      <p>${message}</p>
      <div class="row end">
        <button value="cancel" class="btn ghost">Annullér</button>
        <button value="ok" class="btn ${danger ? "danger" : "primary"}">${ok}</button>
      </div></form>`);
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "ok"); dlg.remove(); });
    dlg.showModal();
  });
}

/** Read named fields of a form into a plain object (checkboxes -> boolean). */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function showError(form, message) {
  const box = form.querySelector(".form-error");
  if (box) { box.textContent = message || ""; box.hidden = !message; }
  else if (message) toast(message, "error");
}

/** Run an async submit handler with a busy state and error reporting. */
export async function busy(button, fn) {
  const label = button?.textContent;
  if (button) { button.disabled = true; button.classList.add("busy"); }
  try {
    return await fn();
  } finally {
    if (button) { button.disabled = false; button.classList.remove("busy"); button.textContent = label; }
  }
}

export const options = (items, selected, labelFn = (x) => x.name) =>
  items.map((x) => html`<option value="${x.id}" ${x.id === selected ? html`selected` : ""}>${labelFn(x)}</option>`);

/**
 * Modal form. `body` is the form's inner HTML; `onSubmit(form)` may throw to show an error.
 * `onMount(form)` wires dynamic behaviour. Resolves true when saved.
 */
export function formDialog(title, body, { onSubmit, onMount, submitLabel = "Gem", wide = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = `dialog${wide ? " wide" : ""}`;
    mount(dlg, html`<form class="stack" novalidate>
      <div class="dialog-head"><h2>${title}</h2><button type="button" class="btn ghost small" data-close aria-label="Luk">✕</button></div>
      ${body}
      <p class="form-error" hidden></p>
      <div class="row end"><button type="button" class="btn ghost" data-close>Annullér</button>
        <button class="btn primary">${submitLabel}</button></div></form>`);
    document.body.appendChild(dlg);
    const form = dlg.querySelector("form");
    let saved = false;
    dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dlg.close()));
    dlg.addEventListener("close", () => { dlg.remove(); resolve(saved); });
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      busy(ev.submitter, async () => {
        try {
          await onSubmit(form);
          saved = true;
          dlg.close();
        } catch (e) {
          showError(form, e.message);
        }
      });
    });
    onMount?.(form);
    dlg.showModal();
  });
}
