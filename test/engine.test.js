import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePowerMonthly, buildClimateProfile, profileFromMonthly, applyScenario, stressScenario, DEMO_CLIMATE } from '../js/climate.js';
import { parseSoilGrids, normalizeSoil, textureClass } from '../js/soil.js';
import { enumerateRotations, cropSuitability, recommend, bestWindow } from '../js/engine.js';
import { cropById } from '../js/crops.js';

const demo = profileFromMonthly(DEMO_CLIMATE);
const loam = normalizeSoil({ ph: 6.5, soc: 18, clay: 25, sand: 35 });

// Synthetic POWER monthly response: warming 0.05 °C/yr, steady rain, one fill value.
function fakePower(years) {
  const series = { T2M: {}, T2M_MAX: {}, PRECTOTCORR: {}, GWETROOT: {} };
  years.forEach((y, i) => {
    for (let m = 1; m <= 12; m++) {
      const k = `${y}${String(m).padStart(2, '0')}`;
      series.T2M[k] = DEMO_CLIMATE.tMean[m - 1] + 0.05 * i;
      series.T2M_MAX[k] = DEMO_CLIMATE.tMax[m - 1] + 0.05 * i;
      series.PRECTOTCORR[k] = 2;
      series.GWETROOT[k] = 0.6;
    }
    series.T2M[`${y}13`] = 999; // annual value must be ignored
  });
  series.GWETROOT[`${years[0]}01`] = -999;
  return { properties: { parameter: series } };
}

test('parses NASA POWER monthly data into normals and trends', () => {
  const years = Array.from({ length: 10 }, (_, i) => 2015 + i);
  const profile = buildClimateProfile(parsePowerMonthly(fakePower(years)));
  assert.deepEqual(profile.yearsCovered, [2015, 2024]);
  assert.equal(profile.precip[0], 62); // 2 mm/day × 31 days
  assert.ok(Math.abs(profile.tempTrend - 0.5) < 1e-9, 'warming of 0.5 °C per decade');
  assert.ok(Math.abs(profile.precipTrend) < 1e-9);
  assert.equal(profile.soilWetness[0], 0.6, 'fill value skipped');
});

test('rejects malformed POWER responses', () => {
  assert.throws(() => parsePowerMonthly({}), /Unexpected/);
  assert.throws(() => profileFromMonthly({ tMean: [1], tMax: [], precip: [] }), /12 monthly values/);
});

test('parses SoilGrids layers with unit conversion', () => {
  const layer = (name, d, v) => ({ name, unit_measure: { d_factor: d }, depths: ['0-5cm', '5-15cm', '15-30cm'].map((label) => ({ label, values: { mean: v } })) });
  const soil = parseSoilGrids({ properties: { layers: [layer('phh2o', 10, 65), layer('soc', 10, 200), layer('clay', 10, 400), layer('sand', 10, 200)] } });
  assert.equal(soil.ph, 6.5);
  assert.equal(soil.soc, 20);
  assert.equal(soil.clay, 40);
  assert.equal(soil.texture, 'clayey');
  assert.throws(() => parseSoilGrids({ properties: { layers: [] } }), /no data/);
});

test('classifies soil texture', () => {
  assert.equal(textureClass(80, 5), 'sandy');
  assert.equal(textureClass(40, 20), 'loamy');
  assert.equal(textureClass(20, 45), 'clayey');
});

test('growing windows wrap over the year end in the southern hemisphere', () => {
  const south = profileFromMonthly({
    tMean: [...DEMO_CLIMATE.tMean.slice(6), ...DEMO_CLIMATE.tMean.slice(0, 6)],
    tMax: [...DEMO_CLIMATE.tMax.slice(6), ...DEMO_CLIMATE.tMax.slice(0, 6)],
    precip: [...DEMO_CLIMATE.precip.slice(6), ...DEMO_CLIMATE.precip.slice(0, 6)],
  });
  const win = bestWindow(cropById.maize, south);
  assert.ok(win.months.includes(0), 'maize grows over January in the south');
  assert.ok(win.months.includes(11));
});

test('crop suitability reflects climate', () => {
  assert.ok(cropSuitability(cropById.maize, demo, loam).score > 0.8);
  assert.equal(cropSuitability(cropById.cassava, demo, loam).score, 0, 'cassava cannot survive a cold winter');
  const dry = applyScenario(demo, { precipFactor: 0.3 });
  assert.ok(cropSuitability(cropById.soybean, dry, loam).water < cropSuitability(cropById.soybean, demo, loam).water);
  assert.equal(cropSuitability(cropById.soybean, dry, loam, { irrigated: true }).water, 1);
});

test('enumerates each rotation cycle once with no back-to-back repeats', () => {
  const rots = enumerateRotations(['a', 'b', 'c'], { maxLength: 4 });
  const keys = rots.map((r) => r.join('-'));
  assert.ok(keys.includes('a-b'));
  assert.ok(!keys.includes('b-a'), 'cyclic duplicate removed');
  assert.ok(!keys.includes('a-b-a-b'), 'repeated shorter cycle removed');
  for (const r of rots) r.forEach((x, i) => assert.notEqual(x, r[(i + 1) % r.length]));
});

test('recommendations beat monoculture on soil health and respect priorities', () => {
  const stress = stressScenario(demo);
  const soilFirst = recommend({ climate: demo, soil: loam, priorities: { soilHealth: 5, water: 0, resilience: 0, profit: 0 }, stress });
  assert.ok(soilFirst.rotations.length > 0);
  const best = soilFirst.rotations[0];
  assert.ok(best.metrics.soilHealth > soilFirst.baseline.metrics.soilHealth);
  assert.ok(best.socChange > soilFirst.baseline.socChange);
  assert.ok(best.slots.some((s) => s.crop.nFix || s.cover?.nFix), 'soil-first plan includes a legume');

  const incomeFirst = recommend({ climate: demo, soil: loam, priorities: { soilHealth: 0, water: 0, resilience: 0, profit: 5 }, stress });
  assert.ok(incomeFirst.rotations[0].metrics.profit >= best.metrics.profit);
});

test('only offers crops the user selected', () => {
  const r = recommend({ climate: demo, soil: loam, cropIds: ['maize', 'soybean', 'winter-wheat'], stress: stressScenario(demo) });
  for (const rot of r.rotations) for (const id of rot.ids) assert.ok(['maize', 'soybean', 'winter-wheat'].includes(id));
});

test('winter wheat is sown in autumn and harvested in early summer', () => {
  const win = bestWindow(cropById['winter-wheat'], demo);
  assert.equal(win.months[0], 9, 'sown in October');
  assert.ok(win.months.includes(0), 'grows through January');
  assert.ok(demo.tMean[win.months.at(-1)] > demo.tMean[win.months[0]], 'ends warmer than it starts');
});
