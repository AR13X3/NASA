# Rotation Compass 🌱🛰️

**NASA Space Apps Challenge** — a decision-support tool that helps farmers explore crop rotations that strengthen soil health, conserve water and adapt to a changing climate, using **NASA Earth observations**, local soil information, crop characteristics and the farmer's own priorities.

## What it does

1. **Pick your field** on a map (or type coordinates).
2. **Pull NASA data** for that point: ~15 years of monthly temperature, daily-max heat, rainfall, root-zone soil wetness and sunlight from **NASA POWER**. From this it builds a monthly climate profile and measures the local **warming and rainfall trends**.
3. **Load soil data** (pH, organic carbon, clay, sand) for the top 30 cm from **ISRIC SoilGrids**. Farmers can overwrite it with their own soil test.
4. **Say what matters**: soil health, saving water, climate resilience and income, each weighted 0–5. You can also set irrigation, whether to use cover crops, rotation length and which crops you're willing to grow.
5. **Get ranked rotations** (2–4 year cycles, with off-season cover crops). For each one you get:
   - scores for soil health, water, climate resilience and income
   - plain-language reasons it works (e.g. "Soybean leaves nitrogen for the maize that follows") and risks to watch for
   - a 12-year soil organic matter outlook compared with growing one crop every year
   - a per-crop suitability table **now vs. a hotter, drier future** (stress test)

## Run it

It's a static site (plain HTML + JavaScript modules, no build step). ES modules need to be served over HTTP:

```bash
python3 -m http.server 8000   # or: npm start
# open http://localhost:8000
```

No API keys are needed. **Use demo data (offline)** loads illustrative values (clearly labelled, *not* NASA data) so you can demo without internet.

Run the tests (Node 18+):

```bash
npm test
```

## How it works

```
index.html / css/styles.css   UI
js/app.js       wires the UI together, renders results
js/climate.js   NASA POWER client → climate profile, trends, stress-test scenario
js/soil.js      SoilGrids client → texture class, drainage, plant-available water
js/crops.js     crop + cover-crop knowledge base (editable table)
js/engine.js    suitability model, rotation search, scoring, explanations
js/charts.js    dependency-free SVG charts
test/           node:test unit tests
```

### NASA data used

| NASA POWER parameter | Used for |
|---|---|
| `T2M` mean temperature | growing-window selection, temperature fit, warming trend |
| `T2M_MAX` max temperature | heat-stress check |
| `PRECTOTCORR` precipitation | water supply per season, rainfall trend |
| `GWETROOT` root-zone soil wetness | shown to farmers (planned: calibrate soil water) |
| `ALLSKY_SFC_SW_DWN` solar radiation | fetched (planned: evapotranspiration / yield potential) |

Endpoint: `https://power.larc.nasa.gov/api/temporal/monthly/point` (community `AG`).

### Scoring model (short version)

- **Crop suitability**: for each crop, find the best growing window (months in a row, wrapping over the year end so the southern hemisphere works; winter crops must be sown in autumn). Score temperature, heat stress, water (effective rain + stored soil water, adjusted for drought tolerance) and soil (pH, texture). The most limiting factor counts most. The same is done for a **stress-test future**: the NASA-measured trend projected 10 years ahead, but never milder than +1.5 °C and −10 % rain.
- **Rotation search**: every 2–4 year cycle of the crops that fit (≥ 50 %), with no crop straight after itself and cyclic duplicates removed (~4,000 candidates, under 2 s). The best off-season cover crop is picked for each gap: a legume cover before a nitrogen-hungry crop, cereal rye to catch leftover nitrogen after one.
- **Soil health**: residue returned, pest/disease breaks (plant families alternating, no crop returning too soon), family diversity, nitrogen balance, cover-crop use, low tillage disturbance.
- **Water**: how well rain covers the crops' needs, how much water they ask for, and drought tolerance. Needing irrigation is penalized.
- **Resilience**: suitability under the stress-test climate (average and worst crop) plus diversity.
- **Income**: relative crop value × expected yield (suitability) + fertilizer saved by legumes.
- **Overall** = score weighted by the farmer's priorities × how well the weakest crop fits.

⚠️ Crop parameters in `js/crops.js` are simplified approximations (FAO ECOCROP / FAO-56 style) and the soil-carbon outlook is an **illustrative index**, not a calibrated model. This is a tool for exploring options, not a prescription.

## Ideas for the team (roadmap)

- **More NASA data**: SMAP soil moisture (L3/L4), MODIS/VIIRS NDVI for field productivity history, GPM IMERG for drought/extreme-rain frequency, Landsat/HLS for bare-soil (erosion) days, NASA NEX-GDDP-CMIP6 for real climate projections instead of the trend stress test.
- **Local crop calendars and prices** (FAO GIEWS, national statistics) instead of relative values.
- **Double cropping** in warm climates (two crops per year).
- **Evapotranspiration** (Hargreaves or Penman using solar + temperature) instead of fixed crop water needs.
- **Calibrate soil carbon** against RothC or published cover-crop meta-analyses.
- **Languages & offline use**: translate the UI, cache results as a PWA for low-connectivity areas.
- **Farmer feedback loop**: let farmers record what worked and use it to tune crop parameters locally.

## Data credits

- NASA POWER Project, NASA Langley Research Center (LaRC), funded through the NASA Earth Science/Applied Science Program.
- Poggio, L. et al. (2021). SoilGrids 2.0. *SOIL*, 7, 217–240. ISRIC — World Soil Information.
- Map tiles © OpenStreetMap contributors, via Leaflet.
