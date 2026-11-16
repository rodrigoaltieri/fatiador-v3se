/* Fatiador V3 SE — núcleo de fatiamento (v15).
   Gera G-code para Creality Ender-3 V3 SE (bico 0.4, Marlin, extrusão relativa).
   Depende de ClipperLib (clipper-lib 6.4.2). Funciona em Worker, página ou Node. */
(function (G) {
  'use strict';
  var CL = (typeof G.ClipperLib !== 'undefined') ? G.ClipperLib : require('clipper-lib');
  var SC = 1000; // mm -> unidades inteiras (1 µm)
  var CT = CL.ClipType, PT = CL.PolyType, PFT = CL.PolyFillType, JT = CL.JoinType, ET = CL.EndType;
  var FIL_AREA = Math.PI * 0.875 * 0.875; // filamento 1.75 mm
  var BED_X = 220, BED_Y = 220, BED_Z = 250;
  var Z_SPEED = 5;        // mm/s, limite da máquina
  var EPS_GAP = 0.01;     // folga usada nos laços de preenchimento de vão
  var THIN_INSET = 0.12;  // recuo dos laços de parede fina (largura mínima imprimível 0,24 mm)
  var MIN_GAP = 0.15;     // vãos menores que isso ficam sem preencher

  var TYPE = { OUTER: 0, INNER: 1, SPARSE: 2, SOLID: 3, TOP: 4, SUPPORT: 5, IFACE: 6, SKIRT: 7, GAP: 8, BRIDGE: 9, IRON: 10 };
  // nomes dos tipos de trecho como o OrcaSlicer escreve em ;TYPE:
  var TYPE_NAME = ['Outer wall', 'Inner wall', 'Sparse infill', 'Internal solid infill', 'Top surface', 'Support', 'Support interface', 'Skirt', 'Gap infill', 'Bridge', 'Ironing'];
  var COLORS = [
    [255, 138, 61],  // parede externa
    [255, 214, 92],  // parede interna
    [176, 70, 90],   // preenchimento
    [140, 110, 230], // sólido interno
    [235, 70, 70],   // topo
    [70, 190, 140],  // suporte
    [120, 225, 180], // interface de suporte
    [90, 180, 230],  // saia / borda
    [255, 120, 200], // vão entre paredes
    [40, 100, 235],  // ponte
    [255, 190, 190]  // alisamento do topo
  ];

  /* ---------- operações de polígonos ---------- */
  function op(type, a, b) {
    var c = new CL.Clipper();
    if (a && a.length) c.AddPaths(a, PT.ptSubject, true);
    if (b && b.length) c.AddPaths(b, PT.ptClip, true);
    var out = [];
    c.Execute(type, out, PFT.pftNonZero, PFT.pftNonZero);
    return out;
  }
  function U(a, b) { if (!a.length && !(b && b.length)) return []; return op(CT.ctUnion, a, b || []); }
  function I(a, b) { return (a.length && b.length) ? op(CT.ctIntersection, a, b) : []; }
  function D(a, b) { if (!a.length) return []; if (!b.length) return a; return op(CT.ctDifference, a, b); }
  function OFF(paths, delta, round) {
    if (!paths.length) return [];
    if (delta === 0) return paths;
    var co = new CL.ClipperOffset(2, 0.01 * SC);
    co.AddPaths(paths, round ? JT.jtRound : JT.jtMiter, ET.etClosedPolygon);
    var out = [];
    co.Execute(out, delta);
    return out;
  }
  function OPEN(paths, r) { return r > 0 ? OFF(OFF(paths, -r, true), r, true) : paths; }   // cantos arredondados
  function OPENM(paths, r) { return r > 0 ? OFF(OFF(paths, -r), r) : paths; }              // cantos vivos
  function clean(paths, d) { return CL.Clipper.CleanPolygons(paths, d); }
  function areaMM(paths) { var a = 0; for (var i = 0; i < paths.length; i++) a += CL.Clipper.Area(paths[i]); return a / (SC * SC); }
  function dropSmall(paths, mm2) {
    var m = mm2 * SC * SC;
    return paths.filter(function (p) { return Math.abs(CL.Clipper.Area(p)) >= m; });
  }
  function islands(paths) {
    if (!paths.length) return [];
    var c = new CL.Clipper();
    c.AddPaths(paths, PT.ptSubject, true);
    var tree = new CL.PolyTree();
    c.Execute(CT.ctUnion, tree, PFT.pftNonZero, PFT.pftNonZero);
    var res = [];
    (function walk(node) {
      var ch = node.Childs();
      for (var i = 0; i < ch.length; i++) {
        var outer = ch[i], isl = [outer.Contour()], holes = outer.Childs();
        for (var j = 0; j < holes.length; j++) { isl.push(holes[j].Contour()); walk(holes[j]); }
        res.push(isl);
      }
    })(tree);
    return res;
  }
  function clipOpen(lines, polys) {
    if (!lines.length || !polys.length) return [];
    var c = new CL.Clipper();
    c.AddPaths(lines, PT.ptSubject, false);
    c.AddPaths(polys, PT.ptClip, true);
    var tree = new CL.PolyTree();
    c.Execute(CT.ctIntersection, tree, PFT.pftNonZero, PFT.pftNonZero);
    return CL.Clipper.OpenPathsFromPolyTree(tree);
  }
  function inside(x, y, paths) {
    var pt = { X: Math.round(x * SC), Y: Math.round(y * SC) }, c = 0;
    for (var i = 0; i < paths.length; i++) if (CL.Clipper.PointInPolygon(pt, paths[i]) !== 0) c++;
    return (c & 1) === 1;
  }
  // Suporte em grade, como o estilo "grid" do OrcaSlicer: a área que precisa de apoio é alargada para as
  // células inteiras de uma grade fixa (g mm) que ela toca. Assim cada torre tem pelo menos uma célula de
  // largura e não muda de forma de uma camada para a outra.
  function snapGrid(paths, g) {
    if (!paths.length) return [];
    var G = g * SC, cells = new Set(), i, j, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var mark = function (X, Y) { cells.add(Math.floor(X / G) * 65536 + Math.floor(Y / G)); };
    for (i = 0; i < paths.length; i++) {
      var p = paths[i], n = p.length;
      for (j = 0; j < n; j++) {
        var A = p[j], B = p[(j + 1) % n], len = Math.hypot(B.X - A.X, B.Y - A.Y), st = Math.max(1, Math.ceil(len / (G / 3)));
        for (var t = 0; t <= st; t++) mark(A.X + (B.X - A.X) * t / st, A.Y + (B.Y - A.Y) * t / st);
        if (A.X < x0) x0 = A.X; if (A.X > x1) x1 = A.X; if (A.Y < y0) y0 = A.Y; if (A.Y > y1) y1 = A.Y;
      }
    }
    // células inteiras dentro da área (o centro está dentro)
    for (var cx = Math.floor(x0 / G); cx <= Math.floor(x1 / G); cx++) for (var cy = Math.floor(y0 / G); cy <= Math.floor(y1 / G); cy++) {
      if (!cells.has(cx * 65536 + cy) && inside((cx + 0.5) * g, (cy + 0.5) * g, paths)) cells.add(cx * 65536 + cy);
    }
    // junta as células de cada linha em retângulos e une tudo
    var rows = new Map();
    cells.forEach(function (k) { var ix = Math.floor(k / 65536), iy = k - ix * 65536, r = rows.get(iy); if (r) r.push(ix); else rows.set(iy, [ix]); });
    var rects = [];
    rows.forEach(function (xs, iy) {
      xs.sort(function (a, b) { return a - b; });
      var a = xs[0], b = xs[0];
      for (var q = 1; q <= xs.length; q++) {
        if (q < xs.length && xs[q] === b + 1) { b = xs[q]; continue; }
        var X0 = Math.round(a * G), X1 = Math.round((b + 1) * G), Y0 = Math.round(iy * G), Y1 = Math.round((iy + 1) * G);
        rects.push([{ X: X0, Y: Y0 }, { X: X1, Y: Y0 }, { X: X1, Y: Y1 }, { X: X0, Y: Y1 }]);
        if (q < xs.length) { a = xs[q]; b = xs[q]; }
      }
    });
    return U(rects);
  }
  function toMM(path) {
    var a = new Array(path.length * 2);
    for (var i = 0; i < path.length; i++) { a[2 * i] = path[i].X / SC; a[2 * i + 1] = path[i].Y / SC; }
    return a;
  }
  function boundsMM(paths) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < paths.length; i++) for (var j = 0; j < paths[i].length; j++) {
      var p = paths[i][j];
      if (p.X < b[0]) b[0] = p.X; if (p.Y < b[1]) b[1] = p.Y; if (p.X > b[2]) b[2] = p.X; if (p.Y > b[3]) b[3] = p.Y;
    }
    return [b[0] / SC, b[1] / SC, b[2] / SC, b[3] / SC];
  }

  /* ---------- fatiamento da malha ---------- */
  function lowerBound(arr, v) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo;
  }
  function sliceMesh(tris, planes, progress) {
    var nT = tris.length / 9, nL = planes.length, segs = new Array(nL), l, t;
    for (l = 0; l < nL; l++) segs[l] = [];
    for (t = 0; t < nT; t++) {
      var o = t * 9, z0 = tris[o + 2], z1 = tris[o + 5], z2 = tris[o + 8];
      var zmin = Math.min(z0, z1, z2), zmax = Math.max(z0, z1, z2);
      if (zmax === zmin) continue;
      for (l = lowerBound(planes, zmin); l < nL && planes[l] < zmax; l++) {
        var z = planes[l], ux = 0, uy = 0, dx = 0, dy = 0, gu = false, gd = false;
        for (var e = 0; e < 3; e++) {
          var a = o + e * 3, b = o + ((e + 1) % 3) * 3;
          var aUp = tris[a + 2] > z, bUp = tris[b + 2] > z;
          if (aUp === bUp) continue;
          var p = aUp ? b : a, q = aUp ? a : b; // p = vértice de baixo (determinístico)
          var k = (z - tris[p + 2]) / (tris[q + 2] - tris[p + 2]);
          var x = tris[p] + (tris[q] - tris[p]) * k, y = tris[p + 1] + (tris[q + 1] - tris[p + 1]) * k;
          if (!aUp && bUp) { ux = x; uy = y; gu = true; } else { dx = x; dy = y; gd = true; }
        }
        if (gu && gd) segs[l].push(dx, dy, ux, uy);
      }
      if (progress && (t & 16383) === 0) progress(0.02 + 0.10 * t / nT, 'Cortando a malha');
    }
    return segs;
  }
  function key(x, y) { return (Math.round(x * 1e4) + 3e6) * 1e7 + (Math.round(y * 1e4) + 3e6); }
  function chain(arr) {
    var n = arr.length / 4, start = new Map(), i;
    for (i = 0; i < n; i++) {
      var k = key(arr[4 * i], arr[4 * i + 1]), l = start.get(k);
      if (l) l.push(i); else start.set(k, [i]);
    }
    var used = new Uint8Array(n), closed = [], open = [];
    for (i = 0; i < n; i++) {
      if (used[i]) continue;
      var poly = [arr[4 * i], arr[4 * i + 1]], cur = i, k0 = key(arr[4 * i], arr[4 * i + 1]), isClosed = false;
      for (;;) {
        used[cur] = 1;
        var bx = arr[4 * cur + 2], by = arr[4 * cur + 3], kb = key(bx, by);
        if (kb === k0) { isClosed = true; break; }
        poly.push(bx, by);
        var c = start.get(kb), nx = -1;
        if (c) for (var j = 0; j < c.length; j++) if (!used[c[j]]) { nx = c[j]; break; }
        if (nx < 0) break;
        cur = nx;
      }
      if (isClosed) closed.push(poly); else open.push(poly);
    }
    // costura de cadeias abertas (malhas com pequenos defeitos)
    var tol2 = 1.0;
    while (open.length) {
      var pl = open.pop(), joined = true;
      while (joined && open.length) {
        joined = false;
        var ex = pl[pl.length - 2], ey = pl[pl.length - 1], best = -1, bd = tol2;
        for (var m = 0; m < open.length; m++) {
          var ddx = open[m][0] - ex, ddy = open[m][1] - ey, d2 = ddx * ddx + ddy * ddy;
          if (d2 < bd) { bd = d2; best = m; }
        }
        var sx = pl[0] - ex, sy = pl[1] - ey;
        if (best >= 0 && bd < sx * sx + sy * sy) { pl = pl.concat(open[best]); open.splice(best, 1); joined = true; }
      }
      if (pl.length >= 6) closed.push(pl);
    }
    var paths = [];
    for (i = 0; i < closed.length; i++) {
      var pp = closed[i];
      if (pp.length < 6) continue;
      var path = new Array(pp.length / 2);
      for (var q = 0; q < path.length; q++) path[q] = { X: Math.round(pp[2 * q] * SC), Y: Math.round(pp[2 * q + 1] * SC) };
      paths.push(path);
    }
    return paths;
  }

  /* ---------- espessura local dos laços ----------
     Para cada trecho de cada laço, lança um raio para o lado de dentro e mede a distância até o
     laço do lado oposto. Com isso o fluxo é reduzido onde duas passadas ficam mais próximas que
     uma linha (paredes finas), em vez de extrudar em dobro. */
  function analyze(paths, maxR) {
    var n = paths.length, i, j, out = [];
    if (!n) return out;
    var bigA = 0;
    for (i = 0; i < n; i++) { var a = CL.Clipper.Area(paths[i]); if (Math.abs(a) > Math.abs(bigA)) bigA = a; }
    var sgn = bigA >= 0 ? 1 : -1; // +1: interior à esquerda do sentido do laço
    var C = 1.0, grid = new Map(), segs = [], base = [], SUB = 1.0;
    function put(ix, iy, id) { var kk = (ix + 64) * 4096 + (iy + 64), c = grid.get(kk); if (c) { if (c[c.length - 1] !== id) c.push(id); } else grid.set(kk, [id]); }
    for (i = 0; i < n; i++) {
      var p = paths[i], m = p.length;
      base.push(segs.length / 4);
      for (j = 0; j < m; j++) {
        var A = p[j], B = p[(j + 1) % m], ax = A.X / SC, ay = A.Y / SC, bx = B.X / SC, by = B.Y / SC, id = segs.length / 4;
        segs.push(ax, ay, bx, by);
        var len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len / (C * 0.5)));
        for (var s = 0; s <= steps; s++) put(Math.floor((ax + (bx - ax) * s / steps) / C), Math.floor((ay + (by - ay) * s / steps) / C), id);
      }
    }
    var stamp = new Int32Array(segs.length / 4), stampId = 0;
    function ray(ox, oy, nx, ny, self) {
      var best = Infinity, tx = ox + nx * maxR, ty = oy + ny * maxR;
      var cx0 = Math.floor(Math.min(ox, tx) / C) - 1, cx1 = Math.floor(Math.max(ox, tx) / C) + 1;
      var cy0 = Math.floor(Math.min(oy, ty) / C) - 1, cy1 = Math.floor(Math.max(oy, ty) / C) + 1;
      stampId++;
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var cell = grid.get((cx + 64) * 4096 + (cy + 64));
        if (!cell) continue;
        for (var k = 0; k < cell.length; k++) {
          var sId = cell[k];
          if (sId === self || stamp[sId] === stampId) continue;
          stamp[sId] = stampId;
          var o = sId * 4, sax = segs[o], say = segs[o + 1], ex = segs[o + 2] - sax, ey = segs[o + 3] - say;
          var den = nx * ey - ny * ex;
          if (Math.abs(den) < 1e-12) continue;
          var rx = sax - ox, ry = say - oy, sd = (rx * ey - ry * ex) / den;
          if (sd <= 1e-6 || sd > maxR || sd >= best) continue;
          var u = (rx * ny - ry * nx) / den;
          if (u < -1e-9 || u > 1 + 1e-9) continue;
          best = sd;
        }
      }
      return best;
    }
    for (i = 0; i < n; i++) {
      var pp = paths[i], mm = pp.length, P = [], T = [];
      for (j = 0; j < mm; j++) {
        var o2 = (base[i] + j) * 4, x0 = segs[o2], y0 = segs[o2 + 1], x1 = segs[o2 + 2], y1 = segs[o2 + 3];
        var L = Math.hypot(x1 - x0, y1 - y0);
        if (L < 1e-9) continue;
        var ex2 = (x1 - x0) / L, ey2 = (y1 - y0) / L, nx2 = -ey2 * sgn, ny2 = ex2 * sgn, parts = Math.max(1, Math.ceil(L / SUB));
        for (var q = 0; q < parts; q++) {
          var s0 = q / parts, sm = (q + 0.5) / parts;
          P.push(x0 + (x1 - x0) * s0, y0 + (y1 - y0) * s0);
          T.push(ray(x0 + (x1 - x0) * sm, y0 + (y1 - y0) * sm, nx2, ny2, base[i] + j));
        }
      }
      if (T.length >= 3) out.push({ p: P, t: T, f: null, s: sgn });
    }
    return out;
  }
  // 0 = apoiado, 1 = balanço parcial, 2 = quase todo no ar
  function markOverhang(L, A, B) {
    var p = L.p, n = L.t.length, o = null;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, mx = (p[2 * i] + p[2 * j]) / 2, my = (p[2 * i + 1] + p[2 * j + 1]) / 2;
      if (!inside(mx, my, A)) { if (!o) o = new Uint8Array(n); o[i] = inside(mx, my, B) ? 1 : 2; }
    }
    L.o = o;
    return !!o;
  }
  function plain(paths) { return paths.map(function (p) { return { p: toMM(p), t: null, f: null, s: 1 }; }); }

  /* ---------- preenchimento por varredura ---------- */
  // devolve segmentos {a:[x,y], b:[x,y], k:linha, u/u1: início e fim ao longo da linha}
  function scanFill(paths, angleDeg, spacing, phase, minMM) {
    if (!paths.length) return [];
    var ang = angleDeg * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    var sp = spacing * SC, ph = (phase || 0) * SC, buckets = new Map();
    for (var pi = 0; pi < paths.length; pi++) {
      var p = paths[pi], n = p.length;
      for (var i = 0; i < n; i++) {
        var A = p[i], B = p[(i + 1) % n];
        var x0 = A.X * ca + A.Y * sa, y0 = -A.X * sa + A.Y * ca;
        var x1 = B.X * ca + B.Y * sa, y1 = -B.X * sa + B.Y * ca;
        if (y0 === y1) continue;
        var lo = Math.min(y0, y1), hi = Math.max(y0, y1);
        for (var k = Math.ceil((lo - ph) / sp); ; k++) {
          var yk = k * sp + ph;
          if (yk >= hi) break;
          if (yk < lo) continue;
          var x = x0 + (yk - y0) * (x1 - x0) / (y1 - y0);
          var bk = buckets.get(k);
          if (bk) bk.push(x); else buckets.set(k, [x]);
        }
      }
    }
    var out = [], minLen = (minMM === undefined ? 0.3 : minMM) * SC;
    buckets.forEach(function (xs, k) {
      xs.sort(function (a, b) { return a - b; });
      var yk = k * sp + ph;
      for (var j = 0; j + 1 < xs.length; j += 2) {
        var xa = xs[j], xb = xs[j + 1];
        if (xb - xa < minLen) continue;
        out.push({
          a: [(xa * ca - yk * sa) / SC, (xa * sa + yk * ca) / SC],
          b: [(xb * ca - yk * sa) / SC, (xb * sa + yk * ca) / SC],
          k: k, u: xa, u1: xb, used: false
        });
      }
    });
    return out;
  }
  function orderGreedy(segs, sx, sy) {
    var res = [], used = new Uint8Array(segs.length), cx = sx, cy = sy;
    for (var it = 0; it < segs.length; it++) {
      var best = -1, bd = Infinity, flip = false;
      for (var j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        var s = segs[j];
        var d1 = (s.a[0] - cx) * (s.a[0] - cx) + (s.a[1] - cy) * (s.a[1] - cy);
        var d2 = (s.b[0] - cx) * (s.b[0] - cx) + (s.b[1] - cy) * (s.b[1] - cy);
        if (d1 < bd) { bd = d1; best = j; flip = false; }
        if (d2 < bd) { bd = d2; best = j; flip = true; }
      }
      used[best] = 1;
      var sg = segs[best];
      var o = flip ? { a: sg.b, b: sg.a } : { a: sg.a, b: sg.b };
      res.push(o); cx = o.b[0]; cy = o.b[1];
    }
    return res;
  }
  // Superfícies sólidas: divide em faixas contínuas (sem saltar por cima de furos) e imprime cada
  // faixa em serpentina antes de passar para a próxima.
  function orderMonotonic(segs, sx, sy, strict) {
    if (!segs.length) return [];
    var rows = new Map(), i, j;
    for (i = 0; i < segs.length; i++) { var r = rows.get(segs[i].k); if (r) r.push(segs[i]); else rows.set(segs[i].k, [segs[i]]); }
    var keys = Array.from(rows.keys()).sort(function (a, b) { return a - b; }), chains = [];
    function ov(a, b) { return a.u < b.u1 && b.u < a.u1; }
    for (var ki = 0; ki < keys.length; ki++) {
      var row = rows.get(keys[ki]);
      row.sort(function (a, b) { return a.u - b.u; });
      for (i = 0; i < row.length; i++) {
        if (row[i].used) continue;
        var ch = [row[i]], cur = row[i], kk = keys[ki];
        cur.used = true;
        for (;;) {
          var nxt = rows.get(kk + 1);
          if (!nxt) break;
          var cand = null, cnt = 0;
          for (j = 0; j < nxt.length; j++) if (ov(nxt[j], cur)) { cnt++; cand = nxt[j]; }
          if (cnt !== 1 || cand.used) break;
          var back = 0, here = rows.get(kk);
          for (j = 0; j < here.length; j++) if (ov(here[j], cand)) back++;
          if (back !== 1) break;
          cand.used = true; ch.push(cand); cur = cand; kk++;
        }
        chains.push(ch);
      }
    }
    var res = [], cx = sx, cy = sy;
    function d2(p) { return (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy); }
    if (strict && chains.length) {
      // começa pela ponta mais próxima do bico: evita um deslocamento longo antes da primeira linha
      var c0 = chains[0][0], cl = chains[chains.length - 1], ce = cl[cl.length - 1];
      if (Math.min(d2(ce.a), d2(ce.b)) < Math.min(d2(c0.a), d2(c0.b))) { chains.reverse(); chains.forEach(function (c) { c.reverse(); }); }
    }
    while (chains.length) {
      var bi = 0, bd = Infinity, rev = false;
      for (i = 0; i < (strict ? 1 : chains.length); i++) {
        var f = chains[i][0], l = chains[i][chains[i].length - 1];
        var df = Math.min(d2(f.a), d2(f.b)), dl = Math.min(d2(l.a), d2(l.b));
        if (df < bd) { bd = df; bi = i; rev = false; }
        if (dl < bd && !strict) { bd = dl; bi = i; rev = true; }
      }
      var c = chains.splice(bi, 1)[0];
      if (rev) c.reverse();
      for (i = 0; i < c.length; i++) {
        var s = c[i], o = d2(s.b) < d2(s.a) ? { a: s.b, b: s.a } : { a: s.a, b: s.b };
        res.push(o); cx = o.b[0]; cy = o.b[1];
      }
    }
    return res;
  }

  // Douglas-Peucker em coordenadas inteiras
  function simplify(path, tol) {
    var n = path.length;
    if (n < 3) return path;
    var keep = new Uint8Array(n), stack = [0, n - 1];
    keep[0] = keep[n - 1] = 1;
    while (stack.length) {
      var b = stack.pop(), a = stack.pop();
      if (b - a < 2) continue;
      var ax = path[a].X, ay = path[a].Y, dx = path[b].X - ax, dy = path[b].Y - ay, len = Math.hypot(dx, dy) || 1, mx = 0, mi = -1;
      for (var i = a + 1; i < b; i++) { var d = Math.abs((path[i].X - ax) * dy - (path[i].Y - ay) * dx) / len; if (d > mx) { mx = d; mi = i; } }
      if (mx > tol) { keep[mi] = 1; stack.push(a, mi, mi, b); }
    }
    var out = [];
    for (var j = 0; j < n; j++) if (keep[j]) out.push(path[j]);
    return out;
  }

  /* ---------- gyroid ----------
     Curvas de nível da superfície sin x cos y + sin y cos z + sin z cos x = 0 na altura z. */
  function gyroidLines(bb, z, period) {
    var k = 2 * Math.PI / period, sz = Math.sin(z * k), cz = Math.cos(z * k);
    var horiz = Math.abs(sz) <= Math.abs(cz); // curvas do tipo y = f(x)
    var a0 = (horiz ? bb[0] : bb[1]) - period, a1 = (horiz ? bb[2] : bb[3]) + period;
    var b0 = horiz ? bb[1] : bb[0], b1 = horiz ? bb[3] : bb[2];
    var step = period / 14, n = Math.ceil((a1 - a0) / step) + 1, i, out = [];
    var phi = new Float64Array(n), del = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var t = (a0 + i * step) * k, A, B, c;
      if (horiz) { A = Math.sin(t); B = cz; c = -sz * Math.cos(t) / Math.hypot(A, B); phi[i] = Math.atan2(B, A); }
      else {
        A = sz; B = Math.cos(t); c = -cz * Math.sin(t) / Math.hypot(A, B);
        phi[i] = A > 0 ? Math.atan2(B, A) : Math.PI - Math.atan2(B, -A);
      }
      del[i] = Math.acos(Math.max(-1, Math.min(1, c)));
    }
    var n0 = Math.floor(b0 * k / (2 * Math.PI)) - 2, n1 = Math.ceil(b1 * k / (2 * Math.PI)) + 2;
    for (var sg = -1; sg <= 1; sg += 2) for (var m = n0; m <= n1; m++) {
      var path = new Array(n), lo = Infinity, hi = -Infinity;
      for (i = 0; i < n; i++) {
        var v = (phi[i] + sg * del[i] + 2 * Math.PI * m) / k, a = a0 + i * step;
        if (v < lo) lo = v; if (v > hi) hi = v;
        path[i] = horiz ? { X: Math.round(a * SC), Y: Math.round(v * SC) } : { X: Math.round(v * SC), Y: Math.round(a * SC) };
      }
      if (hi >= b0 && lo <= b1) out.push(simplify(path, 0.05 * SC));
    }
    return out;
  }

  /* ---------- pontes ---------- */
  // escolhe a direção em que mais linhas ficam apoiadas nas duas pontas; em empate, o menor vão
  function bridgeAngle(area, below) {
    var best = null, bestFrac = 0, bestMean = Infinity;
    for (var a = 0; a < 180; a += 15) {
      var sg = scanFill(area, a, 1.0, 0.37), both = 0, tot = 0;
      for (var i = 0; i < sg.length; i++) {
        var s = sg[i], len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        var ia = inside(s.a[0], s.a[1], below), ib = inside(s.b[0], s.b[1], below);
        tot += len;
        if (ia && ib) both += len; else if (ia || ib) both += 0.3 * len;
      }
      if (!sg.length || tot <= 0) continue;
      var frac = both / tot, mean = tot / sg.length;
      if (frac > bestFrac + 0.03 || (frac > bestFrac - 0.03 && frac > 0 && mean < bestMean - 0.05)) { best = a; bestFrac = Math.max(frac, bestFrac); bestMean = mean; }
    }
    return best;
  }

  /* ---------- tempo ---------- */
  // movimento com velocidade de entrada ve, de saída vx e de cruzeiro v
  function moveTime(d, v, a, ve, vx) {
    if (d <= 0) return 0;
    ve = Math.min(ve, v); vx = Math.min(vx, v);
    var da = (v * v - ve * ve) / (2 * a), dd = (v * v - vx * vx) / (2 * a);
    if (da + dd <= d) return (v - ve) / a + (v - vx) / a + (d - da - dd) / v;
    var vp = Math.sqrt((2 * a * d + ve * ve + vx * vx) / 2);
    if (vp < ve || vp < vx) return d / Math.max(1, (ve + vx) / 2);
    return (2 * vp - ve - vx) / a;
  }
  var JERK = 10; // mm/s, limite da máquina

  /* ---------- crescimento de arrays tipados ---------- */
  function F32() { this.a = new Float32Array(1 << 16); this.n = 0; }
  F32.prototype.push6 = function (a, b, c, d, e, f) {
    if (this.n + 6 > this.a.length) { var na = new Float32Array(this.a.length * 2); na.set(this.a); this.a = na; }
    var x = this.a, n = this.n; x[n] = a; x[n + 1] = b; x[n + 2] = c; x[n + 3] = d; x[n + 4] = e; x[n + 5] = f; this.n = n + 6;
  };
  function U8() { this.a = new Uint8Array(1 << 16); this.n = 0; }
  U8.prototype.push6 = function (r, g, b) {
    if (this.n + 6 > this.a.length) { var na = new Uint8Array(this.a.length * 2); na.set(this.a); this.a = na; }
    var x = this.a, n = this.n; x[n] = r; x[n + 1] = g; x[n + 2] = b; x[n + 3] = r; x[n + 4] = g; x[n + 5] = b; this.n = n + 6;
  };

  function f3(v) { return (Math.round(v * 1000) / 1000).toString(); }
  function f5(v) { return (Math.round(v * 100000) / 100000).toString(); }
  function q50(v) { return Math.round(v * 50) / 50; }

  /* ---------- principal ---------- */
  function slice(job, progress) {
    var cfg = job.cfg, tris = job.tris;
    if (cfg.vase) { cfg = JSON.parse(JSON.stringify(cfg)); cfg.walls = 1; cfg.infill = 0; cfg.top = 0; cfg.supports = 'off'; cfg.thinWalls = false; }
    progress = progress || function () {};
    var i, k, l, s, warnings = [];
    var zmax = 0, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (i = 0; i < tris.length; i += 3) {
      if (tris[i + 2] > zmax) zmax = tris[i + 2];
      if (tris[i] < xmin) xmin = tris[i]; if (tris[i] > xmax) xmax = tris[i];
      if (tris[i + 1] < ymin) ymin = tris[i + 1]; if (tris[i + 1] > ymax) ymax = tris[i + 1];
    }
    var unretSpeed = cfg.unretSpeed || cfg.retSpeed, bridgeFlow = cfg.bridgeFlow || 1;

    // camadas
    var layers = [{ z: cfg.firstH, h: cfg.firstH }], ztop = cfg.firstH;
    for (;;) {
      var nz = Math.round((ztop + cfg.layerH) * 1e6) / 1e6;
      if (nz - cfg.layerH / 2 >= zmax) break;
      layers.push({ z: nz, h: cfg.layerH }); ztop = nz;
    }
    var N = layers.length;
    var planes = layers.map(function (L) { return L.z - L.h / 2; });
    // espessura mínima das cascas: 0,8 mm no topo e 0,6 mm no fundo, para camadas finas
    var topN = cfg.top > 0 ? Math.max(cfg.top, Math.ceil(0.8 / cfg.layerH - 1e-6)) : 0;
    var botN = cfg.bottom > 0 ? Math.max(cfg.bottom, Math.ceil(0.6 / cfg.layerH - 1e-6)) : 0;
    var allSolid = cfg.infill >= 99.5;

    progress(0.02, 'Cortando a malha');
    var segs = sliceMesh(tris, planes, progress);

    // regiões
    var regionRaw = new Array(N), region = new Array(N);
    for (l = 0; l < N; l++) {
      var polys = chain(segs[l]); segs[l] = null;
      var r = U(clean(polys, 0.005 * SC));
      r = dropSmall(r, 0.01);
      regionRaw[l] = r;
      if (cfg.xyComp) r = OFF(r, cfg.xyComp * SC);
      if (cfg.holeComp) {
        var holes = r.filter(function (p) { return !CL.Clipper.Orientation(p); }).map(function (p) { return p.slice().reverse(); });
        if (holes.length) r = D(r, OFF(holes, cfg.holeComp * SC, true));
      }
      if (l === 0 && cfg.elephant) r = OFF(r, -cfg.elephant * SC);
      region[l] = r;
      if ((l & 7) === 0) progress(0.12 + 0.10 * l / N, 'Montando contornos');
    }

    // paredes, paredes finas, vãos e áreas de preenchimento
    var LY = new Array(N);
    for (l = 0; l < N; l++) {
      var w = l === 0 ? cfg.firstW : cfg.lineW, h = layers[l].h;
      // larguras do perfil oficial do Orca: parede externa, sólido e topo 0,42; paredes internas e preenchimento 0,45
      // (na 1ª camada, uma largura só)
      var wi = l === 0 ? cfg.firstW : (cfg.innerW || w), wf = l === 0 ? cfg.firstW : (cfg.infillW || w);
      var lap = h * (1 - Math.PI / 4);
      var sp = w - lap, spI = wi - lap, spF = wf - lap;
      // "parede externa precisa" do Orca (precise_outer_wall): a 1ª parede interna fica com metade da sobreposição
      // normal em relação à externa, para não empurrar a parede externa para fora
      var d01 = (w + wi) / 2 - lap / 2;
      var zoneAt = function (paths) {
        if (!cfg.loopZones || !paths.length) return null;
        var c = paths[0][0], x = c.X / SC, y = c.Y / SC;
        for (var zi = 0; zi < cfg.loopZones.length; zi++) { var Z = cfg.loopZones[zi]; if (x >= Z.x0 && x <= Z.x1 && y >= Z.y0 && y <= Z.y1) return Z; }
        return null;
      };
      var spMax = Math.max(sp, spI), maxR = spMax + 2 * (spMax / 2 - cfg.overlap * Math.min(w, wi)) + spMax + 0.05;
      var isls = islands(region[l]), out = [], fillAll = [];
      var ovA = null, ovB = null, hasOvh = false;
      if (l > 0 && cfg.overhangs !== false && dropSmall(D(region[l], OFF(regionRaw[l - 1], 0.25 * w * SC)), 0.05).length) {
        ovA = OFF(regionRaw[l - 1], -0.25 * w * SC); ovB = OFF(regionRaw[l - 1], 0.25 * w * SC);
      }
      for (s = 0; s < isls.length; s++) {
        var isl = isls[s], walls = [], gaps = [], thin = [], m = 0, wl0 = null;
        // ordem das paredes: 'inner' = internas primeiro (padrão do Orca), 'outer' = externa primeiro.
        // Como no Orca, a "parede externa precisa" só vale com as internas primeiro.
        var zn0 = zoneAt(isl), outerFirst = l > 0 && ((zn0 && zn0.order) || cfg.wallOrder) === 'outer';
        var d01i = outerFirst ? (sp + spI) / 2 : d01;
        var offK = function (k) { return k === 0 ? w / 2 : w / 2 + d01i + (k - 1) * spI; };
        for (k = 0; k < cfg.walls; k++) {
          var wl = dropSmall(OFF(isl, -offK(k) * SC), k === 0 ? 0.002 : 0.01);
          if (!wl.length) break;
          if (k === 0) wl0 = wl;
          walls.push(analyze(wl, maxR)); m++;
        }
        var spLast = m > 1 ? spI : sp, ovl = cfg.overlap * (m > 1 ? wi : w), gLast = 2 * (spLast / 2 - ovl) + spLast;
        for (k = 0; k < m; k++) {
          var spk = k === 0 ? sp : spI, dk = offK(k + 1) - offK(k);
          var lim = (k === m - 1 ? spk + gLast : 2 * dk), needGap = false;
          for (i = 0; i < walls[k].length; i++) {
            var Lw = walls[k][i], fw = new Float32Array(Lw.t.length);
            for (var q = 0; q < fw.length; q++) {
              var tq = Lw.t[q];
              if (tq < spk) fw[q] = q50((tq + spk) / (2 * spk)); else { fw[q] = 1; if (tq < lim) needGap = true; }
            }
            Lw.f = fw;
            if (ovA && markOverhang(Lw, ovA, ovB)) hasOvh = true;
          }
          if (needGap && cfg.gapFill !== false) {
            var glim = (k === m - 1 ? gLast : 2 * dk - spk);
            var gl = dropSmall(OFF(isl, -(offK(k) + spk / 2 + EPS_GAP) * SC), 0.002);
            var ga = gl.length ? analyze(gl, glim + 0.05) : [];
            for (i = 0; i < ga.length; i++) {
              var Lg = ga[i], fg = new Float32Array(Lg.t.length), any = false;
              for (q = 0; q < fg.length; q++) {
                var g = Lg.t[q] + 2 * EPS_GAP;
                if (g >= MIN_GAP && g < glim * 1.02) { fg[q] = Math.max(0.1, q50(g / (2 * sp))); any = true; }
              }
              Lg.f = fg;
              if (any) gaps.push(Lg);
            }
          }
        }
        // trechos mais finos que uma linha (entre 0,24 mm e a largura da linha)
        if (cfg.thinWalls !== false) {
          var rest = m ? D(isl, OFF(wl0, (w / 2 + 0.02) * SC, true)) : isl;
          var tl = rest.length ? dropSmall(OFF(rest, -THIN_INSET * SC), 0.002) : [];
          var ta = tl.length ? analyze(tl, w) : [];
          for (i = 0; i < ta.length; i++) {
            var Lt = ta[i], ft = new Float32Array(Lt.t.length), anyT = false;
            for (q = 0; q < ft.length; q++) {
              var W = Lt.t[q] + 2 * THIN_INSET;
              if (W <= w + 0.08) { ft[q] = Math.max(0.2, q50((W - (w - sp)) / (2 * sp))); anyT = true; }
            }
            Lt.f = ft;
            if (anyT) thin.push(Lt);
          }
        }
        var fill = m ? OFF(isl, -(offK(m - 1) + spLast - ovl) * SC) : [];
        fill = dropSmall(OPENM(fill, sp / 2 * SC), 0.05);
        out.push({ walls: walls, gaps: gaps, thin: thin, fill: fill, outline: isl, outerFirst: outerFirst });
        if (fill.length) fillAll = fillAll.concat(fill);
      }
      LY[l] = { isl: out, fillAll: fillAll, w: w, h: h, spacing: sp, wi: wi, wf: wf, spF: spF, bridge: [], ovh: hasOvh };
      if ((l & 7) === 0) progress(0.22 + 0.18 * l / N, 'Gerando paredes');
    }

    // faixa ocupada pelas paredes de uma camada (contorno menos a área de preenchimento)
    // (simplificada a 0,03 mm: só serve de máscara para o sólido, e contornos com milhares de pontos custam caro)
    var bandOf = function (j) {
      if (!LY[j].band) LY[j].band = D(region[j], LY[j].fillAll).map(function (p) { return simplify(p, 0.03 * SC); }).filter(function (p) { return p.length >= 3; });
      return LY[j].band;
    };
    // topo, fundo, pontes e preenchimento
    for (l = 0; l < N; l++) {
      var L = LY[l], fa = L.fillAll;
      // região "interna" da camada: sem topo nem fundo expostos (o Orca só deixa de retrair dentro dela)
      if (l === 0 || l === N - 1) L.internal = [];
      else {
        var expT = OPEN(D(region[l], regionRaw[l + 1]), 0.042 * SC), expB = OPEN(D(region[l], regionRaw[l - 1]), 0.042 * SC);
        L.internal = (expT.length || expB.length) ? D(region[l], U(expT, expB)) : region[l];
      }
      if (!fa.length) { L.top = []; L.solid = []; L.sparse = []; continue; }
      var solid;
      if (allSolid || l < botN || (topN > 0 && l >= N - topN)) solid = fa;
      else {
        var topPart = [];
        if (topN > 0) {
          var above = regionRaw[l + 1];
          for (k = 2; k <= topN && above.length; k++) above = I(above, regionRaw[l + k]);
          topPart = D(fa, above);
        }
        var botPart = [];
        if (botN > 0) {
          var below = regionRaw[l - 1];
          for (k = 2; k <= botN && below.length; k++) below = I(below, regionRaw[l - k]);
          botPart = D(fa, below);
        }
        // Casca vertical, como o "ensure vertical shell thickness" do Orca: onde as camadas vizinhas (as de cima,
        // até o nº de camadas de topo; as de baixo, até o de fundo) têm parede, esta camada leva sólido. Sem isso,
        // uma parede que nasce de um piso (a cabine do Benchy sobre o convés) fica apoiada só no preenchimento.
        var shellClip = [];
        if (cfg.vshell !== false) {
          // uma camada sim, outra não, e sempre a mais distante: as paredes têm mais de 1 mm de largura, então
          // as faixas vizinhas se sobrepõem e a do meio não acrescenta nada
          for (k = 1; k <= topN && l + k < N; k++) if (k % 2 === 1 || k === topN) shellClip = shellClip.concat(bandOf(l + k));
          for (k = 1; k <= botN && l - k >= 0; k++) if (k % 2 === 1 || k === botN) shellClip = shellClip.concat(bandOf(l - k));
        }
        var shell = shellClip.length ? OPENM(I(fa, shellClip), cfg.lineW * SC) : [];
        solid = I(U(U(topPart, botPart), shell), fa);
      }
      var top = topN === 0 ? [] : (l === N - 1) ? fa : I(D(fa, regionRaw[l + 1]), solid);
      top = OPEN(top, 0.1 * SC);
      // pontes: áreas de preenchimento sem nada embaixo
      if (l > 0 && cfg.bridges !== false) {
        var air = dropSmall(OPEN(D(fa, regionRaw[l - 1]), 0.4 * SC), 4);
        if (air.length) {
          var brIsl = islands(I(OFF(air, 1.2 * SC), fa)), brAll = [];
          for (i = 0; i < brIsl.length; i++) {
            var ang = bridgeAngle(brIsl[i], regionRaw[l - 1]);
            L.bridge.push({ poly: brIsl[i], ang: ang === null ? ((l % 2) ? 135 : 45) : ang });
            brAll = brAll.concat(brIsl[i]);
          }
          solid = D(solid, brAll); top = D(top, brAll); fa = D(fa, brAll);
        }
      }
      var sparse = D(fa, solid);
      if (cfg.infill <= 0) { sparse = []; }
      else if (sparse.length) {
        // áreas estreitas ou pequenas demais para o padrão viram sólido
        var sp2 = OPEN(sparse, L.w * SC), keep = [];
        var spIsl = islands(sp2);
        for (i = 0; i < spIsl.length; i++) if (areaMM(spIsl[i]) >= 10) keep = keep.concat(spIsl[i]);
        var sliver = D(sparse, keep);
        if (sliver.length) {
          // restos minúsculos (as quinas arredondadas pelo teste acima) voltam para o preenchimento; o Orca não
          // imprime pontinhos de sólido nas quinas
          var slIsl = islands(sliver), big = [], tiny = [];
          for (i = 0; i < slIsl.length; i++) { if (areaMM(slIsl[i]) < 0.25) tiny = tiny.concat(slIsl[i]); else big = big.concat(slIsl[i]); }
          if (big.length) solid = U(solid, big);
          if (tiny.length && keep.length) keep = U(keep, tiny);
        }
        sparse = keep;
      }
      L.top = top; L.solid = D(solid, top); L.sparse = sparse;
      if ((l & 7) === 0) progress(0.40 + 0.12 * l / N, 'Calculando topo, fundo e pontes');
    }

    // suportes
    var support = new Array(N);
    for (l = 0; l < N; l++) support[l] = [];
    if (cfg.supports !== 'off') {
      var dOver = cfg.layerH / Math.tan(cfg.supAngle * Math.PI / 180);
      var needs = new Array(N);
      needs[0] = [];
      for (l = 1; l < N; l++) {
        var nd = D(regionRaw[l], OFF(regionRaw[l - 1], dOver * SC, true));
        // tira só o serrilhado (0,1 × a largura da linha, como o Orca). Com os 0,3 mm de antes, balanços entre
        // uns 13° e o ângulo pedido ficavam sem suporte, inclusive a base arredondada de uma peça
        nd = OPEN(nd, 0.1 * cfg.lineW * SC);
        needs[l] = dropSmall(nd, 0.5);
      }
      // passo da grade do Orca: espaçamento do padrão de suporte (2,5 mm) + espaçamento da linha
      var supGrid = 2.5 + (cfg.lineW - cfg.layerH * (1 - Math.PI / 4));
      var shadow = null;
      if (cfg.supports === 'buildplate') {
        shadow = new Array(N); var accS = [];
        for (l = 0; l < N; l++) { accS = clean(U(accS, regionRaw[l]), 0.02 * SC); shadow[l] = accS; }
      }
      var carry = [], gapXY = cfg.supXY * SC;
      for (l = N - 1; l >= 0; l--) {
        if (l + 2 < N && needs[l + 2].length) carry = U(carry, snapGrid(needs[l + 2], supGrid));
        if (!carry.length) continue;
        carry = clean(D(carry, regionRaw[l]), 0.02 * SC);
        var sup = D(carry, OFF(regionRaw[l], gapXY, true));
        if (l >= 1) sup = D(sup, regionRaw[l - 1]);
        if (shadow) sup = D(sup, OFF(shadow[l], gapXY, true));
        // o que sobra de uma célula cortada pela peça e tem menos de 1,2 mm de largura não fica em pé: sai
        sup = OPENM(sup, 0.6 * SC);
        support[l] = dropSmall(sup, 2.0);
        if ((l & 7) === 0) progress(0.52 + 0.08 * (N - l) / N, 'Gerando suportes');
      }
    }

    /* ---------- trajetórias e G-code ---------- */
    var gc = [], layerTimes = [];
    var pos = new F32(), col = new U8(), layerEnds = new Int32Array(N);
    var st = { x: 0, y: 0, z: 0, retracted: false, hopped: false, lastRet: cfg.retLen, tAcc: cfg.acc.travel, seams: [] };
    var totalE = 0, totalT = 0;
    var spd = cfg.sp, acc = cfg.acc;

    function extArea(w, h) { return (w - h) * h + Math.PI * h * h / 4; }

    gc.push(';FLAVOR:Marlin');
    var hdrTime = gc.push(';TIME:0') - 1;
    var hdrFil = gc.push(';Filament used:0m') - 1;
    gc.push(';Layer height:' + cfg.layerH);
    gc.push(';Gerado pelo Fatiador V3 SE para Creality Ender-3 V3 SE');
    gc.push(';PLA  bico ' + cfg.tNozzle0 + '/' + cfg.tNozzle + ' C  mesa ' + cfg.tBed0 + '/' + cfg.tBed + ' C  ' + cfg.walls + ' paredes  ' + cfg.infill + '% ' + cfg.pattern);
    gc.push(';LAYER_COUNT:' + N);
    // limites da máquina, escritos exatamente como o OrcaSlicer faz com o perfil oficial da V3 SE
    // (sem isso a impressora usa os valores do firmware, e o desvio de junção muda o quanto ela freia nas curvas)
    gc.push('M201 X2500 Y2500 Z500 E5000');
    gc.push('M203 X250 Y250 Z5 E40');
    gc.push('M204 P2500 R500 T2500 ; sets acceleration (P, T) and retract acceleration (R), mm/sec^2');
    // velocidade nos cantos: 'orca' = jerk 10 e desvio de junção 0,100 (perfil oficial); 'fast' = jerk 20 e 0,250
    var cornerOf = function (c) { return c === 'fast' ? { jerk: 20, jd: 0.25 } : { jerk: 10, jd: 0.1 }; };
    var cornerCmd = function (c) { var o = cornerOf(c); return ['M205 X' + o.jerk.toFixed(2) + ' Y' + o.jerk.toFixed(2), 'M205 J' + o.jd.toFixed(3)]; };
    var corner0 = cornerOf(cfg.corner);
    gc.push('M205 X' + corner0.jerk.toFixed(2) + ' Y' + corner0.jerk.toFixed(2) + ' Z0.40 E5.00 ; sets the jerk limits, mm/sec');
    gc.push('M205 J' + corner0.jd.toFixed(3) + ' ; desvio de junção');
    gc.push('M220 S100 ; velocidade 100%');
    gc.push('M221 S100 ; fluxo 100%');
    gc.push('M140 S' + cfg.tBed0 + ' ; aquece a mesa');
    gc.push('M104 S140 ; pré-aquece o bico sem escorrer');
    gc.push('G90');
    gc.push('M204 P' + acc.def + ' R500 T' + acc.travel);
    gc.push('M190 S' + cfg.tBed0 + ' ; espera a mesa antes do home (a mesa dilata ao aquecer)');
    gc.push('G28 ; home');
    gc.push('M420 S1 ; usa a malha de nivelamento salva');
    gc.push('G1 Z5 F3000');
    gc.push('M104 S' + cfg.tNozzle0);
    gc.push('G1 X-2.1 Y20 F5000 ; posição da linha de purga');
    gc.push('G1 Z0.28 F300');
    gc.push('M109 S' + cfg.tNozzle0 + ' ; espera o bico');
    gc.push('M83 ; extrusão relativa');
    gc.push('G92 E0');
    gc.push('G1 X-2.1 Y145 E15 F1500 ; linha de purga');
    gc.push('G1 X-2.4 Y145 F5000');
    gc.push('G1 X-2.4 Y20 E15 F1500 ; segunda linha');
    if (cfg.retLen > 0) gc.push('G1 E-' + f5(cfg.retLen) + ' F' + Math.round(cfg.retSpeed * 60));
    gc.push('G1 Z2.0 F300');
    gc.push('M107');
    st.x = -2.4; st.y = 20; st.z = 2.0; st.retracted = true; st.hopped = cfg.zhop > 0;

    var fanState = -1, skirtSkipped = false, brimClipped = false;

    for (l = 0; l < N; l++) {
      var Lr = LY[l], z = layers[l].z, h0 = layers[l].h, first = l === 0;
      var ops = [];
      var cx = st.x, cy = st.y, retracted = st.retracted, wipe = null, curAcc = -1, insideOK = true;
      var lastRole = -1, curTAcc = st.tAcc, seamsNow = [];
      // modo vaso: acima do fundo, uma única volta que sobe continuamente (sem costura)
      var spiral = !!cfg.vase && l >= botN && Lr.isl.length === 1 && Lr.isl[0].walls.length === 1 && Lr.isl[0].walls[0].length === 1 && !support[l].length;
      var firstSpiral = spiral && !st.spiral, zBase = spiral ? z - h0 : z;
      var zb = z - h0 + 1e-6, retL = cfg.retLen, volOverride = 0, zones = cfg.flowZones || null;
      if (cfg.retSchedule) cfg.retSchedule.forEach(function (sch) { if (zb >= sch.z) retL = sch.len; });
      if (cfg.speedSchedule) cfg.speedSchedule.forEach(function (sch) { if (zb >= sch.z) volOverride = sch.vol; });
      var accOverride = 0;
      if (cfg.accSchedule) cfg.accSchedule.forEach(function (sch) { if (zb >= sch.z) accOverride = sch.acc; });

      // arestas da camada para decidir retração
      var edges = [];
      var addEdges = function (paths) {
        for (var a = 0; a < paths.length; a++) {
          var pth = paths[a], np = pth.length;
          for (var e = 0; e < np; e++) { var A = pth[e], B = pth[(e + 1) % np]; edges.push(A.X / SC, A.Y / SC, B.X / SC, B.Y / SC); }
        }
      };
      addEdges(region[l]); addEdges(support[l]);
      var edgesAll = edges, edgesInt = [];
      if (Lr.internal && Lr.internal.length) { edges = edgesInt; addEdges(Lr.internal); edges = edgesAll; }
      var crossesE = function (edges, x1, y1, x2, y2) {
        var minx = Math.min(x1, x2), maxx = Math.max(x1, x2), miny = Math.min(y1, y2), maxy = Math.max(y1, y2);
        for (var q = 0; q < edges.length; q += 4) {
          var ax = edges[q], ay = edges[q + 1], bx = edges[q + 2], by = edges[q + 3];
          if ((ax < minx && bx < minx) || (ax > maxx && bx > maxx) || (ay < miny && by < miny) || (ay > maxy && by > maxy)) continue;
          var d1 = (bx - ax) * (y1 - ay) - (by - ay) * (x1 - ax);
          var d2 = (bx - ax) * (y2 - ay) - (by - ay) * (x2 - ax);
          if ((d1 > 0) === (d2 > 0)) continue;
          var d3 = (x2 - x1) * (ay - y1) - (y2 - y1) * (ax - x1);
          var d4 = (x2 - x1) * (by - y1) - (y2 - y1) * (bx - x1);
          if ((d3 > 0) !== (d4 > 0)) return true;
        }
        return false;
      };
      var crosses = function (x1, y1, x2, y2) { return crossesE(edgesAll, x1, y1, x2, y2); };
      // deslocamento inteiro dentro da região interna da camada
      var insideInternal = function (x1, y1, x2, y2) {
        return edgesInt.length > 0 && inside(x1, y1, Lr.internal) && inside(x2, y2, Lr.internal) && !crossesE(edgesInt, x1, y1, x2, y2);
      };

      var retract = function () {
        if (retracted) return;
        ops.push({ o: 'R', wipe: wipe });
        if (wipe && wipe.length) { cx = wipe[wipe.length - 2]; cy = wipe[wipe.length - 1]; }
        retracted = true; wipe = null;
      };
      var unretract = function () { if (retracted) { ops.push({ o: 'U' }); retracted = false; } };
      var rawMove = function (x, y) {
        var d = Math.hypot(x - cx, y - cy);
        if (d < 0.002) return;
        ops.push({ o: 'T', x0: cx, y0: cy, x: x, y: y, d: d });
        cx = x; cy = y;
      };
      // toPerim: o próximo trecho é parede; toOuter: é a parede externa
      var travel = function (x, y, toPerim, toOuter) {
        var d = Math.hypot(x - cx, y - cy);
        if (d < 0.002) return;
        if (!retracted && d > cfg.retMinTravel) {
          // regra do OrcaSlicer (GCode::needs_retraction): retrai sempre que sai da parede externa e sempre que vai
          // para uma parede; só deixa de retrair se o deslocamento inteiro fica dentro da região interna da camada
          // (e há preenchimento para esconder o fiapo) ou dentro de uma ilha de suporte
          var need = true, mx = (cx + x) / 2, my = (cy + y) / 2;
          if (lastRole === TYPE.OUTER) need = true;
          else if (!toPerim && (lastRole === TYPE.SUPPORT || lastRole === TYPE.IFACE) && inside(mx, my, support[l]) && !crosses(cx, cy, x, y)) need = false;
          else if (!toPerim && cfg.infill > 0 && insideInternal(cx, cy, x, y)) need = false;
          if (need) retract();
        }
        wipe = null;
        // deslocamento curto até a parede externa usa a aceleração dela (Orca), para ela começar sem tranco
        var ta = (!first && toOuter && d < Math.max(cfg.retMinTravel, 2)) ? accOf(TYPE.OUTER) : acc.travel;
        if (ta !== curTAcc) { ops.push({ o: 'B', v: ta }); curTAcc = ta; }
        rawMove(x, y);
      };
      var setAcc = function (a) { if (a !== curAcc) { ops.push({ o: 'A', v: a }); curAcc = a; } };
      var extrude = function (x, y, w, speed, type, fm, zEnd) {
        var d = Math.hypot(x - cx, y - cy);
        if (d < 0.002) return;
        unretract();
        lastRole = type;
        fm = fm || 1;
        var area = extArea(w, h0), mul = cfg.flow * fm * (type === TYPE.BRIDGE ? bridgeFlow : 1);
        var v = (volOverride && type === TYPE.OUTER) ? volOverride / area : Math.min(speed, cfg.maxVol / (area * fm));
        if (zones) {
          var mx = (x + cx) / 2, my = (y + cy) / 2;
          for (var zi = 0; zi < zones.length; zi++) { var Z = zones[zi]; if (mx >= Z.x0 && mx <= Z.x1 && my >= Z.y0 && my <= Z.y1) { mul *= Z.f; break; } }
        }
        var epm = area * mul / FIL_AREA, last = ops.length ? ops[ops.length - 1] : null;
        if (zEnd !== undefined) {
          ops.push({ o: 'E', x0: cx, y0: cy, x: x, y: y, e: d * epm, q: epm, f: v, t: type, d: d, z1: zEnd });
          cx = x; cy = y; wipe = null;
          return;
        }
        if (last && last.o === 'E' && last.z1 === undefined && last.t === type && last.f === v && Math.abs(last.q - epm) < 1e-9) {
          // emenda trechos colineares
          var ux = last.x - last.x0, uy = last.y - last.y0, vx = x - last.x, vy = y - last.y;
          if (Math.abs(ux * vy - uy * vx) < 1e-6 * (last.d * d + 1e-9) + 1e-9 && ux * vx + uy * vy > 0) {
            last.x = x; last.y = y; last.e += d * epm; last.d += d; cx = x; cy = y; wipe = null;
            return;
          }
        }
        ops.push({ o: 'E', x0: cx, y0: cy, x: x, y: y, e: d * epm, q: epm, f: v, t: type, d: d });
        cx = x; cy = y; wipe = null;
      };
      var speedOf = function (type) {
        if (first) return spd.first;
        return [spd.outer, spd.inner, spd.sparse, spd.solid, spd.top, spd.support, spd.iface, spd.first, spd.gap || 40, spd.bridge || 30, spd.iron || 20][type];
      };
      var accOf = function (type) {
        if (first) return acc.first;
        if (accOverride && type <= TYPE.INNER) return accOverride;
        return [acc.outer, acc.inner, acc.def, acc.def, acc.top, acc.def, acc.def, acc.first, acc.inner, acc.def, acc.top][type];
      };
      var ovhV = spd.ovh || 20;

      // costura alinhada: mais ao fundo, mas nunca em trecho em balanço; quinas têm preferência
      // cosseno da mudança de direção num ponto do laço, medido 0,6 mm antes e 0,6 mm depois
      // (trechos curtinhos de um contorno curvo não contam como quina)
      var turnCos = function (pts, n, q) {
        var x = pts[2 * q], y = pts[2 * q + 1], i, a = q, b = q;
        for (i = 1; i < n; i++) { a = (q - i + n) % n; if (Math.hypot(pts[2 * a] - x, pts[2 * a + 1] - y) >= 0.6) break; }
        for (i = 1; i < n; i++) { b = (q + i) % n; if (Math.hypot(pts[2 * b] - x, pts[2 * b + 1] - y) >= 0.6) break; }
        var ax0 = x - pts[2 * a], ay0 = y - pts[2 * a + 1], bx0 = pts[2 * b] - x, by0 = pts[2 * b + 1] - y;
        var la = Math.hypot(ax0, ay0), lb = Math.hypot(bx0, by0);
        return (la > 1e-9 && lb > 1e-9) ? (ax0 * bx0 + ay0 * by0) / (la * lb) : 1;
      };
      var seamIdx = function (L) {
        var pts = L.p, n = pts.length / 2, OVs = first ? null : L.o, best = -Infinity, sIdx = 0;
        for (var q = 0; q < n; q++) {
          var pq = (q + n - 1) % n, sc = pts[2 * q + 1] - 0.001 * pts[2 * q];
          var tc = turnCos(pts, n, q);
          if (tc < 0.87) sc += 0.25 + 0.1 * Math.min(1, 0.87 - tc);
          if (OVs && (OVs[q] || OVs[pq])) sc -= 1e6;
          if (sc > best) { best = sc; sIdx = q; }
        }
        return sIdx;
      };
      // costura alinhada como a do Orca: se a camada de baixo tem uma costura encostada neste laço, fica no mesmo
      // lugar (numa quina a até 2 mm, ou no ponto mais próximo, criando um vértice ali); senão, vale a escolha normal
      var alignSeam = function (L, si) {
        var prev = st.seams, pts = L.p, n = pts.length / 2, q, e;
        if (first || !prev.length) return si;
        var bd = Infinity, bq = -1, bt = 0, bx = 0, by = 0;
        for (q = 0; q < n; q++) {
          var x0 = pts[2 * q], y0 = pts[2 * q + 1], x1 = pts[2 * ((q + 1) % n)], y1 = pts[2 * ((q + 1) % n) + 1];
          var dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
          for (e = 0; e < prev.length; e += 2) {
            var t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((prev[e] - x0) * dx + (prev[e + 1] - y0) * dy) / l2)) : 0;
            var px = x0 + dx * t, py = y0 + dy * t, d = Math.hypot(prev[e] - px, prev[e + 1] - py);
            if (d < bd) { bd = d; bq = q; bt = t; bx = px; by = py; }
          }
        }
        if (bq < 0 || bd > 1.0) return si;
        // quina perto da costura de baixo tem preferência
        var cb = -1, cd = 2.0;
        for (q = 0; q < n; q++) {
          var dc = Math.hypot(pts[2 * q] - bx, pts[2 * q + 1] - by);
          if (dc < cd && turnCos(pts, n, q) < 0.87 && !(L.o && (L.o[q] || L.o[(q + n - 1) % n]))) { cd = dc; cb = q; }
        }
        if (cb >= 0) {
          // entre os pontos de quina vizinhos, o mais agudo
          var bestC = cb, bc = turnCos(pts, n, cb);
          for (q = 0; q < n; q++) if (Math.hypot(pts[2 * q] - pts[2 * cb], pts[2 * q + 1] - pts[2 * cb + 1]) < 0.7) { var tq2 = turnCos(pts, n, q); if (tq2 < bc - 1e-9) { bc = tq2; bestC = q; } }
          return bestC;
        }
        if (L.o && L.o[bq]) return si;
        // se já existe um vértice a menos de 0,02 mm, ele é levado para o ponto exato (senão a costura acompanharia
        // vértices que mudam de lugar de uma camada para a outra)
        var nq = (bq + 1) % n, segL = Math.hypot(pts[2 * nq] - pts[2 * bq], pts[2 * nq + 1] - pts[2 * bq + 1]);
        if (bt * segL < 0.02) { pts[2 * bq] = bx; pts[2 * bq + 1] = by; return bq; }
        if ((1 - bt) * segL < 0.02) { pts[2 * nq] = bx; pts[2 * nq + 1] = by; return nq; }
        // cria um vértice no ponto exato (os dados por trecho são repetidos)
        var ins = bq + 1, dupl = function (arr) {
          if (!arr) return arr;
          var o = new arr.constructor(arr.length + 1), i;
          for (i = 0; i < ins; i++) o[i] = arr[i];
          o[ins] = arr[bq];
          for (i = ins; i < arr.length; i++) o[i + 1] = arr[i];
          return o;
        };
        var np = new Array(pts.length + 2), i2;
        for (i2 = 0; i2 < 2 * ins; i2++) np[i2] = pts[i2];
        np[2 * ins] = bx; np[2 * ins + 1] = by;
        for (i2 = 2 * ins; i2 < pts.length; i2++) np[i2 + 2] = pts[i2];
        L.p = np; L.t = dupl(L.t); L.f = dupl(L.f); L.o = dupl(L.o);
        return ins;
      };
      // costura no meio da face de trás: entre os pontos mais ao fundo (o laço já vem subdividido), o do meio
      var faceSeam = function (L) {
        var p = L.p, n = p.length / 2, q, maxY = -Infinity, x0 = Infinity, x1 = -Infinity;
        for (q = 0; q < n; q++) if (p[2 * q + 1] > maxY) maxY = p[2 * q + 1];
        for (q = 0; q < n; q++) if (p[2 * q + 1] > maxY - 0.05 && !(L.o && !first && L.o[q])) { if (p[2 * q] < x0) x0 = p[2 * q]; if (p[2 * q] > x1) x1 = p[2 * q]; }
        if (!(x1 - x0 >= 2)) { L.si = seamIdx(L); return L; }
        var mid = (x0 + x1) / 2, best = Infinity, si = 0;
        for (q = 0; q < n; q++) if (p[2 * q + 1] > maxY - 0.05) { var d = Math.abs(p[2 * q] - mid); if (d < best) { best = d; si = q; } }
        L.si = si;
        return L;
      };
      var curZone = null;
      var zoneOf = function (IS) {
        if (!cfg.loopZones) return null;
        var c = IS.outline[0][0], x = c.X / SC, y = c.Y / SC;
        for (var zi = 0; zi < cfg.loopZones.length; zi++) { var Z = cfg.loopZones[zi]; if (x >= Z.x0 && x <= Z.x1 && y >= Z.y0 && y <= Z.y1) return Z; }
        return null;
      };
      var printLoop = function (L, type, w, isOuter, near) {
        var pts = L.p, F = L.f, n = pts.length / 2, q;
        if (n < 3) return;
        var sIdx = 0, best = Infinity;
        if (L.si !== undefined) sIdx = L.si;
        else if (near && near.length) {
          // paredes internas começam junto da costura da parede externa
          for (q = 0; q < n; q++) for (var e = 0; e < near.length; e += 2) {
            var dn = (pts[2 * q] - near[e]) * (pts[2 * q] - near[e]) + (pts[2 * q + 1] - near[e + 1]) * (pts[2 * q + 1] - near[e + 1]);
            if (dn < best) { best = dn; sIdx = q; }
          }
        } else if (cfg.seam !== 'nearest') sIdx = seamIdx(L);
        else {
          for (q = 0; q < n; q++) { var dd = Math.hypot(pts[2 * q] - cx, pts[2 * q + 1] - cy); if (dd < best) { best = dd; sIdx = q; } }
        }
        var X = function (i) { return pts[2 * ((sIdx + i) % n)]; }, Y = function (i) { return pts[2 * ((sIdx + i) % n) + 1]; };
        var Ltot = 0;
        for (q = 0; q < n; q++) Ltot += Math.hypot(X(q + 1) - X(q), Y(q + 1) - Y(q));
        var sx = X(0), sy = Y(0), sg = L.s || 1;
        // recuo para dentro da peça, limitado pela espessura local
        var tS = (L.t && insideOK) ? L.t[sIdx] : 0, inw = Math.min(0.35, tS / 2 - 0.02);
        if (!(inw > 0.05)) inw = 0;
        var tx = X(1) - sx, ty = Y(1) - sy, tl = Math.hypot(tx, ty) || 1;
        if (isOuter && cfg.wipe && retracted && inw > 0) {
          // desfaz a retração do lado de dentro, para a gota não ficar na face externa
          travel(sx - ty / tl * sg * inw, sy + tx / tl * sg * inw, true, true);
          unretract();
          rawMove(sx, sy);
        } else travel(sx, sy, type <= TYPE.INNER, isOuter);
        var sp0 = speedOf(type); setAcc(accOf(type));
        if (type === TYPE.OUTER && !first && curZone && curZone.outer) sp0 = curZone.outer;
        // contornos pequenos (furos, pinos) mais devagar, para sair na medida
        if (!first && type <= TYPE.INNER && Ltot < 40) sp0 *= 0.6;
        var OV = first ? null : L.o, wipeFrom = 0;
        // costura em rampa: começa fino e sobe até a altura da camada; no fim, completa por cima da rampa
        var scarf = 0;
        if (isOuter && cfg.scarf && !first && !OV && !volOverride && Ltot >= 8) {
          var px = X(n - 1) - sx, py = Y(n - 1) - sy, pl = Math.hypot(px, py) || 1;
          var turn = (-px / pl) * (tx / tl) + (-py / pl) * (ty / tl); // cosseno do ângulo na costura
          var plainF = true;
          if (F) for (q = 0; q < n; q++) if (F[q] !== 1) { plainF = false; break; }
          if (plainF && turn > 0.9) scarf = Math.min(cfg.scarfLen || 15, Ltot * 0.5);
        }
        var seg = function (q, a, b, zf, mulF) {
          // trecho do segmento q entre as frações a e b
          var x0 = X(q), y0 = Y(q), x1 = X(q + 1), y1 = Y(q + 1), fm = F ? F[(sIdx + q) % n] : 1;
          var ov = OV ? OV[(sIdx + q) % n] : 0, spq = ov === 2 ? Math.min(sp0, ovhV * 0.6) : ov === 1 ? Math.min(sp0, ovhV) : sp0;
          extrude(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, w, spq, type, fm * (mulF === undefined ? 1 : mulF), zf);
        };
        if (scarf > 0) {
          var F0 = 0.1, hf = function (s) { return F0 + (1 - F0) * Math.min(1, s / scarf); };
          unretract();
          ops.push({ o: 'Z', z: z - h0 * (1 - F0) });
          var run2 = 0, pass;
          // 1ª passada: rampa e depois o laço inteiro; 2ª passada: completa a rampa
          for (pass = 0; pass < 2; pass++) {
            run2 = 0;
            for (q = 0; q < n; q++) {
              var slq = Math.hypot(X(q + 1) - X(q), Y(q + 1) - Y(q));
              if (slq < 1e-9) continue;
              if (run2 >= scarf) { if (pass === 1) break; seg(q, 0, 1); run2 += slq; continue; }
              var cut = Math.min(1, (scarf - run2) / slq), parts = Math.max(1, Math.ceil(cut * slq / 1.0));
              for (var pi = 0; pi < parts; pi++) {
                var a0 = cut * pi / parts, b0 = cut * (pi + 1) / parts, h1 = hf(run2 + slq * b0), hm = (hf(run2 + slq * a0) + h1) / 2;
                if (pass === 0) seg(q, a0, b0, z - h0 * (1 - h1), hm);
                else if (1 - hm >= 0.08) seg(q, a0, b0, undefined, 1 - hm);
                else rawMove(X(q) + (X(q + 1) - X(q)) * b0, Y(q) + (Y(q + 1) - Y(q)) * b0);
              }
              if (cut < 1 && pass === 0) seg(q, cut, 1);
              run2 += slq;
            }
          }
          wipeFrom = scarf;
        } else {
          // folga de 0,04 mm no fecho de todas as paredes (seam_gap de 10% do bico, como o Orca)
          var gapLen = (type <= TYPE.INNER && Ltot > 1) ? 0.04 : 0, stopAt = Ltot - gapLen, run = 0;
          for (q = 0; q < n; q++) {
            var sl = Math.hypot(X(q + 1) - X(q), Y(q + 1) - Y(q));
            if (gapLen > 0 && run + sl >= stopAt) { seg(q, 0, sl > 0 ? Math.max(0, (stopAt - run) / sl) : 0); break; }
            seg(q, 0, 1); run += sl;
          }
        }
        if (isOuter && cfg.wipe) {
          // limpeza: segue o laço a partir do fim da costura, deslocado para dentro
          var W = [], done = 0, skip = wipeFrom;
          for (q = 0; q < 2 * n && done < cfg.wipeDist - 1e-6; q++) {
            var ax = X(q), ay = Y(q), bx = X(q + 1), by = Y(q + 1), sl2 = Math.hypot(bx - ax, by - ay);
            if (sl2 < 1e-6) continue;
            if (skip >= sl2 - 1e-9) { skip -= sl2; continue; }
            var tq = (L.t && insideOK) ? L.t[(sIdx + q) % n] : 0, iq = Math.min(0.35, tq / 2 - 0.02);
            if (!(iq > 0.03)) iq = 0;
            var ux = (bx - ax) / sl2, uy = (by - ay) / sl2, ox = -uy * sg * iq, oy = ux * sg * iq;
            var from = skip; skip = 0;
            var take = Math.min(sl2 - from, cfg.wipeDist - done);
            if (!W.length && iq > 0) { var lead = Math.min(take, 0.3); W.push(ax + ux * (from + lead) + ox, ay + uy * (from + lead) + oy); }
            W.push(ax + ux * (from + take) + ox, ay + uy * (from + take) + oy);
            done += take;
          }
          wipe = W;
        }
      };

      var printSpiral = function (L, w) {
        var pts = L.p, n = pts.length / 2, q, s0 = 0, bd = Infinity;
        for (q = 0; q < n; q++) { var dq = Math.hypot(pts[2 * q] - cx, pts[2 * q + 1] - cy); if (dq < bd) { bd = dq; s0 = q; } }
        var X = function (i) { return pts[2 * ((s0 + i) % n)]; }, Y = function (i) { return pts[2 * ((s0 + i) % n) + 1]; };
        var Lt = 0;
        for (q = 0; q < n; q++) Lt += Math.hypot(X(q + 1) - X(q), Y(q + 1) - Y(q));
        setAcc(accOf(TYPE.OUTER));
        var v = speedOf(TYPE.OUTER), run = 0;
        // emenda com a volta anterior extrudando, sem deslocamento em vazio
        if (!firstSpiral && !retracted && Math.hypot(X(0) - cx, Y(0) - cy) < 2) extrude(X(0), Y(0), w, v, TYPE.OUTER, 1, z - h0);
        else travel(X(0), Y(0), true, true);
        for (q = 0; q < n; q++) {
          var sl = Math.hypot(X(q + 1) - X(q), Y(q + 1) - Y(q));
          if (sl < 1e-6) continue;
          var parts = Math.max(1, Math.ceil(sl / 2));
          for (var pi = 1; pi <= parts; pi++) {
            var r1 = run + sl * pi / parts, r0 = run + sl * (pi - 1) / parts;
            // na primeira volta o fluxo cresce de 0 a 100%, saindo de cima do fundo sem degrau
            var fm = firstSpiral ? Math.max(0.05, (r0 + r1) / 2 / Lt) : 1;
            extrude(X(q) + (X(q + 1) - X(q)) * pi / parts, Y(q) + (Y(q + 1) - Y(q)) * pi / parts, w, v, TYPE.OUTER, fm, z - h0 + h0 * r1 / Lt);
          }
          run += sl;
        }
      };

      // imprime só os trechos de um laço com fator > 0 (paredes finas e vãos)
      var printRuns = function (L, type, w, minLen) {
        var p = L.p, f = L.f, n = f.length, i, q, allOn = true;
        for (i = 0; i < n; i++) if (!(f[i] > 0)) { allOn = false; break; }
        if (allOn) { printLoop(L, type, w, false); return; }
        var i0 = 0;
        while (f[i0] > 0) i0++;
        var runs = [], start = -1;
        for (q = 1; q <= n; q++) {
          i = (i0 + q) % n;
          if (f[i] > 0) { if (start < 0) start = i; }
          else if (start >= 0) { runs.push([start, i]); start = -1; }
        }
        var PX = function (v) { return p[2 * (v % n)]; }, PY = function (v) { return p[2 * (v % n) + 1]; };
        runs = runs.filter(function (r) {
          var len = 0, cnt = (r[1] - r[0] + n) % n;
          for (var c = 0; c < cnt; c++) len += Math.hypot(PX(r[0] + c + 1) - PX(r[0] + c), PY(r[0] + c + 1) - PY(r[0] + c));
          r[2] = cnt;
          return len >= minLen;
        });
        var v0 = speedOf(type);
        while (runs.length) {
          var bi = 0, bd = Infinity, rev = false;
          for (i = 0; i < runs.length; i++) {
            var r = runs[i], ds = Math.hypot(PX(r[0]) - cx, PY(r[0]) - cy), de = Math.hypot(PX(r[1]) - cx, PY(r[1]) - cy);
            if (ds < bd) { bd = ds; bi = i; rev = false; }
            if (de < bd) { bd = de; bi = i; rev = true; }
          }
          var R = runs.splice(bi, 1)[0], cnt = R[2], c;
          setAcc(accOf(type));
          if (!rev) {
            travel(PX(R[0]), PY(R[0]), type <= TYPE.INNER);
            for (c = 0; c < cnt; c++) extrude(PX(R[0] + c + 1), PY(R[0] + c + 1), w, v0, type, f[(R[0] + c) % n]);
          } else {
            travel(PX(R[0] + cnt), PY(R[0] + cnt), type <= TYPE.INNER);
            for (c = cnt - 1; c >= 0; c--) extrude(PX(R[0] + c), PY(R[0] + c), w, v0, type, f[(R[0] + c) % n]);
          }
        }
      };

      // conn: área (inteira) por onde a ligação entre linhas vizinhas pode passar, extrudando
      var printSegs = function (sg, type, w, fm, conn, maxD, linkFm) {
        if (!sg.length) return;
        setAcc(accOf(type));
        var v = speedOf(type);
        for (var q = 0; q < sg.length; q++) {
          var ax = sg[q].a[0], ay = sg[q].a[1], dd = Math.hypot(ax - cx, ay - cy);
          if (conn && q > 0 && dd > 0.002 && dd <= maxD && inside((ax + cx) / 2, (ay + cy) / 2, conn) && inside(cx + (ax - cx) * 0.25, cy + (ay - cy) * 0.25, conn) && inside(cx + (ax - cx) * 0.75, cy + (ay - cy) * 0.75, conn))
            extrude(ax, ay, w, v, type, (fm || 1) * (linkFm || 0.6));
          else travel(ax, ay);
          extrude(sg[q].b[0], sg[q].b[1], w, v, type, fm);
        }
      };
      var solidFill = function (area, ang, type, strict) {
        var sg = orderMonotonic(scanFill(area, ang, spc, 0, 0.05), cx, cy, strict);
        printSegs(sg, type, Lr.w, 1, OFF(area, spc * 0.5 * SC), spc * 3);
      };

      // caminhos abertos (gyroid): começa sempre pela ponta mais próxima
      var printPaths = function (paths, type, w) {
        if (!paths.length) return;
        setAcc(accOf(type));
        var v = speedOf(type), rem = paths.slice();
        while (rem.length) {
          var bi = 0, bd = Infinity, rev = false;
          for (var i = 0; i < rem.length; i++) {
            var p = rem[i], a = p[0], b = p[p.length - 1];
            var da = (a.X / SC - cx) * (a.X / SC - cx) + (a.Y / SC - cy) * (a.Y / SC - cy);
            var db = (b.X / SC - cx) * (b.X / SC - cx) + (b.Y / SC - cy) * (b.Y / SC - cy);
            if (da < bd) { bd = da; bi = i; rev = false; }
            if (db < bd) { bd = db; bi = i; rev = true; }
          }
          var P = rem.splice(bi, 1)[0];
          if (rev) P = P.slice().reverse();
          travel(P[0].X / SC, P[0].Y / SC);
          for (var q = 1; q < P.length; q++) extrude(P[q].X / SC, P[q].Y / SC, w, v, type);
        }
      };

      var printLoops = function (arr, type, w, isOuter, near) {
        var rem = arr.slice();
        while (rem.length) {
          var bi = 0, bd2 = Infinity;
          for (var q = 0; q < rem.length; q++) {
            var a = rem[q].p;
            for (var v = 0; v < a.length; v += 8) { var d2 = (a[v] - cx) * (a[v] - cx) + (a[v + 1] - cy) * (a[v + 1] - cy); if (d2 < bd2) { bd2 = d2; bi = q; } }
          }
          printLoop(rem.splice(bi, 1)[0], type, w, isOuter, near);
        }
      };

      // saia e borda (só o que cabe na mesa)
      if (first) {
        var base = U(region[0], support[0]), loopsSB = [];
        var fitsBed = function (paths) { var b = boundsMM(paths); return b[0] >= 0.5 && b[1] >= 0.5 && b[2] <= BED_X - 0.5 && b[3] <= BED_Y - 0.5; };
        if (cfg.brim > 0 && base.length) {
          var nb = Math.max(1, Math.round(cfg.brim / Lr.spacing));
          for (k = nb - 1; k >= 0; k--) {
            var bl = OFF(base, (0.1 + Lr.w / 2 + k * Lr.spacing) * SC, true);
            if (fitsBed(bl)) loopsSB.push(bl); else brimClipped = true;
          }
        }
        if (cfg.skirt > 0 && base.length) {
          var dist0 = cfg.skirtDist + (cfg.brim > 0 ? cfg.brim : 0);
          var hull = OFF(OFF(base, (dist0 + 5) * SC, true), -5 * SC, true);
          var sk = [];
          for (k = cfg.skirt - 1; k >= 0; k--) sk.push(OFF(hull, (Lr.w / 2 + k * Lr.spacing) * SC, true));
          if (sk.every(fitsBed)) loopsSB = sk.concat(loopsSB); else skirtSkipped = true;
        }
        // cada volta de saia/borda que envolve uma só ilha é impressa logo antes dela
        var sbLoose = [];
        for (k = 0; k < loopsSB.length; k++) {
          var lp = clean(loopsSB[k], 0.01 * SC);
          for (var li = 0; li < lp.length; li++) {
            var owner = -1, cnt = 0;
            for (var ii = 0; ii < Lr.isl.length; ii++) {
              var p0 = Lr.isl[ii].outline[0][0];
              if (CL.Clipper.PointInPolygon(p0, lp[li]) !== 0) { owner = ii; cnt++; }
            }
            if (cnt === 1) (Lr.isl[owner].sb = Lr.isl[owner].sb || []).push({ L: lp[li], k: k });
            else sbLoose.push(lp[li]);
          }
        }
        if (sbLoose.length) printLoops(plain(sbLoose), TYPE.SKIRT, Lr.w, false);
      }

      // suporte
      if (support[l].length) {
        var supIsl = islands(support[l]);
        var supAbove = (l + 2 < N) ? I(support[l + 1], support[l + 2]) : [];
        var iface = cfg.supIface ? D(support[l], supAbove) : [];
        for (var si = 0; si < supIsl.length; si++) {
          printLoops(plain(OFF(supIsl[si], -(Lr.w / 2) * SC)), TYPE.SUPPORT, Lr.w, false);
          var inner = OFF(supIsl[si], -(Lr.w / 2 + Lr.spacing * 0.9) * SC);
          var ifc = I(inner, iface), bas = D(inner, ifc);
          printSegs(orderGreedy(scanFill(bas, 0, Lr.w / (cfg.supDensity / 100), 0), cx, cy), TYPE.SUPPORT, Lr.w);
          printSegs(orderMonotonic(scanFill(ifc, 90, Lr.w / 0.7, 0), cx, cy), TYPE.IFACE, Lr.w);
        }
      }

      // ilhas do modelo (ordem por proximidade)
      var rem = Lr.isl.slice();
      var angSolid = (l % 2) ? 135 : 45, dens = cfg.infill / 100, spc = Lr.spacing, spF_ = Lr.spF;
      while (rem.length) {
        var bi = 0, bd = Infinity;
        for (var q = 0; q < rem.length; q++) {
          var c0 = rem[q].outline[0][0], dd2 = (c0.X / SC - cx) * (c0.X / SC - cx) + (c0.Y / SC - cy) * (c0.Y / SC - cy);
          if (dd2 < bd) { bd = dd2; bi = q; }
        }
        var IS = rem.splice(bi, 1)[0];
        if (IS.sb) { IS.sb.sort(function (a, b) { return a.k - b.k; }); IS.sb.forEach(function (o) { printLoop(plain([o.L])[0], TYPE.SKIRT, Lr.w, false); }); IS.sb = null; }
        // paredes: internas primeiro, externa por último
        var seams = [];
        curZone = zoneOf(IS);
        var zoneCorner = !first && curZone && curZone.corner && curZone.corner !== (cfg.corner || 'orca');
        if (zoneCorner) ops.push({ o: 'G', s: cornerCmd(curZone.corner) });
        var seamMode = (curZone && curZone.seam) || cfg.seam;
        if (seamMode === 'face' && IS.walls.length) IS.walls[0] = IS.walls[0].map(faceSeam);
        else if (seamMode === 'rear' && IS.walls.length) IS.walls[0].forEach(function (L0) { L0.si = alignSeam(L0, seamIdx(L0)); });
        if (seamMode !== 'nearest' && IS.walls.length) IS.walls[0].forEach(function (L0) { seams.push(L0.p[2 * L0.si], L0.p[2 * L0.si + 1]); seamsNow.push(L0.p[2 * L0.si], L0.p[2 * L0.si + 1]); });
        // só limpa/desfaz retração por dentro se houver plástico por dentro da parede externa
        insideOK = IS.walls.length > 1 || (IS.fill.length > 0 && (cfg.infill > 0 || I(IS.fill, U(Lr.solid, Lr.top)).length > 0));
        if (spiral) printSpiral(IS.walls[0][0], Lr.w);
        else if (IS.outerFirst) for (k = 0; k < IS.walls.length; k++) printLoops(IS.walls[k], k === 0 ? TYPE.OUTER : TYPE.INNER, k === 0 ? Lr.w : Lr.wi, k === 0, k > 0 ? seams : null);
        else for (k = IS.walls.length - 1; k >= 0; k--) printLoops(IS.walls[k], k === 0 ? TYPE.OUTER : TYPE.INNER, k === 0 ? Lr.w : Lr.wi, k === 0, k > 0 ? seams : null);
        insideOK = true;
        for (k = 0; k < IS.thin.length; k++) printRuns(IS.thin[k], TYPE.OUTER, Lr.w, 0.6);
        for (k = 0; k < IS.gaps.length; k++) printRuns(IS.gaps[k], TYPE.GAP, Lr.w, 2.0);
        if (IS.fill.length) {
          for (k = 0; k < Lr.bridge.length; k++) {
            var br = I(IS.fill, Lr.bridge[k].poly);
            if (br.length) printSegs(orderMonotonic(scanFill(br, Lr.bridge[k].ang, spc, 0), cx, cy), TYPE.BRIDGE, Lr.w);
          }
          var sp_ = I(IS.fill, Lr.sparse), so_ = I(IS.fill, Lr.solid), to_ = I(IS.fill, Lr.top);
          if (sp_.length && dens > 0) {
            if (cfg.pattern === 'gyroid') {
              printPaths(clipOpen(gyroidLines(boundsMM(sp_), z, 2.575 * spF_ / dens), sp_), TYPE.SPARSE, Lr.wf);
            } else {
              var sg = [];
              if (cfg.pattern === 'grid') sg = scanFill(sp_, 45, 2 * spF_ / dens, 0).concat(scanFill(sp_, 135, 2 * spF_ / dens, 0));
              else if (cfg.pattern === 'triangles') sg = scanFill(sp_, 0, 3 * spF_ / dens, 0).concat(scanFill(sp_, 60, 3 * spF_ / dens, 0), scanFill(sp_, 120, 3 * spF_ / dens, 0));
              else sg = scanFill(sp_, angSolid, spF_ / dens, 0);
              // linhas alternadas: cada linha é ligada à vizinha por um trecho junto da parede (rectilinear do Orca),
              // em vez de um deslocamento em vazio entre elas
              if (cfg.pattern === 'lines' || !cfg.pattern) printSegs(orderGreedy(sg, cx, cy), TYPE.SPARSE, Lr.wf, 1, OFF(sp_, 0.05 * SC), 2.2 * spF_ / dens, 1);
              else printSegs(orderGreedy(sg, cx, cy), TYPE.SPARSE, Lr.wf);
            }
          }
          if (so_.length) solidFill(so_, angSolid, TYPE.SOLID, false);
          if (to_.length) {
            solidFill(to_, angSolid, TYPE.TOP, true);
            // alisamento: passadas a cada 0,1 mm com 15% do fluxo de uma camada
            if (cfg.ironing && !first) printSegs(orderMonotonic(scanFill(to_, angSolid, 0.1, 0.05), cx, cy, true), TYPE.IRON, Lr.w, 0.1 * h0 * 0.15 / extArea(Lr.w, h0));
          }
        }
        if (zoneCorner) ops.push({ o: 'G', s: cornerCmd(cfg.corner) });
      }
      // retração ao fim da camada (no modo vaso a espiral segue sem parar)
      if (!spiral) retract();

      /* --- tempo da camada e desaceleração para resfriamento --- */
      var travelV = first ? spd.travel0 : spd.travel, travelF = Math.round(travelV * 60);
      var retT = (retL > 0 ? retL / cfg.retSpeed : 0) + (cfg.zhop > 0 ? cfg.zhop / Z_SPEED : 0);
      var unretT = (retL > 0 ? retL / unretSpeed : 0) + (cfg.zhop > 0 ? cfg.zhop / Z_SPEED : 0);
      var extT = 0, travT = 0, aNow = acc.def, O, mv = [];
      for (q = 0; q < ops.length; q++) {
        O = ops[q];
        if (O.o === 'A') aNow = O.v;
        else if (O.o === 'B' || O.o === 'G') { /* aceleração de deslocamento e comandos avulsos: não contam tempo */ }
        else if (O.o === 'E') { O.a = aNow; O.v = O.f; mv.push(O); }
        else if (O.o === 'T') { O.a = acc.travel; O.v = travelV; mv.push(O); }
        else if (O.o === 'Z') { mv.push(null); travT += 0.05; }
        else { mv.push(null); travT += O.o === 'R' ? retT : unretT; }
      }
      // velocidade nas junções: limitada pela mudança de direção e pelo que dá para acelerar ou frear
      var M = mv.length, vE = new Float64Array(M), vX = new Float64Array(M);
      for (q = 0; q + 1 < M; q++) {
        var m0 = mv[q], m1 = mv[q + 1];
        if (!m0 || !m1) continue;
        var cs = ((m0.x - m0.x0) * (m1.x - m1.x0) + (m0.y - m0.y0) * (m1.y - m1.y0)) / (Math.hypot(m0.x - m0.x0, m0.y - m0.y0) * Math.hypot(m1.x - m1.x0, m1.y - m1.y0) + 1e-12);
        var sh = Math.sqrt(Math.max(0, (1 - cs) / 2));
        vX[q] = Math.min(m0.v, m1.v, sh > 1e-4 ? JERK / (2 * sh) : Infinity);
      }
      for (q = 0; q < M; q++) {
        if (!mv[q]) continue;
        vE[q] = (q > 0 && mv[q - 1]) ? vX[q - 1] : 0;
        vX[q] = Math.min(vX[q], Math.sqrt(vE[q] * vE[q] + 2 * mv[q].a * mv[q].d));
      }
      for (q = M - 1; q >= 0; q--) {
        if (!mv[q]) continue;
        var cap = Math.sqrt(vX[q] * vX[q] + 2 * mv[q].a * mv[q].d);
        if (vE[q] > cap) { vE[q] = cap; if (q > 0 && mv[q - 1]) vX[q - 1] = cap; }
        mv[q].tm = moveTime(mv[q].d, mv[q].v, mv[q].a, vE[q], vX[q]);
        if (mv[q].o === 'E') extT += mv[q].tm; else travT += mv[q].tm;
      }
      // tempo mínimo por camada, como o Orca: abaixa primeiro os trechos mais rápidos, até um teto comum de velocidade.
      // A parede externa só desacelera se o teto chegar à velocidade dela; pontes não desaceleram.
      var vCap = Infinity;
      if (!first && extT > 0 && extT + travT < cfg.minLayerTime) {
        var slowOf = function (m2, V) { return m2.t === TYPE.BRIDGE ? 1 : Math.max(1, m2.f / Math.max(V, Math.min(m2.f, cfg.minSpeed))); };
        var timeAt = function (V) { var t = travT; for (var q2 = 0; q2 < M; q2++) if (mv[q2] && mv[q2].o === 'E') t += mv[q2].tm * slowOf(mv[q2], V); return t; };
        var vLo = cfg.minSpeed, vHi = vLo;
        for (q = 0; q < M; q++) if (mv[q] && mv[q].o === 'E' && mv[q].f > vHi) vHi = mv[q].f;
        if (timeAt(vLo) > cfg.minLayerTime) { for (var it = 0; it < 30; it++) { var vMid = (vLo + vHi) / 2; if (timeAt(vMid) < cfg.minLayerTime) vHi = vMid; else vLo = vMid; } }
        vCap = vLo;
      }

      /* --- emissão --- */
      gc.push(';LAYER:' + l);
      gc.push(';LAYER_CHANGE'); gc.push(';Z:' + f3(z)); gc.push(';HEIGHT:' + f3(h0));
      st.lastT = -1;
      var fan = l === 0 ? 0 : (l < cfg.fanFullLayer - 1 ? Math.round(255 * l / (cfg.fanFullLayer - 1)) : 255);
      if (l > 0 && (Lr.bridge.length || Lr.ovh)) fan = 255;
      if (fan !== fanState) { gc.push(fan === 0 ? 'M107' : 'M106 S' + fan); fanState = fan; }
      if (l === 1) {
        if (cfg.tNozzle !== cfg.tNozzle0) gc.push('M104 S' + cfg.tNozzle);
        if (cfg.tBed !== cfg.tBed0) gc.push('M140 S' + cfg.tBed);
      }
      if (cfg.layerCmds) cfg.layerCmds.forEach(function (c) { if (!c.done && zb >= c.z) { gc.push(c.cmd); c.done = true; } });
      st.z = z;
      if (!(spiral && !firstSpiral)) gc.push('G1 Z' + f3(zBase + (st.hopped ? cfg.zhop : 0)) + ' F300');
      var layerT = 0, lastF = -1;
      var px0 = st.x, py0 = st.y;
      for (q = 0; q < ops.length; q++) {
        O = ops[q];
        if (O.o === 'A') gc.push('M204 P' + O.v);
        else if (O.o === 'B') gc.push('M204 T' + O.v);
        else if (O.o === 'G') O.s.forEach(function (ln) { gc.push(ln); });
        else if (O.o === 'Z') { gc.push('G1 Z' + f3(O.z) + ' F300'); lastF = 300; layerT += 0.05; }
        else if (O.o === 'T') {
          gc.push('G1 X' + f3(O.x) + ' Y' + f3(O.y) + (lastF !== travelF ? ' F' + travelF : ''));
          lastF = travelF; layerT += O.tm;
          px0 = O.x; py0 = O.y;
        } else if (O.o === 'E') {
          if (O.t !== st.lastT) { gc.push(';TYPE:' + TYPE_NAME[O.t]); st.lastT = O.t; }
          var v2 = O.t === TYPE.BRIDGE ? O.f : Math.min(O.f, Math.max(vCap, Math.min(O.f, cfg.minSpeed)));
          var F = Math.round(v2 * 60);
          gc.push('G1 X' + f3(O.x) + ' Y' + f3(O.y) + (O.z1 !== undefined ? ' Z' + f3(O.z1) : '') + ' E' + f5(O.e) + (F !== lastF ? ' F' + F : ''));
          lastF = F; totalE += O.e; layerT += O.tm * (O.f / v2);
          var C = COLORS[O.t];
          pos.push6(px0, py0, z, O.x, O.y, z); col.push6(C[0], C[1], C[2]);
          px0 = O.x; py0 = O.y;
        } else if (O.o === 'R') {
          var RF = Math.round(cfg.retSpeed * 60), hasWipe = O.wipe && O.wipe.length;
          if (hasWipe) {
            // 70% da retração parado na costura, o resto durante a limpeza
            var r5 = function (v) { return Math.round(v * 1e5) / 1e5; };
            var pre = r5(retL * 0.7), rest2 = retL - pre, wl3 = 0, wx = px0, wy = py0, wi, sent = pre;
            for (wi = 0; wi < O.wipe.length; wi += 2) { wl3 += Math.hypot(O.wipe[wi] - wx, O.wipe[wi + 1] - wy); wx = O.wipe[wi]; wy = O.wipe[wi + 1]; }
            if (pre > 0) gc.push('G1 E-' + f5(pre) + ' F' + RF);
            var WF = Math.round(spd.travel * 0.8 * 60);
            wx = px0; wy = py0;
            gc.push(';WIPE_START');
            for (wi = 0; wi < O.wipe.length; wi += 2) {
              var dlw = Math.hypot(O.wipe[wi] - wx, O.wipe[wi + 1] - wy);
              if (dlw < 0.002) continue;
              var ew = wl3 > 0 ? r5(rest2 * dlw / wl3) : 0;
              if (sent + ew > retL) ew = r5(retL - sent);
              gc.push('G1 X' + f3(O.wipe[wi]) + ' Y' + f3(O.wipe[wi + 1]) + (ew > 0 ? ' E-' + f5(ew) : '') + ' F' + WF);
              sent = r5(sent + ew); wx = O.wipe[wi]; wy = O.wipe[wi + 1];
            }
            gc.push(';WIPE_END');
            lastF = WF; px0 = wx; py0 = wy;
            // sobra de arredondamento menor que 0,0005 mm não vira comando: desfaz-se exatamente o que foi recolhido
            if (retL - sent > 5e-4) { gc.push('G1 E-' + f5(retL - sent) + ' F' + RF); lastF = RF; sent = retL; }
            layerT += wl3 / (spd.travel * 0.8) + pre / cfg.retSpeed;
            st.lastRet = sent;
          } else {
            if (retL > 0) { gc.push('G1 E-' + f5(retL) + ' F' + RF); lastF = RF; layerT += retL / cfg.retSpeed; }
            st.lastRet = retL;
          }
          if (cfg.zhop > 0) { gc.push('G1 Z' + f3(z + cfg.zhop) + ' F300'); st.hopped = true; lastF = 300; layerT += cfg.zhop / Z_SPEED; }
        } else if (O.o === 'U') {
          if (st.hopped) { gc.push('G1 Z' + f3(zBase) + ' F300'); st.hopped = false; lastF = 300; layerT += cfg.zhop / Z_SPEED; }
          var UL = st.lastRet != null ? st.lastRet : retL, DF = Math.round(unretSpeed * 60);
          if (UL > 0) { gc.push('G1 E' + f5(UL) + ' F' + DF); lastF = DF; layerT += UL / unretSpeed; }
        }
      }
      st.x = cx; st.y = cy; st.retracted = retracted; st.spiral = spiral; st.tAcc = curTAcc; st.seams = seamsNow;
      layerEnds[l] = pos.n / 6;
      layerTimes.push(layerT); totalT += layerT + h0 / Z_SPEED;
      if ((l & 3) === 0) progress(0.60 + 0.38 * l / N, 'Escrevendo G-code (' + (l + 1) + '/' + N + ')');
    }

    // finalização
    // final igual ao do perfil oficial da V3 SE: afasta o bico antes de desligar ventilador e aquecimento
    gc.push(';FIM');
    gc.push('G91 ; posição relativa');
    gc.push('G1 E-2 F2700 ; recolhe um pouco');
    gc.push('G1 E-2 Z0.2 F2400 ; recolhe e sobe');
    gc.push('G1 X' + (st.x > BED_X - 6 ? -5 : 5) + ' Y' + (st.y > BED_Y - 6 ? -5 : 5) + ' F3000 ; limpa o bico para fora da peça');
    gc.push('G1 Z10 ; sobe mais');
    gc.push('G90 ; posição absoluta');
    gc.push('G1 X0 Y' + BED_Y + ' ; apresenta a peça');
    gc.push('M106 S0 ; desliga o ventilador');
    gc.push('M104 S0 ; desliga o bico');
    gc.push('M140 S0 ; desliga a mesa');
    gc.push('M84 X Y E ; desliga os motores, menos o Z');

    totalT += 150 + 10 / Z_SPEED; // aquecimento, home e purga
    var meters = totalE / 1000;
    var grams = totalE * FIL_AREA * 1.24 / 1000;
    gc[hdrTime] = ';TIME:' + Math.round(totalT);
    gc[hdrFil] = ';Filament used:' + meters.toFixed(3) + 'm';
    if (skirtSkipped) warnings.push('A saia não coube na mesa e foi deixada de fora.');
    if (brimClipped) warnings.push('Parte da borda não coube na mesa e foi deixada de fora.');
    progress(0.99, 'Finalizando');

    return {
      gcode: gc.join('\n') + '\n',
      preview: {
        pos: pos.a.slice(0, pos.n), col: col.a.slice(0, col.n), layerEnds: layerEnds,
        layerZ: Float32Array.from(layers.map(function (L) { return L.z; }))
      },
      stats: { time: totalT, meters: meters, grams: grams, layers: N, height: layers[N - 1].z,
        supportUsed: support.some(function (s) { return s.length > 0; }), warnings: warnings }
    };
  }

  var API = { slice: slice, BED: [BED_X, BED_Y, BED_Z], COLORS: COLORS, version: 15 };
  API._int = { sliceMesh: sliceMesh, chain: chain, U: U, D: D, I: I, OFF: OFF, clean: clean, islands: islands, analyze: analyze, gyroidLines: gyroidLines, scanFill: scanFill, orderMonotonic: orderMonotonic, bridgeAngle: bridgeAngle, SC: SC };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else G.SlicerCore = API;
})(typeof self !== 'undefined' ? self : this);
