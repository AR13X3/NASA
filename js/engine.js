// Rotation decision engine.
//
// 1. Score how well each crop fits the site (climate now, climate under stress, soil).
// 2. Enumerate candidate rotations (2–4 year cycles) from the crops that fit.
// 3. Score each rotation on soil health, water, climate resilience and income,
//    weight by the farmer's priorities, and explain the result in plain language.

import { CROPS, COVER_CROPS, cropById } from './crops.js';
import { applyScenario } from './climate.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const monthsFrom = (start, len) => Array.from({ length: len }, (_, i) => (start + i) % 12);

// ---------------------------------------------------------------- crop fit --

// Candidate growing windows: consecutive months (wrapping over the year end, so
// the southern hemisphere works) that the crop can survive. `allowed` restricts
// the months a window may use, e.g. a cover crop must fit between cash crops.
function candidateWindows(crop, climate, allowed) {
  const out = [];
  for (let start = 0; start < 12; start++) {
    const months = monthsFrom(start, crop.months);
    if (allowed && !months.every((m) => allowed.has(m))) continue;
    if (months.some((m) => climate.tMean[m] < crop.tFloor)) continue;
    // Overwintering crops are sown into cooling autumn weather that is still warm
    // enough to establish, and harvested once it has warmed up again.
    if (crop.overwinter) {
      const sow = climate.tMean[months[0]];
      const autumn = climate.tMean[(start + 11) % 12] > sow && sow >= 5;
      if (!autumn || climate.tMean[months[months.length - 1]] <= sow) continue;
    }
    out.push({
      start,
      months,
      temp: mean(months.map((m) => climate.tMean[m])),
      rain: months.reduce((a, m) => a + climate.precip[m], 0),
      // Rain in the three months before sowing refills the soil profile.
      preRain: [1, 2, 3].reduce((a, k) => a + climate.precip[(start + 12 - k) % 12], 0),
    });
  }
  return out;
}

// Scores one crop in one growing window.
function evaluateWindow(crop, win, climate, soil, irrigated) {
  const tDist = win.temp < crop.tMin ? crop.tMin - win.temp : win.temp > crop.tMax ? win.temp - crop.tMax : 0;
  const temp = clamp(1 - tDist / 6);

  const peakHeat = Math.max(...win.months.map((m) => climate.tMax[m]));
  const heat = clamp(1 - Math.max(0, peakHeat - crop.heatLimit) / 8);

  // ~75 % of in-season rain is effective. The root zone starts partly full,
  // topped up by pre-season rain (how dryland crops live on winter rain).
  const capacity = soil.awc * Math.min(crop.rootDepth, 1.5);
  const stored = Math.min(capacity, 0.3 * capacity + 0.5 * win.preRain);
  const supply = win.rain * 0.75 + stored;
  const ratio = supply / crop.waterNeed;
  const irrigationNeed = Math.max(0, crop.waterNeed - supply);
  let water = irrigated ? 1 : clamp(ratio + crop.droughtTol * 0.3);
  // Too much water on poorly drained soil hurts crops that hate wet feet.
  if (ratio > 2 && soil.drainage === 'poor') water *= 1 - (1 - crop.waterlogTol) * 0.4;

  // pH can be corrected (lime, sulfur), so it weighs less than texture.
  const phDist = soil.ph < crop.phMin ? crop.phMin - soil.ph : soil.ph > crop.phMax ? soil.ph - crop.phMax : 0;
  const soilFit = clamp(1 - phDist / 2.5) * (0.4 + 0.6 * (crop.texture[soil.texture] ?? 0.7));

  // Liebig-style: the most limiting factor dominates, the rest still count.
  const factors = { temp, heat, water, soilFit };
  const score = 0.6 * Math.min(...Object.values(factors)) + 0.4 * mean(Object.values(factors));

  const limits = [];
  if (temp < 0.7) limits.push(win.temp < crop.tMin ? 'season too cool' : 'season too hot');
  if (heat < 0.7) limits.push('heat stress at peak');
  if (water < 0.7) limits.push('rainfall too low');
  if (soilFit < 0.7) {
    if (phDist > 0) limits.push(`soil pH ${soil.ph} outside ${crop.phMin}–${crop.phMax}${soil.ph < crop.phMin ? ' (liming helps)' : ''}`);
    else limits.push(`${soil.texture} soil not ideal`);
  }
  return { score, ...factors, window: win, supply, irrigationNeed, limits, tDist };
}

// Finds the crop's best growing season at this site and scores it there.
export function cropSuitability(crop, climate, soil, { irrigated = false, allowed = null } = {}) {
  let best = null;
  for (const win of candidateWindows(crop, climate, allowed)) {
    const r = evaluateWindow(crop, win, climate, soil, irrigated);
    if (!best || r.score > best.score + 1e-9 || (Math.abs(r.score - best.score) < 1e-9 && r.tDist < best.tDist)) best = r;
  }
  if (!best) {
    return { score: 0, temp: 0, heat: 0, water: 0, soilFit: 0, window: null, supply: 0, irrigationNeed: 0, limits: ['too cold for any growing window'] };
  }
  delete best.tDist;
  return best;
}

export function bestWindow(crop, climate, soil, opts) {
  return cropSuitability(crop, climate, soil, opts).window;
}

// ------------------------------------------------------------ cover crops --

// Picks the best off-season cover crop between `crop` and `next`, or null.
function chooseCover(crop, next, fit, climate, soil) {
  if (!fit[crop.id]?.window) return null;
  const used = new Set(fit[crop.id].window.months);
  const offSeason = new Set([...Array(12).keys()].filter((m) => !used.has(m)));
  let best = null;
  for (const cover of COVER_CROPS) {
    const s = cropSuitability(cover, climate, soil, { allowed: offSeason });
    if (s.score < 0.55) continue;
    // A legume cover pays off before a hungry crop; rye scavenges nitrogen after one.
    let bonus = 0;
    if (cover.nFix && next.nDemand >= 0.6) bonus += 0.15;
    if (!cover.nFix && crop.nDemand >= 0.6 && !next.nFix) bonus += 0.05;
    if (cover.family === next.family) bonus -= 0.1;
    if (cover.family === crop.family) bonus -= 0.1;
    const value = s.score + bonus;
    if (!best || value > best.value) best = { cover, value, suitability: s.score };
  }
  return best && { crop: best.cover, suitability: best.suitability };
}

// ----------------------------------------------------------- enumeration --

// Rotations are cycles, so [a,b,c], [b,c,a] and [c,a,b] are the same plan.
function isCanonical(seq) {
  for (let s = 1; s < seq.length; s++) {
    const rotated = [...seq.slice(s), ...seq.slice(0, s)];
    if (rotated.join('|') < seq.join('|')) return false;
  }
  return true;
}

// True if the sequence is a shorter cycle repeated (e.g. corn-soy-corn-soy).
function isRepeat(seq) {
  for (let p = 1; p < seq.length; p++) {
    if (seq.length % p === 0 && seq.every((x, i) => x === seq[i % p])) return true;
  }
  return false;
}

export function enumerateRotations(cropIds, { minLength = 2, maxLength = 4 } = {}) {
  const out = [];
  const seq = [];
  const walk = (len) => {
    if (seq.length === len) {
      if (seq[0] !== seq[len - 1] && isCanonical(seq) && !isRepeat(seq)) out.push([...seq]);
      return;
    }
    for (const id of cropIds) {
      if (seq.length && seq[seq.length - 1] === id) continue; // never the same crop twice in a row
      seq.push(id);
      walk(len);
      seq.pop();
    }
  };
  for (let len = minLength; len <= maxLength; len++) walk(len);
  return out;
}

// --------------------------------------------------------------- scoring --

// Illustrative soil organic carbon index: +residue, +cover, +legumes, −tillage,
// with faster decomposition in hot climates. Returns yearly % change from today.
export function projectSoilCarbon(slots, climate, years = 12) {
  const heatDecay = clamp((climate.annualTemp - 10) / 20, 0, 1) * 0.006;
  const series = [0];
  let soc = 1;
  for (let y = 0; y < years; y++) {
    const { crop, cover } = slots[y % slots.length];
    const gain = 0.02 * crop.residue + (cover ? 0.012 * cover.residue + 0.004 : 0) + (crop.nFix ? 0.003 : 0);
    const loss = 0.018 * crop.disturbance + 0.004 + heatDecay;
    // Carbon gains saturate as the soil fills up.
    soc *= 1 + gain / soc - loss;
    series.push((soc - 1) * 100);
  }
  return series;
}

// Pest and disease break: penalise consecutive crops (or a cover crop) from the
// same family, the same crop returning within the cycle, and one family
// dominating the rotation.
function pestBreak(slots) {
  const n = slots.length;
  let clashes = 0;
  for (let i = 0; i < n; i++) {
    const { crop, cover } = slots[i];
    const next = slots[(i + 1) % n].crop;
    if (crop.family === next.family) clashes++;
    if (cover && (cover.family === crop.family || cover.family === next.family)) clashes += 0.3;
  }
  const repeats = n - new Set(slots.map((s) => s.crop.id)).size;
  const familyCounts = {};
  slots.forEach((s) => (familyCounts[s.crop.family] = (familyCounts[s.crop.family] ?? 0) + 1));
  const dominance = Math.max(0, Math.max(...Object.values(familyCounts)) / n - 0.5);
  return clamp((1 - clashes / n) * (1 - (0.5 * repeats) / n) * (1 - dominance));
}

// Nitrogen: legumes and legume covers supply N, hungry crops draw it down.
function nitrogenBalance(slots) {
  let balance = 0;
  for (const { crop, cover } of slots) {
    balance += (crop.nFix ? 0.6 : 0) - crop.nDemand + (cover?.nFix ? 0.4 : 0) + (cover && !cover.nFix ? 0.1 : 0);
  }
  return balance / slots.length;
}

export function scoreRotation(ids, ctx) {
  const { fit, stressFit, climate, soil, useCovers, priorities } = ctx;
  const slots = ids.map((id, i) => {
    const crop = cropById[id];
    const next = cropById[ids[(i + 1) % ids.length]];
    let cover = null;
    if (useCovers) {
      const key = `${crop.id}>${next.id}`;
      if (!(key in ctx.coverCache)) ctx.coverCache[key] = chooseCover(crop, next, fit, climate, soil);
      cover = ctx.coverCache[key];
    }
    return { crop, cover: cover?.crop ?? null };
  });

  const suit = ids.map((id) => fit[id].score);
  const stressed = ids.map((id) => stressFit[id].score);
  const families = new Set(slots.map((s) => s.crop.family)).size;
  const diversity = clamp((families - 1) / 2);
  const breaks = pestBreak(slots);
  const nBalance = nitrogenBalance(slots);
  const coverFrac = mean(slots.map((s) => (s.cover ? 1 : 0)));
  const socSeries = projectSoilCarbon(slots, climate);
  const socChange = socSeries[socSeries.length - 1];

  const soilHealth = clamp(
    0.25 * mean(slots.map((s) => s.crop.residue)) +
      0.2 * breaks +
      0.15 * diversity +
      0.15 * clamp(0.5 + nBalance) +
      0.15 * coverFrac +
      0.1 * (1 - mean(slots.map((s) => s.crop.disturbance))),
  );

  // Water: how well rain covers each crop's needs, plus how little it asks for.
  const water = clamp(
    mean(
      slots.map(({ crop }) => {
        const f = fit[crop.id];
        const coverage = clamp(f.supply / crop.waterNeed);
        const thrift = clamp(1 - (crop.waterNeed - 300) / 800);
        return 0.5 * coverage + 0.25 * thrift + 0.25 * crop.droughtTol;
      }),
    ) - (ctx.irrigated ? 0.15 * mean(ids.map((id) => clamp(fit[id].irrigationNeed / 500))) : 0),
  );

  const resilience = clamp(0.55 * mean(stressed) + 0.2 * Math.min(...stressed) + 0.15 * diversity + 0.1 * breaks);

  // Income proxy: crop value scaled by expected yield (suitability), plus
  // fertilizer savings from nitrogen supplied inside the rotation.
  const profit = clamp(mean(slots.map((s, i) => s.crop.value * (0.4 + 0.6 * suit[i]))) + 0.08 * clamp(nBalance + 0.5));

  const metrics = { soilHealth, water, resilience, profit };
  const weights = normalizeWeights(priorities);
  const weighted = Object.keys(metrics).reduce((a, k) => a + weights[k] * metrics[k], 0);
  // A rotation is only as good as its weakest crop's fit to the site.
  const overall = weighted * (0.5 + 0.5 * Math.min(...suit));

  return {
    ids,
    slots,
    metrics,
    overall,
    suitability: mean(suit),
    minSuitability: Math.min(...suit),
    nBalance,
    socSeries,
    socChange,
    reasons: explain(slots, { fit, stressFit, breaks, nBalance, socChange }),
  };
}

export function normalizeWeights(p) {
  const w = { soilHealth: p.soilHealth ?? 3, water: p.water ?? 3, resilience: p.resilience ?? 3, profit: p.profit ?? 3 };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
}

function explain(slots, { fit, stressFit, breaks, nBalance, socChange }) {
  const pros = [];
  const cons = [];
  const n = slots.length;

  slots.forEach(({ crop, cover }, i) => {
    const next = slots[(i + 1) % n].crop;
    if (crop.nFix && next.nDemand >= 0.6) pros.push(`${crop.name} leaves nitrogen for the ${next.name.toLowerCase()} that follows.`);
    if (cover) pros.push(`A ${cover.name.toLowerCase()} cover after ${crop.name.toLowerCase()} ${cover.role}.`);
  });
  const repeated = slots.filter((s, i) => slots.findIndex((t) => t.crop.id === s.crop.id) !== i).map((s) => s.crop.name);
  if (breaks > 0.95) pros.push('Crops and plant families alternate well, which breaks pest and disease cycles.');
  else if (repeated.length) cons.push(`${[...new Set(repeated)].join(', ')} return${repeated.length === 1 ? 's' : ''} within the cycle — soil-borne diseases can build up.`);
  else cons.push('Related crops follow each other or dominate the rotation — watch for carry-over pests and diseases.');
  if (socChange > 3) pros.push(`Projected to build soil organic matter (≈ +${socChange.toFixed(0)} % index over 12 years).`);
  if (socChange < -3) cons.push(`Likely to deplete soil organic matter (≈ ${socChange.toFixed(0)} % index over 12 years).`);
  if (nBalance < -0.4) cons.push('Net nitrogen draw is high — expect significant fertilizer needs.');

  const shaky = slots.filter(({ crop }) => stressFit[crop.id].score < fit[crop.id].score - 0.15);
  if (shaky.length) cons.push(`${shaky.map((s) => s.crop.name).join(', ')} lose${shaky.length === 1 ? 's' : ''} suitability in a hotter, drier future.`);
  slots.forEach(({ crop }) => {
    if (fit[crop.id].limits.length) cons.push(`${crop.name}: ${fit[crop.id].limits.join(', ')}.`);
  });
  return { pros: [...new Set(pros)], cons: [...new Set(cons)] };
}

// ------------------------------------------------------------ entry point --

export function recommend({ climate, soil, priorities = {}, cropIds = null, irrigated = false, useCovers = true, maxLength = 4, stress, top = 5 }) {
  const stressClimate = applyScenario(climate, stress);
  const pool = CROPS.filter((c) => !cropIds || cropIds.includes(c.id));

  const fit = {};
  const stressFit = {};
  for (const c of pool) {
    fit[c.id] = cropSuitability(c, climate, soil, { irrigated });
    stressFit[c.id] = cropSuitability(c, stressClimate, soil, { irrigated });
  }

  // Crops of the same species (e.g. two wheat types) would be the same crop in
  // a rotation: keep whichever fits better.
  const bySpecies = {};
  for (const c of pool) {
    const k = c.species ?? c.id;
    if (!bySpecies[k] || fit[c.id].score > fit[bySpecies[k]].score) bySpecies[k] = c.id;
  }

  // Keep the crops that genuinely fit; cap the pool so enumeration stays fast.
  const viable = pool
    .filter((c) => fit[c.id].score >= 0.5 && bySpecies[c.species ?? c.id] === c.id)
    .sort((a, b) => fit[b.id].score - fit[a.id].score)
    .slice(0, 12)
    .map((c) => c.id);

  const ctx = { fit, stressFit, climate, soil, useCovers, priorities, irrigated, coverCache: {} };
  const scored = enumerateRotations(viable, { maxLength })
    .map((ids) => scoreRotation(ids, ctx))
    .sort((a, b) => b.overall - a.overall);

  // Baseline: continuous monoculture of the most valuable well-suited crop.
  const baselineCrop = [...viable].sort((a, b) => cropById[b].value * fit[b].score - cropById[a].value * fit[a].score)[0];
  const baseline = baselineCrop ? scoreRotation([baselineCrop], { ...ctx, useCovers: false }) : null;

  return { fit, stressFit, viable, rotations: diversify(scored, top), baseline, candidates: scored.length };
}

// Avoid showing five near-identical plans: skip ones that share every crop with a pick.
function diversify(sorted, top) {
  const picks = [];
  for (const r of sorted) {
    const key = [...new Set(r.ids)].sort().join('|');
    if (picks.some((p) => [...new Set(p.ids)].sort().join('|') === key)) continue;
    picks.push(r);
    if (picks.length === top) break;
  }
  return picks;
}
