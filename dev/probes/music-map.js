/* 音乐响应模式的映射验证：注入合成音频帧，看柱子是否真的跟着动 */
(function () {
  var g = window.__gp;
  if (!g) return 'NO-INSTANCE';
  g.setMode('music');
  g.setFocus(0, 0);
  var bands = new Float32Array(16);
  var t0 = performance.now();
  var beating = false;
  function drive() {
    var t = (performance.now() - t0) / 1000;
    var on = (t % 1.0) < 0.5;                       // 1Hz 通断
    for (var i = 0; i < 16; i++) bands[i] = on ? (i < 3 ? 0.95 : 0.25) : 0.0;
    var beat = 0;
    if (on && !beating) { beating = true; beat = 1; }
    if (!on) beating = false;
    g.setAudioFrame({ bands: bands, level: on ? 0.8 : 0.02, bass: on ? 0.95 : 0,
                      mid: 0.3, high: 0.2, bright: 0.4, flux: beat, beat: beat });
    requestAnimationFrame(drive);
  }
  drive();
  return new Promise(function (res) {
    var samples = [], n = 0;
    function poll() {
      samples.push({ c: g.sample(0, 0), r8: g.sample(8, 0) });
      if (++n < 24) { setTimeout(poll, 100); return; }
      var c = samples.map(function (x) { return x.c; });
      var r = samples.map(function (x) { return x.r8; });
      res(JSON.stringify({
        mode: g.mode(),
        live: g.audio.live,
        pillars: g.stats().pillars,
        center: [Math.min.apply(null, c).toFixed(2), Math.max.apply(null, c).toFixed(2)],
        ring8: [Math.min.apply(null, r).toFixed(2), Math.max.apply(null, r).toFixed(2)]
      }));
    }
    setTimeout(poll, 400);
  });
})()
