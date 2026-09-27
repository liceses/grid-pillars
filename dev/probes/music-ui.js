/* 走真实 UI 路径：点「改用麦克风」→ 应自动切到音乐响应 + 打开音频抽屉 + 频谱有反应 */
(function () {
  var btn = document.querySelector('#audioMic');
  if (!btn) return 'NO-BUTTON';
  btn.click();
  return new Promise(function (res) {
    setTimeout(function () {
      var gp = window.__gp;
      res(JSON.stringify({
        mode: gp.mode(),
        live: gp.audio.live,
        state: document.querySelector('#audioState').textContent,
        levelTxt: document.querySelector('#audioLevel').textContent,
        bpmTxt: document.querySelector('#audioBpm').textContent,
        drawer: document.querySelector('#drawerAudio').classList.contains('on'),
        modeName: document.querySelector('#capMode').textContent,
        bands: Array.prototype.slice.call(gp.audio.bands).map(function (v) { return +v.toFixed(2); })
      }));
    }, 4500);
  });
})()
