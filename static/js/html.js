// Auto-escaping template literals. Every interpolated value is HTML-escaped unless wrapped in raw().
class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, (c) => ESC[c]);
export const raw = (s) => new Safe(String(s));

function render(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v === false || v === null || v === undefined) return "";
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Safe(out);
}

export function mount(el, content) {
  el.innerHTML = String(content);
  return el;
}

// ------------------------------------------------------------------ formatting (da-DK)

const nf = (d) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: d });
export const fmtNum = (x, d = 1) => nf(d).format(Number.isFinite(+x) ? +x : 0);
export const fmtHours = (x) => `${fmtNum(x, 2)} t`;
export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export function fmtMonth(key) {
  const [y, m] = key.split("-");
  return `${MONTHS[+m - 1]} ${y.slice(2)}`;
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
