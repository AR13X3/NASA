// Crop knowledge base.
//
// Values are simplified, literature-informed approximations (FAO ECOCROP,
// FAO Irrigation & Drainage Paper 56, extension guides). They are meant as
// sensible defaults for exploring rotations, not agronomic prescriptions —
// refine them with local extension data for real use.
//
// Field reference:
//   family      botanical family (rotating families breaks pest/disease cycles)
//   group       cereal | legume | oilseed | root | fiber | forage | cover
//   months      length of the growing window in months
//   tMin/tMax   optimal range of mean air temperature over the window (°C)
//   tFloor      coldest monthly mean temperature the crop can sit through (°C)
//   overwinter sown in autumn, grows through winter and is harvested as it warms
//   heatLimit   monthly mean daily-max temperature above which heat stress starts (°C)
//   waterNeed   seasonal crop water requirement (mm)
//   droughtTol  0..1 drought tolerance
//   waterlogTol 0..1 tolerance of wet / poorly drained conditions
//   nFix        fixes atmospheric nitrogen (legume)
//   nDemand     0..1 nitrogen demand
//   residue     0..1 biomass returned to the soil (drives soil organic carbon)
//   rootDepth   effective rooting depth (m)
//   disturbance 0..1 soil disturbance at planting/harvest (tillage, digging)
//   phMin/phMax preferred soil pH range
//   texture     suitability on sandy / loamy / clayey soils (0..1)
//   value       relative economic value per season (0..1)

export const CROPS = [
  { id: 'maize', name: 'Maize (corn)', family: 'Poaceae', group: 'cereal', months: 5, tMin: 18, tMax: 27, tFloor: 10, heatLimit: 35, waterNeed: 600, droughtTol: 0.35, waterlogTol: 0.3, nFix: false, nDemand: 0.9, residue: 0.85, rootDepth: 1.2, disturbance: 0.5, phMin: 5.8, phMax: 7.5, texture: { sandy: 0.6, loamy: 1, clayey: 0.8 }, value: 0.8 },
  { id: 'sorghum', name: 'Sorghum', family: 'Poaceae', group: 'cereal', months: 4, tMin: 22, tMax: 32, tFloor: 15, heatLimit: 40, waterNeed: 450, droughtTol: 0.8, waterlogTol: 0.5, nFix: false, nDemand: 0.7, residue: 0.8, rootDepth: 1.5, disturbance: 0.4, phMin: 5.5, phMax: 8.0, texture: { sandy: 0.7, loamy: 1, clayey: 0.9 }, value: 0.55 },
  { id: 'millet', name: 'Pearl millet', family: 'Poaceae', group: 'cereal', months: 3, tMin: 24, tMax: 33, tFloor: 18, heatLimit: 42, waterNeed: 350, droughtTol: 0.9, waterlogTol: 0.3, nFix: false, nDemand: 0.5, residue: 0.6, rootDepth: 1.2, disturbance: 0.35, phMin: 5.0, phMax: 8.0, texture: { sandy: 1, loamy: 0.9, clayey: 0.6 }, value: 0.4 },
  { id: 'winter-wheat', name: 'Winter wheat', family: 'Poaceae', group: 'cereal', months: 8, overwinter: true, tMin: 4, tMax: 15, tFloor: -12, heatLimit: 32, waterNeed: 450, droughtTol: 0.55, waterlogTol: 0.4, nFix: false, nDemand: 0.7, residue: 0.6, rootDepth: 1.2, disturbance: 0.4, phMin: 6.0, phMax: 7.5, texture: { sandy: 0.6, loamy: 1, clayey: 0.9 }, value: 0.6 },
  { id: 'barley', name: 'Spring barley', family: 'Poaceae', group: 'cereal', months: 4, tMin: 12, tMax: 20, tFloor: 3, heatLimit: 30, waterNeed: 400, droughtTol: 0.6, waterlogTol: 0.3, nFix: false, nDemand: 0.6, residue: 0.6, rootDepth: 1.0, disturbance: 0.4, phMin: 6.0, phMax: 8.0, texture: { sandy: 0.7, loamy: 1, clayey: 0.8 }, value: 0.5 },
  { id: 'oats', name: 'Oats', family: 'Poaceae', group: 'cereal', months: 4, tMin: 12, tMax: 20, tFloor: 3, heatLimit: 28, waterNeed: 450, droughtTol: 0.45, waterlogTol: 0.5, nFix: false, nDemand: 0.5, residue: 0.6, rootDepth: 1.0, disturbance: 0.35, phMin: 5.5, phMax: 7.5, texture: { sandy: 0.8, loamy: 1, clayey: 0.8 }, value: 0.4 },
  { id: 'rice', name: 'Rice (paddy)', family: 'Poaceae', group: 'cereal', months: 5, tMin: 22, tMax: 30, tFloor: 15, heatLimit: 38, waterNeed: 1100, droughtTol: 0.1, waterlogTol: 1.0, nFix: false, nDemand: 0.8, residue: 0.6, rootDepth: 0.4, disturbance: 0.6, phMin: 5.0, phMax: 7.5, texture: { sandy: 0.2, loamy: 0.8, clayey: 1 }, value: 0.75 },
  { id: 'soybean', name: 'Soybean', family: 'Fabaceae', group: 'legume', months: 5, tMin: 20, tMax: 28, tFloor: 12, heatLimit: 35, waterNeed: 500, droughtTol: 0.4, waterlogTol: 0.3, nFix: true, nDemand: 0.2, residue: 0.4, rootDepth: 1.0, disturbance: 0.45, phMin: 6.0, phMax: 7.5, texture: { sandy: 0.6, loamy: 1, clayey: 0.8 }, value: 0.75 },
  { id: 'dry-bean', name: 'Dry bean', family: 'Fabaceae', group: 'legume', months: 3, tMin: 17, tMax: 25, tFloor: 10, heatLimit: 32, waterNeed: 350, droughtTol: 0.3, waterlogTol: 0.2, nFix: true, nDemand: 0.3, residue: 0.3, rootDepth: 0.6, disturbance: 0.5, phMin: 6.0, phMax: 7.5, texture: { sandy: 0.7, loamy: 1, clayey: 0.6 }, value: 0.6 },
  { id: 'chickpea', name: 'Chickpea', family: 'Fabaceae', group: 'legume', months: 4, tMin: 15, tMax: 25, tFloor: 5, heatLimit: 34, waterNeed: 300, droughtTol: 0.75, waterlogTol: 0.1, nFix: true, nDemand: 0.2, residue: 0.35, rootDepth: 1.0, disturbance: 0.4, phMin: 6.0, phMax: 8.5, texture: { sandy: 0.7, loamy: 1, clayey: 0.6 }, value: 0.6 },
  { id: 'lentil', name: 'Lentil', family: 'Fabaceae', group: 'legume', months: 4, tMin: 12, tMax: 22, tFloor: 2, heatLimit: 30, waterNeed: 300, droughtTol: 0.7, waterlogTol: 0.1, nFix: true, nDemand: 0.15, residue: 0.3, rootDepth: 0.7, disturbance: 0.4, phMin: 6.0, phMax: 8.0, texture: { sandy: 0.7, loamy: 1, clayey: 0.7 }, value: 0.55 },
  { id: 'cowpea', name: 'Cowpea', family: 'Fabaceae', group: 'legume', months: 3, tMin: 22, tMax: 32, tFloor: 16, heatLimit: 40, waterNeed: 350, droughtTol: 0.8, waterlogTol: 0.3, nFix: true, nDemand: 0.15, residue: 0.5, rootDepth: 1.0, disturbance: 0.4, phMin: 5.5, phMax: 7.5, texture: { sandy: 1, loamy: 1, clayey: 0.6 }, value: 0.45 },
  { id: 'peanut', name: 'Groundnut (peanut)', family: 'Fabaceae', group: 'legume', months: 5, tMin: 22, tMax: 30, tFloor: 16, heatLimit: 38, waterNeed: 500, droughtTol: 0.6, waterlogTol: 0.2, nFix: true, nDemand: 0.2, residue: 0.3, rootDepth: 0.8, disturbance: 0.8, phMin: 5.5, phMax: 7.0, texture: { sandy: 1, loamy: 0.9, clayey: 0.3 }, value: 0.7 },
  { id: 'alfalfa', name: 'Alfalfa (1 yr in rotation)', family: 'Fabaceae', group: 'forage', months: 7, tMin: 10, tMax: 25, tFloor: -10, heatLimit: 36, waterNeed: 700, droughtTol: 0.7, waterlogTol: 0.2, nFix: true, nDemand: 0.1, residue: 0.7, rootDepth: 2.0, disturbance: 0.1, phMin: 6.5, phMax: 7.8, texture: { sandy: 0.7, loamy: 1, clayey: 0.7 }, value: 0.55 },
  { id: 'canola', name: 'Canola (rapeseed)', family: 'Brassicaceae', group: 'oilseed', months: 5, tMin: 12, tMax: 22, tFloor: 0, heatLimit: 30, waterNeed: 450, droughtTol: 0.45, waterlogTol: 0.3, nFix: false, nDemand: 0.7, residue: 0.6, rootDepth: 1.2, disturbance: 0.4, phMin: 5.5, phMax: 8.0, texture: { sandy: 0.7, loamy: 1, clayey: 0.8 }, value: 0.65 },
  { id: 'sunflower', name: 'Sunflower', family: 'Asteraceae', group: 'oilseed', months: 4, tMin: 18, tMax: 28, tFloor: 10, heatLimit: 38, waterNeed: 450, droughtTol: 0.7, waterlogTol: 0.3, nFix: false, nDemand: 0.6, residue: 0.55, rootDepth: 1.8, disturbance: 0.45, phMin: 6.0, phMax: 7.5, texture: { sandy: 0.8, loamy: 1, clayey: 0.8 }, value: 0.55 },
  { id: 'cotton', name: 'Cotton', family: 'Malvaceae', group: 'fiber', months: 6, tMin: 22, tMax: 32, tFloor: 16, heatLimit: 40, waterNeed: 700, droughtTol: 0.65, waterlogTol: 0.3, nFix: false, nDemand: 0.7, residue: 0.4, rootDepth: 1.5, disturbance: 0.6, phMin: 5.8, phMax: 8.0, texture: { sandy: 0.8, loamy: 1, clayey: 0.9 }, value: 0.75 },
  { id: 'potato', name: 'Potato', family: 'Solanaceae', group: 'root', months: 4, tMin: 14, tMax: 22, tFloor: 6, heatLimit: 30, waterNeed: 500, droughtTol: 0.2, waterlogTol: 0.2, nFix: false, nDemand: 0.8, residue: 0.25, rootDepth: 0.5, disturbance: 0.95, phMin: 5.0, phMax: 6.5, texture: { sandy: 1, loamy: 1, clayey: 0.4 }, value: 0.85 },
  { id: 'cassava', name: 'Cassava', family: 'Euphorbiaceae', group: 'root', months: 10, tMin: 22, tMax: 30, tFloor: 16, heatLimit: 40, waterNeed: 1000, droughtTol: 0.8, waterlogTol: 0.2, nFix: false, nDemand: 0.4, residue: 0.4, rootDepth: 1.0, disturbance: 0.7, phMin: 4.5, phMax: 7.5, texture: { sandy: 1, loamy: 1, clayey: 0.5 }, value: 0.5 },
];

// Off-season cover crops, slotted between cash crops when the climate allows.
export const COVER_CROPS = [
  { id: 'cereal-rye', name: 'Cereal rye', family: 'Poaceae', group: 'cover', months: 5, tMin: 0, tMax: 15, tFloor: -20, heatLimit: 30, waterNeed: 200, droughtTol: 0.7, waterlogTol: 0.4, nFix: false, nDemand: 0.1, residue: 0.8, rootDepth: 1.0, disturbance: 0.05, phMin: 5.0, phMax: 7.5, texture: { sandy: 1, loamy: 1, clayey: 0.9 }, value: 0, role: 'scavenges leftover nitrate and protects soil from erosion' },
  { id: 'hairy-vetch', name: 'Hairy vetch', family: 'Fabaceae', group: 'cover', months: 5, tMin: 3, tMax: 18, tFloor: -12, heatLimit: 30, waterNeed: 200, droughtTol: 0.5, waterlogTol: 0.3, nFix: true, nDemand: 0, residue: 0.6, rootDepth: 0.8, disturbance: 0.05, phMin: 5.5, phMax: 7.5, texture: { sandy: 1, loamy: 1, clayey: 0.8 }, value: 0, role: 'fixes nitrogen for the next crop' },
  { id: 'crimson-clover', name: 'Crimson clover', family: 'Fabaceae', group: 'cover', months: 4, tMin: 6, tMax: 20, tFloor: -6, heatLimit: 30, waterNeed: 200, droughtTol: 0.4, waterlogTol: 0.3, nFix: true, nDemand: 0, residue: 0.5, rootDepth: 0.6, disturbance: 0.05, phMin: 5.5, phMax: 7.0, texture: { sandy: 0.9, loamy: 1, clayey: 0.7 }, value: 0, role: 'fixes nitrogen and feeds pollinators' },
  { id: 'radish', name: 'Tillage radish', family: 'Brassicaceae', group: 'cover', months: 3, tMin: 8, tMax: 20, tFloor: 0, heatLimit: 30, waterNeed: 150, droughtTol: 0.4, waterlogTol: 0.2, nFix: false, nDemand: 0.1, residue: 0.4, rootDepth: 1.5, disturbance: 0.05, phMin: 6.0, phMax: 7.5, texture: { sandy: 0.8, loamy: 1, clayey: 1 }, value: 0, role: 'breaks up compacted soil with deep taproots' },
  { id: 'sunn-hemp', name: 'Sunn hemp', family: 'Fabaceae', group: 'cover', months: 3, tMin: 22, tMax: 32, tFloor: 16, heatLimit: 40, waterNeed: 250, droughtTol: 0.7, waterlogTol: 0.3, nFix: true, nDemand: 0, residue: 0.8, rootDepth: 1.0, disturbance: 0.05, phMin: 5.0, phMax: 7.5, texture: { sandy: 1, loamy: 1, clayey: 0.7 }, value: 0, role: 'fixes nitrogen and builds biomass in hot climates' },
];

export const ALL_CROPS = [...CROPS, ...COVER_CROPS];
export const cropById = Object.fromEntries(ALL_CROPS.map((c) => [c.id, c]));
