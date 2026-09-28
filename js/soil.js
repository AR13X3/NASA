// ISRIC SoilGrids v2 client (global 250 m soil property maps).
// https://rest.isric.org/soilgrids/v2.0/docs
//
// We average the top 30 cm, which is where rotation choices matter most.

const PROPERTIES = ['phh2o', 'soc', 'clay', 'sand', 'silt', 'nitrogen'];
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm'];

export function soilGridsUrl(lat, lon) {
  const q = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), value: 'mean' });
  PROPERTIES.forEach((p) => q.append('property', p));
  DEPTHS.forEach((d) => q.append('depth', d));
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${q}`;
}

async function fetchSoilAt(lat, lon) {
  const res = await fetch(soilGridsUrl(lat, lon));
  if (!res.ok) throw new Error(`SoilGrids request failed (HTTP ${res.status})`);
  return parseSoilGrids(await res.json());
}

// SoilGrids leaves towns, water and some patches blank. Farmers often click near
// a town, so if the exact point is empty, try rings of nearby points (~5 km,
// then ~15 km) and use the closest one that has data.
export async function fetchSoil(lat, lon) {
  try {
    return await fetchSoilAt(lat, lon);
  } catch (err) {
    if (!/no data/.test(err.message)) throw err;
  }
  for (const [d, km] of [[0.05, 5], [0.15, 15]]) {
    const ring = [[d, 0], [-d, 0], [0, d], [0, -d]].map(([dy, dx]) => fetchSoilAt(lat + dy, lon + dx));
    const found = (await Promise.allSettled(ring)).find((r) => r.status === 'fulfilled');
    if (found) return { ...found.value, source: `${found.value.source}, nearest data ≈ ${km} km away` };
  }
  throw new Error('SoilGrids has no data within ~15 km (water, urban area or outside coverage)');
}

// Returns conventional units: pH, SOC g/kg, clay/sand/silt %, nitrogen g/kg.
export function parseSoilGrids(json) {
  const raw = {};
  for (const layer of json?.properties?.layers ?? []) {
    const factor = layer.unit_measure?.d_factor || 1;
    const vals = (layer.depths ?? [])
      .filter((d) => DEPTHS.includes(d.label))
      .map((d) => d.values?.mean)
      .filter((v) => v != null);
    if (vals.length) raw[layer.name] = vals.reduce((a, b) => a + b, 0) / vals.length / factor;
  }
  if (raw.phh2o == null && raw.clay == null) {
    throw new Error('SoilGrids has no data here (water, urban area or outside coverage)');
  }
  return normalizeSoil({
    ph: raw.phh2o,
    soc: raw.soc,
    clay: raw.clay,
    sand: raw.sand,
    nitrogen: raw.nitrogen,
    source: 'ISRIC SoilGrids v2 (0–30 cm)',
  });
}

export function textureClass(sand, clay) {
  if (clay >= 35) return 'clayey';
  if (sand >= 65 && clay < 18) return 'sandy';
  return 'loamy';
}

// Plant-available water per metre of soil (mm/m), with a small organic-matter bonus.
export function availableWater(texture, soc = 10) {
  const base = { sandy: 90, loamy: 170, clayey: 150 }[texture] ?? 150;
  return base + Math.min(30, Math.max(0, soc - 10) * 1.5);
}

export function normalizeSoil({ ph = 6.5, soc = 12, clay = 25, sand = 40, nitrogen = null, drainage = null, source = 'Manual entry' }) {
  const texture = textureClass(sand, clay);
  return {
    ph: round(ph, 1),
    soc: round(soc, 1),
    clay: round(clay, 0),
    sand: round(sand, 0),
    nitrogen: nitrogen == null ? null : round(nitrogen, 2),
    texture,
    drainage: drainage ?? (texture === 'clayey' ? 'poor' : 'good'),
    awc: availableWater(texture, soc),
    source,
  };
}

const round = (v, d) => (v == null ? v : Math.round(v * 10 ** d) / 10 ** d);
