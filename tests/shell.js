// Casca vertical: uma parede fina que nasce de um piso precisa de sólido por baixo, em todas as camadas
// sólidas do piso. Até a v14 o pedaço de piso debaixo da parede ficava só com o preenchimento de 15%
// (no Benchy, a parede de trás da cabine soltou do convés por isso).
const T = require('./lib.js');
// piso de 30 x 30 x 4 mm com uma parede de 2 x 20 x 6 mm em cima, no meio
T.MODELS.wallOnDeck = () => [...T.prism(T.rect(0, 0, 30, 30), 0, 4), ...T.prism(T.rect(14, 5, 16, 25), 4, 10)];
const o = T.run('wallOnDeck'), err = [];
// pegada da parede em coordenadas da mesa (o modelo é centrado em 110,110): x 109..111, y 100..120
const box = [109.2, 100.5, 110.8, 119.5], len = {};
let typ = '', layer = -1, x = 0, y = 0;
for (const raw of o.r.gcode.split('\n')) {
  if (raw.startsWith(';TYPE:')) { typ = raw.slice(6).trim(); continue; }
  if (raw.startsWith(';LAYER:')) { layer = +raw.slice(7); continue; }
  if (raw[0] === ';' || !raw.startsWith('G1')) continue;
  let nx = x, ny = y, e = 0;
  for (const t of raw.split(/\s+/).slice(1)) { const v = parseFloat(t.slice(1)); if (t[0] === 'X') nx = v; else if (t[0] === 'Y') ny = v; else if (t[0] === 'E') e = v; }
  if (e > 0 && (nx !== x || ny !== y)) {
    // comprimento do trecho dentro da pegada (amostrado)
    const d = Math.hypot(nx - x, ny - y), n = Math.max(1, Math.ceil(d / 0.1)); let inside = 0;
    for (let i = 0; i < n; i++) { const px = x + (nx - x) * (i + 0.5) / n, py = y + (ny - y) * (i + 0.5) / n; if (px >= box[0] && px <= box[2] && py >= box[1] && py <= box[3]) inside += d / n; }
    if (inside > 0) { const k = layer + '|' + (typ === 'Sparse infill' ? 'ralo' : 'cheio'); len[k] = (len[k] || 0) + inside; }
  }
  x = nx; y = ny;
}
// o piso tem 20 camadas (4 mm); as 5 de cima (15 a 19) são as sólidas do topo
const full = (box[2] - box[0]) * (box[3] - box[1]) / 0.377; // comprimento de linha para cobrir a pegada
const rows = [];
for (let l = 15; l <= 19; l++) {
  const c = len[l + '|cheio'] || 0, r = len[l + '|ralo'] || 0; rows.push(l + ':' + Math.round(100 * c / full) + '%');
  if (c < 0.8 * full) err.push('camada ' + l + ': só ' + Math.round(100 * c / full) + '% da pegada da parede tem sólido');
}
console.log(`\n## casca:parede sobre piso  sólido sob a parede, por camada do piso: ${rows.join(' ')}`);
if (err.length || Object.keys(o.c.err).length) { console.log('   ERRO | ' + err.concat(Object.keys(o.c.err)).slice(0, 3).join(' || ')); process.exitCode = 1; } else console.log('   OK sem erros');
