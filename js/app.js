import { CROPS, cropById } from './crops.js';
import { fetchPowerClimate, profileFromMonthly, stressScenario, DEMO_CLIMATE } from './climate.js';
import { fetchSoil, normalizeSoil } from './soil.js';
import { recommend } from './engine.js';
import { climateChart, socChart } from './charts.js';

const $ = (id) => document.getElementById(id);
const pct = (v) => `${Math.round(v * 100)}%`;
const state = { climate: null };

// ------------------------------------------------------------------- map --

let marker = null;
function initMap() {
  const el = $('map');
  if (!window.L) {
    el.classList.add('no-map');
    el.textContent = 'Map unavailable offline — enter coordinates instead.';
    return;
  }
  const map = L.map(el).setView([+$('lat').value, +$('lon').value], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  marker = L.marker([+$('lat').value, +$('lon').value]).addTo(map);
  map.on('click', (e) => {
    $('lat').value = e.latlng.lat.toFixed(4);
    $('lon').value = e.latlng.lng.toFixed(4);
    marker.setLatLng(e.latlng);
  });
  const sync = () => {
    const ll = [+$('lat').value, +$('lon').value];
    if (ll.every(Number.isFinite)) marker.setLatLng(ll);
  };
  $('lat').addEventListener('change', sync);
  $('lon').addEventListener('change', sync);
}

// ------------------------------------------------------------------ data --

function setStatus(msg, isError = false) {
  $('data-status').textContent = msg;
  $('data-status').classList.toggle('error', isError);
}

async function loadNasaData() {
  const lat = +$('lat').value;
  const lon = +$('lon').value;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    setStatus('Please enter a valid latitude and longitude.', true);
    return;
  }
  $('fetch-data').disabled = true;
  setStatus('Fetching NASA POWER climate and SoilGrids soil data…');
  const [climate, soil] = await Promise.allSettled([fetchPowerClimate(lat, lon), fetchSoil(lat, lon)]);
  $('fetch-data').disabled = false;

  const notes = [];
  if (climate.status === 'fulfilled') {
    setClimate(climate.value);
    notes.push(`Climate: ${climate.value.source}.`);
  } else {
    notes.push(`Climate data failed: ${climate.reason.message}.`);
  }
  if (soil.status === 'fulfilled') {
    setSoilInputs(soil.value);
    notes.push('Soil loaded from SoilGrids.');
  } else {
    notes.push(`Soil data unavailable (${soil.reason.message}) — enter your soil values below.`);
  }
  setStatus(notes.join(' '), climate.status !== 'fulfilled');
}

function loadDemoData() {
  setClimate(profileFromMonthly(DEMO_CLIMATE));
  setSoilInputs(normalizeSoil({ ph: 6.4, soc: 20, clay: 28, sand: 30, source: 'Illustrative demo soil' }));
  setStatus('Loaded illustrative demo data (not NASA data) — useful when offline.');
}

function setSoilInputs(soil) {
  $('soil-ph').value = soil.ph;
  $('soil-soc').value = soil.soc;
  $('soil-clay').value = soil.clay;
  $('soil-sand').value = soil.sand;
  updateSoilSummary(soil.source);
}

function readSoil(source) {
  return normalizeSoil({
    ph: +$('soil-ph').value,
    soc: +$('soil-soc').value,
    clay: +$('soil-clay').value,
    sand: +$('soil-sand').value,
    drainage: $('soil-drainage').value || null,
    source,
  });
}

function updateSoilSummary(source = $('soil-summary').dataset.source || 'Manual entry') {
  $('soil-summary').dataset.source = source;
  const s = readSoil(source);
  $('soil-summary').textContent = `${s.texture[0].toUpperCase() + s.texture.slice(1)} soil, ${s.drainage} drainage, holds ≈ ${Math.round(s.awc)} mm of plant-available water per metre. Source: ${source}.`;
}

function setClimate(climate) {
  state.climate = climate;
  $('run').disabled = false;
  const stress = stressScenario(climate);
  const trend =
    climate.yearsCovered && climate.annualSeries.length >= 3
      ? `<div class="stat"><b>${climate.tempTrend >= 0 ? '+' : ''}${climate.tempTrend.toFixed(2)} °C</b><span>warming per decade (${climate.yearsCovered.join('–')})</span></div>
         <div class="stat"><b>${climate.precipTrend >= 0 ? '+' : ''}${(climate.precipTrend * 100).toFixed(0)} %</b><span>rainfall change per decade</span></div>`
      : '';
  const wet = climate.soilWetness
    ? `<div class="stat"><b>${pct(Math.min(...climate.soilWetness))}–${pct(Math.max(...climate.soilWetness))}</b><span>root-zone soil wetness range</span></div>`
    : '';
  $('climate-summary').innerHTML = `<div class="stats">
      <div class="stat"><b>${climate.annualTemp.toFixed(1)} °C</b><span>mean annual temperature</span></div>
      <div class="stat"><b>${Math.round(climate.annualPrecip)} mm</b><span>annual rainfall</span></div>
      ${trend}${wet}
      <div class="stat"><b>+${stress.dT.toFixed(1)} °C, ${Math.round((stress.precipFactor - 1) * 100)} %</b><span>stress-test future (${stress.horizonYears} yrs)</span></div>
    </div>`;
  $('climate-chart').innerHTML = climateChart(climate);
}

// ---------------------------------------------------------------- inputs --

function buildCropPicker() {
  $('crop-picker').innerHTML = CROPS.map(
    (c) => `<label class="check"><input type="checkbox" value="${c.id}" checked /> ${c.name}</label>`,
  ).join('');
  const count = () => {
    const n = $('crop-picker').querySelectorAll('input:checked').length;
    $('crop-count').textContent = `(${n} of ${CROPS.length} selected)`;
  };
  $('crop-picker').addEventListener('change', count);
  count();
}

function readPriorities() {
  const p = {};
  document.querySelectorAll('[data-priority]').forEach((el) => (p[el.dataset.priority] = +el.value));
  return p;
}

// --------------------------------------------------------------- results --

const METRIC_LABELS = { soilHealth: 'Soil health', water: 'Water', resilience: 'Climate resilience', profit: 'Income' };

function rotationCard(r, rank) {
  const years = r.slots
    .map(
      ({ crop, cover }, i) => `<div class="year"><small>Year ${i + 1}</small><b>${crop.name}</b>${cover ? `<div class="cover">+ ${cover.name} cover</div>` : ''}</div>`,
    )
    .join('<span class="arrow" aria-hidden="true">→</span>');
  const metrics = Object.entries(r.metrics)
    .map(([k, v]) => `<div class="metric">${METRIC_LABELS[k]} · ${pct(v)}<div class="bar"><div style="width:${pct(v)}"></div></div></div>`)
    .join('');
  const list = (items, cls) => (items.length ? `<ul class="${cls}">${items.map((t) => `<li>${t}</li>`).join('')}</ul>` : '<p class="muted">None noted.</p>');
  return `<article class="rotation ${rank === 0 ? 'top' : ''}">
    <div class="rotation-head">
      <h3>${rank === 0 ? 'Best match: ' : `Option ${rank + 1}: `}${r.slots.length}-year rotation</h3>
      <span class="score" title="Overall match to your priorities">${pct(r.overall)}</span>
    </div>
    <div class="sequence">${years}<span class="arrow" aria-hidden="true">↺</span></div>
    <div class="metrics">${metrics}</div>
    <div class="reasons">
      <div><b>Why it works</b>${list(r.reasons.pros, 'pro')}</div>
      <div><b>Watch out for</b>${list(r.reasons.cons, 'con')}</div>
    </div>
  </article>`;
}

function fitTable(result) {
  const cls = (v) => (v >= 0.75 ? 'good' : v >= 0.5 ? 'meh' : 'poor');
  const rows = Object.keys(result.fit)
    .sort((a, b) => result.fit[b].score - result.fit[a].score)
    .map((id) => {
      const now = result.fit[id];
      const fut = result.stressFit[id];
      const months = now.window ? `${monthName(now.window.months[0])}–${monthName(now.window.months.at(-1))}` : '—';
      return `<tr><td>${cropById[id].name}</td><td>${months}</td>
        <td class="pct ${cls(now.score)}">${pct(now.score)}</td>
        <td class="pct ${cls(fut.score)}">${pct(fut.score)}</td>
        <td class="muted">${now.limits.join('; ') || '—'}</td></tr>`;
    })
    .join('');
  return `<div class="table-scroll"><table><thead><tr><th>Crop</th><th>Best season</th><th>Fit now</th><th>Fit, hotter &amp; drier</th><th>Limiting factors</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const monthName = (m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];

function run() {
  if (!state.climate) return;
  $('run').disabled = true;
  $('run').textContent = 'Comparing rotations…';
  // Let the button repaint before the (synchronous) search runs.
  setTimeout(() => {
    try {
      showResults();
    } finally {
      $('run').disabled = false;
      $('run').textContent = 'Find rotations';
    }
  }, 30);
}

function showResults() {
  const cropIds = [...$('crop-picker').querySelectorAll('input:checked')].map((el) => el.value);
  const result = recommend({
    climate: state.climate,
    soil: readSoil($('soil-summary').dataset.source || 'Manual entry'),
    priorities: readPriorities(),
    cropIds,
    irrigated: $('irrigated').checked,
    useCovers: $('use-covers').checked,
    maxLength: +$('max-length').value,
    stress: stressScenario(state.climate),
  });

  $('results').hidden = false;
  if (!result.rotations.length) {
    $('results-intro').textContent = 'No rotation fits: fewer than two of your selected crops suit this climate and soil. Try selecting more crops or enabling irrigation.';
    $('rotation-list').innerHTML = '';
  } else {
    $('results-intro').textContent = `Compared ${result.candidates.toLocaleString()} possible rotations built from ${result.viable.length} crops that suit your field. Scores are weighted by your priorities.`;
    $('rotation-list').innerHTML = result.rotations.map(rotationCard).join('');
    $('soc-chart').innerHTML = socChart(
      result.rotations.slice(0, 3).map((r, i) => ({ label: `${i ? `Option ${i + 1}` : 'Best match'}: ${r.slots.map((s) => s.crop.name.split(' (')[0]).join(' → ')}`, values: r.socSeries })),
      result.baseline && { label: `${cropById[result.baseline.ids[0]].name} every year`, values: result.baseline.socSeries },
    );
  }
  $('fit-table').innerHTML = fitTable(result);
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------------------------------------------------------------------ init --

initMap();
buildCropPicker();
updateSoilSummary('Manual entry');
$('fetch-data').addEventListener('click', loadNasaData);
$('demo-data').addEventListener('click', loadDemoData);
$('run').addEventListener('click', run);
['soil-ph', 'soil-soc', 'soil-clay', 'soil-sand', 'soil-drainage'].forEach((id) => $(id).addEventListener('change', () => updateSoilSummary()));
document.querySelectorAll('[data-priority]').forEach((el) =>
  el.addEventListener('input', () => (el.nextElementSibling.value = el.value)),
);
