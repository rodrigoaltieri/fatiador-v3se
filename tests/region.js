// volume extrudado por região XY (para checar paredes finas)
const T = require('./lib.js');
function regionVol(gcode, boxes, zmin) {
  let x = 0, y = 0, z = 0; const out = boxes.map(() => 0);
  for (const raw of gcode.split('\n')) {
    const L = raw.split(';')[0].trim(); if (!L.startsWith('G1') && !L.startsWith('G0')) continue;
    let nx = x, ny = y, nz = z, e = null;
    for (const p of L.split(/\s+/).slice(1)) { const v = parseFloat(p.slice(1)); if (p[0] === 'X') nx = v; else if (p[0] === 'Y') ny = v; else if (p[0] === 'Z') nz = v; else if (p[0] === 'E') e = v; }
    if (e > 0 && (nx !== x || ny !== y) && nz > zmin) { const mx = (x + nx) / 2, my = (y + ny) / 2; boxes.forEach((b, i) => { if (mx >= b[0] && mx <= b[2] && my >= b[1] && my <= b[3]) out[i] += e * T.FIL; }); }
    x = nx; y = ny; z = nz;
  }
  return out;
}
module.exports = { regionVol };
if (require.main === module) {
  const o = T.run('thin', JSON.parse(process.argv[2] || '{}')); T.report(o);
  const [ox, oy] = o.P.off, feats = [['2.0mm', 2, 2, 38, 4], ['1.2mm', 2, 8, 38, 9.2], ['0.8mm', 2, 13, 38, 13.8], ['0.6mm', 2, 18, 38, 18.6], ['pescoço 1.0', 13, 24.5, 27, 25.5]];
  const boxes = feats.map(f => [f[1] + ox, f[2] + oy - 0.3, f[3] + ox, f[4] + oy + 0.3]);
  const v = regionVol(o.r.gcode, boxes, 1.0001);
  feats.forEach((f, i) => { const ideal = (f[3] - f[1]) * (f[4] - f[2]) * 7 * o.cfg.flow; console.log('  ', f[0].padEnd(12), 'extrudado', v[i].toFixed(0).padStart(5), 'ideal', ideal.toFixed(0).padStart(5), (100 * v[i] / ideal).toFixed(0) + '%'); });
  T.dump(o, 'thin.json');
}
