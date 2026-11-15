// cobertura real da 1ª camada: une as linhas com a largura real e mostra o que fica sem material

const CL = require('clipper-lib'), fs = require('fs');
const FIL = Math.PI * 0.875 * 0.875, SC = 1000, H = 0.2;
const g = fs.readFileSync(process.argv[2] || 'cal_first.gcode', 'utf8').split('\n');
const box = (process.argv[3] || '95,95,125,125').split(',').map(Number);
let x = 0, y = 0, i = g.indexOf(';LAYER:0'); const lines = [];
for (let j = i; j < g.length && !g[j].startsWith(';LAYER:1'); j++) {
  const L = g[j], mx = L.match(/X([-\d.]+)/), my = L.match(/Y([-\d.]+)/), me = L.match(/ E([\d.]+)/);
  const nx = mx ? +mx[1] : x, ny = my ? +my[1] : y;
  if (me && L.startsWith('G1 X')) { const d = Math.hypot(nx - x, ny - y); if (d > 1e-4 && nx > box[0] && nx < box[2] && ny > box[1] && ny < box[3]) { const area = +me[1] * FIL / d, w = area / H + H * (1 - Math.PI / 4); lines.push({ p: [[x, y], [nx, ny]], w }); } }
  x = nx; y = ny;
}
let cov = [];
const batch = 200;
for (let k = 0; k < lines.length; k += batch) {
  const co = new CL.ClipperOffset(2, 5);
  // agrupa por largura aproximada
  const parts = [];
  for (const l of lines.slice(k, k + batch)) { const c = new CL.ClipperOffset(2, 5); c.AddPath(l.p.map(p => ({ X: Math.round(p[0] * SC), Y: Math.round(p[1] * SC) })), CL.JoinType.jtRound, CL.EndType.etOpenRound); const o = []; c.Execute(o, l.w / 2 * SC); parts.push(...o); }
  const c2 = new CL.Clipper(); c2.AddPaths(cov, CL.PolyType.ptSubject, true); c2.AddPaths(parts, CL.PolyType.ptClip, true); const u = []; c2.Execute(CL.ClipType.ctUnion, u, 1, 1); cov = u;
}
// contorno da peça = maior contorno coberto (sem buracos)
const outer = cov.reduce((a, b) => Math.abs(CL.Clipper.Area(b)) > Math.abs(CL.Clipper.Area(a)) ? b : a);
const c3 = new CL.Clipper(); c3.AddPath(outer.slice(), CL.PolyType.ptSubject, true); c3.AddPaths(cov, CL.PolyType.ptClip, true); const holes = []; c3.Execute(CL.ClipType.ctDifference, holes, 1, 1);
const big = holes.map(h => ({ a: Math.abs(CL.Clipper.Area(h)) / 1e6, cx: h.reduce((s, p) => s + p.X, 0) / h.length / SC, cy: h.reduce((s, p) => s + p.Y, 0) / h.length / SC })).filter(h => h.a > 0.003).sort((a, b) => b.a - a.a);
console.log('linhas', lines.length, '· vazios > 0,003 mm²:', big.length, '· área total vazia', big.reduce((s, h) => s + h.a, 0).toFixed(3), 'mm²');
big.slice(0, +(process.argv[4]||12)).forEach(h => console.log('  ', h.a.toFixed(3), 'mm² em (' + h.cx.toFixed(2) + ', ' + h.cy.toFixed(2) + ')'));
