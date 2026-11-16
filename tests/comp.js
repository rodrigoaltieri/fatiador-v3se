// Compensações XY e de furos (as do perfil calibrado) não podem apagar partes da peça.
// Até a v15, a compensação de furos subtraía o furo alargado inteiro, e tudo o que ficava dentro de um furo
// sumia: no Benchy, a caixa de carga e a parede de trás da cabine (dentro do convés aberto), camadas 42 a 53.
const T = require('./lib.js'), fs = require('fs'), path = require('path');
const prof = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'perfil-inicial.json'), 'utf8')).cfg;
function wallsPerLayer(gcode) {
  const out = {}; let typ = '', layer = -1, x = 0, y = 0;
  for (const raw of gcode.split('\n')) {
    if (raw.startsWith(';TYPE:')) { typ = raw.slice(6).trim(); continue; }
    if (raw.startsWith(';LAYER:')) { layer = +raw.slice(7); continue; }
    if (raw[0] === ';' || !raw.startsWith('G1')) continue;
    let nx = x, ny = y, e = 0;
    for (const t of raw.split(/\s+/).slice(1)) { const v = parseFloat(t.slice(1)); if (t[0] === 'X') nx = v; else if (t[0] === 'Y') ny = v; else if (t[0] === 'E') e = v; }
    if (e > 0 && (typ === 'Outer wall' || typ === 'Inner wall')) out[layer] = (out[layer] || 0) + Math.hypot(nx - x, ny - y);
    x = nx; y = ny;
  }
  return out;
}
function compare(name, model) {
  const a = T.run(model, { xyComp: 0, holeComp: 0 }), b = T.run(model, { xyComp: prof.xyComp || 0.05, holeComp: prof.holeComp || 0.05 });
  const A = wallsPerLayer(a.r.gcode), B = wallsPerLayer(b.r.gcode), err = [];
  let worst = 1, wl = -1;
  for (const l in A) { const r = (B[l] || 0) / A[l]; if (r < worst) { worst = r; wl = +l; } if (r < 0.9) err.push('camada ' + l + ': só ' + Math.round(100 * r) + '% das paredes'); }
  console.log(`\n## comp:${name}  compensação XY ${prof.xyComp} e de furos ${prof.holeComp} · pior camada ${wl}: ${Math.round(100 * worst)}% das paredes de sem compensação`);
  if (err.length || Object.keys(b.c.err).length) { console.log('   ERRO x' + err.length + ' | ' + err.concat(Object.keys(b.c.err)).slice(0, 3).join(' || ')); process.exitCode = 1; } else console.log('   OK sem erros');
}
// anel com um pino oco no meio: o pino fica dentro do furo do anel
T.MODELS.ringPin = () => [...T.prism(T.rect(0, 0, 40, 40), 0, 2), ...T.prism(T.rect(0, 0, 40, 4), 2, 10), ...T.prism(T.rect(0, 36, 40, 40), 2, 10), ...T.prism(T.rect(0, 4, 4, 36), 2, 10), ...T.prism(T.rect(36, 4, 40, 36), 2, 10),
  ...T.prism(T.circ(20, 20, 5, 64), 2, 10), ...T.flip(T.prism(T.circ(20, 20, 2.5, 48), 2, 10))];
compare('anel com pino', 'ringPin');
const bp = path.join(__dirname, '..', 'modelos', '3DBenchy.stl');
if (fs.existsSync(bp)) {
  const buf = fs.readFileSync(bp), n = buf.readUInt32LE(80), tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) tris[i * 9 + j] = buf.readFloatLE(84 + i * 50 + 12 + j * 4);
  T.MODELS.benchy = () => tris;
  compare('benchy', 'benchy');
}
