// Minimal SVG charts. Colours come from CSS custom properties (see app.css, --series-*).
// Each chart has a legend (>= 2 series), a per-bar <title> tooltip and a table fallback built by the caller.
import { esc, fmtMonth, fmtNum } from "./html.js";

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/** Stacked monthly bar chart. series: [{key, label, cls}] */
export function stackedBars(rows, series, { height = 220, unit = "t", label = fmtMonth } = {}) {
  if (!rows.length) return `<p class="muted">Ingen data endnu.</p>`;
  const W = Math.min(760, Math.max(560, rows.length * 34 + 48));
  const H = height;
  const pad = { l: 40, r: 8, t: 10, b: 28 };
  const max = niceMax(Math.max(...rows.map((r) => series.reduce((a, s) => a + r[s.key], 0))));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = Math.max(6, Math.min(26, iw / rows.length - 6));
  const y = (v) => pad.t + ih - (v / max) * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Søjlediagram pr. måned">`;
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v, 1)}</text>`;
  }
  const every = Math.ceil(rows.length / 12);
  rows.forEach((r, i) => {
    const cx = pad.l + (iw / rows.length) * (i + 0.5);
    let acc = 0;
    const tip = `${label(r.month)}: ` + series.map((s) => `${s.label} ${fmtNum(r[s.key])} ${unit}`).join(", ");
    svg += `<g class="bar"><title>${esc(tip)}</title>`;
    svg += `<rect class="hit" x="${cx - (iw / rows.length) / 2}" y="${pad.t}" width="${iw / rows.length}" height="${ih}"/>`;
    series.forEach((s, si) => {
      const v = r[s.key];
      if (v <= 0) return;
      const y0 = y(acc);
      const y1 = y(acc + v);
      const top = si === series.length - 1 || series.slice(si + 1).every((n) => r[n.key] <= 0);
      const h = Math.max(1, y0 - y1 - (acc > 0 ? 2 : 0));
      svg += `<rect class="${s.cls}" x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${h}" rx="${top ? 3 : 0}"/>`;
      acc += v;
    });
    svg += `</g>`;
    if (i % every === 0) svg += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(label(r.month))}</text>`;
  });
  svg += `</svg>`;
  const legend = series.length > 1
    ? `<div class="legend">${series.map((s) => `<span><i class="sw ${s.cls}"></i>${esc(s.label)}</span>`).join("")}</div>` : "";
  return `${legend}<div class="chart-scroll">${svg}</div>`;
}

/** Horizontal bars with direct labels. items: [{label, value, note}] */
export function hBars(items, { unit = "t", target } = {}) {
  if (!items.length) return `<p class="muted">Ingen data endnu.</p>`;
  const max = Math.max(target || 0, ...items.map((i) => i.value)) || 1;
  return `<ul class="hbars">${items.map((i) => `
    <li><span class="hb-label">${esc(i.label)}</span>
      <span class="hb-track"><span class="hb-fill" data-w="${(i.value / max) * 100}"></span>
      ${target ? `<span class="hb-target" data-l="${(target / max) * 100}" title="Krav: ${target} ${unit}"></span>` : ""}</span>
      <span class="hb-value">${fmtNum(i.value)} ${unit}</span></li>`).join("")}</ul>`;
}

/** CSP forbids inline style attributes, so widths are applied through the CSSOM after mounting. */
export function applyWidths(root) {
  root.querySelectorAll("[data-w]").forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, +el.dataset.w))}%`; });
  root.querySelectorAll("[data-l]").forEach((el) => { el.style.left = `${Math.max(0, Math.min(100, +el.dataset.l))}%`; });
}
