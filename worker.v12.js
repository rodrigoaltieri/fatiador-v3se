/* Worker do Fatiador V3 SE (v12) */
importScripts('vendor/clipper.js', 'core.v12.js');
self.onmessage = function (e) {
  try {
    var last = 0;
    var r = self.SlicerCore.slice(e.data, function (p, m) {
      var now = Date.now();
      if (now - last > 120) { last = now; self.postMessage({ type: 'progress', p: p, m: m }); }
    });
    self.postMessage({ type: 'done', gcode: r.gcode, preview: r.preview, stats: r.stats },
      [r.preview.pos.buffer, r.preview.col.buffer, r.preview.layerEnds.buffer, r.preview.layerZ.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
