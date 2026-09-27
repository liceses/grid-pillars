/* 音频链路端到端：getUserMedia（fake 设备）→ AudioContext → meyda → 音频帧 → 实例 */
(function () {
  var G = window.GridPillars;
  if (!G) return 'NO-ENGINE';
  var gp = window.__gp;
  if (!gp) return 'NO-INSTANCE';
  var out = { supported: G.audioSupported(), statuses: [] };
  var tap = G.createAudioTap({
    source: 'mic',
    target: gp,
    onStatus: function (s) { out.statuses.push(s.status); }
  });
  return tap.start().then(function (st) {
    out.status = st.status;
    out.error = st.error || '';
    out.sourceLabel = st.source || '';
    return new Promise(function (res) {
      var n = 0, peak = { level: 0, bands: 0 };
      (function sample() {
        var a = gp.audio;
        if (a.level > peak.level) peak.level = a.level;
        var nz = 0;
        for (var i = 0; i < a.bands.length; i++) if (a.bands[i] > 0.01) nz++;
        if (nz > peak.bands) peak.bands = nz;
        if (++n < 25) { setTimeout(sample, 100); return; }
        out.live = gp.audio.live;
        out.peakLevel = +peak.level.toFixed(3);
        out.maxNonZeroBands = peak.bands;
        out.bands = Array.prototype.slice.call(gp.audio.bands).map(function (v) { return +v.toFixed(2); });
        out.loudest = gp.audio.bands.indexOf(Math.max.apply(null, gp.audio.bands));
        tap.stop();
        res(JSON.stringify(out));
      })();
    });
  }).catch(function (e) { return 'THREW ' + e; });
})()
