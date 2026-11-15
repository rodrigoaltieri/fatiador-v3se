const T = require('./lib.js'), fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function prism('), end = html.indexOf('var CAL_STEPS');
const gens = eval('(function(){ var br = v => String(v);' + html.slice(start, end) + '; return { first: genFirst, temp: genTemp, flow: () => genFlow(FLOW1, "x"), ret: genRet, vol: genVol, fit: genFit, ghost: genGhost, corner: genCorner }; })()');
const S = T.loadCore();
for (const name of Object.keys(gens)) {
  const g = gens[name](), cfg = T.defaults(), ov = g.cal.over || {};
  for (const k in ov) { if (typeof ov[k] === 'object') Object.assign(cfg[k], ov[k]); else cfg[k] = ov[k]; }
  const P = T.place(Array.from(g.tris));
  if (g.cal.layerCmds) cfg.layerCmds = JSON.parse(JSON.stringify(g.cal.layerCmds));
  if (g.cal.retSchedule) cfg.retSchedule = g.cal.retSchedule;
  if (g.cal.speedSchedule) cfg.speedSchedule = g.cal.speedSchedule;
  if (g.cal.accSchedule) cfg.accSchedule = g.cal.accSchedule;
  if (g.cal.loopZones) cfg.loopZones = g.cal.loopZones.map(z => ({ x0: z.x0 + P.off[0], x1: z.x1 + P.off[0], y0: z.y0 + P.off[1], y1: z.y1 + P.off[1], outer: z.outer, seam: z.seam, order: z.order, corner: z.corner }));
  if (g.cal.zones) cfg.flowZones = g.cal.zones.map(z => ({ x0: z.x0 + P.off[0], x1: z.x1 + P.off[0], y0: z.y0 + P.off[1], y1: z.y1 + P.off[1], f: z.f }));
  const t0 = Date.now(), r = S.slice({ cfg, tris: P.tris }, () => {});
  const c = T.check(r.gcode, cfg, { noVolLimit: name === 'vol' });
  T.report({ name: 'cal:' + name, r, c, ms: Date.now() - t0, vol: T.volume(P.tris), cfg, P });
  fs.writeFileSync(require('path').join(T.OUT, 'cal_' + name + '.gcode'), r.gcode);
  T.dump({ r }, 'cal_' + name + '.json');
}
