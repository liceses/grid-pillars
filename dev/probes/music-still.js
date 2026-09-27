/* 出图用：音乐响应 + 音频抽屉，注入一条"低频强、高频弱"的受控频谱 */
(function () {
  var gp = window.__gp;
  gp.preset('music');
  document.querySelectorAll('.tab-item')[3].click();
  var bands = new Float32Array(16);
  var t0 = performance.now(), beating = false, frames = 0;
  var shape = [0.95, 0.88, 0.72, 0.58, 0.46, 0.38, 0.30, 0.25, 0.20, 0.16, 0.13, 0.11, 0.09, 0.07, 0.06, 0.05];
  (function drive() {
    var t = (performance.now() - t0) / 1000;
    var on = (t % 1.2) < 0.85;
    for (var i = 0; i < 16; i++) bands[i] = on ? shape[i] : 0.0;
    var beat = 0;
    if (on && !beating) { beating = true; beat = 1; }
    if (!on) beating = false;
    gp.setAudioFrame({ bands: bands, level: on ? 0.85 : 0.03, bass: on ? 0.95 : 0,
                       mid: 0.4, high: 0.15, bright: 0.35, flux: beat, beat: beat });
    frames++;
    requestAnimationFrame(drive);
  })();
  return new Promise(function (res) {
    setTimeout(function () {
      res(JSON.stringify({
        mode: gp.mode(), frames: frames, pillars: gp.stats().pillars,
        ring0: +gp.sample(0, 0).toFixed(2), ring2: +gp.sample(2, 0).toFixed(2),
        ring8: +gp.sample(8, 0).toFixed(2), ring15: +gp.sample(15, 0).toFixed(2),
        outside: +gp.sample(30, 0).toFixed(2)
      }));
    }, 3000);
  });
})()
