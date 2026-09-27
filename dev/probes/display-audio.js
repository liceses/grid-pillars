/* 验证 getDisplayMedia 的新参数不会抛错，并看返回的轨道构成（无头环境没有真实系统声，audio 可能为 0） */
(function () {
  var md = navigator.mediaDevices;
  if (!md || !md.getDisplayMedia) return 'NO-DISPLAY';
  return md.getDisplayMedia({
    video: true, audio: true,
    selfBrowserSurface: 'exclude', systemAudio: 'include', surfaceSwitching: 'include'
  }).then(function (s) {
    var out = {
      audioTracks: s.getAudioTracks().length,
      videoTracks: s.getVideoTracks().length,
      audioLabel: (s.getAudioTracks()[0] || {}).label || '',
      videoLabel: (s.getVideoTracks()[0] || {}).label || ''
    };
    s.getTracks().forEach(function (t) { t.stop(); });
    return JSON.stringify(out);
  }).catch(function (e) { return 'ERR ' + e.name + ': ' + e.message; });
})()
