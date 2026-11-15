const T = require('./lib.js');
const NEW = { retLen: 1.2, unretSpeed: 30, bridgeFlow: 0.95, sp: { travel: 150, bridge: 30, gap: 40 } };
const cases = [['cube'], ['cube', { infill: 100 }], ['cube', { pattern: 'gyroid' }], ['cube', { pattern: 'gyroid', infill: 40 }], ['tshape', { supports: 'everywhere', pattern: 'gyroid' }], ['sphere', { supports: 'buildplate' }], ['thin'], ['bridge', { pattern: 'gyroid' }], ['holes', { brim: 5 }], ['big'], ['cube', { layerH: 0.12 }], ['cube', { zhop: 0, retLen: 0 }], ['cube', { walls: 1, top: 0, infill: 0 }]];
const only = process.argv[2];
for (const [n, o] of cases) { if (only && n !== only) continue; const r = T.run(n, Object.assign({}, NEW, o, { sp: Object.assign({}, NEW.sp, (o || {}).sp) })); console.log(JSON.stringify(o || {})); T.report(r); T.dump(r, n + '.json'); }
