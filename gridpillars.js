/*!
 * GridPillars — 3D 无限网格柱阵组件
 * 单文件、零依赖、原生 WebGL2。既能当作品展示，也能嵌进产品里当数据可视化元素。
 *
 * 用法：
 *   var gp = GridPillars.create(document.querySelector('#box'), {
 *     mode: 'sine', palette: 'deep', fit: true, legend: true,
 *     data: [{ id:'deepseek', label:'DeepSeek', value:0.82, color:'#4D6BFE' }, ...]
 *   });
 *   gp.setData([...]);  gp.setMode('ripple');  gp.on('pick', cb);  gp.destroy();
 *
 * 设计要点见 README.md：三层控制（算法 / 手动 / 缓动）、数据层、自适应构图。
 */
(function(global){
'use strict';

var TAU = Math.PI * 2;
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function frac(x){ return x - Math.floor(x); }
function nowMs(){ return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

/* ============================ 配色 ============================ */
var PALETTES = {
  swiss: { name:'瑞士', ui:'#e30613', flat:true, mono:true, lite:true,
    bgTop:[0.960,0.958,0.952], bgBottom:[0.976,0.975,0.970], bgHorizon:[0.940,0.938,0.930],
    grid:[0.400,0.400,0.392], major:[0.105,0.105,0.105], glow:[0.640,0.640,0.630], fog:[0.968,0.967,0.962],
    pillar:[0.145,0.152,0.165], pillarTop:[0.105,0.112,0.125] },
  deep:  { name:'深海', ui:'#6ee7f9',
    bgTop:[0.012,0.020,0.040], bgBottom:[0.045,0.070,0.110], bgHorizon:[0.10,0.34,0.46],
    grid:[0.22,0.42,0.56], major:[0.46,0.78,0.96], glow:[0.32,0.96,1.00], fog:[0.028,0.050,0.082],
    pillar:[0.30,0.42,1.00] },
  neon:  { name:'霓虹', ui:'#ff7ae6',
    bgTop:[0.020,0.008,0.036], bgBottom:[0.048,0.014,0.068], bgHorizon:[0.30,0.06,0.40],
    grid:[0.46,0.24,0.62], major:[0.86,0.44,1.00], glow:[1.00,0.36,0.92], fog:[0.030,0.010,0.048],
    pillar:[0.72,0.42,1.00] },
  amber: { name:'琥珀', ui:'#ffb86b',
    bgTop:[0.024,0.016,0.008], bgBottom:[0.066,0.042,0.018], bgHorizon:[0.46,0.26,0.06],
    grid:[0.52,0.36,0.18], major:[0.98,0.72,0.32], glow:[1.00,0.66,0.24], fog:[0.044,0.030,0.014],
    pillar:[0.92,0.62,0.28] },
  aurora:{ name:'极光', ui:'#7dffc4',
    bgTop:[0.005,0.020,0.018], bgBottom:[0.012,0.050,0.044], bgHorizon:[0.04,0.32,0.26],
    grid:[0.18,0.46,0.40], major:[0.38,0.92,0.72], glow:[0.30,1.00,0.72], fog:[0.010,0.038,0.034],
    pillar:[0.34,0.86,0.68] },
  slate: { name:'石墨', ui:'#9fb4d0',
    bgTop:[0.020,0.024,0.031], bgBottom:[0.050,0.058,0.070], bgHorizon:[0.16,0.20,0.28],
    grid:[0.30,0.35,0.44], major:[0.62,0.70,0.82], glow:[0.60,0.78,1.00], fog:[0.032,0.038,0.048],
    pillar:[0.58,0.64,0.74] }
};

/* ============================ 参数 ============================ */
var PARAM_DEFS = {
  speed: { label:'速度',  min:0,    max:4,   step:0.01 },
  wave:  { label:'波长',  min:3,    max:40,  step:0.1  },
  sharp: { label:'锐度',  min:0.5,  max:6,   step:0.1  },
  decay: { label:'衰减',  min:0,    max:0.4, step:0.002},
  duty:  { label:'带宽',  min:0.08, max:0.9, step:0.01 },
  dir:   { label:'方向°', min:0,    max:360, step:1    },
  amp:   { label:'强度',  min:0.1,  max:1.5, step:0.01 },
  gain:  { label:'灵敏度', min:0.2, max:3,   step:0.05 },
  smooth:{ label:'平滑',  min:0,    max:0.95,step:0.01 },
  punch: { label:'重拍',  min:0,    max:2,   step:0.05 },
  spread:{ label:'环半径', min:4,   max:24,  step:0.5  }
};

var GLOBAL_DEFS = [
  { k:'maxHeight',  label:'柱高',     min:3,   max:26,  step:0.5 },
  { k:'cellSize',   label:'网格尺寸', min:1.2, max:4.5, step:0.1, reset:true },
  { k:'easeUp',     label:'升起速度', min:1,   max:20,  step:0.1 },
  { k:'easeDown',   label:'回落速度', min:1,   max:20,  step:0.1 },
  { k:'fogEnd',     label:'可视距离', min:60,  max:600, step:5   },
  { k:'haze',       label:'距离减淡', min:0,   max:0.6, step:0.05 },
  { k:'gridGlow',   label:'网格辉光', min:0,   max:2,   step:0.05 },
  { k:'beam',       label:'光柱强度', min:0,   max:2,   step:0.05 },
  { k:'reflection', label:'地面倒影', min:0,   max:1,   step:0.05 },
  { k:'ambient',    label:'底噪起伏', min:0,   max:0.4, step:0.01 }
];

/* ============================ 噪声 / CA ============================ */
function hash2(x, y){
  var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hexToRgb(hex){
  if(!hex) return null;
  var h = String(hex).replace('#','');
  if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if(h.length !== 6) return null;
  var v = parseInt(h, 16);
  if(!isFinite(v)) return null;
  return [((v>>16)&255)/255, ((v>>8)&255)/255, (v&255)/255];
}
function vnoise(x, y){
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  var u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  var a = hash2(xi, yi), b = hash2(xi+1, yi), c = hash2(xi, yi+1), d = hash2(xi+1, yi+1);
  return a*(1-u)*(1-v) + b*u*(1-v) + c*(1-u)*v + d*u*v;
}
var CA_N = 48;

/* ============================ 算法 ============================ */
function shape(s, sharp){ return Math.pow(clamp(0.5 + 0.5*s, 0, 1), sharp); }

var MODES = [
  { id:'sine', name:'正弦波', glyph:'∿', desc:'单频平面波沿设定方向推进，像一片会呼吸的地毯。',
    uses:['speed','wave','sharp','dir','amp'], def:{ speed:1.1, wave:9, sharp:1.4, dir:35, amp:1 },
    fn:function(cx,cz,t,P){ var a=P.dir*Math.PI/180, k=TAU/P.wave;
      return shape(Math.sin((cx*Math.cos(a) + cz*Math.sin(a))*k - t*P.speed*1.7), P.sharp); } },

  { id:'ripple', name:'涟漪', glyph:'◎', desc:'从焦点向外扩散的同心波，随距离衰减；单击可移动焦点。',
    uses:['speed','wave','sharp','decay','amp'], def:{ speed:1.1, wave:11, sharp:2.2, decay:0.05, amp:1 },
    fn:function(cx,cz,t,P,F){ var r = Math.hypot(cx-F[0], cz-F[1]);
      return shape(Math.sin(r*(TAU/P.wave) - t*P.speed*2.0), P.sharp) / (1 + r*P.decay); } },

  { id:'spiral', name:'螺旋', glyph:'✺', desc:'角度相位叠加半径相位，柱子沿旋臂依次立起。',
    uses:['speed','wave','sharp','amp'], def:{ speed:1.1, wave:22, sharp:2.0, amp:1 },
    fn:function(cx,cz,t,P,F){ var dx=cx-F[0], dz=cz-F[1];
      return shape(Math.sin(Math.atan2(dz,dx)*3 + Math.hypot(dx,dz)*(TAU/P.wave)*0.6 - t*P.speed*1.7), P.sharp); } },

  { id:'pulse', name:'心跳', glyph:'♥', desc:'窄脉冲环一次次向外推，节拍感最强。',
    uses:['speed','wave','sharp','decay','amp'], def:{ speed:1.0, wave:26, sharp:6, decay:0.035, amp:1 },
    fn:function(cx,cz,t,P,F){ var r = Math.hypot(cx-F[0], cz-F[1]);
      return Math.pow(Math.max(0, Math.sin(r*(TAU/P.wave) - t*P.speed*2.8)), P.sharp) / (1 + r*P.decay); } },

  { id:'noise', name:'柏林噪声', glyph:'▒', desc:'两倍频值噪声，无周期有机起伏，适合“呼吸的城市”。',
    uses:['speed','wave','sharp','amp'], def:{ speed:1.0, wave:16, sharp:1.2, amp:1 },
    fn:function(cx,cz,t,P){ var s = 1/P.wave;
      var n = 0.65*vnoise(cx*s, cz*s + t*P.speed*0.25)
            + 0.35*vnoise(cx*s*2.3 + 11.3, cz*s*2.3 + 7.7 - t*P.speed*0.18);
      return Math.pow(clamp(n,0,1), P.sharp*0.6); } },

  { id:'life', name:'元胞自动机', glyph:'▦', desc:'48×48 环形网格上的生命游戏（B3/S23），柱子自组织成群。',
    uses:['speed','amp'], def:{ speed:1, amp:1 }, ca:true,
    fn:function(cx,cz){ return 0; } },

  { id:'rain', name:'随机雨', glyph:'☂', desc:'每格一个固定随机相位，柱子各自按节拍升起再落下。',
    uses:['speed','duty','sharp','amp'], def:{ speed:1.0, duty:0.35, sharp:1.6, amp:1 },
    fn:function(cx,cz,t,P){ var cyc = frac(t*P.speed*0.22 + hash2(cx*3+1, cz*7+5));
      return Math.pow(Math.max(0, 1 - Math.abs(cyc - 0.28) / (0.18 + 0.5*P.duty)), P.sharp*0.8); } },

  { id:'scan', name:'扫描线', glyph:'⤢', desc:'一道光带周期性扫过网格，秩序感最强。',
    uses:['speed','wave','duty','dir','amp'], def:{ speed:1.0, wave:24, duty:0.30, dir:0, amp:1 },
    fn:function(cx,cz,t,P){ var a=P.dir*Math.PI/180;
      var u = frac((cx*Math.cos(a) + cz*Math.sin(a))/P.wave - t*P.speed*0.55);
      var e = (u - 0.5) / (0.5*P.duty);
      return Math.exp(-e*e*3.0); } },

  { id:'interference', name:'双波干涉', glyph:'⧉', desc:'两列正交波叠加成交替亮斑，像网格自己的摩尔纹。',
    uses:['speed','wave','sharp','dir','amp'], def:{ speed:1.0, wave:13, sharp:1.6, dir:20, amp:1 },
    fn:function(cx,cz,t,P){ var a=P.dir*Math.PI/180, k=TAU/P.wave;
      var u = cx*Math.cos(a) + cz*Math.sin(a);
      var v = -cx*Math.sin(a) + cz*Math.cos(a);
      return Math.pow(clamp(0.5 + 0.25*Math.sin(u*k - t*P.speed*1.7) + 0.25*Math.sin(v*k*1.3 + t*P.speed*1.1), 0, 1), P.sharp*0.7); } },

  { id:'domino', name:'多米诺', glyph:'▤', desc:'锯齿波沿对角线逐排推倒又立起，有“传送带”的节奏。',
    uses:['speed','wave','sharp','amp'], def:{ speed:1.0, wave:18, sharp:2.5, amp:1 },
    fn:function(cx,cz,t,P){ return Math.pow(1 - frac((cx + cz)/P.wave - t*P.speed*0.18), P.sharp); } },

  { id:'vortex', name:'涡旋', glyph:'🌀', desc:'旋臂随时间旋转，柱子绕着焦点打转。',
    uses:['speed','wave','sharp','amp'], def:{ speed:1.0, wave:20, sharp:2.2, amp:1 },
    fn:function(cx,cz,t,P,F){ var dx=cx-F[0], dz=cz-F[1];
      var r = Math.hypot(dx,dz), ang = Math.atan2(dz,dx) + r*0.05 - t*P.speed*0.55;
      return shape(Math.sin(ang*2 + r*(TAU/P.wave)*0.5), P.sharp); } },

  { id:'weave', name:'编织', glyph:'▩', desc:'两个方向的正弦相乘，织出流动的格纹。',
    uses:['speed','wave','sharp','amp'], def:{ speed:1.0, wave:10, sharp:1.8, amp:1 },
    fn:function(cx,cz,t,P){ var k=TAU/P.wave;
      var s = Math.sin(cx*k - t*P.speed*1.6) * Math.sin(cz*k*0.9 + t*P.speed*1.2);
      return Math.pow(clamp(0.5 + 0.5*s, 0, 1), P.sharp); } },

  { id:'breath', name:'全阵呼吸', glyph:'◍', desc:'近乎同步的整体呼吸，只留一点相位差做“光泽”。',
    uses:['speed','wave','sharp','amp'], def:{ speed:1.0, wave:30, sharp:1.8, amp:1 },
    fn:function(cx,cz,t,P){ return shape(Math.sin(t*P.speed*1.5 - (cx + cz)*(TAU/P.wave)*0.5), P.sharp); } },

  { id:'data', name:'数据柱', glyph:'▮', desc:'每根柱子 = 一条数据（模型/指标），高度就是数值；悬停与点选会联动图例。',
    uses:['amp'], def:{ amp:1 }, dataDriven:true,
    fn:function(){ return 0; } },

  { id:'music', name:'音乐响应', glyph:'♫', audio:true,
    desc:'实时跟随系统正在播放的声音：16 个频段铺成同心环、重拍给全阵一次冲击并向外推一圈冲击波。',
    uses:['gain','smooth','punch','spread'], def:{ gain:1.2, smooth:0.55, punch:1.0, spread:14 },
    /* prepare 每帧跑一次（算环能量 / 重拍 / 冲击波半径），fn 只读它算出来的 S */
    prepare:function(A, P, t, S, dt){
      if(!S.rings){ S.rings = new Float32Array(16); S.lastBeat = -9; S.impulse = 0; }
      var live = A.live && A.level > 0.0015;
      S.live = live;
      var k = 1 - Math.exp(-dt * (2.5 + (1 - P.smooth) * 45));
      for(var i=0;i<16;i++){
        var target = live ? A.bands[i] : 0;
        S.rings[i] += (target - S.rings[i]) * k;
      }
      if(A.beat > 0.02 && t - S.lastBeat > 0.12){
        S.lastBeat = t;
        S.impulse = Math.min(2, P.punch * A.beat);
      }
      S.impulse *= Math.exp(-dt / 0.16);
      S.waveR = (t - S.lastBeat) * 26;                 /* 冲击波半径（格） */
      S.ringW = Math.max(0.7, P.spread / 16);
      S.gain = P.gain;
      S.bright = A.bright || 0;
    },
    fn:function(cx, cz, t, P, F, S){
      var dx = cx - F[0], dz = cz - F[1];
      var r = Math.sqrt(dx*dx + dz*dz);
      var idx = Math.floor(r / S.ringW);
      if(idx > 15) idx = 15;
      var v = S.rings[idx];
      v = v < 0.10 ? 0 : (v - 0.10) / 0.90;            /* 噪声门：安静处就是平的 */
      var h = Math.pow(v, 1.5) * S.gain * 1.15;        /* 幂曲线：弱频段压下去，强频段立起来 */
      if(S.impulse > 0.002){
        var d = r - S.waveR;
        h += 0.40 * S.impulse * Math.exp(-(d*d) / 26);  /* 向外推的冲击波 */
        h += 0.10 * S.impulse;                          /* 全阵一次抬升 */
      }
      h *= 0.55 + 0.60 * (idx / 15) * (0.55 + 0.9 * S.bright);   /* 高频亮 → 外环更活跃 */
      if(!S.live) h = 0.04 + 0.025 * Math.sin(t * 1.1);          /* 无信号：慢呼吸等待 */
      return h;
    } },

  { id:'manual', name:'手动', glyph:'✎', desc:'算法静默：开画笔（或按住 Shift）直接升降任意格子，完全由你控制。',
    uses:[], def:{}, fn:function(){ return 0; } }
];

/* 场景预设：算法 + 配色 + 参数 + 图标分配 + 取景（默认取景都能看到网格铺到地平线） */
var PRESETS = [
  { id:'awaken', name:'觉醒矩阵', mode:'scan', palette:'swiss', assign:'block',
    p:{ speed:0.9, wave:26, duty:0.26, dir:0, amp:1 },
    g:{ cellSize:3.2, maxHeight:16, easeUp:9, easeDown:5, gridGlow:0.30, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:118, phi:0.82, targetY:2, fov:44 } },
  { id:'city', name:'呼吸城市', mode:'noise', palette:'swiss', assign:'random',
    p:{ speed:0.8, wave:15, sharp:1.2, amp:1 },
    g:{ cellSize:3.4, maxHeight:9, easeUp:7, easeDown:4.5, gridGlow:0.26, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:86, phi:1.18, targetY:2.4 } },
  { id:'wave', name:'数据涟漪', mode:'ripple', palette:'swiss', assign:'ring',
    p:{ speed:1.0, wave:14, sharp:2.2, decay:0.05, amp:1 },
    g:{ cellSize:3.0, maxHeight:10, easeUp:9, easeDown:5, gridGlow:0.30, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:74, phi:1.14, targetY:2.2 } },
  { id:'neuron', name:'神经脉冲', mode:'pulse', palette:'swiss', assign:'cycle',
    p:{ speed:1.0, wave:26, sharp:6, decay:0.03, amp:1 },
    g:{ cellSize:2.8, maxHeight:15, easeUp:14, easeDown:7, gridGlow:0.28, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:70, phi:1.10, targetY:2.6 } },
  { id:'life', name:'生命群落', mode:'life', palette:'swiss', assign:'block',
    p:{ speed:1.6, amp:1 },
    g:{ cellSize:3.4, maxHeight:8, easeUp:6, easeDown:4, gridGlow:0.30, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:88, phi:1.20, targetY:2.0 } },
  { id:'models', name:'模型巡礼', mode:'sine', palette:'swiss', assign:'ring',
    p:{ speed:0.6, wave:20, sharp:1.5, dir:30, amp:0.95 },
    g:{ cellSize:3.2, maxHeight:12, easeUp:6.5, easeDown:4, gridGlow:0.30, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:76, phi:1.18, targetY:2.4 } },
  { id:'domino', name:'多米诺', mode:'domino', palette:'swiss', assign:'cycle',
    p:{ speed:0.9, wave:22, sharp:2.5, amp:1 },
    g:{ cellSize:3.0, maxHeight:10, easeUp:12, easeDown:6, gridGlow:0.28, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:78, phi:1.16, targetY:2.2 } },
  { id:'matrix', name:'数据矩阵', mode:'data', palette:'swiss', assign:'single',
    p:{ amp:1 },
    g:{ cellSize:2.6, maxHeight:12, easeUp:9, easeDown:5, ambient:0.05, gridGlow:0.24, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:62, phi:1.02, targetY:5 } },
  { id:'music', name:'音浪', mode:'music', palette:'swiss', assign:'single',
    p:{ gain:1.35, smooth:0.5, punch:1.1, spread:16 },
    g:{ cellSize:3.0, maxHeight:18, easeUp:16, easeDown:9, gridGlow:0.26, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:104, phi:0.74, targetY:2, fov:44 } },
  { id:'silent', name:'静默仪式', mode:'manual', palette:'swiss', assign:'single',
    p:{},
    g:{ cellSize:3.2, maxHeight:12, easeUp:9, easeDown:5, gridGlow:0.26, fogEnd:420, reflection:0, beam:0 },
    view:{ radius:84, phi:1.20, targetY:2.2 } }
];

/* ============================ 矩阵 ============================ */
function mat4(){ return new Float32Array(16); }
function perspective(out, fovy, aspect, near, far){
  var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
  out[4]=0; out[5]=f; out[6]=0; out[7]=0;
  out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
  out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
  return out;
}
function lookAt(out, eye, center, up){
  var z0=eye[0]-center[0], z1=eye[1]-center[1], z2=eye[2]-center[2];
  var len=Math.sqrt(z0*z0+z1*z1+z2*z2) || 1; z0/=len; z1/=len; z2/=len;
  var x0=up[1]*z2-up[2]*z1, x1=up[2]*z0-up[0]*z2, x2=up[0]*z1-up[1]*z0;
  len=Math.sqrt(x0*x0+x1*x1+x2*x2);
  if(len<1e-6){ x0=1; x1=0; x2=0; } else { x0/=len; x1/=len; x2/=len; }
  var y0=z1*x2-z2*x1, y1=z2*x0-z0*x2, y2=z0*x1-z1*x0;
  out[0]=x0; out[1]=y0; out[2]=z0; out[3]=0;
  out[4]=x1; out[5]=y1; out[6]=z1; out[7]=0;
  out[8]=x2; out[9]=y2; out[10]=z2; out[11]=0;
  out[12]=-(x0*eye[0]+x1*eye[1]+x2*eye[2]);
  out[13]=-(y0*eye[0]+y1*eye[1]+y2*eye[2]);
  out[14]=-(z0*eye[0]+z1*eye[1]+z2*eye[2]);
  out[15]=1;
  return out;
}
function mul(out,a,b){
  for(var c=0;c<4;c++){
    var b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
    out[c*4+0]=a[0]*b0+a[4]*b1+a[8]*b2+a[12]*b3;
    out[c*4+1]=a[1]*b0+a[5]*b1+a[9]*b2+a[13]*b3;
    out[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
    out[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
  }
  return out;
}
function invert(out,a){
  var a00=a[0],a01=a[1],a02=a[2],a03=a[3], a10=a[4],a11=a[5],a12=a[6],a13=a[7],
      a20=a[8],a21=a[9],a22=a[10],a23=a[11], a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  var b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
      b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
      b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
      b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
  var det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(!det) return out;
  det = 1/det;
  out[0]=(a11*b11-a12*b10+a13*b09)*det; out[1]=(a02*b10-a01*b11-a03*b09)*det;
  out[2]=(a31*b05-a32*b04+a33*b03)*det; out[3]=(a22*b04-a21*b05-a23*b03)*det;
  out[4]=(a12*b08-a10*b11-a13*b07)*det; out[5]=(a00*b11-a02*b08+a03*b07)*det;
  out[6]=(a32*b02-a30*b05-a33*b01)*det; out[7]=(a20*b05-a22*b02+a23*b01)*det;
  out[8]=(a10*b10-a11*b08+a13*b06)*det; out[9]=(a01*b08-a00*b10-a03*b06)*det;
  out[10]=(a30*b04-a31*b02+a33*b00)*det; out[11]=(a21*b02-a20*b04-a23*b00)*det;
  out[12]=(a11*b07-a10*b09-a12*b06)*det; out[13]=(a00*b09-a01*b07+a02*b06)*det;
  out[14]=(a31*b01-a30*b03-a32*b00)*det; out[15]=(a20*b03-a21*b01+a22*b00)*det;
  return out;
}

/* ============================ 着色器 ============================ */
var BG_VS = `#version 300 es
out vec2 vUV;
void main(){
  float x = float((gl_VertexID << 1) & 2);
  float y = float(gl_VertexID & 2);
  vUV = vec2(x, y);
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 1.0, 1.0);
}`;
var BG_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec3 uTop, uBottom, uHorizon;
out vec4 outColor;
void main(){
  float y = clamp(vUV.y, 0.0, 1.0);
  vec3 c = mix(uBottom, uTop, pow(y, 0.9));
  c += uHorizon * exp(-pow((y - 0.34) * 4.2, 2.0)) * 0.85;
  vec2 q = vUV - vec2(0.5);
  c *= 1.0 - 0.65 * dot(q, q);
  float n = fract(sin(dot(vUV, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * 0.012;
  outColor = vec4(c, 1.0);
}`;

var GRID_VS = `#version 300 es
in vec2 aXZ;
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform float uExtent;
out vec3 vWorld;
void main(){
  vec2 w = uCamPos.xz + aXZ * uExtent;
  vWorld = vec3(w.x, 0.0, w.y);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}`;
var GRID_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 uCamPos, uGridColor, uMajorColor, uGlowColor;
uniform float uCell, uFogStart, uFogEnd, uTime, uGlow, uN, uPulse;
uniform vec2 uPatchOrigin;
uniform sampler2D uHeight;
out vec4 outColor;
void main(){
  vec2 wc = vWorld.xz / uCell;
  vec2 f = fract(wc);
  vec2 d = min(f, 1.0 - f);
  float w = max(fwidth(wc.x), fwidth(wc.y)) * 1.4 + 0.0015;
  float minor = 1.0 - smoothstep(0.0, w, min(d.x, d.y));
  vec2 fm = fract(wc / 8.0);
  vec2 dm = min(fm, 1.0 - fm);
  float wm = max(fwidth(wc.x / 8.0), fwidth(wc.y / 8.0)) * 1.4 + 0.0008;
  float major = 1.0 - smoothstep(0.0, wm, min(dm.x, dm.y));

  vec2 uvT = (wc - uPatchOrigin) / uN;
  float inside = step(0.0, uvT.x) * step(uvT.x, 1.0) * step(0.0, uvT.y) * step(uvT.y, 1.0);
  float hf = texture(uHeight, uvT).r * inside;
  float glow = pow(hf, 1.4) * 1.5 * uGlow;

  float dist = distance(vWorld, uCamPos);
  float fog = clamp((dist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
  fog = fog * fog;
  float travel = mix(1.0, 0.80 + 0.20 * sin(dist * 0.14 - uTime * 1.6), uPulse);

  vec3 c = uGridColor * travel;
  c = mix(c, uMajorColor, major * 0.9);
  c += uGlowColor * glow;
  float a = max(minor * 0.62 * travel, major * 0.95);
  a = max(a, glow * 0.8);
  a *= 1.0 - fog;
  if(a < 0.003) discard;
  outColor = vec4(c, a);
}`;

var PILLAR_VS = `#version 300 es
in vec3 aPos;
in vec3 aNrm;
in float aTop;
in vec4 iA;
in vec4 iB;
uniform mat4 uViewProj;
uniform float uFlip;
out vec3 vNrm, vCol, vWorld;
out float vTop, vY;
void main(){
  /* 柱子 = 那个网格格子本身：底面与四条侧棱精确对齐格线，不做任何收分 */
  float h = iA.z;
  float halfW = iA.w;
  float y = aPos.y * h * uFlip;
  vec3 p = vec3(iA.x + aPos.x * halfW, y, iA.y + aPos.z * halfW);
  vNrm = vec3(aNrm.x, aNrm.y * uFlip, aNrm.z);
  vCol = iB.rgb;
  vTop = aTop;
  vY = aPos.y;
  vWorld = p;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
var PILLAR_FS = `#version 300 es
precision highp float;
in vec3 vNrm, vCol, vWorld;
in float vTop, vY;
uniform vec3 uCamPos, uFogColor;
uniform float uFogStart, uFogEnd, uDim, uFlat, uHaze;
out vec4 outColor;
void main(){
  vec3 N = normalize(vNrm);
  vec3 c;
  if(uFlat > 0.5){
    /* 扁平：每个朝向一个明度，不加高光、不加边缘光 */
    float face = abs(N.y) > 0.5 ? 1.00 : (abs(N.x) > 0.5 ? 0.86 : 0.94);
    c = vCol * face;
    if(vTop > 0.5) c = vCol * 1.02;
  } else {
    vec3 V = normalize(uCamPos - vWorld);
    vec3 L = normalize(vec3(0.40, 0.90, 0.25));
    float lam = 0.20 + 0.80 * max(dot(N, L), 0.0);
    c = vCol * lam;
    c *= mix(0.34, 1.30, vY);
    c *= mix(0.45, 1.0, smoothstep(0.0, 0.10, vY));
    c += vCol * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.9;
    if(vTop > 0.5) c = vCol * 1.45 + 0.30;
    c += vCol * exp(-pow((vY - 0.93) * 16.0, 2.0)) * 1.5;
  }
  float dist = distance(vWorld, uCamPos);
  float fog = clamp((dist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
  c = mix(c, uFogColor, fog * fog * uHaze);   /* 只做轻微减淡，不把远处刷成纸白 */
  outColor = vec4(c * uDim, 1.0);
}`;

/* 图标平贴在柱顶面：水平四边形，不做 billboard */
var ICON_VS = `#version 300 es
in vec2 aCorner;
in vec4 iA;
in vec4 iB;
uniform mat4 uViewProj;
uniform float uLift;
out vec2 vUV;
out float vAlpha;
out vec3 vWorld;
void main(){
  vec3 p = vec3(iA.x + aCorner.x * iA.w, iA.y + uLift, iA.z + aCorner.y * iA.w);
  float inset = 1.0 / 1024.0;
  vUV = vec2(iB.x, iB.y) + inset + (aCorner + 0.5) * (0.125 - 2.0 * inset);
  vAlpha = iB.z;
  vWorld = p;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
var ICON_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vAlpha;
in vec3 vWorld;
uniform sampler2D uAtlas;
uniform vec3 uCamPos, uFogColor;
uniform float uFogStart, uFogEnd, uHaze;
out vec4 outColor;
void main(){
  vec4 t = texture(uAtlas, vUV);
  if(t.a < 0.01) discard;
  float dist = distance(vWorld, uCamPos);
  float fog = clamp((dist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0) * uHaze;
  vec3 c = mix(t.rgb, uFogColor, fog);
  outColor = vec4(c, t.a * vAlpha * (1.0 - fog));
}`;

var HALO_VS = `#version 300 es
in vec2 aCorner;
in vec4 iA;
in vec4 iB;
uniform mat4 uViewProj;
uniform float uScale;
uniform float uLift;
out vec2 vUV;
out float vAlpha;
out float vIco;
void main(){
  float s = iA.w * uScale;
  vec3 p = vec3(iA.x + aCorner.x * s, iA.y + uLift * 0.5, iA.z + aCorner.y * s);
  vUV = aCorner + 0.5;
  vAlpha = iB.z;
  vIco = iB.w;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
var HALO_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vAlpha;
in float vIco;
uniform sampler2D uHalo;
uniform vec3 uColors[64];
uniform float uStrength;
out vec4 outColor;
void main(){
  float a = texture(uHalo, vUV).r * vAlpha * uStrength;
  if(a < 0.004) discard;
  vec3 c = uColors[int(vIco)];
  outColor = vec4(c * a, a);
}`;

var BEAM_VS = `#version 300 es
in vec2 aCorner;
in vec4 iA;
in vec4 iB;
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform float uLen;
out float vT;
out vec3 vCol;
out float vA;
void main(){
  float st = iA.w;
  vec3 base = vec3(iA.x, iA.y, iA.z);
  vec3 p = base + uCamRight * (aCorner.x * (0.5 + 0.55 * st)) + vec3(0.0, aCorner.y * uLen, 0.0);
  vT = aCorner.y + 0.5;
  vCol = iB.rgb;
  vA = st;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
var BEAM_FS = `#version 300 es
precision highp float;
in float vT;
in vec3 vCol;
in float vA;
uniform float uStrength;
out vec4 outColor;
void main(){
  float fade = pow(1.0 - vT, 1.8);
  outColor = vec4(vCol * (0.5 + 0.9 * fade), fade * vA * 0.22 * uStrength);
}`;

var RING_VS = `#version 300 es
in vec2 aCorner;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform float uSize;
out vec2 vC;
void main(){
  vC = aCorner * 2.0;
  vec3 p = uCenter + vec3(aCorner.x * uSize, 0.0, aCorner.y * uSize);
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
var RING_FS = `#version 300 es
precision highp float;
in vec2 vC;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 outColor;
void main(){
  float r = length(vC);
  float ring = smoothstep(0.66, 0.84, r) * (1.0 - smoothstep(0.90, 1.0, r));
  float fill = (1.0 - smoothstep(0.0, 1.0, r)) * 0.10;
  float a = (ring * 0.9 + fill) * uAlpha;
  if(a < 0.003) discard;
  outColor = vec4(uColor, a);
}`;

/* ============================ 内置图标 ============================ */
function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x+r, y);
  c.arcTo(x+w, y, x+w, y+h, r);
  c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r);
  c.arcTo(x, y, x+w, y, r);
  c.closePath();
}
function chipBg(c, S, color, inset, radius){
  c.fillStyle = color;
  roundRect(c, inset, inset, S - inset*2, S - inset*2, radius);
  c.fill();
}
function drawDeepSeek(c, S){
  chipBg(c, S, '#4D6BFE', 6, 26);
  c.save(); c.translate(10, 10); c.scale(1.08, 1.08);
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(10, 58);
  c.bezierCurveTo(20, 34, 48, 26, 72, 34);
  c.bezierCurveTo(94, 42, 98, 58, 88, 68);
  c.bezierCurveTo(76, 80, 46, 82, 26, 74);
  c.bezierCurveTo(18, 70, 12, 66, 10, 58);
  c.closePath(); c.fill();
  c.beginPath(); c.moveTo(10, 58); c.lineTo(-4, 44); c.lineTo(20, 48); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(76, 30); c.quadraticCurveTo(80, 16, 92, 12);
  c.lineWidth = 6; c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
  c.fillStyle = '#4D6BFE';
  c.beginPath(); c.arc(66, 48, 5, 0, TAU); c.fill();
  c.restore();
}
function drawKimi(c, S){
  chipBg(c, S, '#191B24', 6, 26);
  c.fillStyle = '#EDEDF5';
  c.beginPath(); c.arc(56, 68, 30, 0, TAU); c.fill();
  c.fillStyle = '#191B24';
  c.beginPath(); c.arc(74, 54, 28, 0, TAU); c.fill();
  c.fillStyle = '#9C8CFF';
  c.beginPath(); c.arc(34, 34, 4, 0, TAU); c.fill();
  c.beginPath(); c.arc(92, 84, 3, 0, TAU); c.fill();
  c.beginPath(); c.arc(96, 40, 2.4, 0, TAU); c.fill();
}
function drawGLM(c, S){
  chipBg(c, S, '#1F6FEB', 6, 12);
  c.save(); c.translate(S/2, S/2);
  c.strokeStyle = '#fff'; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  for(var i=0;i<6;i++){
    var a = i * Math.PI / 3 - Math.PI / 2;
    var x = Math.cos(a) * 38, y = Math.sin(a) * 38;
    if(i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath(); c.stroke();
  c.lineWidth = 7.5;
  c.beginPath();
  c.moveTo(-15, -16); c.lineTo(15, -16); c.lineTo(-15, 16); c.lineTo(15, 16);
  c.stroke();
  c.restore();
}
function drawQwen(c, S){
  chipBg(c, S, '#5B4BC4', 6, 12);
  c.save(); c.translate(S/2, S/2);
  c.strokeStyle = '#fff'; c.lineWidth = 10; c.lineCap = 'round';
  c.beginPath(); c.arc(-4, -4, 26, 0, TAU); c.stroke();
  c.beginPath(); c.moveTo(14, 14); c.lineTo(32, 32); c.stroke();
  c.restore();
}
function drawOpenAI(c, S){
  chipBg(c, S, '#0B0F14', 6, 26);
  c.save(); c.translate(S/2, S/2);
  c.strokeStyle = '#EDF2F7'; c.lineWidth = 7.5; c.lineJoin = 'round';
  for(var i=0;i<6;i++){
    c.save(); c.rotate(i * Math.PI / 3);
    roundRect(c, -13, -34, 26, 46, 13);
    c.stroke();
    c.restore();
  }
  c.restore();
}
function drawClaude(c, S){
  chipBg(c, S, '#F2EFE9', 6, 26);
  c.save(); c.translate(S/2, S/2);
  c.fillStyle = '#D97757';
  for(var i=0;i<8;i++){
    c.save(); c.rotate(i * Math.PI / 4);
    c.beginPath(); c.moveTo(-7, -10); c.lineTo(0, -42); c.lineTo(7, -10);
    c.closePath(); c.fill();
    c.restore();
  }
  c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill();
  c.restore();
}
var BUILTIN = [
  { name:'DeepSeek', draw:drawDeepSeek, tint:[0.30,0.42,1.00] },
  { name:'Kimi',     draw:drawKimi,     tint:[0.61,0.55,1.00] },
  { name:'GLM',      draw:drawGLM,      tint:[0.10,0.71,0.80] },
  { name:'Qwen',     draw:drawQwen,     tint:[0.54,0.43,0.88] },
  { name:'OpenAI',   draw:drawOpenAI,   tint:[0.06,0.64,0.50] },
  { name:'Claude',   draw:drawClaude,   tint:[0.85,0.47,0.34] }
];

/* ============================ 组件样式 ============================ */
var CSS_ID = 'gridpillars-css';
function injectCSS(){
  if(document.getElementById(CSS_ID)) return;
  var s = document.createElement('style');
  s.id = CSS_ID;
  s.textContent =
    '.gp-root{position:relative;width:100%;height:100%;overflow:hidden}' +
    '.gp-canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}' +
    '.gp-legend{position:absolute;left:10px;right:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px;z-index:2;' +
      'font:12px/1.3 ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none}' +
    '.gp-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;' +
      'background:rgba(9,13,21,.66);border:1px solid rgba(255,255,255,.13);color:#e8eef7;' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;pointer-events:auto;transition:.15s;white-space:nowrap}' +
    '.gp-chip:hover{border-color:rgba(255,255,255,.34)}' +
    '.gp-chip.on{border-color:currentColor;background:rgba(18,26,40,.92);box-shadow:0 0 0 1px currentColor inset}' +
    '.gp-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:0 0 auto}' +
    '.gp-name{opacity:.92}' +
    '.gp-val{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.75}' +
    '.gp-fatal{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(6,9,14,.92);color:#ffb0b0;font:13px/1.6 ui-sans-serif,system-ui,sans-serif;padding:20px;text-align:center}';
  document.head.appendChild(s);
}

/* ============================ 工厂 ============================ */
function create(container, opts){
  if(!container) throw new Error('GridPillars.create 需要一个容器元素');
  injectCSS();
  var DEFAULTS = {
    mode:'sine', palette:'swiss', assign:'random',
    background:'sky',
    cellSize:2.4, maxHeight:9.5, halfRatio:0.4995, iconRatio:0.52,
    iconInset:0.80, iconLift:0.004,
    easeUp:8, easeDown:5, fogEnd:420, gridGlow:0.9, beam:1.0, reflection:0.34, ambient:0,
    showGrid:true, showIcons:true, showBeams:true, showReflection:true,
    colorBlend:0.30, colorMode:'auto', flat:false, halo:0.30, pulse:true,
    autoRotate:true, autoRotateSway:false, cruise:false, paused:false, interactive:true,
    timeScale:1, quality:'auto', maxDpr:2, reducedMotion:'auto',
    autoPause:true, fit:true, legend:false,
    fov:52, radius:62, phi:0.95, theta:0.85, targetY:3.5,
    data:null, dataRadius:0, dataLayout:'ring', dataSpacing:2.6, dataNormalize:false
  };
  var o = {};
  for(var dk in DEFAULTS) if(DEFAULTS.hasOwnProperty(dk)) o[dk] = DEFAULTS[dk];
  for(var ik in opts) if(opts.hasOwnProperty(ik) && opts[ik] !== undefined) o[ik] = opts[ik];
  o.palette = PALETTES[o.palette] ? o.palette : 'deep';

  /* ---- DOM ---- */
  var root = document.createElement('div');
  root.className = 'gp-root';
  if(o.background === 'transparent') root.style.background = 'transparent';
  var canvas = document.createElement('canvas');
  canvas.className = 'gp-canvas';
  root.appendChild(canvas);
  container.appendChild(root);

  var ctxOpts = { antialias:true, alpha:o.background === 'transparent', depth:true, stencil:false,
                  premultipliedAlpha:false, preserveDrawingBuffer:true, powerPreference:'high-performance' };
  var gl = canvas.getContext('webgl2', ctxOpts);
  if(!gl){
    var fe = document.createElement('div');
    fe.className = 'gp-fatal';
    fe.textContent = '当前环境不支持 WebGL2，GridPillars 无法渲染。';
    root.appendChild(fe);
    return { ok:false, destroy:function(){ root.parentNode && root.parentNode.removeChild(root); } };
  }

  function shader(type, src){
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      var log = gl.getShaderInfoLog(sh);
      console.error('[GridPillars] shader', log);
      throw new Error(log);
    }
    return sh;
  }
  function program(vsSrc, fsSrc){
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('[GridPillars] link', gl.getProgramInfoLog(p));
    var obj = { p:p, _u:{}, _a:{}, use:function(){ gl.useProgram(p); } };
    obj.loc = function(n){ if(!(n in obj._u)) obj._u[n] = gl.getUniformLocation(p, n); return obj._u[n]; };
    obj.attr = function(n){ if(!(n in obj._a)) obj._a[n] = gl.getAttribLocation(p, n); return obj._a[n]; };
    return obj;
  }
  var bgP     = program(BG_VS, BG_FS);
  var gridP   = program(GRID_VS, GRID_FS);
  var pillarP = program(PILLAR_VS, PILLAR_FS);
  var iconP   = program(ICON_VS, ICON_FS);
  var haloP   = program(HALO_VS, HALO_FS);
  var beamP   = program(BEAM_VS, BEAM_FS);
  var ringP   = program(RING_VS, RING_FS);

  /* ---- 几何 ---- */
  function makeBuffer(data){
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  var boxVerts = (function(){
    var P=[], N=[], T=[];
    function face(a,b,c,d,n,isTop){
      var q=[a,b,c,a,c,d];
      for(var i=0;i<6;i++){ P.push(q[i][0],q[i][1],q[i][2]); N.push(n[0],n[1],n[2]); T.push(isTop); }
    }
    face([-0.5,1,-0.5],[0.5,1,-0.5],[0.5,1,0.5],[-0.5,1,0.5],[0,1,0],1);
    face([0.5,0,-0.5],[0.5,0,0.5],[0.5,1,0.5],[0.5,1,-0.5],[1,0,0],0);
    face([-0.5,0,0.5],[-0.5,0,-0.5],[-0.5,1,-0.5],[-0.5,1,0.5],[-1,0,0],0);
    face([-0.5,0,0.5],[0.5,0,0.5],[0.5,1,0.5],[-0.5,1,0.5],[0,0,1],0);
    face([0.5,0,-0.5],[-0.5,0,-0.5],[-0.5,1,-0.5],[0.5,1,-0.5],[0,0,-1],0);
    return { pos:new Float32Array(P), nrm:new Float32Array(N), top:new Float32Array(T) };
  })();
  var boxPosBuf = makeBuffer(boxVerts.pos);
  var boxNrmBuf = makeBuffer(boxVerts.nrm);
  var boxTopBuf = makeBuffer(boxVerts.top);
  var quadBuf   = makeBuffer(new Float32Array([-0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,-0.5, 0.5,0.5, -0.5,0.5]));
  var gridQuadBuf = makeBuffer(new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]));

  /* ---- 图集 ---- */
  var ATLAS = 1024, CELLPX = 128, GRIDN = 8, MAXICON = GRIDN * GRIDN;
  var atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasCanvas.height = ATLAS;
  var actx = atlasCanvas.getContext('2d', { willReadFrequently:true });
  var atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  actx.clearRect(0,0,ATLAS,ATLAS);

  var haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  (function(){
    var c = haloCanvas.getContext('2d');
    var g = c.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.14,'rgba(255,255,255,.42)');
    g.addColorStop(0.34,'rgba(255,255,255,.10)');
    g.addColorStop(0.62,'rgba(255,255,255,.02)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0,0,128,128);
  })();
  var haloTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, haloTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, haloCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  function uploadAtlas(){
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  var icons = [];
  var iconColorArr = new Float32Array(MAXICON * 3);
  function extractColor(slot, fallback){
    try{
      var x = (slot % GRIDN) * CELLPX, y = Math.floor(slot / GRIDN) * CELLPX;
      var d = actx.getImageData(x, y, CELLPX, CELLPX).data;
      var r=0,g=0,b=0,n=0;
      for(var i=0;i<d.length;i+=4){
        if(d[i+3] > 60){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
      }
      if(!n) return fallback || [0.6,0.75,1];
      r/=n*255; g/=n*255; b/=n*255;
      /* 压掉过亮/过暗的图标主色，避免柱子跳出画面配色 */
      var lum = 0.2126*r + 0.7152*g + 0.0722*b;
      if(lum > 0.52){ var kd = 0.52/lum; r*=kd; g*=kd; b*=kd; }
      else if(lum < 0.22 && lum > 0){ var ku = 0.30/lum; r=clamp(r*ku,0,1); g=clamp(g*ku,0,1); b=clamp(b*ku,0,1); }
      var m = Math.max(r, Math.max(g, b)) || 1;
      if(m > 0.92){ var km = 0.92/m; r*=km; g*=km; b*=km; }
      return [clamp(r,0,1), clamp(g,0,1), clamp(b,0,1)];
    }catch(e){ return fallback || [0.6,0.75,1]; }
  }
  function syncIconColors(){
    iconColorArr.fill(0);
    for(var i=0;i<icons.length;i++){
      iconColorArr[i*3] = icons[i].color[0];
      iconColorArr[i*3+1] = icons[i].color[1];
      iconColorArr[i*3+2] = icons[i].color[2];
    }
  }
  function addIcon(name, drawFn, fallbackTint, meta){
    if(icons.length >= MAXICON) return null;
    var slot = icons.length;
    var x = (slot % GRIDN) * CELLPX, y = Math.floor(slot / GRIDN) * CELLPX;
    actx.save();
    actx.clearRect(x, y, CELLPX, CELLPX);
    actx.translate(x, y);
    actx.beginPath(); actx.rect(0, 0, CELLPX, CELLPX); actx.clip();
    try{ drawFn(actx, CELLPX); }catch(e){ console.warn('[GridPillars] 图标绘制失败', e); }
    actx.restore();
    var item = { name:name, slot:slot, color:extractColor(slot, fallbackTint), meta:meta || null };
    icons.push(item);
    uploadAtlas(); syncIconColors();
    return item;
  }
  function hexRgbOrNull(hex){ return hexToRgb(hex); }
  function addTextIcon(text, tint){
    return addIcon(text, function(c, S){
      chipBg(c, S, 'rgba(9,14,24,.94)', 6, 24);
      c.strokeStyle = 'rgba(140,200,255,.5)'; c.lineWidth = 2;
      roundRect(c, 6, 6, S-12, S-12, 24); c.stroke();
      c.fillStyle = '#eafcff';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 ' + (text.length <= 2 ? 62 : (text.length <= 4 ? 44 : 30)) + 'px ui-sans-serif,system-ui,"Segoe UI Emoji","PingFang SC",sans-serif';
      c.fillText(text, S/2, S/2 + 2);
    }, tint || [0.55,0.85,1]);
  }
  function addImageIcon(src, name, meta){
    var img = new Image();
    if(!/^data:/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = function(){
      addIcon(name || 'IMG', function(c, S){
        var pad = 8, box = S - pad*2;
        var sc = Math.min(box / img.width, box / img.height);
        var w = img.width * sc, h = img.height * sc;
        c.drawImage(img, (S - w)/2, (S - h)/2, w, h);
      }, [0.72,0.8,0.95], meta);
      emit('icons', icons.length);
      buildLegend();
    };
    img.onerror = function(){ emit('error', { where:'icon-image', src:src }); };
    img.src = src;
    return true;
  }

  /* ---- 音频状态（由外部 tap 每帧灌入；引擎只管消费） ---- */
  var audio = {
    bands: new Float32Array(16), level:0, bass:0, mid:0, high:0,
    bright:0, flux:0, beat:0, bpm:0,
    live:false, status:'idle', source:'', error:'', lastAt:0
  };
  var modeScratch = {};

  /* ---- 状态 ---- */
  var N = 144, MAXI = N * N;   /* 活动补丁：144×144（cellSize 3.2 时半宽 230 单位），柱阵能铺满画面 */
  var state = {
    cellSize:o.cellSize, maxHeight:o.maxHeight, easeUp:o.easeUp, easeDown:o.easeDown,
    fogEnd:o.fogEnd, gridGlow:o.gridGlow, beam:o.beam, reflection:o.reflection, ambient:o.ambient,
    haze:0.15          /* 距离减淡：0 = 完全不减淡（远处柱子照样清晰），不是"雾化洗白" */
  };
  /* 补丁外圈的高度收敛表：远处柱子自然变平，而不是靠雾把画面刷白 */
  var EDGE_TAPER = 14;
  var taperLUT = new Float32Array(MAXI);
  (function buildTaper(){
    for(var z=0; z<N; z++){
      for(var x=0; x<N; x++){
        var d = Math.min(Math.min(x, N-1-x), Math.min(z, N-1-z));
        var t = d >= EDGE_TAPER ? 1 : (d / EDGE_TAPER);
        taperLUT[z*N + x] = t*t*(3 - 2*t);
      }
    }
  })();
  var modeIndex = MODES.map(function(m){ return m.id; }).indexOf(o.mode);
  if(modeIndex < 0) modeIndex = 0;
  var params = {};
  MODES.forEach(function(m){ params[m.id] = Object.assign({}, m.def); });

  var heights = new Float32Array(MAXI);
  var manual  = new Float32Array(MAXI);
  var heightBytes = new Uint8Array(MAXI);
  var spareH = new Float32Array(MAXI), spareM = new Float32Array(MAXI), spareB = new Uint8Array(MAXI);
  var patch = { ox:0, oz:0 };
  var orbit = { theta:o.theta, phi:o.phi, radius:o.radius, target:new Float32Array([0, o.targetY, 0]) };
  var cam = { pos:new Float32Array(3), fov:o.fov, baseFov:o.fov };
  var view = mat4(), proj = mat4(), viewProj = mat4(), invVP = mat4();
  var camRight = new Float32Array(3), camUp = new Float32Array(3);
  var UP = new Float32Array([0,1,0]);
  var focus = [0,0];
  var hover = { x:0, z:0, on:false };
  var caGrid = new Uint8Array(CA_N*CA_N), caTmp = new Uint8Array(CA_N*CA_N);
  for(var ci=0; ci<caGrid.length; ci++) caGrid[ci] = Math.random() < 0.30 ? 1 : 0;
  var caTimer = 0, timeSec = 0, qualityAcc = 0, fpsAcc = 0, fpsN = 0, fps = 60, swayPhase = 0;
  var paused = !!o.paused, offscreen = false, destroyed = false, rafId = 0;
  var renderScale = 1, autoQuality = o.quality === 'auto';
  var counts = { p:0, i:0, b:0 };
  var pointer = { active:false, button:0, x:0, y:0, moved:0, painting:false };
  var pointerState = { painting:false, tool:1, brushRadius:0, shift:false };
  var pick = { index:-1 };
  var listeners = {};

  function emit(name, payload){
    var l = listeners[name];
    if(l) for(var i=0;i<l.length;i++){ try{ l[i](payload); }catch(e){ console.warn('[GridPillars] listener', e); } }
  }
  function on(name, fn){ (listeners[name] = listeners[name] || []).push(fn); return api; }
  function off(name, fn){
    var l = listeners[name];
    if(!l) return api;
    var i = l.indexOf(fn); if(i >= 0) l.splice(i,1);
    return api;
  }

  /* ---- 数据层 ---- */
  var series = [];
  var slots = [];
  function setData(list){
    series = (list || []).map(function(s, i){
      return {
        id: s.id !== undefined ? s.id : ('s' + i),
        label: s.label !== undefined ? s.label : (s.id || ('#' + i)),
        value: clamp(typeof s.value === 'number' ? s.value : 0, 0, 1),
        color: s.color || null,
        icon: s.icon !== undefined ? s.icon : null,
        raw: s.raw,
        h: 0
      };
    });
    normalizeSeries();
    layoutSlots();
    buildLegend();
    return api;
  }
  /* 数据归一化：把当前这批数拉到 [0.30, 1]，柱高差异才看得清；图例仍显示真实值 */
  function normalizeSeries(){
    var n = series.length, mn = 1, mx = 0, i;
    for(i=0;i<n;i++){ if(series[i].value < mn) mn = series[i].value; if(series[i].value > mx) mx = series[i].value; }
    var span = mx - mn;
    for(i=0;i<n;i++){
      series[i].h = o.dataNormalize
        ? (span > 0.001 ? 0.30 + 0.70 * (series[i].value - mn) / span : 0.65)
        : series[i].value;
    }
  }
  function slotCount(){ return Math.max(series.length, 6); }
  function layoutSlots(){
    slots = [];
    var n = slotCount();
    if(!n) return;
    if(o.dataLayout === 'line'){
      /* 一排柱子：像 3D 柱状图，适合宽扁的产品卡片 */
      var gap = o.dataSpacing > 0 ? o.dataSpacing : 2.6;
      for(var i=0;i<n;i++){
        slots.push({ cx: Math.round((i - (n-1)/2) * gap), cz: 0, i:i });
      }
      return;
    }
    var ring = o.dataRadius > 0 ? o.dataRadius : clamp(3.4 + n * 0.55, 3.4, 14);
    for(var j=0;j<n;j++){
      var a = (j / n) * TAU - Math.PI/2;
      slots.push({ cx: Math.round(Math.cos(a) * ring), cz: Math.round(Math.sin(a) * ring), i:j });
    }
  }
  function dataAt(cx, cz){
    for(var i=0;i<slots.length;i++){
      if(slots[i].cx === cx && slots[i].cz === cz) return slots[i];
    }
    return null;
  }
  function dataHeight(i){
    if(i < 0 || i >= series.length) return 0;
    var v = series[i].h || 0;
    var breathe = 0.035 * Math.sin(timeSec * 0.9 + i * 1.7);
    var sel = (i === pick.index) ? 0.06 : 0;
    return clamp(v + breathe + sel, 0, 1);
  }

  /* ---- 图例（可选的 DOM 叠加层） ---- */
  var legendEl = null;
  function buildLegend(){
    if(!o.legend) return;
    if(!legendEl){
      legendEl = document.createElement('div');
      legendEl.className = 'gp-legend';
      root.appendChild(legendEl);
    }
    legendEl.innerHTML = '';
    series.forEach(function(s, i){
      var chip = document.createElement('button');
      chip.className = 'gp-chip' + (i === pick.index ? ' on' : '');
      chip.type = 'button';
      var col = s.color || rgbCss(iconColor(i));
      chip.style.color = col;
      chip.innerHTML = '<i class="gp-dot"></i><span class="gp-name">' + escapeHtml(s.label) + '</span>' +
                       '<span class="gp-val">' + Math.round(s.value * 100) + '</span>';
      chip.style.color = col;
      chip.addEventListener('click', function(){ select(i, true); });
      chip.addEventListener('mouseenter', function(){ pick.hover = i; });
      chip.addEventListener('mouseleave', function(){ pick.hover = -1; });
      legendEl.appendChild(chip);
    });
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"]/g, function(c){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c];
    });
  }
  function rgbCss(c){
    return 'rgb(' + Math.round(c[0]*255) + ',' + Math.round(c[1]*255) + ',' + Math.round(c[2]*255) + ')';
  }
  function iconColor(index){
    var icon = icons[index];
    return (icon && icon.color) || [0.55,0.8,1];
  }
  function select(i, fromUser){
    pick.index = (i === pick.index) ? -1 : i;
    buildLegend();
    if(fromUser) emit('pick', series[pick.index] || null);
  }

  function seriesColor(i){
    var s = series[i];
    if(s && s.color){
      var rgb = hexToRgb(s.color);
      if(rgb) return rgb;
    }
    var iconIdx = seriesIconIndex(i);
    return iconColor(iconIdx);
  }
  /* 数据项 → 图集槽位：有 icon 字段就用它，否则按名字匹配内置图标，再退化到序号 */
  var iconIndexCache = {};
  function seriesIconIndex(i){
    var s = series[i];
    if(!s) return 0;
    if(iconIndexCache[s.id] !== undefined) return iconIndexCache[s.id];
    var idx = 0;
    if(typeof s.icon === 'number') idx = s.icon;
    else if(typeof s.icon === 'string'){
      for(var k=0;k<icons.length;k++) if(icons[k].name === s.icon){ idx = k; break; }
    } else {
      for(var j=0;j<icons.length;j++) if(icons[j].name === s.label){ idx = j; break; }
    }
    idx = clamp(idx, 0, Math.max(0, icons.length - 1));
    iconIndexCache[s.id] = idx;
    return idx;
  }

  /* ---- 补丁重定中心 ---- */
  function rebaseTo(nox, noz){
    var dx = nox - patch.ox, dz = noz - patch.oz;
    if(!dx && !dz) return;
    spareH.fill(0); spareM.fill(0); spareB.fill(0);
    for(var z=0; z<N; z++){
      var nz = z - dz;
      if(nz < 0 || nz >= N) continue;
      for(var x=0; x<N; x++){
        var nx = x - dx;
        if(nx < 0 || nx >= N) continue;
        spareH[nz*N + nx] = heights[z*N + x];
        spareM[nz*N + nx] = manual[z*N + x];
        spareB[nz*N + nx] = heightBytes[z*N + x];
      }
    }
    var t;
    t = heights; heights = spareH; spareH = t;
    t = manual;  manual  = spareM; spareM  = t;
    t = heightBytes; heightBytes = spareB; spareB = t;
    patch.ox = nox; patch.oz = noz;
  }
  function resetPack(){
    heights = new Float32Array(MAXI);
    manual  = new Float32Array(MAXI);
    heightBytes = new Uint8Array(MAXI);
  }

  /* ---- 元胞自动机 ---- */
  function caStep(){
    var pop = 0;
    for(var z=0; z<CA_N; z++){
      var zm = (z-1+CA_N)%CA_N, zp = (z+1)%CA_N;
      for(var x=0; x<CA_N; x++){
        var xm = (x-1+CA_N)%CA_N, xp = (x+1)%CA_N;
        var n = caGrid[zm*CA_N+xm] + caGrid[zm*CA_N+x] + caGrid[zm*CA_N+xp]
              + caGrid[z*CA_N+xm]  + caGrid[z*CA_N+xp]
              + caGrid[zp*CA_N+xm] + caGrid[zp*CA_N+x] + caGrid[zp*CA_N+xp];
        var a = caGrid[z*CA_N+x];
        var alive = (a ? (n===2||n===3) : (n===3)) ? 1 : 0;
        caTmp[z*CA_N+x] = alive; pop += alive;
      }
    }
    if(pop < CA_N*CA_N*0.07){ for(var i=0;i<220;i++) caTmp[(Math.random()*caTmp.length)|0] = 1; }
    var t = caGrid; caGrid = caTmp; caTmp = t;
  }
  function caAt(cx, cz){
    return caGrid[(((cz % CA_N) + CA_N) % CA_N) * CA_N + (((cx % CA_N) + CA_N) % CA_N)] ? 1 : 0;
  }

  /* ---- 缓冲 / VAO ---- */
  var pillarData = new Float32Array(MAXI * 8);
  var iconData   = new Float32Array(MAXI * 8);
  var beamData   = new Float32Array(MAXI * 8);
  function makeInstBuf(){
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, MAXI * 8 * 4, gl.DYNAMIC_DRAW);
    return b;
  }
  var pillarBuf = makeInstBuf(), iconBuf = makeInstBuf(), beamBuf = makeInstBuf();

  function bindInst(prog, buf){
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    var names = ['iA','iB'];
    for(var i=0;i<2;i++){
      var loc = prog.attr(names[i]);
      if(loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, i*16);
      gl.vertexAttribDivisor(loc, 1);
    }
  }
  function makeVAO(prog, vbuf, vName, vSize, instBuf){
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    var l = prog.attr(vName);
    if(l >= 0){ gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, vSize, gl.FLOAT, false, 0, 0); }
    if(instBuf) bindInst(prog, instBuf);
    gl.bindVertexArray(null);
    return vao;
  }
  var pillarVAO = gl.createVertexArray();
  gl.bindVertexArray(pillarVAO);
  (function(){
    gl.bindBuffer(gl.ARRAY_BUFFER, boxPosBuf);
    var l1 = pillarP.attr('aPos'); if(l1>=0){ gl.enableVertexAttribArray(l1); gl.vertexAttribPointer(l1,3,gl.FLOAT,false,0,0); }
    gl.bindBuffer(gl.ARRAY_BUFFER, boxNrmBuf);
    var l2 = pillarP.attr('aNrm'); if(l2>=0){ gl.enableVertexAttribArray(l2); gl.vertexAttribPointer(l2,3,gl.FLOAT,false,0,0); }
    gl.bindBuffer(gl.ARRAY_BUFFER, boxTopBuf);
    var l3 = pillarP.attr('aTop'); if(l3>=0){ gl.enableVertexAttribArray(l3); gl.vertexAttribPointer(l3,1,gl.FLOAT,false,0,0); }
    bindInst(pillarP, pillarBuf);
    gl.bindVertexArray(null);
  })();
  var iconVAO = makeVAO(iconP, quadBuf, 'aCorner', 2, iconBuf);
  var haloVAO = makeVAO(haloP, quadBuf, 'aCorner', 2, iconBuf);
  var beamVAO = makeVAO(beamP, quadBuf, 'aCorner', 2, beamBuf);
  var gridVAO = makeVAO(gridP, gridQuadBuf, 'aXZ', 2, null);
  var ringVAO = makeVAO(ringP, quadBuf, 'aCorner', 2, null);

  var hTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, hTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, heightBytes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /* ---- 图标分配 ---- */
  function iconIndexFor(cx, cz, h){
    var n = icons.length;
    if(!n) return 0;
    switch(o.assign){
      case 'cycle':  return (((cx - cz) % n) + n) % n;
      case 'block':  return ((((Math.floor((cx+512)/4) * 3 + Math.floor((cz+512)/4)) % n) + n) % n);
      case 'ring':   return (((Math.floor(Math.hypot(cx, cz) / 3)) % n) + n) % n;
      case 'height': return Math.min(n-1, Math.max(0, Math.floor(h * n * 0.999)));
      case 'time':   return (((Math.floor(timeSec * 1.5) + cx + cz) % n) + n) % n;
      case 'single': return clamp(o.singleIcon || 0, 0, n-1);
      default:       return Math.floor(hash2(cx, cz) * n) % n;
    }
  }

  /* ---- 每帧模拟 ---- */
  function simulate(dt){
    var mode = MODES[modeIndex];
    var P = params[mode.id];
    var fn = mode.fn;
    var amp = (mode.uses.indexOf('amp') >= 0 && P.amp !== undefined) ? P.amp : 1;
    var ox = patch.ox, oz = patch.oz, cell = state.cellSize, maxH = state.maxHeight;
    var kUp = 1 - Math.exp(-dt * state.easeUp);
    var kDn = 1 - Math.exp(-dt * state.easeDown);
    var halfW = cell * o.halfRatio, iconSize = cell * o.iconInset;
    var pal = PALETTES[o.palette];
    var palMajor = pal.major;
    var monoColor = pal.pillar || [0.5, 0.55, 0.62];
    var useMono = (o.colorMode === 'mono') || (o.colorMode === 'auto' && !!pal.mono);
    var dataMode = !!mode.dataDriven;

    /* 音频：帧龄决定 live，音频模式每帧先跑一次 prepare（算环能量/重拍/冲击波） */
    if(audio.lastAt) audio.live = (nowMs() - audio.lastAt) < 600;
    else audio.live = false;
    var S = null;
    if(mode.audio || mode.prepare){
      S = modeScratch[mode.id] || (modeScratch[mode.id] = {});
      if(mode.prepare) mode.prepare(audio, P, timeSec, S, dt);
    }
    var amb = dataMode ? state.ambient : 0;
    var nP = 0, nI = 0, nB = 0;

    if(mode.ca){
      caTimer += dt * P.speed;
      while(caTimer > 0.25){ caStep(); caTimer -= 0.25; }
    }

    for(var z=0; z<N; z++){
      var cz = oz + z;
      for(var x=0; x<N; x++){
        var i = z*N + x, cx = ox + x;
        var tgt = 0, icoOverride = -1;

        if(dataMode){
          var slot = dataAt(cx, cz);
          if(slot){
            tgt = dataHeight(slot.i) * amp;
            icoOverride = seriesIconIndex(slot.i);
          } else if(amb > 0){
            tgt = amb * (0.5 + 0.5 * vnoise(cx * 0.16, cz * 0.16 + timeSec * 0.25));
          }
        } else if(mode.id !== 'manual'){
          tgt = fn(cx, cz, timeSec, P, focus, S) * amp;
        }
        if(tgt < 0) tgt = 0; else if(tgt > 1) tgt = 1;
        tgt *= taperLUT[i];   /* 外圈收敛：远处柱子自然变平，补丁边界看不见（手动层不受影响） */

        var m = manual[i];
        if(m > tgt) tgt = m;

        var h0 = heights[i];
        h0 += (tgt - h0) * (tgt > h0 ? kUp : kDn);
        if(h0 < 0.0008) h0 = 0;
        heights[i] = h0;
        heightBytes[i] = (h0 * 255) | 0;
        if(h0 <= 0.006) continue;

        var hh = h0 * maxH;
        var wx = (cx + 0.5) * cell, wz = (cz + 0.5) * cell;
        var ic = icoOverride >= 0 ? icoOverride : iconIndexFor(cx, cz, h0);
        var col;
        if(dataMode && slot){
          col = seriesColor(slot.i);
        } else if(useMono){
          col = monoColor;
        } else {
          col = (icons[ic] && icons[ic].color) || [0.6,0.75,1];
          if(o.colorBlend > 0){
            var kb = o.colorBlend;
            col = [col[0] + (palMajor[0] - col[0]) * kb,
                   col[1] + (palMajor[1] - col[1]) * kb,
                   col[2] + (palMajor[2] - col[2]) * kb];
          }
        }

        var o1 = nP * 8;
        pillarData[o1]   = wx; pillarData[o1+1] = wz; pillarData[o1+2] = hh; pillarData[o1+3] = halfW;
        pillarData[o1+4] = col[0]; pillarData[o1+5] = col[1]; pillarData[o1+6] = col[2]; pillarData[o1+7] = 0;
        nP++;

        if(o.showIcons && h0 > 0.42){
          var topY = hh;
          var o2 = nI * 8;
          iconData[o2]   = wx;
          iconData[o2+1] = topY;
          iconData[o2+2] = wz;
          iconData[o2+3] = iconSize;
          iconData[o2+4] = (ic % GRIDN) / GRIDN;
          iconData[o2+5] = 1 - (Math.floor(ic / GRIDN) + 1) / GRIDN;
          iconData[o2+6] = clamp((h0 - 0.40) / 0.30, 0, 1);
          iconData[o2+7] = ic;
          nI++;

          var st = clamp((h0 - 0.45) / 0.55, 0, 1);
          if(o.showBeams && st > 0.04){
            var o3 = nB * 8;
            beamData[o3]   = wx; beamData[o3+1] = topY; beamData[o3+2] = wz; beamData[o3+3] = st;
            beamData[o3+4] = col[0]; beamData[o3+5] = col[1]; beamData[o3+6] = col[2]; beamData[o3+7] = 0;
            nB++;
          }
        }
      }
    }
    counts.p = nP; counts.i = nI; counts.b = nB;
  }

  /* ---- 相机 ---- */
  function autoFrame(){
    if(!o.fit) return;
    var w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    var aspect = w / h;
    var wide = clamp(aspect - 1.9, 0, 2.2);
    var m = MODES[modeIndex];
    /* 把"内容"当包围盒来算相机距离：宽由水平视角决定，高由垂直视角决定，取更远的那个 */
    var cw, ch;
    if(m.dataDriven && slots.length){
      if(o.dataLayout === 'line'){
        var gap = o.dataSpacing > 0 ? o.dataSpacing : 2.6;
        cw = (slots.length - 1) * gap * state.cellSize + state.cellSize * 4;
        ch = state.maxHeight * 1.05 + state.cellSize * 2;
      } else {
        var ring = o.dataRadius > 0 ? o.dataRadius : clamp(3.4 + slotCount() * 0.55, 3.4, 14);
        cw = ch = ring * state.cellSize * 2 + state.cellSize * 2 + state.maxHeight * 1.05;
      }
    } else {
      cw = ch = 42;
    }
    var vHalf = o.fov * Math.PI / 360;
    var tanV = Math.tan(vHalf), tanH = tanV * aspect;
    var d = Math.max(ch * 0.5 / tanV, cw * 0.5 / tanH) * 1.55;
    if(h < 360) d *= 0.92;
    orbit.radius = clamp(d, 14, 240);
    orbit.phi = clamp(o.phi - wide * 0.08, 0.12, 1.45);
    cam.fov = clamp(o.fov - wide * 2.2, 30, 80);
    state.cellSize = (w < 480) ? clamp(o.cellSize * 0.78, 1.2, 4.5) : o.cellSize;
  }
  function updateCamera(dt){
    cam.fov = o.fov;
    if(o.cruise){
      orbit.target[0] += Math.cos(timeSec * 0.11) * dt * 5.0;
      orbit.target[2] += Math.sin(timeSec * 0.11) * dt * 5.0;
    } else if(o.autoRotate && !pointer.active && !reduceMotion){
      if(o.autoRotateSway){
        swayPhase += dt * 0.22;
        orbit.theta = o.theta + Math.sin(swayPhase) * 0.18;   /* 小幅摆动：机位稳定，顶部图标始终可读 */
      } else {
        orbit.theta += dt * 0.055;
      }
    }
    orbit.phi = clamp(orbit.phi, 0.12, 1.45);
    orbit.radius = clamp(orbit.radius, 12, 240);
    var sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    cam.pos[0] = orbit.target[0] + orbit.radius * sp * Math.sin(orbit.theta);
    cam.pos[1] = orbit.target[1] + orbit.radius * cp;
    cam.pos[2] = orbit.target[2] + orbit.radius * sp * Math.cos(orbit.theta);
    if(cam.pos[1] < 1.2) cam.pos[1] = 1.2;
    lookAt(view, cam.pos, orbit.target, UP);
    camRight[0] = view[0]; camRight[1] = view[4]; camRight[2] = view[8];
    camUp[0]    = view[1]; camUp[1] = view[5]; camUp[2]    = view[9];
    mul(viewProj, proj, view);
    invert(invVP, viewProj);
  }
  function resize(){
    var dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr) * renderScale;
    var w = Math.max(1, Math.floor(root.clientWidth * dpr));
    var h = Math.max(1, Math.floor(root.clientHeight * dpr));
    if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
    perspective(proj, cam.fov * Math.PI / 180, w / h, 0.5, 3000);
    autoFrame();
  }
  function uploadInst(buf, arr, n){
    if(n <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, n * 8));
  }
  function render(){
    var pal = PALETTES[o.palette];
    var gridFogEnd = state.fogEnd, gridFogStart = gridFogEnd * 0.20;
    /* 柱阵不再靠"短雾洗白"藏边界：边界由补丁外圈的高度收敛（taperLUT）解决，
       距离上只做 state.haze 那么轻的减淡，所以远处柱子照样清晰。 */
    var fieldFogEnd = gridFogEnd, fieldFogStart = gridFogEnd * 0.55;
    var haze = state.haze;
    var pal = PALETTES[o.palette];
    var flatShade = (o.flat || !!pal.flat) ? 1.0 : 0.0;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    /* 必须在 depthMask(true) 时清深度：depthMask(false) 会让 gl.clear(DEPTH) 变成空操作，
       上一帧柱子留下的深度会把近处地面剔掉。 */
    gl.depthMask(true);
    var flatBg = (o.background === 'flat') || (o.background === 'sky' && pal.flat && o.flatBackground !== false);
    if(o.background === 'transparent') gl.clearColor(0,0,0,0);
    else gl.clearColor(pal.bgBottom[0], pal.bgBottom[1], pal.bgBottom[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthMask(false);

    if(o.background === 'sky' && !flatBg){
      bgP.use();
      gl.uniform3fv(bgP.loc('uTop'), pal.bgTop);
      gl.uniform3fv(bgP.loc('uBottom'), pal.bgBottom);
      gl.uniform3fv(bgP.loc('uHorizon'), pal.bgHorizon);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if(o.showGrid){
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gridP.use();
      gl.uniformMatrix4fv(gridP.loc('uViewProj'), false, viewProj);
      gl.uniform3fv(gridP.loc('uCamPos'), cam.pos);
      gl.uniform3fv(gridP.loc('uGridColor'), pal.grid);
      gl.uniform3fv(gridP.loc('uMajorColor'), pal.major);
      gl.uniform3fv(gridP.loc('uGlowColor'), pal.glow);
      gl.uniform1f(gridP.loc('uCell'), state.cellSize);
      gl.uniform1f(gridP.loc('uExtent'), 1400.0);
      gl.uniform1f(gridP.loc('uFogStart'), gridFogStart);
      gl.uniform1f(gridP.loc('uFogEnd'), gridFogEnd);
      gl.uniform1f(gridP.loc('uTime'), timeSec);
      gl.uniform1f(gridP.loc('uGlow'), state.gridGlow);
      gl.uniform1f(gridP.loc('uPulse'), (o.pulse && !pal.lite) ? 1.0 : 0.0);
      gl.uniform1f(gridP.loc('uN'), N);
      gl.uniform2f(gridP.loc('uPatchOrigin'), patch.ox, patch.oz);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RED, gl.UNSIGNED_BYTE, heightBytes);
      gl.uniform1i(gridP.loc('uHeight'), 0);
      gl.bindVertexArray(gridVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if(counts.p > 0){
      uploadInst(pillarBuf, pillarData, counts.p);
      pillarP.use();
      gl.uniformMatrix4fv(pillarP.loc('uViewProj'), false, viewProj);
      gl.uniform3fv(pillarP.loc('uCamPos'), cam.pos);
      gl.uniform3fv(pillarP.loc('uFogColor'), pal.fog);
      gl.uniform1f(pillarP.loc('uFogStart'), fieldFogStart);
      gl.uniform1f(pillarP.loc('uFogEnd'), fieldFogEnd);
      gl.uniform1f(pillarP.loc('uHaze'), haze);
      gl.uniform1f(pillarP.loc('uFlip'), 1.0);
      gl.uniform1f(pillarP.loc('uDim'), 1.0);
      gl.uniform1f(pillarP.loc('uFlat'), flatShade);
      gl.bindVertexArray(pillarVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, counts.p);
    }

    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if(counts.p > 0 && state.reflection > 0.01 && o.showReflection && !pal.lite){
      pillarP.use();
      gl.uniform1f(pillarP.loc('uFlip'), -1.0);
      gl.uniform1f(pillarP.loc('uDim'), 0.22 * state.reflection);
      gl.bindVertexArray(pillarVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, counts.p);
    }
    if(counts.b > 0 && state.beam > 0.01 && o.showBeams && !pal.lite){
      uploadInst(beamBuf, beamData, counts.b);
      beamP.use();
      gl.uniformMatrix4fv(beamP.loc('uViewProj'), false, viewProj);
      gl.uniform3fv(beamP.loc('uCamRight'), camRight);
      gl.uniform1f(beamP.loc('uLen'), state.maxHeight * 0.9);
      gl.uniform1f(beamP.loc('uStrength'), state.beam);
      gl.bindVertexArray(beamVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, counts.b);
    }

    if(counts.i > 0) uploadInst(iconBuf, iconData, counts.i);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, haloTex);
    if(counts.i > 0 && o.halo > 0.01 && !pal.lite){
      haloP.use();
      gl.uniformMatrix4fv(haloP.loc('uViewProj'), false, viewProj);
      gl.uniform1f(haloP.loc('uScale'), 1.85);
      gl.uniform1f(haloP.loc('uLift'), o.iconLift);
      gl.uniform1f(haloP.loc('uStrength'), o.halo);
      gl.uniform3fv(haloP.loc('uColors'), iconColorArr);
      gl.uniform1i(haloP.loc('uHalo'), 1);
      gl.bindVertexArray(haloVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, counts.i);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if(counts.i > 0){
      iconP.use();
      gl.uniformMatrix4fv(iconP.loc('uViewProj'), false, viewProj);
      gl.uniform1f(iconP.loc('uLift'), o.iconLift);
      gl.uniform3fv(iconP.loc('uCamPos'), cam.pos);
      gl.uniform3fv(iconP.loc('uFogColor'), pal.fog);
      gl.uniform1f(iconP.loc('uFogStart'), fieldFogStart);
      gl.uniform1f(iconP.loc('uFogEnd'), fieldFogEnd);
      gl.uniform1f(iconP.loc('uHaze'), haze);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(iconP.loc('uAtlas'), 0);
      gl.bindVertexArray(iconVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, counts.i);
    }
    if(hover.on && (pointerState.painting || pointerState.shift) && o.interactive){
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      ringP.use();
      gl.uniformMatrix4fv(ringP.loc('uViewProj'), false, viewProj);
      gl.uniform3f(ringP.loc('uCenter'), (hover.x + 0.5) * state.cellSize, 0.03, (hover.z + 0.5) * state.cellSize);
      gl.uniform1f(ringP.loc('uSize'), state.cellSize * (1 + 2 * pointerState.brushRadius));
      gl.uniform3f(ringP.loc('uColor'), pointerState.tool ? 0.45 : 1.0, pointerState.tool ? 0.95 : 0.55, pointerState.tool ? 1.0 : 0.45);
      gl.uniform1f(ringP.loc('uAlpha'), 0.9);
      gl.bindVertexArray(ringVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
  }

  /* ---- 主循环 ---- */
  var last = (global.performance && performance.now()) ? performance.now() : Date.now();
  var reduceMotion = false;
  function frame(now){
    if(destroyed) return;
    rafId = global.requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if(paused || offscreen){ return; }
    timeSec += dt * o.timeScale;
    resize();
    updateCamera(dt);
    var wantX = Math.floor(cam.pos[0] / state.cellSize) - (N >> 1);
    var wantZ = Math.floor(cam.pos[2] / state.cellSize) - (N >> 1);
    rebaseTo(wantX, wantZ);
    simulate(dt);
    render();
    fpsAcc += dt; fpsN++;
    if(fpsAcc > 0.5){
      fps = fpsN / Math.max(fpsAcc, 1e-6);
      fpsAcc = 0; fpsN = 0;
      emit('stats', { fps:fps, pillars:counts.p, icons:counts.i, resolution:renderScale });
      if(autoQuality){
        qualityAcc += 0.5;
        if(qualityAcc > 1.5){
          qualityAcc = 0;
          if(fps < 40 && renderScale > 0.55) renderScale = Math.max(0.55, renderScale - 0.15);
          else if(fps > 58 && renderScale < 1) renderScale = Math.min(1, renderScale + 0.1);
        }
      }
    }
  }

  /* ---- 交互 ---- */
  function unp3(nx, ny, z){
    var x = invVP[0]*nx + invVP[4]*ny + invVP[8]*z + invVP[12];
    var y = invVP[1]*nx + invVP[5]*ny + invVP[9]*z + invVP[13];
    var zz= invVP[2]*nx + invVP[6]*ny + invVP[10]*z + invVP[14];
    var w = invVP[3]*nx + invVP[7]*ny + invVP[11]*z + invVP[15];
    return [x/w, y/w, zz/w];
  }
  function groundCell(clientX, clientY){
    var r = canvas.getBoundingClientRect();
    var nx = ((clientX - r.left) / r.width) * 2 - 1;
    var ny = 1 - ((clientY - r.top) / r.height) * 2;
    var a = unp3(nx, ny, -1), b = unp3(nx, ny, 1);
    var dy = b[1] - a[1];
    if(Math.abs(dy) < 1e-6) return null;
    var t = -a[1] / dy;
    if(t < 0) return null;
    var wx = a[0] + (b[0] - a[0]) * t;
    var wz = a[2] + (b[2] - a[2]) * t;
    return [Math.floor(wx / state.cellSize), Math.floor(wz / state.cellSize)];
  }
  function paintAt(gx, gz, erase){
    var rad = pointerState.brushRadius;
    for(var dz=-rad; dz<=rad; dz++){
      for(var dx=-rad; dx<=rad; dx++){
        if(rad > 0 && dx*dx + dz*dz > rad*rad + rad*0.5) continue;
        var px = gx + dx - patch.ox, pz = gz + dz - patch.oz;
        if(px < 0 || px >= N || pz < 0 || pz >= N) continue;
        manual[pz*N + px] = erase ? 0 : (pointerState.tool ? 1 : 0);
      }
    }
  }
  var pointers = {};
  var pinch = { last:false, dist:0, cx:0, cy:0 };
  function pointerCount(){ var n = 0, k; for(k in pointers) n++; return n; }
  var listenersAttached = false;
  function attachPointer(){
    if(listenersAttached || !o.interactive) return;
    listenersAttached = true;
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive:false });
    global.addEventListener('blur', onBlur);
  }
  function detachPointer(){
    if(!listenersAttached) return;
    listenersAttached = false;
    canvas.removeEventListener('contextmenu', onCtx);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('wheel', onWheel);
    global.removeEventListener('blur', onBlur);
  }
  function onCtx(e){ e.preventDefault(); }
  function onBlur(){ pointerState.shift = false; pointer.active = false; pointer.painting = false; pointers = {}; pinch.last = false; }
  function onDown(e){
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
    pointers[e.pointerId] = { x:e.clientX, y:e.clientY };
    if(pointerCount() > 1){ pointer.active = false; pointer.painting = false; pinch.last = false; return; }
    pointer.active = true; pointer.button = e.button;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = 0; pointer.painting = false;
    var g = groundCell(e.clientX, e.clientY);
    var wantPaint = (pointerState.painting || pointerState.shift) && (e.button === 0 || e.button === 2) && !e.altKey;
    if(wantPaint && g){
      paintAt(g[0], g[1], e.button === 2 || !pointerState.tool);
      pointer.painting = true;
    } else if(e.altKey && g){
      focus[0] = g[0]; focus[1] = g[1];
      emit('focus', { x:g[0], z:g[1] });
    }
  }
  function onMove(e){
    if(pointers[e.pointerId]){ pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
    if(pointerCount() >= 2){
      var ids = Object.keys(pointers);
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      var cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      var dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if(pinch.last){
        if(pinch.dist > 0) orbit.radius = clamp(orbit.radius * (pinch.dist / Math.max(dist, 1)), 12, 240);
        orbit.target[0] -= (camRight[0] * (cx - pinch.cx) - camRight[2] * (cy - pinch.cy)) * orbit.radius * 0.0016;
        orbit.target[2] -= (camRight[2] * (cx - pinch.cx) + camRight[0] * (cy - pinch.cy)) * orbit.radius * 0.0016;
      }
      pinch.last = true; pinch.dist = dist; pinch.cx = cx; pinch.cy = cy;
      return;
    }
    var g = groundCell(e.clientX, e.clientY);
    if(g){
      hover.x = g[0]; hover.z = g[1]; hover.on = true;
      if(MODES[modeIndex].dataDriven){
        var s = dataAt(g[0], g[1]);
        var hi = s ? s.i : -1;
        if(hi !== pick.hover){ pick.hover = hi; }
      }
    } else { hover.on = false; }
    if(!pointer.active) return;
    var dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    pointer.x = e.clientX; pointer.y = e.clientY;
    if(pointer.painting && g){ paintAt(g[0], g[1], pointer.button === 2 || !pointerState.tool); return; }
    if(pointer.button === 2){
      var s2 = orbit.radius * 0.0016;
      orbit.target[0] -= (camRight[0] * dx - camRight[2] * dy) * s2;
      orbit.target[2] -= (camRight[2] * dx + camRight[0] * dy) * s2;
      orbit.target[1] = clamp(orbit.target[1] + dy * s2 * 0.5, 0, 40);
    } else if(pointer.button === 0){
      orbit.theta -= dx * 0.005;
      orbit.phi = clamp(orbit.phi - dy * 0.004, 0.12, 1.45);
    }
  }
  function onUp(e){
    delete pointers[e.pointerId];
    if(pointer.active && pointer.moved < 5 && e.button === 0 && !pointerState.painting && !pointerState.shift && !e.altKey){
      var g = groundCell(e.clientX, e.clientY);
      if(g){
        focus[0] = g[0]; focus[1] = g[1];
        if(MODES[modeIndex].dataDriven){
          var s = dataAt(g[0], g[1]);
          if(s) select(s.i, true);
        } else {
          emit('focus', { x:g[0], z:g[1] });
        }
      }
    }
    pointer.active = false; pointer.painting = false;
    try{ canvas.releasePointerCapture(e.pointerId); }catch(err){}
    var ids = Object.keys(pointers);
    if(ids.length === 1){
      var p = pointers[ids[0]];
      pointer.active = true; pointer.button = 0; pointer.painting = false;
      pointer.x = p.x; pointer.y = p.y; pointer.moved = 0;
    }
  }
  function onCancel(e){ delete pointers[e.pointerId]; pointer.active = false; pointer.painting = false; }
  function onLeave(){ hover.on = false; }
  function onWheel(e){
    e.preventDefault();
    orbit.radius = clamp(orbit.radius * Math.exp(e.deltaY * 0.0011), 12, 240);
    emit('view', { radius:orbit.radius, phi:orbit.phi, theta:orbit.theta });
  }

  /* ---- 尺寸 / 可见性监听 ---- */
  var ro = null, io = null;
  function watch(){
    if(global.ResizeObserver){
      ro = new ResizeObserver(function(){ resize(); });
      ro.observe(root);
    } else {
      global.addEventListener('resize', resize);
    }
    if(o.autoPause && global.IntersectionObserver){
      io = new IntersectionObserver(function(entries){
        for(var i=0;i<entries.length;i++) offscreen = !entries[i].isIntersecting;
      }, { rootMargin:'80px' });
      io.observe(root);
    }
    if(o.autoPause) document.addEventListener('visibilitychange', onVis);
  }
  function onVis(){ offscreen = document.hidden; }

  /* ---- 自适应降级 / 动效偏好 ---- */
  function initPrefs(){
    if(o.reducedMotion === true) reduceMotion = true;
    else if(o.reducedMotion === 'auto'){
      reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    if(reduceMotion){ o.autoRotate = false; o.cruise = false; o.timeScale = Math.min(o.timeScale, 0.4); }
  }

  /* ---- 内置图标 ---- */
  BUILTIN.forEach(function(b){ addIcon(b.name, b.draw, b.tint, { builtin:true }); });
  if(o.icons && o.icons.length){
    o.icons.forEach(function(ic){
      if(ic.src) addImageIcon(ic.src, ic.name);
      else if(ic.text) addTextIcon(ic.text, ic.tint);
    });
  }

  /* ---- 对外 API ---- */
  var api = {
    ok:true,
    version: '1.0',
    root: root,
    canvas: canvas,
    atlas: atlasCanvas,
    state: state,
    params: params,
    orbit: orbit,
    focus: focus,
    setFocus: function(x, z){ focus[0] = x; focus[1] = z; return api; },
    get slots(){ return slots; },
    attributes: o,
    get counts(){ return counts; },

    getModes: function(){ return MODES; },
    getParams: function(id){ return params[id]; },
    mode: function(){ return MODES[modeIndex].id; },
    setMode: function(id, silent){
      var i = MODES.map(function(m){ return m.id; }).indexOf(id);
      if(i < 0) return false;
      modeIndex = i;
      o.mode = id;
      if(id === 'data') layoutSlots();
      if(!silent) emit('mode', id);
      return true;
    },
    preset: function(id, silent){
      var p = null;
      for(var i=0;i<PRESETS.length;i++) if(PRESETS[i].id === id) p = PRESETS[i];
      if(!p) return false;
      if(p.palette && PALETTES[p.palette]){ o.palette = p.palette; }
      if(p.assign) o.assign = p.assign;
      for(var gk in p.g) if(p.g.hasOwnProperty(gk)) state[gk] = p.g[gk];
      for(var pk in p.p) if(p.p.hasOwnProperty(pk)) params[p.mode][pk] = p.p[pk];
      if(p.view){
        if(typeof p.view.radius === 'number') orbit.radius = p.view.radius;
        if(typeof p.view.phi === 'number') orbit.phi = clamp(p.view.phi, 0.12, 1.45);
        if(typeof p.view.theta === 'number') orbit.theta = p.view.theta;
        if(typeof p.view.targetY === 'number') orbit.target[1] = p.view.targetY;
        if(typeof p.view.fov === 'number'){ o.fov = p.view.fov; cam.fov = p.view.fov; }
      }
      api.setMode(p.mode, true);
      o.preset = id;
      if(!silent) emit('preset', id);
      return true;
    },
    setPalette: function(key){ if(PALETTES[key]){ o.palette = key; emit('palette', key); return true; } return false; },
    getPalette: function(){ return o.palette; },
    palettes: function(){ return Object.keys(PALETTES); },

    setData: setData,
    getData: function(){ return series; },
    select: function(i, silent){ select(i, !silent); },
    getSelected: function(){ return pick.index >= 0 ? series[pick.index] : null; },

    paint: paintAt,
    clearManual: function(){ manual.fill(0); },
    manualCount: function(){
      var n = 0;
      for(var i=0;i<manual.length;i++) if(manual[i] > 0) n++;
      return n;
    },
    setBrush: function(cfg){
      if(cfg.painting !== undefined) pointerState.painting = !!cfg.painting;
      if(cfg.radius !== undefined) pointerState.brushRadius = cfg.radius | 0;
      if(cfg.tool !== undefined) pointerState.tool = cfg.tool ? 1 : 0;
      canvas.style.cursor = pointerState.painting ? 'crosshair' : (o.interactive ? 'grab' : 'default');
    },

    play: function(){ paused = false; emit('state', { paused:paused }); return api; },
    pause: function(){ paused = true; emit('state', { paused:paused }); return api; },
    isPaused: function(){ return paused; },
    resize: function(){ resize(); return api; },

    on: on, off: off,
    setOptions: function(patch){
      for(var k in patch) if(patch.hasOwnProperty(k)) o[k] = patch[k];
      initPrefs();
      if(patch.interactive === false) detachPointer(); else if(patch.interactive !== undefined) attachPointer();
      if(patch.legend !== undefined) buildLegend();
      if(patch.data !== undefined) setData(patch.data);
      resize();
      return api;
    },
    addTextIcon: function(text, tint){ var it = addTextIcon(text, tint); emit('icons', icons.length); return it; },
    addImageIcon: function(src, name){ addImageIcon(src, name); return api; },
    addIconCanvas: function(name, drawFn, tint){ var it = addIcon(name, drawFn, tint); emit('icons', icons.length); return it; },
    icons: function(){ return icons; },

    exportPNG: function(){
      render();
      try{ return canvas.toDataURL('image/png'); }
      catch(e){ emit('error', { where:'exportPNG', error:e }); return null; }
    },
    stats: function(){ return { fps:fps, pillars:counts.p, icons:counts.i, resolution:renderScale, series:series.length }; },
    /* 取某世界格当前高度（-1 = 该格不在活动补丁内）；用于把"图案是否锚在世界坐标"这件事验证出来 */
    sample: function(cx, cz){
      var ix = cx - patch.ox, iz = cz - patch.oz;
      if(ix < 0 || ix >= N || iz < 0 || iz >= N) return -1;
      return heights[iz * N + ix];
    },
    patchOrigin: function(){ return { ox:patch.ox, oz:patch.oz }; },

    /* ---- 音频（音乐响应模式的数据入口） ---- */
    get audio(){ return audio; },
    setAudioFrame: function(f){
      if(!f) return api;
      if(f.bands){
        var n = Math.min(16, f.bands.length || 0);
        for(var i=0;i<n;i++) audio.bands[i] = clamp(f.bands[i] || 0, 0, 1);
      }
      if(typeof f.level  === 'number') audio.level  = clamp(f.level, 0, 1);
      if(typeof f.bass   === 'number') audio.bass   = clamp(f.bass, 0, 1);
      if(typeof f.mid    === 'number') audio.mid    = clamp(f.mid, 0, 1);
      if(typeof f.high   === 'number') audio.high   = clamp(f.high, 0, 1);
      if(typeof f.bright === 'number') audio.bright = clamp(f.bright, 0, 1);
      if(typeof f.flux   === 'number') audio.flux   = clamp(f.flux, 0, 1);
      if(typeof f.bpm    === 'number') audio.bpm    = f.bpm;
      audio.beat = clamp(f.beat || 0, 0, 1);
      audio.lastAt = nowMs();
      audio.live = true;
      return api;
    },
    setAudioStatus: function(status, detail){
      audio.status = status || 'idle';
      if(status === 'live'){ audio.source = detail || audio.source; audio.error = ''; }
      else if(status === 'error'){ audio.error = detail || ''; }
      if(status !== 'live'){ audio.live = false; audio.beat = 0; }
      emit('audio', { status:audio.status, source:audio.source, error:audio.error });
      return api;
    },
    camera: function(){
      return { pos:[cam.pos[0], cam.pos[1], cam.pos[2]], fov:cam.fov,
               radius:orbit.radius, phi:orbit.phi, theta:orbit.theta, targetY:orbit.target[1] };
    },
    getConfig: function(){
      var st = {};
      GLOBAL_DEFS.forEach(function(d){ st[d.k] = state[d.k]; });
      st.ambient = state.ambient;
      var mp = {};
      MODES.forEach(function(m){
        mp[m.id] = {};
        m.uses.forEach(function(k){ mp[m.id][k] = params[m.id][k]; });
      });
      return {
        v:3, mode: api.mode(), palette:o.palette, assign:o.assign, preset:o.preset || null,
        st: st, mp: mp, focus: focus.slice(),
        view: { theta:+orbit.theta.toFixed(3), phi:+orbit.phi.toFixed(3), radius:Math.round(orbit.radius), fov:cam.fov },
        data: series.map(function(s){ return { id:s.id, label:s.label, value:s.value, color:s.color, icon:s.icon }; })
      };
    },
    applyConfig: function(cfg, silent){
      if(!cfg || typeof cfg !== 'object') return false;
      try{
        var bad = 0;
        if(cfg.palette && PALETTES[cfg.palette]) o.palette = cfg.palette;
        if(cfg.assign) o.assign = cfg.assign;
        if(cfg.st){
          GLOBAL_DEFS.forEach(function(d){
            var v = cfg.st[d.k];
            if(typeof v !== 'number' || !isFinite(v)){ if(v !== undefined) bad++; return; }
            if(d.reset && clamp(v, d.min, d.max) !== state[d.k]) resetPack();
            state[d.k] = clamp(v, d.min, d.max);
          });
        }
        if(cfg.mp) MODES.forEach(function(m){
          var src = cfg.mp[m.id];
          if(!src) return;
          m.uses.forEach(function(k){
            var def = PARAM_DEFS[k], v = src[k];
            if(!def) return;
            if(typeof v !== 'number' || !isFinite(v)){ if(v !== undefined) bad++; return; }
            params[m.id][k] = clamp(v, def.min, def.max);
          });
        });
        if(cfg.view){
          if(typeof cfg.view.theta === 'number' && isFinite(cfg.view.theta)) orbit.theta = cfg.view.theta;
          if(typeof cfg.view.phi === 'number' && isFinite(cfg.view.phi)) orbit.phi = clamp(cfg.view.phi, 0.12, 1.45);
          if(typeof cfg.view.radius === 'number' && isFinite(cfg.view.radius)) orbit.radius = clamp(cfg.view.radius, 12, 240);
          if(typeof cfg.view.fov === 'number' && isFinite(cfg.view.fov)) cam.fov = clamp(cfg.view.fov, 30, 80);
        }
        if(cfg.focus && cfg.focus.length === 2 && isFinite(cfg.focus[0]) && isFinite(cfg.focus[1])){
          focus[0] = clamp(cfg.focus[0], -1e4, 1e4); focus[1] = clamp(cfg.focus[1], -1e4, 1e4);
        }
        if(cfg.mode) api.setMode(cfg.mode, true);
        if(cfg.data && cfg.data.length) setData(cfg.data);
        if(!silent) emit('config', cfg);
        return !bad;
      }catch(e){
        emit('error', { where:'applyConfig', error:e });
        return false;
      }
    },
    destroy: function(){
      destroyed = true;
      if(rafId) global.cancelAnimationFrame(rafId);
      detachPointer();
      if(ro && ro.disconnect) ro.disconnect();
      if(io && io.disconnect) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if(!ro) global.removeEventListener('resize', resize);
      var ext = gl.getExtension('WEBGL_lose_context');
      if(ext) try{ ext.loseContext(); }catch(e){}
      if(root.parentNode) root.parentNode.removeChild(root);
      listeners = {};
    }
  };

  initPrefs();
  attachPointer();
  if(o.preset) api.preset(o.preset, true);
  setData(o.data || []);
  if(o.legend) buildLegend();
  canvas.style.cursor = o.interactive ? 'grab' : 'default';
  resize();
  watch();
  rafId = global.requestAnimationFrame(function(t){ last = t; frame(t); });
  emit('ready', api);
  return api;
}

/* ============================ 音频捕获 + 分析 ============================
   平台 API 抓系统正在播放的声音（getDisplayMedia，需用户授权并勾选"分享音频"），
   FFT 与特征提取交给 meyda（vendor/meyda.min.js，MIT），这里只做：
   分频段 / 归一化 / 频谱通量 onset / BPM 估计 / 逐帧产出音频帧。
   ============================================================ */
function audioSupported(){
  var md = (typeof navigator !== 'undefined') ? navigator.mediaDevices : null;
  return {
    secure: (typeof window !== 'undefined') ? !!window.isSecureContext : false,
    display: !!(md && md.getDisplayMedia),
    mic: !!(md && md.getUserMedia),
    meyda: (typeof window !== 'undefined') && !!window.Meyda,
    audioContext: (typeof window !== 'undefined') && !!(window.AudioContext || window.webkitAudioContext)
  };
}

function createAudioTap(opts){
  opts = opts || {};
  var CFG = {
    source: opts.source || 'display',
    fftSize: opts.fftSize || 2048,
    bandCount: opts.bandCount || 16,
    target: opts.target || null,
    onFrame: opts.onFrame || null,
    onStatus: opts.onStatus || null,
    minHz: opts.minHz || 40,
    maxHz: opts.maxHz || 16000
  };
  var st = { status:'idle', source:'', error:'', bpm:0, level:0, beat:0, live:false };

  var ctx = null, stream = null, srcNode = null, analyzer = null, rafId = 0;
  var bands = new Float32Array(CFG.bandCount);
  var frame = { bands: bands, level:0, bass:0, mid:0, high:0, bright:0, flux:0, beat:0, bpm:0 };
  var bandBins = [], prevSpec = null, fluxAvg = 0.02, lastBeat = 0, onsetTimes = [];
  var lastTs = 0, silentMs = 0, silenceWarned = false;

  function emitStatus(status, detail){
    st.status = status;
    if(status === 'live'){ st.live = true; st.source = detail || st.source; st.error = ''; }
    else { st.live = false; if(status === 'error') st.error = detail || ''; }
    if(CFG.target) CFG.target.setAudioStatus(status === 'live' ? 'live' : status, status === 'live' ? st.source : st.error);
    if(CFG.onStatus) { try{ CFG.onStatus({ status:status, source:st.source, error:st.error }); }catch(e){} }
  }
  function fail(code, msg){ emitStatus('error', msg); st.code = code; return st; }

  function buildBands(sampleRate, fftSize){
    var bins = fftSize / 2;
    var hz = sampleRate / fftSize;
    var lo = Math.log(CFG.minHz), hi = Math.log(CFG.maxHz);
    bandBins = [];
    for(var i=0;i<CFG.bandCount;i++){
      var a = Math.exp(lo + (hi - lo) * i / CFG.bandCount);
      var b = Math.exp(lo + (hi - lo) * (i + 1) / CFG.bandCount);
      var from = Math.max(1, Math.floor(a / hz));
      var to = Math.min(bins - 1, Math.max(from + 1, Math.ceil(b / hz)));
      bandBins.push([from, to]);
    }
    prevSpec = new Float32Array(bins);
  }

  var DB_FLOOR = -70, DB_CEIL = -10;
  function dbTo01(raw){ return clamp(((20 * Math.log10(raw + 1e-7)) - DB_FLOOR) / (DB_CEIL - DB_FLOOR), 0, 1); }

  function tick(){
    rafId = requestAnimationFrame(tick);
    if(!analyzer) return;
    var feats;
    try{ feats = analyzer.get(); }catch(e){ return; }
    if(!feats || !feats.amplitudeSpectrum) return;
    var spec = feats.amplitudeSpectrum;

    /* 16 个对数频段 */
    for(var i=0;i<CFG.bandCount;i++){
      var range = bandBins[i], sum = 0, n = 0;
      for(var k=range[0]; k<range[1]; k++){ sum += spec[k] || 0; n++; }
      bands[i] = dbTo01(n ? sum / n : 0);
    }
    var lvl = dbTo01(feats.rms || 0);
    var bass = (bands[0] + bands[1] + bands[2]) / 3;
    var mid = (bands[5] + bands[6] + bands[7] + bands[8]) / 4;
    var high = (bands[12] + bands[13] + bands[14] + bands[15]) / 4;

    /* 频谱通量 → 重拍 */
    var flux = 0;
    if(prevSpec){
      for(var j=0;j<spec.length;j++){
        var d = (spec[j] || 0) - prevSpec[j];
        if(d > 0) flux += d;
      }
      flux = clamp(flux / spec.length * 26, 0, 1);
    }
    for(var m=0;m<spec.length;m++) prevSpec[m] = spec[m] || 0;

    var t = nowMs();
    var dt = lastTs ? Math.min((t - lastTs) / 1000, 0.25) : 0.016;
    lastTs = t;
    fluxAvg += (flux - fluxAvg) * Math.min(1, dt / 1.0);

    var beat = 0;
    if(flux > 0.06 && flux > fluxAvg * 1.5 && t - lastBeat > 110){
      lastBeat = t;
      beat = clamp((flux - fluxAvg) / (fluxAvg + 0.02), 0.35, 1);
      onsetTimes.push(t);
      if(onsetTimes.length > 9) onsetTimes.shift();
      if(onsetTimes.length >= 4){
        var gaps = [];
        for(var g=1; g<onsetTimes.length; g++) gaps.push(onsetTimes[g] - onsetTimes[g-1]);
        gaps.sort(function(a,b){ return a-b; });
        var med = gaps[Math.floor(gaps.length / 2)];
        var bpm = med > 0 ? 60000 / med : 0;
        if(bpm >= 60 && bpm <= 200) st.bpm = Math.round(bpm);
      }
    }

    st.level = lvl; st.beat = beat;

    /* 连上了却一直是静音 → 提示一次（多半是选错来源，或没勾"分享音频"） */
    if(lvl < 0.02){ silentMs += dt * 1000; } else { silentMs = 0; silenceWarned = false; }
    if(silentMs > 4000 && !silenceWarned){
      silenceWarned = true;
      st.code = 'silent';
      if(CFG.onStatus) { try{ CFG.onStatus({ status:'live', source:st.source, error:'', warn:'silent' }); }catch(e){} }
    }
    frame.level = lvl; frame.bass = bass; frame.mid = mid; frame.high = high;
    frame.bright = clamp((feats.spectralCentroid || 0) / 6000, 0, 1);
    frame.flux = flux; frame.beat = beat; frame.bpm = st.bpm;
    if(CFG.target) CFG.target.setAudioFrame(frame);
    if(CFG.onFrame){ try{ CFG.onFrame(frame); }catch(e){} }
  }

  function teardown(){
    if(rafId){ cancelAnimationFrame(rafId); rafId = 0; }
    if(analyzer){ try{ analyzer.stop(); }catch(e){} analyzer = null; }
    if(srcNode){ try{ srcNode.disconnect(); }catch(e){} srcNode = null; }
    if(stream){ try{ stream.getTracks().forEach(function(tr){ tr.stop(); }); }catch(e){} stream = null; }
    if(ctx){ try{ ctx.close(); }catch(e){} ctx = null; }
    lastTs = 0; onsetTimes = []; fluxAvg = 0.02;
  }

  var api = {
    get state(){ return st; },
    get bands(){ return bands; },
    source: function(){ return CFG.source; },

    setSource: function(s){ if(st.status === 'live') return false; CFG.source = (s === 'mic') ? 'mic' : 'display'; return true; },

    start: function(){
      if(st.status === 'starting' || st.status === 'live') return Promise.resolve(st);
      emitStatus('starting', '');
      var sup = audioSupported();
      if(!sup.audioContext) return Promise.resolve(fail('no-audiocontext', '浏览器不支持 Web Audio'));
      if(!sup.meyda) return Promise.resolve(fail('no-meyda', 'vendor/meyda.min.js 未加载'));
      var md = navigator.mediaDevices;
      if(!md) return Promise.resolve(fail('no-mediaDevices', '当前上下文无法捕获声音（需要 https / localhost / file://）'));

      var wantDisplay = (CFG.source === 'display');
      /* 关键：绝不能传 preferCurrentTab（那会把"本页自己的声音"当系统声抓，通常还是静音）；
         同时把当前标签页从选择器里排除，逼用户去选真正在放声音的标签页 / 窗口 / 整个屏幕。 */
      var displayOpts = {
        video: true,
        audio: true,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include'
      };
      var getStream = wantDisplay && md.getDisplayMedia
        ? md.getDisplayMedia(displayOpts)
        : md.getUserMedia({ audio:{ echoCancellation:false, autoGainControl:false, noiseSuppression:false } });

      return getStream.then(function(s){
        stream = s;
        if(wantDisplay && stream.getAudioTracks().length === 0){
          teardown();
          return fail('no-audio-track', '没拿到音频轨道：重新选择时请勾选「分享标签页音频 / 分享系统音频」');
        }
        var AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        var resume = (ctx.state === 'suspended' && ctx.resume) ? ctx.resume() : Promise.resolve();
        return resume.then(function(){
          srcNode = ctx.createMediaStreamSource(stream);
          analyzer = window.Meyda.createMeydaAnalyzer({
            audioContext: ctx,
            source: srcNode,
            bufferSize: CFG.fftSize,
            featureExtractors: ['amplitudeSpectrum', 'rms', 'spectralCentroid']
          });
          analyzer.start();
          buildBands(ctx.sampleRate, CFG.fftSize);
          var tr = stream.getAudioTracks()[0];
          var label = (tr && tr.label) ? tr.label : (CFG.source === 'mic' ? '麦克风' : '系统声音');
          if(tr) tr.onended = function(){ api.stop(); emitStatus('ended', ''); };
          emitStatus('live', label);
          st.code = '';
          if(!rafId) rafId = requestAnimationFrame(tick);
          return st;
        });
      }).catch(function(err){
        teardown();
        var name = (err && err.name) || '';
        if(name === 'NotAllowedError' || name === 'SecurityError') return fail('denied', '授权被拒绝：需要在弹窗里选择「标签页 / 屏幕」并勾选分享音频');
        if(name === 'NotFoundError') return fail('not-found', '没有可用的音频来源');
        return fail('capture-failed', (err && err.message) || String(err));
      });
    },

    stop: function(){ teardown(); emitStatus('idle', ''); return st; }
  };
  return api;
}


global.GridPillars = {
  create: create,
  createAudioTap: createAudioTap,
  audioSupported: audioSupported,
  version: '1.1',
  MODES: MODES,
  PRESETS: PRESETS,
  PARAM_DEFS: PARAM_DEFS,
  GLOBAL_DEFS: GLOBAL_DEFS,
  PALETTES: PALETTES,
  BUILTIN: BUILTIN,
  hexToRgb: hexToRgb
};
})(typeof window !== 'undefined' ? window : this);
