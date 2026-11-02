/**
 * dsh-neuron-memory 客户端半 —— 「神经元」3D 记忆星云（合并版）。
 * 记忆池/条目 + 旧思维链簇 + 全机节点（会话/服务/花费/插件/系统/海马体）。
 * 每帧绕 Y/X 旋转后透视投影（近大远小、深度衰减），拖动旋转、滚轮缩放、点击看详情。
 */
window.__ModuleLoader__.load({
  id: 'dsh-neuron-memory',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var h = React.createElement;

    var CSS = [
      '.nm3{position:relative;display:flex;flex-direction:column;height:100%;min-height:520px;color:#dfe8f7;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;background:radial-gradient(1200px 700px at 30% -10%,#0e2136 0%,#070c16 60%,#04070d 100%);overflow:hidden}',
      '.nm3-top{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #1c2a42;flex-wrap:wrap;font-size:12px;color:#93a9c9;z-index:2}',
      '.nm3-top b{color:#e9f2ff;font-size:14px;letter-spacing:.05em}.nm3-top .sp{flex:1}',
      '.nm3-stage{position:relative;flex:1;min-height:0;cursor:grab}.nm3-stage.drag{cursor:grabbing}',
      '.nm3-stage canvas{display:block;width:100%;height:100%}',
      '.nm3-lg{position:absolute;left:14px;bottom:12px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#6f84a8;pointer-events:none}',
      '.nm3-lg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;background:var(--c)}',
      '.nm3-hint{position:absolute;right:14px;bottom:12px;font-size:11px;color:#4f6285;pointer-events:none}',
      '.nm3-side{position:absolute;top:56px;right:12px;width:240px;max-height:calc(100% - 96px);overflow:auto;background:rgba(10,17,29,.78);border:1px solid #1f2c44;border-radius:12px;padding:10px 12px;font-size:11.5px;backdrop-filter:blur(4px)}',
      '.nm3-side h4{margin:10px 0 6px;font-size:10.5px;color:#8fa6c9;letter-spacing:.07em;text-transform:uppercase}.nm3-side h4:first-child{margin-top:0}',
      '.nm3-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed #182338;color:#c9d7ec}.nm3-row:last-child{border-bottom:0}.nm3-row .m{color:#7286a8}',
      '.nm3-detail{position:absolute;left:14px;top:56px;max-width:360px;background:rgba(10,17,29,.88);border:1px solid #22304c;border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.55}',
      '.nm3-detail b{color:#eaf3ff}.nm3-detail .m{color:#8198ba;font-size:11px;margin-top:4px}',
      '.nm3-themes{display:flex;gap:6px;margin-left:6px}',
      '.nm3-theme{cursor:pointer;font-size:11px;padding:2px 9px;border-radius:10px;border:1px solid #2a3a58;background:rgba(12,20,34,.6);color:#9fb3d9;font-family:inherit}',
      '.nm3-theme.on{background:#2c4a7a;color:#eaf3ff;border-color:#4a76b8}',
      '.nm3-nav{display:flex;gap:4px;margin-left:8px}',
      '.nm3-nav button{cursor:pointer;font-size:12px;padding:4px 12px;border-radius:8px;border:1px solid #24344f;background:rgba(12,20,34,.65);color:#9fb3d9;font-family:inherit}',
      '.nm3-nav button.on{background:#26405f;color:#eaf3ff;border-color:#3f689e}',
      '.nm3-foot{display:flex;align-items:center;gap:14px;padding:6px 16px;border-top:1px solid #1a2740;font-size:11px;color:#667b9d;z-index:2}',
      '.nm3-foot .dot{width:7px;height:7px;border-radius:50%;background:#3ddc97;display:inline-block;margin-right:5px}',
      '.nm3-foot .dot.bad{background:#ff6b6b}',
      '.nm3-card{background:rgba(14,22,36,.7);border:1px solid #1f2c44;border-radius:10px;padding:8px 10px;margin-bottom:8px}',
      '.nm3-card h5{margin:0 0 6px;font-size:10.5px;color:#8fa6c9;letter-spacing:.06em;text-transform:uppercase}',
      '.nm3-kv{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:#c9d7ec;padding:2px 0;border-bottom:1px dashed #182338}',
      '.nm3-kv:last-child{border-bottom:0}.nm3-kv .m{color:#7286a8}',
      '.nm3-item{border-bottom:1px dashed #182338;padding:6px 0;font-size:11.5px;color:#c9d7ec}',
      '.nm3-item:last-child{border-bottom:0}',
      '.nm3-item .m{color:#7286a8;font-size:10.5px;margin-top:2px}',
      '.nm3-item .ops{display:flex;gap:6px;margin-top:4px}',
      '.nm3-item .ops button{cursor:pointer;font-size:10.5px;padding:2px 8px;border-radius:6px;border:1px solid #2a3a58;background:#141f31;color:#9fb3d9;font-family:inherit}',
      '.nm3-field{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;font-size:12px;color:#c9d7ec}',
      '.nm3-field input[type=color]{width:34px;height:22px;border:1px solid #2a3a58;background:none;padding:0;border-radius:6px}',
      '.nm3-field input[type=range]{width:120px}',
      '.nm3-rail{position:absolute;left:12px;top:56px;display:flex;flex-direction:column;gap:6px;z-index:4}',
      '.nm3-rail button{cursor:pointer;font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #24344f;background:rgba(12,20,34,.78);color:#9fb3d9;font-family:inherit;text-align:left;min-width:70px}',
      '.nm3-rail button.on{background:#26405f;color:#eaf3ff;border-color:#3f689e}',
      '.nm3-err{color:#ff9c9c;padding:8px 16px;font-size:12px;z-index:3}',
    ].join('\n');

    function injectCss() {
      try {
        if (document.querySelector('style[data-plugin="dsh-neuron-memory"]')) return;
        var s = document.createElement('style');
        s.setAttribute('data-plugin', 'dsh-neuron-memory');
        s.textContent = CSS;
        document.head.appendChild(s);
      } catch (e) { /* ignore */ }
    }

    var num = function (n) { return n == null ? '—' : (Math.round(Number(n) * 100) / 100).toLocaleString(); };
    var hash = function (s) { var x = 0; for (var i = 0; i < s.length; i += 1) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; };

    // 可选 UI 主题
    var THEMES = [
      { id: 'nebula', label: '星云', bg: ['rgba(40,86,150,0.20)', 'rgba(16,32,58,0.10)', 'rgba(0,0,0,0)'], edge: 'rgba(110,150,215,', labelC: 'rgba(232,242,255,', shape: 'circle', grid: false, transform: null },
      { id: 'cortex', label: '皮层', bg: ['rgba(170,80,190,0.16)', 'rgba(60,20,80,0.10)', 'rgba(0,0,0,0)'], edge: 'rgba(210,140,235,', labelC: 'rgba(250,235,255,', shape: 'diamond', grid: false, transform: function (n) { if (n.kind === 'leaf') { n.y *= 1.35; n.x *= 1.06; } } },
      { id: 'matrix', label: '矩阵', bg: ['rgba(20,120,70,0.14)', 'rgba(6,30,16,0.08)', 'rgba(0,0,0,0)'], edge: 'rgba(80,230,150,', labelC: 'rgba(190,255,220,', shape: 'square', grid: true, transform: function (n) { if (n.kind === 'leaf') { n.y *= 0.6; n.z *= 0.8; } } },
      { id: 'minimal', label: '极简', bg: ['rgba(90,110,140,0.10)', 'rgba(20,26,36,0.06)', 'rgba(0,0,0,0)'], edge: 'rgba(150,170,200,', labelC: 'rgba(225,232,245,', shape: 'circle', grid: false, transform: null },
      { id: 'custom', label: '自定义', bg: ['rgba(60,90,160,0.18)', 'rgba(18,28,48,0.10)', 'rgba(0,0,0,0)'], edge: 'rgba(120,180,255,', labelC: 'rgba(235,245,255,', shape: 'circle', grid: false, transform: null },
    ];
    function themeById(id) {
      for (var i = 0; i < THEMES.length; i += 1) if (THEMES[i].id === id) return THEMES[i];
      return THEMES[0];
    }

    function hexRgb(hex) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return [127, 209, 255];
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // 轻量力导向松弛：撒点后跑几十步，减少重叠（参考力导向星图的思路）
    function relax(nodes, links, steps) {
      var idx = {};
      for (var z = 0; z < nodes.length; z += 1) idx[nodes[z].id] = nodes[z];
      for (var st = 0; st < steps; st += 1) {
        for (var i = 0; i < nodes.length; i += 1) {
          var a = nodes[i];
          for (var j = i + 1; j < nodes.length; j += 1) {
            var b = nodes[j];
            var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            var d2 = dx * dx + dy * dy + dz * dz + 0.02;
            var f = 0.01 / d2;
            a.x -= dx * f; a.y -= dy * f; a.z -= dz * f;
            b.x += dx * f; b.y += dy * f; b.z += dz * f;
          }
        }
        for (var k = 0; k < links.length; k += 1) {
          var na = idx[links[k].a], nb = idx[links[k].b];
          if (!na || !nb) continue;
          var lx = nb.x - na.x, ly = nb.y - na.y, lz = nb.z - na.z;
          var ld = Math.sqrt(lx * lx + ly * ly + lz * lz) || 0.001;
          var lf = (ld - 0.55) * 0.02;
          na.x += lx / ld * lf; na.y += ly / ld * lf; na.z += lz / ld * lf;
          nb.x -= lx / ld * lf; nb.y -= ly / ld * lf; nb.z -= lz / ld * lf;
        }
        for (var m = 0; m < nodes.length; m += 1) {
          var nn = nodes[m];
          nn.x -= nn.x * 0.012; nn.y -= nn.y * 0.012; nn.z -= nn.z * 0.012;
          var dd = Math.hypot(nn.x, nn.y, nn.z) || 1;
          if (dd > 2.2) { nn.x *= 2.2 / dd; nn.y *= 2.2 / dd; nn.z *= 2.2 / dd; }
        }
      }
    }

    function NeuronView() {
      var canvasRef = React.useRef(null);
      var stageRef = React.useRef(null);
      var [data, setData] = React.useState(null);
      var [err, setErr] = React.useState('');
      var [sel, setSel] = React.useState(null);
      var [theme, setTheme] = React.useState(function () {
        try {
          var saved = localStorage.getItem('neuron-theme');
          if (saved && themeById(saved).id === saved) return saved;
        } catch (e) { /* ignore */ }
        return 'nebula';
      });
      var [nav, setNav] = React.useState('star');
      var [accent, setAccent] = React.useState(function () {
        try { return localStorage.getItem('neuron-accent') || '#7fd1ff'; } catch (e) { return '#7fd1ff'; }
      });
      var [fontScale, setFontScale] = React.useState(function () {
        try { return Number(localStorage.getItem('neuron-font')) || 1; } catch (e) { return 1; }
      });
      var [autoRotate, setAutoRotate] = React.useState(true);
      var [shape, setShape] = React.useState(function () { try { return localStorage.getItem('neuron-shape') || 'circle'; } catch (e) { return 'circle'; } });
      var [edgeAlpha, setEdgeAlpha] = React.useState(function () { try { return Number(localStorage.getItem('neuron-edge')) || 1; } catch (e) { return 1; } });
      var [refreshKey, setRefreshKey] = React.useState(0);
      var [, setTick] = React.useState(0);
      var S = React.useRef({ nodes: [], links: [], pulses: [], byId: {}, proj: {}, data: null, theme: 'nebula', accent: '#7fd1ff', fontScale: 1, autoRotate: true, prevRecalls: {}, signalQueue: [], lastSignalAt: 0, yaw: 0, pitch: -0.18, zoom: 1, panX: 0, panY: 0, focal: 3.2, cam: 5.2, drag: null, auto: true, lastInput: 0, lastPulse: 0, raf: 0 });

      React.useEffect(function () { injectCss(); }, []);

      React.useEffect(function () {
        var t = setInterval(function () { setTick(function (x) { return x + 1; }); }, 1000);
        return function () { clearInterval(t); };
      }, []);

      React.useEffect(function () {
        var alive = true;
        function load() {
          fetch('/neuron/api/data', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (alive) { setData(d); setErr(''); build(d); } })
            .catch(function (e) { if (alive) setErr(String((e && e.message) || e)); });
        }
        load();
        var t = setInterval(load, 5000);
        return function () { alive = false; clearInterval(t); };
      }, [refreshKey]);

      React.useEffect(function () {
        S.current.theme = theme;
        S.current.accent = accent;
        S.current.fontScale = fontScale;
        S.current.autoRotate = autoRotate;
        S.current.shape = shape;
        S.current.edgeAlpha = edgeAlpha;
        try {
          localStorage.setItem('neuron-theme', theme);
          localStorage.setItem('neuron-accent', accent);
          localStorage.setItem('neuron-font', String(fontScale));
          localStorage.setItem('neuron-shape', shape);
          localStorage.setItem('neuron-edge', String(edgeAlpha));
        } catch (e) { /* ignore */ }
        if (S.current.data) build(S.current.data);
      }, [theme, accent, fontScale, autoRotate, shape, edgeAlpha]);

      function build(d) {
        var s = S.current;
        var nodes = [], links = [], byId = {};
        function add(n) { nodes.push(n); byId[n.id] = n; }
        function link(a, b) { links.push({ a: a, b: b }); }

        var mem = d.memory || {};
        var pools = d.pools || [];
        var items = d.items || [];
        var sys = d.system || {};
        var svc = d.services || {};
        var cost = d.cost || {};
        var pl = d.plugins || {};

        add({ id: 'c', label: 'DSH', kind: 'center', color: '#eaf3ff', x: 0, y: 0, z: 0, r0: 16 });

        pools.forEach(function (p, i) {
          var a = (i / Math.max(1, pools.length)) * Math.PI * 2;
          var hub = { id: 'h:' + p.key, label: p.label, kind: 'hub', color: p.color, pool: p.key, x: Math.cos(a) * 1.35, y: Math.sin(i * 1.7) * 0.35, z: Math.sin(a) * 1.35, r0: 9 };
          add(hub); link('c', hub.id);
        });

        items.forEach(function (it) {
          if (it.state === 'archived') return;
          var hub = byId['h:' + it.pool];
          if (!hub) return;
          var seed = hash(String(it.id));
          var ang = (seed % 360) * Math.PI / 180;
          var tilt = (((seed >> 8) % 100) / 100 - 0.5) * 1.6;
          var R = 0.55 + ((seed >> 4) % 100) / 100 * 0.45;
          var base = Math.atan2(hub.z, hub.x);
          var ax = base + ang * 0.35;
          var id = 'e:' + it.id;
          add({
            id: id, label: it.text, kind: 'leaf', color: hub.color, pool: it.pool, item: it,
            x: hub.x + Math.cos(ax) * Math.cos(tilt) * R,
            y: hub.y + Math.sin(tilt) * R * 0.9,
            z: hub.z + Math.sin(ax) * Math.cos(tilt) * R,
            r0: 2.4 + Math.min(5, (it.weight || 0.2) * 6),
          });
          link(hub.id, id);
        });

        var ho = d.handoff || {};
        if (ho.text && String(ho.text).trim() !== '') {
          var hhub = { id: 'h:handoff', label: '交接 ' + (ho.chars || 0) + ' 字', kind: 'hub', color: '#ff9fd0', x: 0, y: -1.05, z: 0, r0: 8 };
          add(hhub); link('c', hhub.id);
          String(ho.text).split('\n').filter(function (x) { return x.trim() !== '' && x.charAt(0) !== '#'; }).slice(0, 3).forEach(function (t, i) {
            var hid = 'h:handoff:l' + i;
            add({ id: hid, label: t, kind: 'leaf', color: '#ff9fd0', x: (i - 1) * 0.3, y: -1.05 - 0.3, z: 0.2, r0: 2.6 });
            link(hhub.id, hid);
          });
        }

        var mo = d.mood;
        if (mo && typeof mo.value === 'number') {
          var mhub = { id: 'h:mood', label: '心情 ' + mo.value, kind: 'hub', color: mo.color || '#7fd4ff', x: 0, y: 1.05, z: 0, r0: 8 };
          add(mhub); link('c', mhub.id);
          if (mo.reason) {
            add({ id: 'h:mood:l0', label: mo.reason, kind: 'leaf', color: mo.color || '#7fd4ff', x: 0, y: 1.35, z: 0.2, r0: 2.6 });
            link(mhub.id, 'h:mood:l0');
          }
        }

        var systems = [
          { k: 'session', label: '会话 ' + ((d.sessions || []).length), color: '#7fd1ff', leaves: (d.sessions || []).slice(0, 8).map(function (x) { return x.title; }) },
          { k: 'chain', label: '思维链 ' + ((d.chain && d.chain.count) || 0), color: '#ffd479', leaves: ((d.chain && d.chain.recent) || []).map(function (x) { return x.judgement; }) },
          { k: 'svc', label: '服务', color: '#3ddc97', leaves: ['core ' + (svc.core ? '在线' : '离线'), 'shim ' + (svc.shim ? '在线' : '离线'), 'panel ' + (svc.dashboard ? '在线' : '离线')] },
          { k: 'cost', label: '花费 ¥' + num(cost.todayUsage), color: '#ffb46a', leaves: ['余额 ¥' + num(cost.balance), num(cost.todayTokens) + ' tokens', num(cost.calls) + ' 次调用'] },
          { k: 'plugin', label: '插件 ' + ((pl.extraBundles || []).length), color: '#59d98e', leaves: (pl.extraBundles || []).slice(0, 6) },
          { k: 'sys', label: '系统', color: '#8ea4c6', leaves: [String(sys.platform || '') + ' ' + String(sys.release || ''), (sys.cpuCount || '?') + ' 核 · load ' + num(sys.load1), 'Node ' + String(sys.node || '')] },
        ];
        systems.forEach(function (sh, i) {
          var a = (i / systems.length) * Math.PI * 2 + 0.5;
          var hub = { id: 's:' + sh.k, label: sh.label, kind: 'hub', color: sh.color, x: Math.cos(a) * 2.55, y: Math.cos(i * 1.3) * 0.8, z: Math.sin(a) * 2.55, r0: 8 };
          add(hub); link('c', hub.id);
          sh.leaves.forEach(function (txt, j) {
            var seed = hash(sh.k + j);
            var ax = a + (j - (sh.leaves.length - 1) / 2) * 0.42;
            var rr = 0.55 + (seed % 50) / 100;
            var id = 's:' + sh.k + ':' + j;
            add({ id: id, label: txt, kind: 'leaf', color: sh.color, x: hub.x + Math.cos(ax) * rr, y: hub.y + Math.sin((seed % 100) / 100 * 3) * 0.35, z: hub.z + Math.sin(ax) * rr, r0: 3 });
            link(hub.id, id);
          });
        });

        var pending = (d.stats && d.stats.pending) || 0;
        if (pending > 0) {
          var hip = { id: 's:hippo', label: '海马体 ' + pending, kind: 'hub', color: '#ff9fd0', x: 0, y: 0.95, z: 0, r0: 7 };
          add(hip); link('c', hip.id);
          for (var i = 0; i < Math.min(6, pending); i += 1) {
            var id = 's:hippo:' + i;
            add({ id: id, label: '待归档 ' + (i + 1), kind: 'leaf', color: '#ff9fd0', x: Math.cos(i) * 0.35, y: 0.95 + Math.sin(i) * 0.2, z: Math.sin(i) * 0.35, r0: 2.4 });
            link(hip.id, id);
          }
        }
        // 主题几何变形（皮层/矩阵）
        var th = themeById(s.theme);
        if (th.transform) for (var ti = 0; ti < nodes.length; ti += 1) th.transform(nodes[ti]);
        // 任务信号：recalls 增长的条目排队，从中心点亮并沿边扩散
        if (!s.prevRecalls) s.prevRecalls = {};
        for (var ii = 0; ii < items.length; ii += 1) {
          var it = items[ii];
          var prev = s.prevRecalls[it.id] || 0;
          if ((it.recalls || 0) > prev) s.signalQueue.push('e:' + it.id);
          s.prevRecalls[it.id] = it.recalls || 0;
        }
        if (s.signalQueue.length > 16) s.signalQueue = s.signalQueue.slice(-16);
        relax(nodes, links, 60);
        // 聚类：叶子向所属池 hub 收拢，形成可读的簇
        var hubMap = {};
        for (var hi = 0; hi < nodes.length; hi += 1) if (nodes[hi].kind === 'hub' && nodes[hi].pool) hubMap[nodes[hi].pool] = nodes[hi];
        for (var ci = 0; ci < nodes.length; ci += 1) {
          var cn = nodes[ci];
          if (cn.kind !== 'leaf' || !cn.pool || !hubMap[cn.pool]) continue;
          var hubN = hubMap[cn.pool];
          cn.x = hubN.x + (cn.x - hubN.x) * 0.55;
          cn.y = hubN.y + (cn.y - hubN.y) * 0.55;
          cn.z = hubN.z + (cn.z - hubN.z) * 0.55;
        }
        for (var di = 0; di < nodes.length; di += 1) {
          var dn = nodes[di];
          if (dn.item && dn.item.due) {
            var dd2 = Math.hypot(dn.x, dn.z) || 1;
            dn.x = (dn.x / dd2) * 2.1; dn.z = (dn.z / dd2) * 2.1; dn.y *= 0.15;
          }
        }
        s.data = d;
        s.nodes = nodes; s.links = links; s.byId = byId;
      }

      React.useEffect(function () {
        var canvas = canvasRef.current, stage = stageRef.current;
        if (!canvas || !stage) return;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        var raf = 0, last = 0;

        function resize() {
          var rect = stage.getBoundingClientRect();
          var dpr = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.max(320, Math.round(rect.width * dpr));
          canvas.height = Math.max(320, Math.round(rect.height * dpr));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize();
        var ro = null;
        try { ro = new ResizeObserver(resize); ro.observe(stage); } catch (e) { /* ignore */ }

        function project(p, w, hh) {
          var s = S.current;
          var cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), cx = Math.cos(s.pitch), sx = Math.sin(s.pitch);
          var x1 = p.x * cy + p.z * sy;
          var z1 = -p.x * sy + p.z * cy;
          var y2 = p.y * cx - z1 * sx;
          var z2 = p.y * sx + z1 * cx;
          var k = s.focal / (s.focal + z2 + s.cam);
          var scale = Math.min(w, hh) / 1.9;
          return { x: w / 2 + x1 * k * s.zoom * scale + s.panX, y: hh / 2 + y2 * k * s.zoom * scale + s.panY, k: k, z: z2 };
        }

        function frame(now) {
          if (now - last < 30) { raf = requestAnimationFrame(frame); return; }
          last = now;
          var s = S.current;
          var rect = stage.getBoundingClientRect();
          var w = rect.width, hh = rect.height;
          ctx.clearRect(0, 0, w, hh);
          var th = themeById(s.theme);
          if (th.id === 'custom') {
            var rgb = hexRgb(s.accent);
            th = { id: 'custom', bg: th.bg, edge: 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',', labelC: th.labelC, shape: th.shape, grid: false, transform: null };
          }
          var grd = ctx.createRadialGradient(w / 2, hh * 0.48, 20, w / 2, hh * 0.5, Math.min(w, hh) * 0.8);
          grd.addColorStop(0, th.bg[0]); grd.addColorStop(0.55, th.bg[1]); grd.addColorStop(1, th.bg[2]);
          ctx.fillStyle = grd; ctx.fillRect(0, 0, w, hh);
          if (th.grid) {
            ctx.strokeStyle = 'rgba(70,200,130,0.08)'; ctx.lineWidth = 1;
            for (var gx = 0; gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, hh); ctx.stroke(); }
            for (var gy = 0; gy < hh; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
            var scan = (now / 24) % hh;
            ctx.strokeStyle = 'rgba(90,255,170,0.10)'; ctx.beginPath(); ctx.moveTo(0, scan); ctx.lineTo(w, scan); ctx.stroke();
          }
          if (s.auto && s.autoRotate !== false && now - s.lastInput > 2200) s.yaw += 0.0024;
          // 用户拖出来的俯仰要保留；只有长时间没操作时才轻微回摆（不再每帧覆盖）
          if (!s.drag && s.auto && now - s.lastInput > 5000) {
            s.pitch += (-0.02 + Math.sin(now / 5200) * 0.10 - s.pitch) * 0.01;
          }
          var proj = {}, i, n;
          for (i = 0; i < s.nodes.length; i += 1) { n = s.nodes[i]; proj[n.id] = project(n, w, hh); }
          s.proj = proj;
          ctx.lineWidth = 1;
          for (i = 0; i < s.links.length; i += 1) {
            var l = s.links[i], a = proj[l.a], b = proj[l.b];
            if (!a || !b) continue;
            var depth = (a.k + b.k) / 2;
            ctx.strokeStyle = th.edge + ((0.06 + Math.min(0.18, depth * 0.10)) * (s.edgeAlpha || 1)).toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
          if (s.signalQueue.length && now - s.lastSignalAt > 100) {
            var targetId = s.signalQueue.shift();
            var target = s.byId[targetId];
            s.lastSignalAt = now;
            if (target) {
              target.flashUntil = now + 1400;
              for (var sp = 0; sp < 3; sp += 1) s.pulses.push({ link: { a: 'c', b: targetId }, t: -sp * 0.09, speed: 0.022, signal: true });
              for (var li = 0; li < s.links.length; li += 1) {
                var lk = s.links[li];
                if (lk.a === targetId || lk.b === targetId) {
                  var other = lk.a === targetId ? lk.b : lk.a;
                  s.pulses.push({ link: { a: targetId, b: other }, t: -0.15, speed: 0.018, signal: true });
                }
              }
            }
          }
          if (now - s.lastPulse > 160 && s.links.length) {
            s.pulses.push({ link: s.links[Math.floor(Math.random() * s.links.length)], t: 0, speed: 0.01 + Math.random() * 0.01 });
            if (s.pulses.length > 46) s.pulses.shift();
            s.lastPulse = now;
          }
          for (i = s.pulses.length - 1; i >= 0; i -= 1) {
            var pu = s.pulses[i];
            pu.t += pu.speed;
            if (pu.t >= 1) { s.pulses.splice(i, 1); continue; }
            if (pu.t < 0) continue;
            var la = s.byId[pu.link.a], lb = s.byId[pu.link.b];
            if (!la || !lb) { s.pulses.splice(i, 1); continue; }
            var mp = project({ x: la.x + (lb.x - la.x) * pu.t, y: la.y + (lb.y - la.y) * pu.t, z: la.z + (lb.z - la.z) * pu.t }, w, hh);
            ctx.fillStyle = lb.color || '#7fd1ff'; ctx.globalAlpha = Math.max(0.15, Math.min(0.95, mp.k * 0.9));
            var pr = Math.max(1.2, (pu.signal ? 4.2 : 2.4) * mp.k);
            ctx.beginPath(); ctx.arc(mp.x, mp.y, pr, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          }
          var order = s.nodes.slice().sort(function (m1, m2) { return (proj[m2.id] || {}).z - (proj[m1.id] || {}).z; });
          for (i = 0; i < order.length; i += 1) {
            n = order[i]; var p = proj[n.id]; if (!p) continue;
            var k = Math.max(0.25, Math.min(2.4, p.k));
            var r = Math.max(0.8, (n.r0 || 3) * k * (0.6 + s.zoom * 0.4));
            var alpha = Math.max(0.12, Math.min(1, k * 0.85));
            var focus = sel && sel.id === n.id;
            if (n.kind === 'leaf') {
              ctx.fillStyle = n.color; ctx.globalAlpha = alpha * 0.85;
              var shp = s.shape || th.shape;
              if (shp === 'square') {
                ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
              } else if (shp === 'diamond') {
                ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 1.3); ctx.lineTo(p.x + r * 1.3, p.y); ctx.lineTo(p.x, p.y + r * 1.3); ctx.lineTo(p.x - r * 1.3, p.y); ctx.closePath(); ctx.fill();
              } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
              }
              ctx.globalAlpha = 1;
              if (n.item && n.item.recalls > 0) { ctx.strokeStyle = n.color; ctx.globalAlpha = alpha * 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
              if (n.flashUntil && now < n.flashUntil) {
                var fp = 1 - (n.flashUntil - now) / 1400;
                ctx.strokeStyle = n.color; ctx.lineWidth = 2;
                ctx.globalAlpha = 0.85 * (1 - fp);
                ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + fp * 14, 0, Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 1;
              }
              if (focus) { ctx.strokeStyle = '#eaf3ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2); ctx.stroke(); }
              continue;
            }
            var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
            glow.addColorStop(0, n.color); glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = alpha * 0.28; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
            if (focus) { ctx.strokeStyle = '#eaf3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2); ctx.stroke(); }
            ctx.fillStyle = th.labelC + Math.min(0.95, alpha + 0.15).toFixed(2) + ')';
            var fs = Math.max(0.8, Math.min(1.6, s.fontScale || 1));
            var baseSize = n.kind === 'center' ? 14 : 11;
            ctx.font = (n.kind === 'center' ? '600 ' : '') + Math.round(baseSize * fs) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(n.label || '').slice(0, 20), p.x, p.y + r + 14);
          }
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);

        function down(e) { var s = S.current; s.drag = { x: e.clientX, y: e.clientY, yaw: s.yaw, pitch: s.pitch }; s.auto = false; s.lastInput = performance.now(); stage.classList.add('drag'); }
        function move(e) { var s = S.current; if (!s.drag) return; s.yaw = s.drag.yaw + (e.clientX - s.drag.x) * 0.006; s.pitch = Math.max(-1.1, Math.min(1.1, s.drag.pitch + (e.clientY - s.drag.y) * 0.005)); s.lastInput = performance.now(); }
        function up() { var s = S.current; s.drag = null; s.auto = true; s.lastInput = performance.now(); stage.classList.remove('drag'); }
        function wheel(e) {
          var s = S.current; e.preventDefault();
          var rect = stage.getBoundingClientRect();
          var mx = e.clientX - rect.left, my = e.clientY - rect.top;
          var oldZ = s.zoom;
          var nz = Math.max(0.4, Math.min(4.0, s.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
          if (nz === oldZ) return;
          var r = nz / oldZ;
          // 以光标为中心缩放：光标下的世界点在屏幕上保持不动
          var cx = rect.width / 2, cy = rect.height / 2;
          s.panX = (mx - cx) - ((mx - cx) - s.panX) * r;
          s.panY = (my - cy) - ((my - cy) - s.panY) * r;
          s.zoom = nz; s.lastInput = performance.now();
        }
        function click(e) {
          var s = S.current; if (!s.proj) return;
          var rect = stage.getBoundingClientRect();
          var mx = e.clientX - rect.left, my = e.clientY - rect.top;
          var best = null, bestD = 256;
          for (var id in s.proj) { var p = s.proj[id]; var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (d < bestD) { bestD = d; best = id; } }
          var node = best ? s.byId[best] : null;
          setSel(node ? { id: node.id, label: node.label, kind: node.kind, pool: node.pool, color: node.color, item: node.item } : null);
        }
        function dblclick(e) {
          var s = S.current; if (!s.proj) return;
          var rect = stage.getBoundingClientRect();
          var mx = e.clientX - rect.left, my = e.clientY - rect.top;
          var cx = rect.width / 2, cy = rect.height / 2;
          var best = null, bestD = 256;
          for (var id in s.proj) { var p = s.proj[id]; var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (d < bestD) { bestD = d; best = id; } }
          var nz = Math.min(3.4, s.zoom * 1.35);
          var r = nz / s.zoom;
          if (best && s.proj[best]) {
            var p2 = s.proj[best];
            var wx = (p2.x - cx - s.panX) / s.zoom;
            var wy = (p2.y - cy - s.panY) / s.zoom;
            s.zoom = nz;
            s.panX = -wx * nz;
            s.panY = -wy * nz;
          } else {
            s.panX = (mx - cx) - ((mx - cx) - s.panX) * r;
            s.panY = (my - cy) - ((my - cy) - s.panY) * r;
            s.zoom = nz;
          }
          s.lastInput = performance.now();
        }
        function reset(e) {
          if (e) e.preventDefault();
          var s = S.current;
          s.yaw = 0; s.pitch = -0.18; s.zoom = 1; s.panX = 0; s.panY = 0; s.auto = true; s.lastInput = 0;
        }
        stage.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        stage.addEventListener('wheel', wheel, { passive: false });
        stage.addEventListener('click', click);
        stage.addEventListener('dblclick', dblclick);
        stage.addEventListener('contextmenu', reset);
        return function () {
          cancelAnimationFrame(raf);
          if (ro) ro.disconnect();
          stage.removeEventListener('pointerdown', down);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          stage.removeEventListener('wheel', wheel);
          stage.removeEventListener('click', click);
          stage.removeEventListener('dblclick', dblclick);
          stage.removeEventListener('contextmenu', reset);
        };
      }, [sel]);

      var st = (data && data.stats) || {};
      var pools = (data && data.pools) || [];
      var items = (data && data.items) || [];
      var cfg = (data && data.config) || {};
      var side = [];
      var ho2 = (data && data.handoff) || {};
      side.push(h('h4', { key: 'h0' }, '交接层（每轮注入）'));
      side.push(h('div', { className: 'nm3-row', key: 'ho1' }, h('span', null, '体量'), h('span', { className: 'm' }, num(ho2.chars) + ' / ' + num(ho2.limit) + ' 字')));
      side.push(h('div', { className: 'nm3-row', key: 'ho2' }, h('span', null, ho2.text ? String(ho2.text).split('\n').filter(Boolean).slice(1, 2).join('').slice(0, 28) : '（还没有交接）')));
      var mo2 = (data && data.mood) || null;
      side.push(h('h4', { key: 'm0' }, '心情（鱼的心情）'));
      side.push(h('div', { className: 'nm3-row', key: 'mo1' }, h('span', null, '心情值'), h('span', null, mo2 ? num(mo2.value) + ' / 100' : '未检测到')));
      if (mo2) {
        side.push(h('div', { className: 'nm3-row', key: 'mo2' }, h('span', null, mo2.label), h('span', { className: 'm' }, (mo2.dims || []).join(' · '))));
        if (mo2.reason) side.push(h('div', { className: 'nm3-row', key: 'mo3' }, h('span', { className: 'm' }, String(mo2.reason).slice(0, 40))));
        (mo2.timeline || []).slice(-3).reverse().forEach(function (t, i) {
          var when = t.at ? new Date(t.at).toLocaleTimeString().slice(0, 5) : '';
          side.push(h('div', { className: 'nm3-row', key: 'moT' + i }, h('span', { className: 'm' }, when + ' ' + (t.reason || '')), h('span', { className: 'm' }, num(t.mood))));
        });
      }
      side.push(h('h4', { key: 'a' }, '记忆'));
      side.push(h('div', { className: 'nm3-row', key: 'r1' }, h('span', null, '活跃 / 归档'), h('span', null, num(st.active) + ' / ' + num(st.archived))));
      side.push(h('div', { className: 'nm3-row', key: 'r2' }, h('span', null, '海马体'), h('span', null, num(st.pending))));
      side.push(h('div', { className: 'nm3-row', key: 'r3' }, h('span', null, '夜巡'), h('span', null, (data && data.lastPatrol) || '从未')));
      side.push(h('h4', { key: 'b' }, '池（半衰期）'));
      pools.forEach(function (p) {
        var c = items.filter(function (i) { return i.pool === p.key && i.state !== 'archived'; }).length;
        side.push(h('div', { className: 'nm3-row', key: 'p' + p.key }, h('span', null, p.label + ' · ' + c), h('span', { className: 'm' }, p.halfLifeDays + '天')));
      });
      side.push(h('h4', { key: 'c' }, '生命周期'));
      var bs = st.byState || {};
      ['active', 'settling', 'echo', 'archived'].forEach(function (k) {
        side.push(h('div', { className: 'nm3-row', key: 'l' + k }, h('span', null, k), h('span', { className: 'm' }, num(bs[k]))));
      });
      side.push(h('h4', { key: 'd' }, '参数'));
      side.push(h('div', { className: 'nm3-row', key: 'i1' }, h('span', null, '注入'), h('span', { className: 'm' }, num(cfg.injection && cfg.injection.maxItems) + ' 条')));
      side.push(h('div', { className: 'nm3-row', key: 'i2' }, h('span', null, '夜巡'), h('span', { className: 'm' }, (cfg.patrol ? cfg.patrol.hour + ':' + String(cfg.patrol.minute).padStart(2, '0') : '—'))));
      var rt = (data && data.retrieval) || {};
      side.push(h('h4', { key: 'v0' }, '检索'));
      side.push(h('div', { className: 'nm3-row', key: 'v1' }, h('span', null, '向量检索'), h('span', { className: 'm' }, rt.enabled ? ('开 · ' + (rt.model || '') + ' · 缓存 ' + num(rt.cached) + (rt.ok === false ? ' · 服务离线' : '')) : '关（关键词）')));

      function act(action, id, extra) {
        var body = Object.assign({ action: action, id: id }, extra || {});
        fetch('/neuron/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          .then(function () { setRefreshKey(function (k) { return k + 1; }); })
          .catch(function () { /* ignore */ });
      }
      function setCfg(patch) { act('config', null, { patch: patch }); }
      var wb = [];
      if (nav === 'overview') {
        var rt2 = (data && data.retrieval) || {};
        var tiersList = (data && data.tiers) || [];
        var due = (data && data.due) || [];
        wb.push(h('div', { className: 'nm3-card', key: 'o1' },
          h('h5', null, '记忆库'),
          h('div', { className: 'nm3-kv' }, h('span', null, '活跃 / 归档'), h('span', null, num(st.active) + ' / ' + num(st.archived))),
          h('div', { className: 'nm3-kv' }, h('span', null, '海马体待归档'), h('span', null, num(st.pending))),
          h('div', { className: 'nm3-kv' }, h('span', null, '事实卡'), h('span', { className: 'm' }, num((data && data.card && data.card.chars) || 0) + ' / ' + num((data && data.card && data.card.limit) || 0) + ' 字')),
          h('div', { className: 'nm3-kv' }, h('span', null, '事件日志'), h('span', { className: 'm' }, num((data && data.events) || 0) + ' 条'))));
        wb.push(h('div', { className: 'nm3-card', key: 'o2' },
          h('h5', null, '分档（半衰期）'),
          tiersList.map(function (t) { return h('div', { className: 'nm3-kv', key: 't' + t.key }, h('span', null, t.label), h('span', { className: 'm' }, t.halfLifeDays ? t.halfLifeDays + ' 天' : '不衰减')); })));
        wb.push(h('div', { className: 'nm3-card', key: 'o3' },
          h('h5', null, '运行'),
          h('div', { className: 'nm3-kv' }, h('span', null, '预设'), h('span', { className: 'm' }, (data && data.preset) || 'balanced')),
          h('div', { className: 'nm3-kv' }, h('span', null, '夜巡'), h('span', { className: 'm' }, (data && data.lastPatrol) || '从未')),
          h('div', { className: 'nm3-kv' }, h('span', null, '向量检索'), h('span', { className: 'm' }, rt2.enabled ? '开' : '关')),
          h('div', { className: 'nm3-kv' }, h('span', null, '写入门'), h('span', { className: 'm' }, '跳过 ' + num((data && data.gate && data.gate.skipped) || 0)))));
        if (due.length) wb.push(h('div', { className: 'nm3-card', key: 'o4' }, h('h5', null, '到期 / 待办'), due.map(function (t, i) { return h('div', { className: 'nm3-kv', key: 'due' + i }, h('span', { className: 'm' }, t)); })));
      } else if (nav === 'memory') {
        var list = (items || []).filter(function (i) { return i.state !== 'archived'; }).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 40);
        wb.push(h('h4', { key: 'ml' }, '记忆库（前 40 条，按权重）'));
        list.forEach(function (it) {
          wb.push(h('div', { className: 'nm3-item', key: 'mi' + it.id },
            h('div', null, String(it.text).slice(0, 80)),
            h('div', { className: 'm' }, (it.pool || '') + ' · w ' + num(it.weight) + ' · ' + (it.ageDays || 0) + ' 天 · 想起 ' + (it.recalls || 0)),
            h('div', { className: 'ops' },
              h('button', { onClick: function () { act('touch', it.id); } }, '想起'),
              h('button', { onClick: function () { act('forget', it.id); } }, '归档'))));
        });
        if (!list.length) wb.push(h('div', { className: 'nm3-row' }, h('span', { className: 'm' }, '（空）')));
      } else if (nav === 'scheme') {
        var sc = (data && data.scheme) || {};
        var preset = sc.preset || 'balanced';
        var tiers = (data && data.tiers) || [];
        wb.push(h('h4', { key: 'sc1' }, '遗忘模型'));
        wb.push(h('div', { className: 'nm3-field', key: 'sp' }, h('span', null, '预设'),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
            (sc.presets || []).map(function (x) {
              return h('button', { key: x.key, className: 'nm3-theme' + (preset === x.key ? ' on' : ''), onClick: function () { act('preset', null, { name: x.key }); } }, x.label);
            }))));
        var curPreset = (sc.presets || []).filter(function (x) { return x.key === preset; })[0];
        if (curPreset && curPreset.desc) wb.push(h('div', { className: 'nm3-row', key: 'pd' }, h('span', { className: 'm' }, curPreset.desc)));
        tiers.forEach(function (t) {
          if (t.key === 'hard') return;
          wb.push(h('div', { className: 'nm3-field', key: 'tl' + t.key }, h('span', null, t.label + ' 半衰期'),
            h('input', { type: 'number', min: 0.5, max: 180, step: 0.5, value: Number(t.halfLifeDays) || 1, style: { width: '72px' },
              onChange: function (e) { var p = {}; p[t.key] = { halfLifeDays: Number(e.target.value) }; setCfg({ tiers: p }); } })));
        });
        wb.push(h('div', { className: 'nm3-field', key: 'inj' }, h('span', null, '注入条数'), h('input', { type: 'number', min: 1, max: 20, value: (sc.injection && sc.injection.maxItems) || 6, style: { width: '56px' }, onChange: function (e) { setCfg({ injection: { maxItems: Number(e.target.value) }, scoring: { preset: 'custom' } }); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'injc' }, h('span', null, '注入字数'), h('input', { type: 'number', min: 200, max: 4000, step: 100, value: (sc.injection && sc.injection.budgetChars) || 900, style: { width: '72px' }, onChange: function (e) { setCfg({ injection: { budgetChars: Number(e.target.value) }, scoring: { preset: 'custom' } }); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'cap' }, h('span', null, '海马体上限'), h('input', { type: 'number', min: 50, max: 2000, step: 50, value: (sc.capture && sc.capture.maxHippocampus) || 400, style: { width: '72px' }, onChange: function (e) { setCfg({ capture: { maxHippocampus: Number(e.target.value) }, scoring: { preset: 'custom' } }); } })));
        wb.push(h('div', { className: 'nm3-row', key: 'pat' }, h('span', null, '夜巡时间'), h('span', { className: 'm' }, ((sc.patrol && sc.patrol.hour) || 3) + ':' + String((sc.patrol && sc.patrol.minute) || 0).padStart(2, '0'))));
        wb.push(h('h4', { key: 'sc2' }, '运行模式'));
        var pol = (sc.policies && sc.policies.default) || 'full';
        wb.push(h('div', { className: 'nm3-field', key: 'pol' }, h('span', null, '会话策略'),
          h('select', { value: pol, onChange: function (e) { setCfg({ policies: { default: e.target.value } }); } },
            h('option', { value: 'full' }, 'full（记录 + 注入）'),
            h('option', { value: 'log' }, 'log（只记录）'),
            h('option', { value: 'off' }, 'off（全关）'))));
        wb.push(h('h4', { key: 'sc3' }, '写入门 / 事实卡 / 到期'));
        wb.push(h('div', { className: 'nm3-field', key: 'g' }, h('span', null, '写入门'),
          h('input', { type: 'checkbox', checked: (sc.gate && sc.gate.enabled) !== false, onChange: function (e) { setCfg({ gate: { enabled: e.target.checked } }); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'c' }, h('span', null, '事实卡字数'),
          h('input', { type: 'range', min: 500, max: 4000, step: 100, value: Number(sc.card && sc.card.maxChars) || 1500, onChange: function (e) { setCfg({ card: { maxChars: Number(e.target.value) } }); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'd' }, h('span', null, '到期窗口(天)'),
          h('input', { type: 'number', min: 0, max: 14, value: Number(sc.due && sc.due.withinDays) || 2, style: { width: '56px' }, onChange: function (e) { setCfg({ due: { withinDays: Number(e.target.value) } }); } })));
        wb.push(h('h4', { key: 'sc4' }, '数据维护'));
        wb.push(h('div', { className: 'nm3-field', key: 'rp' },
          h('button', { className: 'nm3-theme', onClick: function () { act('repair', null, {}); } }, '清理噪音 / 去重 / 补字段'),
          h('button', { className: 'nm3-theme', onClick: function () { act('config-reset', null, {}); } }, '恢复默认配置')));
        wb.push(h('div', { className: 'nm3-row', key: 'hist' }, h('span', { className: 'm' }, '配置快照 ' + num((sc && sc.configHistory) || 0) + ' 份（改前自动留档）')));
      } else if (nav === 'settings') {
        wb.push(h('h4', { key: 'st1' }, '主题'));
        wb.push(h('div', { className: 'nm3-field', key: 'th' },
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
            THEMES.map(function (t) { return h('button', { key: t.id, className: 'nm3-theme' + (theme === t.id ? ' on' : ''), onClick: function () { setTheme(t.id); } }, t.label); }))));
        wb.push(h('div', { className: 'nm3-field', key: 'ac' }, h('span', null, '自定义强调色'), h('input', { type: 'color', value: accent, onChange: function (e) { setAccent(e.target.value); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'fs' }, h('span', null, '字号'), h('input', { type: 'range', min: 0.8, max: 1.6, step: 0.1, value: fontScale, onChange: function (e) { setFontScale(Number(e.target.value)); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'ar' }, h('span', null, '自动旋转'), h('input', { type: 'checkbox', checked: autoRotate, onChange: function (e) { setAutoRotate(e.target.checked); } })));
        wb.push(h('div', { className: 'nm3-field', key: 'sh' }, h('span', null, '节点形状'),
          h('select', { value: shape, onChange: function (e) { setShape(e.target.value); } },
            h('option', { value: 'circle' }, '圆形'), h('option', { value: 'square' }, '方形'), h('option', { value: 'diamond' }, '菱形'))));
        wb.push(h('div', { className: 'nm3-field', key: 'ea' }, h('span', null, '连线亮度'),
          h('input', { type: 'range', min: 0.4, max: 2, step: 0.1, value: edgeAlpha, onChange: function (e) { setEdgeAlpha(Number(e.target.value)); } })));
        wb.push(h('h4', { key: 'st2' }, '检索'));
        wb.push(h('div', { className: 'nm3-kv', key: 'sv' }, h('span', null, '向量检索'), h('span', { className: 'm' }, ((data && data.retrieval && data.retrieval.enabled) ? '开' : '关（关键词）'))));
        wb.push(h('div', { className: 'nm3-kv', key: 'sp' }, h('span', null, '预设'), h('span', { className: 'm' }, (data && data.preset) || 'balanced')));
      }

      return h('div', { className: 'nm3' },
        h('div', { className: 'nm3-top' },
          h('b', null, '神经元记忆'),
          h('span', { className: 'sp' }),
          nav !== 'star' ? h('button', { className: 'nm3-theme', onClick: function () { setNav('star'); } }, '收起 ✕') : null,
          h('span', null, '条目 ' + num(st.active) + ' · 海马体 ' + num(st.pending))),
        err ? h('div', { className: 'nm3-err' }, '读取失败：' + err) : null,
        h('div', { className: 'nm3-stage', ref: stageRef },
          h('canvas', { ref: canvasRef }),
          h('div', { className: 'nm3-rail' },
            [['star', '星图'], ['overview', '概览'], ['memory', '记忆'], ['scheme', '方案'], ['settings', '设置']].map(function (x) {
              return h('button', {
                key: x[0],
                className: nav === x[0] ? 'on' : '',
                onClick: function () { setNav(nav === x[0] && x[0] !== 'star' ? 'star' : x[0]); },
              }, x[1]);
            })),
          h('div', { className: 'nm3-lg' }, pools.map(function (p) { return h('span', { key: 'lg' + p.key }, h('i', { style: { '--c': p.color } }), p.label); })),
          h('div', { className: 'nm3-hint' }, '拖动旋转（上下/左右）· 滚轮指向处缩放 · 双击聚焦 · 右键重置'),
          h('div', { className: 'nm3-side' }, nav === 'star' ? side : wb),
          sel ? h('div', { className: 'nm3-detail' },
            h('b', null, sel.kind === 'leaf' ? String(sel.label || '').slice(0, 120) : sel.label),
            sel.item ? h('div', { className: 'm' }, '池 ' + (sel.pool || '—') + ' · 权重 ' + num(sel.item.weight) + ' · ' + (sel.item.ageDays || 0) + ' 天 · 想起 ' + (sel.item.recalls || 0) + ' 次 · ' + sel.item.state) : null) : null),
        h('div', { className: 'nm3-foot' },
          h('span', null, h('span', { className: 'dot' + (err ? ' bad' : '') }), err ? '未连接' : '已连接 · 5 秒自动刷新'),
          h('span', null, '星 ' + num(S.current.nodes.length) + ' · 连线 ' + num(S.current.links.length)),
          h('span', { className: 'sp', style: { flex: 1 } }),
          h('span', null, new Date().toLocaleTimeString())));
    }

    var inject = ['slots'];
    function apply(ctx) {
      try {
        ctx.slots.inject('conversation.view', function () {
          return ctx.slots.register({ name: 'conversation.view', id: 'neuron-memory-view', order: 95, label: function () { return '神经元'; } }, NeuronView);
        });
      } catch (e) { if (typeof console !== 'undefined') console.warn('[dsh-neuron-memory] tab register failed', e); }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NeuronView = NeuronView;
    return module.exports;
  },
});
