// Tiny dependency-free SVG charts.

import { MONTH_NAMES } from './climate.js';

const W = 720;
const H = 240;
const PAD = { l: 44, r: 44, t: 14, b: 28 };

const niceMax = (v) => {
  const step = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return Math.ceil(v / step) * step;
};

// Monthly rainfall bars with mean and max temperature lines.
export function climateChart(climate) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / 12;
  const pMax = niceMax(Math.max(...climate.precip) * 1.1);
  const tLo = Math.floor(Math.min(...climate.tMean, 0) / 5) * 5;
  const tHi = Math.ceil(Math.max(...climate.tMax) / 5) * 5;
  const x = (m) => PAD.l + bw * m + bw / 2;
  const yP = (p) => PAD.t + ih - (p / pMax) * ih;
  const yT = (t) => PAD.t + ih - ((t - tLo) / (tHi - tLo || 1)) * ih;
  const line = (arr) => arr.map((t, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${yT(t).toFixed(1)}`).join('');

  const bars = climate.precip
    .map((p, m) => `<rect x="${(x(m) - bw * 0.32).toFixed(1)}" y="${yP(p).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(PAD.t + ih - yP(p)).toFixed(1)}" rx="3" fill="var(--rain)" opacity="0.75"><title>${MONTH_NAMES[m]}: ${p.toFixed(0)} mm</title></rect>`)
    .join('');
  const labels = MONTH_NAMES.map((n, m) => `<text x="${x(m)}" y="${H - 8}" text-anchor="middle">${n}</text>`).join('');
  const pTicks = [0, pMax / 2, pMax].map((p) => `<text x="${PAD.l - 6}" y="${yP(p) + 4}" text-anchor="end">${p}</text>`).join('');
  const tTicks = [tLo, (tLo + tHi) / 2, tHi].map((t) => `<text x="${W - PAD.r + 6}" y="${yT(t) + 4}">${t}°</text>`).join('');
  const zero = tLo < 0 ? `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${yT(0)}" y2="${yT(0)}" stroke="var(--line)" stroke-dasharray="4 4"/>` : '';
  const dots = (arr, color, label) =>
    arr.map((t, m) => `<circle cx="${x(m)}" cy="${yT(t)}" r="3" fill="${color}"><title>${MONTH_NAMES[m]} ${label}: ${t.toFixed(1)} °C</title></circle>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rainfall and temperature">
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + ih}" y2="${PAD.t + ih}" stroke="var(--line)"/>
    ${zero}${bars}
    <path d="${line(climate.tMax)}" fill="none" stroke="var(--temp)" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="${line(climate.tMean)}" fill="none" stroke="var(--temp)" stroke-width="2.5"/>
    ${dots(climate.tMean, 'var(--temp)', 'mean')}${dots(climate.tMax, 'var(--temp)', 'max')}
    ${labels}${pTicks}${tTicks}
  </svg>
  <div class="legend"><span><i style="background:var(--rain)"></i>Rainfall (mm/month)</span><span><i style="background:var(--temp)"></i>Mean temperature (°C)</span><span><i style="border:2px dashed var(--temp)"></i>Daily max temperature (°C)</span></div>`;
}

const SERIES_COLORS = ['var(--accent)', '#3a76b8', '#b8862e', '#8a5bb8', '#c05a7a'];

// Multi-line chart of the soil organic carbon index (% change per year).
export function socChart(series, baseline) {
  const all = [...series.flatMap((s) => s.values), ...(baseline ? baseline.values : [])];
  const lo = Math.min(0, ...all);
  const hi = Math.max(1, ...all);
  const span = hi - lo || 1;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const years = series[0].values.length - 1;
  const x = (i) => PAD.l + (i / years) * iw;
  const y = (v) => PAD.t + ih - ((v - lo) / span) * ih;
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const lines = series
    .map((s, k) => `<path d="${path(s.values)}" fill="none" stroke="${SERIES_COLORS[k % SERIES_COLORS.length]}" stroke-width="${k ? 2 : 3}"><title>${s.label}</title></path>`)
    .join('');
  const base = baseline ? `<path d="${path(baseline.values)}" fill="none" stroke="var(--bad)" stroke-width="2" stroke-dasharray="6 5"><title>${baseline.label}</title></path>` : '';
  const xTicks = Array.from({ length: years + 1 }, (_, i) => i)
    .filter((i) => i % 2 === 0)
    .map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">yr ${i}</text>`)
    .join('');
  const yTicks = [lo, 0, hi]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((v) => `<text x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${v.toFixed(0)}%</text>`)
    .join('');

  const legend = [
    ...series.map((s, k) => `<span><i style="background:${SERIES_COLORS[k % SERIES_COLORS.length]}"></i>${s.label}</span>`),
    baseline ? `<span><i style="border:2px dashed var(--bad)"></i>${baseline.label}</span>` : '',
  ].join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected soil organic carbon index">
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>
    ${base}${lines}${xTicks}${yTicks}
  </svg><div class="legend">${legend}</div>`;
}
