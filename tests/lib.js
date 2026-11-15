// Ferramentas de teste: modelos, config e verificador de G-code
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

global.ClipperLib = require('clipper-lib');
const FIL = Math.PI * 0.875 * 0.875;
function loadCore() { delete require.cache[require.resolve(require('path').join(__dirname, '..') + '/' + (process.env.CORE || 'core.v13.js') + '')]; return require(require('path').join(__dirname, '..') + '/' + (process.env.CORE || 'core.v13.js') + ''); }
function defaults() {
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  return eval('(' + html.match(/var DEFAULTS = (\{[\s\S]*?\n\});/)[1] + ')');
}
function prism(poly, z0, z1) {
  const o = [], n = poly.length;
  for (let i = 1; i + 1 < n; i++) {
    o.push(poly[0][0], poly[0][1], z0, poly[i + 1][0], poly[i + 1][1], z0, poly[i][0], poly[i][1], z0);
    o.push(poly[0][0], poly[0][1], z1, poly[i][0], poly[i][1], z1, poly[i + 1][0], poly[i + 1][1], z1);
  }
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; o.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z0, b[0], b[1], z1, a[0], a[1], z1); }
  return o;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circ = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]);
function flip(o) { for (let i = 0; i < o.length; i += 9) for (let k = 0; k < 3; k++) { const t = o[i + 3 + k]; o[i + 3 + k] = o[i + 6 + k]; o[i + 6 + k] = t; } return o; }
function sphere(r, nu, nv) { const o = []; const P = (i, j) => { const th = Math.PI * j / nv, ph = 2 * Math.PI * i / nu; return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), -r * Math.cos(th)]; };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); o.push(...a, ...c, ...b, ...a, ...d, ...c); } return o; }
function place(arr) {
  const t = Float32Array.from(arr); let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], t[i + k]); mx[k] = Math.max(mx[k], t[i + k]); }
  const off = [110 - (mn[0] + mx[0]) / 2, 110 - (mn[1] + mx[1]) / 2, -mn[2]];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) t[i + k] += off[k];
  return { tris: t, off, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}
function volume(t) { let v = 0; for (let i = 0; i < t.length; i += 9) { const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.subarray(i, i + 9); v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx); } return v / 6; }
const MODELS = {
  cube: () => prism(rect(0, 0, 20, 20), 0, 20),
  tshape: () => [...prism(rect(0, 0, 10, 10), 0, 15), ...prism(rect(-10, -5, 30, 15), 15, 18), ...prism(circ(45, 5, 8, 64), 0, 20)],
  sphere: () => sphere(20, 96, 48),
  // paredes finas: 2.0, 1.2, 0.8, 0.6 mm sobre uma base
  thin: () => [...prism(rect(0, 0, 40, 30), 0, 1), ...prism(rect(2, 2, 38, 4), 1, 8), ...prism(rect(2, 8, 38, 9.2), 1, 8), ...prism(rect(2, 13, 38, 13.8), 1, 8), ...prism(rect(2, 18, 38, 18.6), 1, 8), ...prism(rect(2, 22, 12, 28), 1, 8), ...prism(rect(11.9, 24.5, 28.1, 25.5), 1, 8), ...prism(rect(28, 22, 38, 28), 1, 8)],
  // placa com furos e ponte (rasgo horizontal)
  bridge: () => [...prism(rect(0, 0, 10, 20), 0, 12), ...prism(rect(40, 0, 50, 20), 0, 12), ...prism(rect(0, 0, 50, 20), 12, 15)],
  holes: () => [...prism(rect(0, 0, 60, 20), 0, 5), ...flip(prism(circ(10, 10, 5, 64), 0, 5)), ...flip(prism(circ(30, 10, 3, 48), 0, 5)), ...flip(prism(circ(48, 10, 1.5, 32), 0, 5))],
  big: () => prism(rect(0, 0, 216, 216), 0, 0.6),
  // paredes mais finas que uma linha: aleta 0.4, aleta 0.3, tubo com parede 0.4, pino 0.5
  fins: () => [...prism(rect(0, 0, 40, 30), 0, 1), ...prism(rect(2, 4, 38, 4.4), 1, 6), ...prism(rect(2, 9, 38, 9.3), 1, 6), ...prism(circ(12, 20, 6, 96), 1, 6), ...flip(prism(circ(12, 20, 5.6, 96), 1, 6)), ...prism(circ(30, 20, 0.25, 24), 1, 6)],
  round: () => prism(circ(0, 0, 15, 128), 0, 4),
};
// ---------- verificador ----------
function check(gcode, cfg, opts) {
  opts = opts || {};
  const err = {}, add = (k, msg) => { (err[k] = err[k] || []).push(msg); };
  let relXYZ = false, x = 0, y = 0, z = 0, f = 0, ret = 0, layerZ = null, layer = -1, rel = false, e_abs = 0, inBody = false;
  let totE = 0, widths = [], maxVol = 0, maxF = 0, nRet = 0, nExt = 0, nTrav = 0, travNoRet = 0, zeroMoves = 0;
  let layerH = cfg.firstH, prevZ = 0, pendingLayer = false, bb = [1e9, 1e9, -1e9, -1e9];
  const lines = gcode.split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    let L = lines[ln]; const sc = L.indexOf(';');
    if (L.startsWith(';LAYER:')) { layer = +L.slice(7); inBody = true; pendingLayer = true; continue; }
    if (L.startsWith(';FIM')) { inBody = false; continue; }
    if (sc >= 0) L = L.slice(0, sc); L = L.trim(); if (!L) continue;
    const p = L.split(/\s+/), cmd = p[0];
    if (cmd === 'M83') rel = true; else if (cmd === 'M82') rel = false; else if (cmd === 'G92') { e_abs = 0; }
    if (cmd === 'G91') { relXYZ = true; continue; } if (cmd === 'G90') { relXYZ = false; continue; }
    if (cmd !== 'G0' && cmd !== 'G1') continue;
    let nx = x, ny = y, nz = z, e = null;
    for (let i = 1; i < p.length; i++) { const c = p[i][0], v = parseFloat(p[i].slice(1)); if (isNaN(v)) add('nan', ln + ': ' + L); if (c === 'X') nx = relXYZ ? x + v : v; else if (c === 'Y') ny = relXYZ ? y + v : v; else if (c === 'Z') nz = relXYZ ? z + v : v; else if (c === 'E') e = v; else if (c === 'F') f = v; }
    if (e !== null && !rel) { const d = e - e_abs; e_abs = e; e = d; }
    const d = Math.hypot(nx - x, ny - y), moved = d > 1e-9;
    if (nx < -3 || nx > 220 || ny < 0 || ny > 220 || nz < 0 || nz > 250) add('bounds', ln + ': ' + L);
    if (f / 60 > 250.01) add('feed', ln + ': ' + L);
    if (inBody) {
      if (pendingLayer && nz !== z) { /* mudança de camada */ }
      if (e !== null && e > 0 && moved) {
        if (pendingLayer) { layerH = +(nz - prevZ).toFixed(4); layerZ = nz; prevZ = nz; pendingLayer = false; }
        if (ret > 5e-4) add('extrude_while_retracted', ln + ': ' + L + ' ret=' + ret.toFixed(3));
        if (cfg.vase ? false : cfg.scarf ? (nz > layerZ + 1e-6 || nz < layerZ - layerH - 1e-6) : (Math.abs(nz - layerZ) > 1e-6 || Math.abs(z - layerZ) > 1e-6)) add('extrude_off_z', ln + ': ' + L + ' z=' + z + ' layerZ=' + layerZ);
        const vol = e * FIL, w = vol / (d * layerH), rate = vol / (d / (f / 60));
        widths.push(w); if (rate > maxVol) maxVol = rate;
        if (!opts.noVolLimit && rate > cfg.maxVol * 1.02) add('over_maxvol', ln + ': ' + L + ' rate=' + rate.toFixed(1));
        if (!cfg.vase && ((w < 0.03 && !cfg.ironing) || w > 0.8)) add('odd_width', ln + ': ' + L + ' w=' + w.toFixed(3));
        totE += e; nExt++; bb = [Math.min(bb[0], x, nx), Math.min(bb[1], y, ny), Math.max(bb[2], x, nx), Math.max(bb[3], y, ny)];
        if (f / 60 > maxF) maxF = f / 60;
      } else if (e !== null && e < 0) { ret += -e; if (!moved) nRet++; }
      else if (e !== null && e > 0 && !moved) { ret -= e; if (ret < -5e-4) add('over_unretract', ln + ': ' + L + ' ret=' + ret.toFixed(4)); if (Math.abs(ret) < 5e-4) ret = 0; if (pendingLayer === false && Math.abs(nz - layerZ) > 1e-6) add('unretract_off_z', ln + ': ' + L); }
      else if (moved) { nTrav++; if (ret < 5e-4 && d > 5) travNoRet++; if (!pendingLayer && layerZ !== null && nz < layerZ - 1e-6) add('travel_below_layer', ln + ': ' + L); }
      if (e !== null && e === 0 && !/E-0$/.test(L)) zeroMoves++;
      if (e !== null && moved && d < 1e-4) zeroMoves++;
    } else if (e !== null) { if (e < 0) ret += -e; else if (!moved) ret = Math.max(0, ret - e); }
    x = nx; y = ny; z = nz;
  }
  widths.sort((a, b) => a - b);
  const q = t => widths.length ? widths[Math.min(widths.length - 1, Math.floor(t * widths.length))].toFixed(3) : '-';
  return { err, vol: totE * FIL, stats: { layers: layer + 1, nExt, nTrav, nRet, travNoRet, zeroMoves, maxVol: maxVol.toFixed(1), maxF: maxF.toFixed(0), w: [q(0), q(0.05), q(0.5), q(0.95), q(0.999)].join('/'), bb: bb.map(v => v.toFixed(1)).join(',') } };
}
function run(name, over, opts) {
  const S = loadCore(), cfg = Object.assign(defaults(), {}), P = place(MODELS[name]());
  for (const k in (over || {})) { if (typeof over[k] === 'object' && !Array.isArray(over[k]) && cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], over[k]); else cfg[k] = over[k]; }
  const t0 = Date.now(), r = S.slice({ cfg, tris: P.tris }, () => {}), ms = Date.now() - t0;
  const c = check(r.gcode, cfg, opts);
  return { name, r, c, ms, vol: volume(P.tris), cfg, P };
}
function report(o) {
  const ek = Object.keys(o.c.err);
  console.log(`\n## ${o.name}  ${o.ms}ms  tempo ${(o.r.stats.time / 60).toFixed(1)}min  ${o.r.stats.grams.toFixed(2)}g  extrudado ${o.c.vol.toFixed(0)}mm³ / malha ${o.vol.toFixed(0)}mm³ = ${(100 * o.c.vol / o.vol).toFixed(1)}%`);
  console.log('  ', JSON.stringify(o.c.stats));
  if (!ek.length) console.log('   OK sem erros'); else ek.forEach(k => console.log('   ERRO', k, 'x' + o.c.err[k].length, '| ex:', o.c.err[k].slice(0, 2).join(' || ')));
}
function dump(o, file) { fs.writeFileSync(path.join(OUT, file), JSON.stringify({ pos: Array.from(o.r.preview.pos), col: Array.from(o.r.preview.col), ends: Array.from(o.r.preview.layerEnds) })); }
module.exports = { OUT, MODELS, run, report, check, place, volume, prism, rect, circ, flip, defaults, loadCore, dump, FIL };
