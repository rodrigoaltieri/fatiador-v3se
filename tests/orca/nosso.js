// Fatia um STL com o nosso motor usando o perfil calibrado (DEFAULTS do index.html + perfil-inicial.json)
// uso: node run_ours.js <raiz do repo> <entrada.stl> <saida.gcode> [caminho absoluto do core] [json de ajustes extras]
const fs = require('fs'), path = require('path');
const [root, inp, outp, core, extra] = process.argv.slice(2);
const T = require(path.join(root, 'tests', 'lib.js'));
const buf = fs.readFileSync(inp), n = buf.readUInt32LE(80), tris = new Float32Array(n * 9);
for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) tris[i * 9 + j] = buf.readFloatLE(84 + i * 50 + 12 + j * 4);
const cfg = T.defaults(), prof = JSON.parse(fs.readFileSync(path.join(root, 'perfil-inicial.json'), 'utf8')).cfg;
Object.assign(cfg, prof, { sp: Object.assign(cfg.sp, prof.sp), acc: Object.assign(cfg.acc, prof.acc) });
if (extra) { const o = JSON.parse(extra); for (const k in o) { if (o[k] && typeof o[k] === 'object' && cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], o[k]); else cfg[k] = o[k]; } }
const P = T.place(Array.from(tris)), S = core ? require(core) : T.loadCore();
const t0 = Date.now(), r = S.slice({ cfg, tris: P.tris }, () => {}), ms = Date.now() - t0;
fs.writeFileSync(outp, r.gcode);
const c = T.check(r.gcode, cfg);
console.log(JSON.stringify({ ms, time_min: +(r.stats.time / 60).toFixed(1), g: +r.stats.grams.toFixed(2), bytes: r.gcode.length, erros: c.err, avisos: r.stats.warnings, stats: c.stats }).slice(0, 900));
