/* 回归：把 16 个模式挨个过一遍，再套一次「音浪」预设，确认没有报错 */
(function () {
  var gp = window.__gp;
  var out = { modes: [], errors: [] };
  window.addEventListener('error', function (e) { out.errors.push(String(e.message)); });
  var ids = window.GridPillars.MODES.map(function (m) { return m.id; });
  var i = 0;
  return new Promise(function (res) {
    function step() {
      if (i >= ids.length) {
        gp.preset('music');
        out.presetName = document.querySelector('#presetNow').textContent;
        out.modeAfterPreset = gp.mode();
        out.audioPanel = document.querySelector('#audioState').textContent;
        out.fatal = document.querySelector('#fatal').classList.contains('show');
        res(JSON.stringify(out));
        return;
      }
      var id = ids[i++];
      gp.setMode(id);
      out.modes.push(id + '=' + gp.stats().pillars);
      setTimeout(step, 200);
    }
    step();
  });
})()
