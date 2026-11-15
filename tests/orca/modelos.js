// gera STL binário (centrado na origem em XY, base em Z=0) dos modelos de teste
const fs = require('fs'), path = require('path');
const out = process.argv[2];
function prism(poly, z0, z1) { const o = [], n = poly.length;
  for (let i = 1; i + 1 < n; i++) { o.push(poly[0][0], poly[0][1], z0, poly[i + 1][0], poly[i + 1][1], z0, poly[i][0], poly[i][1], z0); o.push(poly[0][0], poly[0][1], z1, poly[i][0], poly[i][1], z1, poly[i + 1][0], poly[i + 1][1], z1); }
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; o.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z0, b[0], b[1], z1, a[0], a[1], z1); }
  return o; }
const circ = (r, n) => Array.from({ length: n }, (_, i) => [r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]);
function stl(t) { const n = t.length / 9, b = Buffer.alloc(84 + n * 50); b.writeUInt32LE(n, 80); let o = 84;
  for (let i = 0; i < n; i++) { const a = t.slice(i * 9, i * 9 + 9); const u = [a[3] - a[0], a[4] - a[1], a[5] - a[2]], v = [a[6] - a[0], a[7] - a[1], a[8] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0]; const l = Math.hypot(nx, ny, nz) || 1;
    b.writeFloatLE(nx / l, o); b.writeFloatLE(ny / l, o + 4); b.writeFloatLE(nz / l, o + 8); o += 12; for (let k = 0; k < 9; k++) { b.writeFloatLE(a[k], o); o += 4; } o += 2; }
  return b; }
fs.writeFileSync(path.join(out, 'cube20.stl'), stl(prism([[-10, -10], [10, -10], [10, 10], [-10, 10]], 0, 20)));
fs.writeFileSync(path.join(out, 'cyl20.stl'), stl(prism(circ(10, 128), 0, 20)));
console.log('ok');
