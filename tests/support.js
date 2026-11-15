// Suporte: uma esfera apoiada na mesa precisa de calço em volta da base. A parede só passa do ângulo pedido
// (35°) a R·(1 − cos 35°) = 3,6 mm para R = 20; descontando a folga até a peça, o calço tem de chegar a uns
// 2 mm (até a v13 parava em 0,2 mm). E nenhuma torre pode ser uma lâmina fina.
const T = require('./lib.js');
function supportStats(gcode) {
  let typ = '', z = 0, x = 0, y = 0, layer = -1, top = 0, len = 0; const boxes = {};
  for (const raw of gcode.split('\n')) {
    if (raw.startsWith(';TYPE:')) { typ = raw.slice(6).trim(); continue; }
    if (raw.startsWith(';LAYER:')) { layer = +raw.slice(7); continue; }
    if (raw.startsWith(';Z:')) { z = +raw.slice(3); continue; }
    if (raw[0] === ';' || !raw.startsWith('G1')) continue;
    let nx = x, ny = y, e = 0;
    for (const t of raw.split(/\s+/).slice(1)) { const v = parseFloat(t.slice(1)); if (t[0] === 'X') nx = v; else if (t[0] === 'Y') ny = v; else if (t[0] === 'E') e = v; }
    if (e > 0 && (nx !== x || ny !== y) && typ === 'Support') {
      top = Math.max(top, z); len += Math.hypot(nx - x, ny - y);
      const b = boxes[layer] = boxes[layer] || [1e9, 1e9, -1e9, -1e9];
      b[0] = Math.min(b[0], x, nx); b[1] = Math.min(b[1], y, ny); b[2] = Math.max(b[2], x, nx); b[3] = Math.max(b[3], y, ny);
    }
    x = nx; y = ny;
  }
  let minW = Infinity; for (const k in boxes) minW = Math.min(minW, boxes[k][2] - boxes[k][0], boxes[k][3] - boxes[k][1]);
  return { top, len, minW };
}
const o = T.run('sphere', { supports: 'buildplate' }), s = supportStats(o.r.gcode), err = [];
if (!(s.top >= 1.8)) err.push('o calço da base da esfera só vai até ' + s.top.toFixed(1) + ' mm (esperado ≥ 1,8)');
if (!(s.minW >= 2.5)) err.push('suporte com só ' + s.minW.toFixed(2) + ' mm de largura numa camada');
console.log(`\n## suporte:esfera  calço até ${s.top.toFixed(1)} mm · ${(s.len / 1000).toFixed(1)} m de suporte · largura mínima ${s.minW.toFixed(1)} mm`);
if (err.length || Object.keys(o.c.err).length) { console.log('   ERRO | ' + err.concat(Object.keys(o.c.err)).join(' || ')); process.exitCode = 1; } else console.log('   OK sem erros');
