// Compara as paredes do nosso G-code com o G-code de referência gerado pelo OrcaSlicer 2.5.1 de verdade
// (perfil oficial da V3 SE 0.4 + valores calibrados; ver tests/orca/README.md).
// Cubo: cada parede tem de coincidir com a do Orca em posição, fluxo, velocidade e aceleração.
// Cilindro: as paredes têm de ficar a menos de 0,03 mm e a costura tem de ficar parada de uma camada para a outra.
const T = require('./lib.js'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const FIL = T.FIL;
function walls(gcode) {
  let x = 0, y = 0, f = 0, acc = null, typ = '', layer = -1, own = false, body = false;
  const out = {};
  for (const raw of gcode.split('\n')) {
    if (raw[0] === ';') {
      if (raw.startsWith(';TYPE:')) typ = raw.slice(6).trim();
      else if (raw.startsWith(';LAYER:')) { layer = +raw.slice(7); own = true; body = true; }
      else if (raw.startsWith(';LAYER_CHANGE')) { if (!own) layer++; body = true; }
      continue;
    }
    const p = raw.split(';')[0].trim().split(/\s+/), cmd = p[0];
    if (cmd === 'M204') { for (const t of p) if (t[0] === 'P') acc = +t.slice(1); continue; }
    if (cmd !== 'G1' && cmd !== 'G0') continue;
    let nx = x, ny = y, e = 0;
    for (const t of p.slice(1)) { const v = parseFloat(t.slice(1)); if (t[0] === 'X') nx = v; else if (t[0] === 'Y') ny = v; else if (t[0] === 'E') e = v; else if (t[0] === 'F') f = v; }
    const d = Math.hypot(nx - x, ny - y);
    if (body && d > 1e-6 && e > 0 && (typ === 'Outer wall' || typ === 'Inner wall')) (out[layer + '|' + typ] = out[layer + '|' + typ] || []).push({ x0: x, y0: y, x1: nx, y1: ny, d, e, f, acc });
    x = nx; y = ny;
  }
  return out;
}
function distSeg(px, py, s) {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy, t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / l2));
  return Math.hypot(px - s.x0 - dx * t, py - s.y0 - dy * t);
}
function compare(name, model, tol, exact) {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'ref', 'orca', 'gcode', name));
  const ref = walls((name.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8'));
  const o = T.run(model), mine = walls(o.r.gcode), err = [];
  let worst = 0, n = 0, eRef = 0, eMine = 0;
  const seams = [];
  for (const key of Object.keys(ref)) {
    const [l, typ] = key.split('|');
    if (+l === 0) continue; // a 1ª camada é diferente de propósito (largura 0,5 e pé de elefante)
    const A = ref[key], B = mine[key] || [];
    if (!B.length) { err.push('falta ' + key); continue; }
    for (const s of B) for (const [px, py] of [[s.x0, s.y0], [s.x1, s.y1], [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2]]) {
      let d = Infinity; for (const r of A) { const v = distSeg(px, py, r); if (v < d) d = v; }
      if (d > worst) worst = d; n++;
      if (d > tol) err.push(key + ' ponto a ' + d.toFixed(4) + ' mm da parede do Orca');
    }
    const sum = (S, k) => S.reduce((a, s) => a + s[k], 0);
    eRef += sum(A, 'e'); eMine += sum(B, 'e');
    if (Math.abs(sum(A, 'e') - sum(B, 'e')) > 0.005 * sum(A, 'e')) err.push(key + ' fluxo diferente: ' + sum(B, 'e').toFixed(4) + ' x ' + sum(A, 'e').toFixed(4));
    if (exact) {
      if (Math.abs(sum(A, 'd') - sum(B, 'd')) > 0.01) err.push(key + ' comprimento diferente');
      if (typ === 'Outer wall' && (A[0].f !== B[0].f || A[0].acc !== B[0].acc)) err.push(key + ' velocidade/aceleração diferente: F' + B[0].f + ' P' + B[0].acc + ' x F' + A[0].f + ' P' + A[0].acc);
    }
    if (typ === 'Outer wall') seams.push([B[0].x0, B[0].y0]);
  }
  const sx = seams.map(p => p[0]), sy = seams.map(p => p[1]), spread = Math.hypot(Math.max(...sx) - Math.min(...sx), Math.max(...sy) - Math.min(...sy));
  if (!(spread <= 0.05)) err.push('a costura muda de lugar entre as camadas: espalhada por ' + spread.toFixed(3) + ' mm');
  console.log(`\n## orca:${model}  ${n} pontos de parede comparados · maior desvio ${worst.toFixed(4)} mm · filamento das paredes ${eMine.toFixed(1)} x ${eRef.toFixed(1)} mm (Orca) · costura em ${seams.length ? seams[0].map(v => v.toFixed(2)).join(',') : '-'} (variação ${spread.toFixed(3)} mm)`);
  if (err.length) { console.log('   ERRO x' + err.length + ' | ex: ' + err.slice(0, 3).join(' || ')); process.exitCode = 1; } else console.log('   OK sem erros');
}
T.MODELS.cyl = () => T.prism(T.circ(0, 0, 10, 128), 0, 20);
compare('cubo20_orca-2.5.1.gcode', 'cube', 0.003, true);
compare('cilindro20_orca-2.5.1.gcode.gz', 'cyl', 0.03, false);
