// mapa de material depositado por camada (0,1 mm): mostra onde sobra plástico

const fs = require('fs'), FIL = Math.PI * 0.875 * 0.875;
function density(gcode, layer, box, cell) {
  const g = gcode.split('\n'); let i = g.indexOf(';LAYER:' + layer), x = 0, y = 0, z = 0, zl = null;
  // posição inicial: último X/Y antes da camada
  for (let j = 0; j < i; j++) { const mx = g[j].match(/X([-\d.]+)/), my = g[j].match(/Y([-\d.]+)/); if (mx) x = +mx[1]; if (my) y = +my[1]; }
  const nx = Math.round((box[2] - box[0]) / cell), ny = Math.round((box[3] - box[1]) / cell), D = new Float64Array(nx * ny);
  let h = 0.2;
  for (let j = i + 1; j < g.length && !g[j].startsWith(';LAYER'); j++) {
    const L = g[j], mx = L.match(/X([-\d.]+)/), my = L.match(/Y([-\d.]+)/), me = L.match(/ E([\d.]+)/);
    const X = mx ? +mx[1] : x, Y = my ? +my[1] : y;
    if (me && L.startsWith('G1 X')) {
      const d = Math.hypot(X - x, Y - y), vol = +me[1] * FIL;
      if (d > 1e-4) {
        const w = vol / d / h + h * (1 - Math.PI / 4), ux = (X - x) / d, uy = (Y - y) / d;
        // espalha o volume sobre a faixa de largura w (inclui as pontas arredondadas)
        const pts = []; const step = cell / 2;
        for (let s = -w / 2; s <= d + w / 2 + 1e-9; s += step) for (let t = -w / 2; t <= w / 2 + 1e-9; t += step) {
          const sc = Math.min(Math.max(s, 0), d); if (Math.hypot(s - sc, t) > w / 2) continue;
          pts.push([x + ux * s - uy * t, y + uy * s + ux * t]);
        }
        const v = vol / pts.length;
        for (const p of pts) { const cx = Math.floor((p[0] - box[0]) / cell), cy = Math.floor((p[1] - box[1]) / cell); if (cx >= 0 && cy >= 0 && cx < nx && cy < ny) D[cy * nx + cx] += v; }
      }
    }
    x = X; y = Y;
  }
  for (let k = 0; k < D.length; k++) D[k] /= cell * cell * h;
  return { D, nx, ny };
}
module.exports = { density };
if (require.main === module) {
  const [file, layer, boxs] = process.argv.slice(2), box = boxs.split(',').map(Number);
  const r = density(fs.readFileSync(file, 'utf8'), +layer, box, 0.1);
  // média por zona: canto (2x2 mm), borda (faixa de 1 mm sem os cantos), miolo
  const zone = (x0, y0, x1, y1) => { let s = 0, n = 0, mx = 0; for (let cy = 0; cy < r.ny; cy++) for (let cx = 0; cx < r.nx; cx++) { const X = box[0] + (cx + 0.5) * 0.1, Y = box[1] + (cy + 0.5) * 0.1; if (X >= x0 && X < x1 && Y >= y0 && Y < y1) { const v = r.D[cy * r.nx + cx]; s += v; n++; if (v > mx) mx = v; } } return (s / n).toFixed(2) + ' (máx ' + mx.toFixed(2) + ')'; };
  const [a, b, c, d] = box, m = 0.0;
  console.log('cantos  :', [[a, b], [c - 2, b], [a, d - 2], [c - 2, d - 2]].map(p => zone(p[0], p[1], p[0] + 2, p[1] + 2)).join(' | '));
  console.log('bordas  :', zone(a + 2, b, c - 2, b + 1), '|', zone(a + 2, d - 1, c - 2, d), '|', zone(a, b + 2, a + 1, d - 2), '|', zone(c - 1, b + 2, c, d - 2));
  console.log('miolo   :', zone(a + 3, b + 3, c - 3, d - 3));
}
