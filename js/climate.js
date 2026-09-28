// NASA POWER (Prediction Of Worldwide Energy Resources) client.
// https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
//
// We pull ~15 years of monthly data for one point and derive:
//   - monthly climate normals (temperature, heat, rainfall, root-zone soil wetness, sunlight)
//   - warming and rainfall trends, used to stress-test rotations against the near future.

export const POWER_PARAMS = {
  T2M: 'Mean air temperature at 2 m (°C)',
  T2M_MAX: 'Mean daily maximum temperature at 2 m (°C)',
  PRECTOTCORR: 'Bias-corrected precipitation (mm/day)',
  GWETROOT: 'Root-zone soil wetness (0 = dry, 1 = saturated)',
  ALLSKY_SFC_SW_DWN: 'All-sky surface solar radiation (kWh/m²/day)',
};

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const FILL_VALUE = -999;

export function powerMonthlyUrl(lat, lon, startYear, endYear) {
  const q = new URLSearchParams({
    parameters: Object.keys(POWER_PARAMS).join(','),
    community: 'AG',
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start: String(startYear),
    end: String(endYear),
    format: 'JSON',
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${q}`;
}

export async function fetchPowerClimate(lat, lon, { years = 15, now = new Date() } = {}) {
  // POWER monthly data lags by a few months, so stop at the last full year.
  const endYear = now.getUTCFullYear() - 1;
  const startYear = endYear - years + 1;
  const res = await fetch(powerMonthlyUrl(lat, lon, startYear, endYear));
  if (!res.ok) throw new Error(`NASA POWER request failed (HTTP ${res.status})`);
  const profile = buildClimateProfile(parsePowerMonthly(await res.json()));
  profile.source = `NASA POWER monthly, ${profile.yearsCovered[0]}–${profile.yearsCovered[1]}`;
  return profile;
}

// Turns a POWER monthly response into { year: { PARAM: [12 monthly values] } }.
// Keys look like "201907"; month "13" is the annual value and is skipped.
export function parsePowerMonthly(json) {
  const params = json?.properties?.parameter;
  if (!params) throw new Error('Unexpected NASA POWER response format');
  const years = {};
  for (const [param, series] of Object.entries(params)) {
    for (const [key, value] of Object.entries(series)) {
      const year = Number(key.slice(0, 4));
      const month = Number(key.slice(4, 6));
      if (month < 1 || month > 12 || value == null || value <= FILL_VALUE) continue;
      years[year] ??= {};
      years[year][param] ??= Array(12).fill(null);
      years[year][param][month - 1] = value;
    }
  }
  return years;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function slope(points) {
  if (points.length < 3) return 0;
  const mx = mean(points.map((p) => p[0]));
  const my = mean(points.map((p) => p[1]));
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den ? num / den : 0;
}

export function buildClimateProfile(years) {
  const yearKeys = Object.keys(years).map(Number).sort((a, b) => a - b);
  if (!yearKeys.length) throw new Error('No usable climate data for this location');

  const normal = (param) =>
    Array.from({ length: 12 }, (_, m) => {
      const vals = yearKeys.map((y) => years[y][param]?.[m]).filter((v) => v != null);
      return vals.length ? mean(vals) : null;
    });

  const precipRate = normal('PRECTOTCORR');
  const annualSeries = yearKeys
    .map((year) => {
      const t = years[year].T2M;
      const p = years[year].PRECTOTCORR;
      if (!t || !p || t.includes(null) || p.includes(null)) return null;
      return { year, temp: mean(t), precip: p.reduce((a, v, m) => a + v * DAYS_IN_MONTH[m], 0) };
    })
    .filter(Boolean);

  const profile = profileFromMonthly({
    tMean: normal('T2M'),
    tMax: normal('T2M_MAX'),
    precip: precipRate.map((v, m) => (v == null ? null : v * DAYS_IN_MONTH[m])),
    soilWetness: normal('GWETROOT'),
    solar: normal('ALLSKY_SFC_SW_DWN'),
  });

  const avgPrecip = annualSeries.length ? mean(annualSeries.map((s) => s.precip)) : profile.annualPrecip;
  profile.annualSeries = annualSeries;
  profile.yearsCovered = [yearKeys[0], yearKeys[yearKeys.length - 1]];
  profile.tempTrend = slope(annualSeries.map((s) => [s.year, s.temp])) * 10; // °C per decade
  profile.precipTrend = avgPrecip ? (slope(annualSeries.map((s) => [s.year, s.precip])) * 10) / avgPrecip : 0; // fraction per decade
  return profile;
}

// Builds a climate profile from 12-month arrays (NASA-derived or entered by hand).
export function profileFromMonthly({ tMean, tMax, precip, soilWetness = null, solar = null, source = 'Manual entry' }) {
  for (const [name, arr] of Object.entries({ tMean, tMax, precip })) {
    if (!Array.isArray(arr) || arr.length !== 12 || arr.some((v) => v == null || Number.isNaN(v))) {
      throw new Error(`Climate data needs 12 monthly values for ${name}`);
    }
  }
  return {
    source,
    tMean: [...tMean],
    tMax: [...tMax],
    precip: [...precip],
    soilWetness: soilWetness ? [...soilWetness] : null,
    solar: solar ? [...solar] : null,
    annualTemp: mean(tMean),
    annualPrecip: precip.reduce((a, b) => a + b, 0),
    tempTrend: 0,
    precipTrend: 0,
    annualSeries: [],
    yearsCovered: null,
  };
}

// Returns a shifted copy of the profile: warmer by dT and with rainfall scaled.
export function applyScenario(profile, { dT = 0, precipFactor = 1 }) {
  const shifted = {
    ...profile,
    tMean: profile.tMean.map((t) => t + dT),
    tMax: profile.tMax.map((t) => t + dT * 1.1),
    precip: profile.precip.map((p) => p * precipFactor),
  };
  shifted.annualTemp = profile.annualTemp + dT;
  shifted.annualPrecip = profile.annualPrecip * precipFactor;
  return shifted;
}

// The "stress test" future: the recent NASA trend projected forward, but never
// milder than +1.5 °C and −10 % rainfall, so every site gets tested against
// a plausibly harsher climate.
export function stressScenario(profile, horizonYears = 10) {
  const trendWarming = (profile.tempTrend / 10) * horizonYears;
  const trendRain = 1 + (profile.precipTrend / 10) * horizonYears;
  return {
    dT: Math.max(1.5, trendWarming),
    precipFactor: Math.min(0.9, Math.max(0.5, trendRain)),
    horizonYears,
  };
}

// Illustrative Midwest-like climate for offline demos. NOT NASA data.
export const DEMO_CLIMATE = {
  tMean: [-6, -3, 3, 10, 16, 21, 23, 22, 18, 11, 3, -4],
  tMax: [-1, 2, 9, 17, 23, 28, 29, 28, 25, 18, 9, 1],
  precip: [25, 28, 55, 90, 115, 125, 110, 105, 80, 65, 50, 35],
  source: 'Illustrative demo climate (not NASA data)',
};
