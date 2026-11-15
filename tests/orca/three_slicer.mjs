// Fatia um STL com o three-slicer usando os presets da V3 SE + perfil calibrado do Rodrigo
// uso: node run_ts.mjs <pasta do pacote> <entrada.stl> <saida.gcode> [mt]
import fs from 'node:fs';
const [base, inp, outp, extra] = process.argv.slice(2);
const st = await import(base + '/engine/src/settings.js');
const { createSlicer } = await import(base + '/engine/index.js');
const P = 'Creality Ender-3 V3 SE 0.4 nozzle';
const proc = await st.processPresets(), fil = await st.filamentPresets();
const CAL = {
  nozzle_temperature: [205], nozzle_temperature_initial_layer: [210],
  hot_plate_temp: [55], hot_plate_temp_initial_layer: [60], textured_plate_temp: [55], textured_plate_temp_initial_layer: [60],
  cool_plate_temp: [55], cool_plate_temp_initial_layer: [60], eng_plate_temp: [55], eng_plate_temp_initial_layer: [60],
  filament_flow_ratio: [0.98], filament_max_volumetric_speed: [13],
  retraction_length: [1.2], retraction_speed: [40], deretraction_speed: [30], z_hop: [0.2],
  wall_loops: 3, top_shell_layers: 5, bottom_shell_layers: 4, sparse_infill_density: '15%', sparse_infill_pattern: 'rectilinear',
  initial_layer_speed: [25], initial_layer_infill_speed: [25], outer_wall_speed: [40], inner_wall_speed: [70], top_surface_speed: [40],
  internal_solid_infill_speed: [80], sparse_infill_speed: [120], travel_speed: [150],
  outer_wall_acceleration: [700], inner_wall_acceleration: [1500], top_surface_acceleration: [1000], default_acceleration: [2000],
  travel_acceleration: [2500], initial_layer_acceleration: [500],
  skirt_loops: 1,
};
const settings = Object.assign({}, st.printerSettings(P), proc.settingsFor('0.20mm Standard @Creality Ender3V3SE 0.4'),
  fil.settingsFor('Creality Generic PLA @Ender-3V3-all'), extra === 'stock' ? {} : CAL);
const params = st.deriveKernelParams(settings);
fs.writeFileSync(outp + '.settings.json', JSON.stringify(settings, null, 1));
fs.writeFileSync(outp + '.params.json', JSON.stringify(params, null, 1));
const stl = fs.readFileSync(inp);
const t0 = performance.now();
const slicer = await createSlicer();
const t1 = performance.now();
const r = slicer.slice(new Uint8Array(stl), params);
const t2 = performance.now();
if (r.error) { console.error('ERRO', r.error); process.exit(1); }
fs.writeFileSync(outp, r.gcode);
console.log(JSON.stringify({ carregar_ms: Math.round(t1 - t0), fatiar_ms: Math.round(t2 - t1), stats: r.stats, warnings: r.warnings, throughput: r.throughput, bytes: r.gcode.length }, null, 1));
// segunda fatiada (kernel já quente)
const t3 = performance.now(); const r2 = slicer.slice(new Uint8Array(stl), params); console.log('segunda fatiada ms', Math.round(performance.now() - t3), r2.gcode === r.gcode ? 'idêntica' : 'DIFERENTE');
slicer.dispose();
