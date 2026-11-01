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
    ];
    function themeById(id) {
      for (var i = 0; i < THEMES.length; i += 1) if (THEMES[i].id === id) return THEMES[i];
      return THEMES[0];
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
      var S = React.useRef({ nodes: [], links: [], pulses: [], byId: {}, proj: {}, data: null, theme: 'nebula', prevRecalls: {}, signalQueue: [], lastSignalAt: 0, yaw: 0, pitch: -0.18, zoom: 1, panX: 0, panY: 0, focal: 3.2, cam: 5.2, drag: null, auto: true, lastInput: 0, lastPulse: 0, raf: 0 });

      React.useEffect(function () { injectCss(); }, []);

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
      }, []);

      React.useEffect(function () {
        S.current.theme = theme;
        try { localStorage.setItem('neuron-theme', theme); } catch (e) { /* ignore */ }
        if (S.current.data) build(S.current.data);
      }, [theme]);

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
          if (s.auto && now - s.lastInput > 2200) s.yaw += 0.0024;
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
            ctx.strokeStyle = th.edge + (0.06 + Math.min(0.18, depth * 0.10)).toFixed(3) + ')';
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
              if (th.shape === 'square') {
                ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
              } else if (th.shape === 'diamond') {
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
            ctx.font = (n.kind === 'center' ? '600 14px' : '11px') + ' "Segoe UI","Microsoft YaHei",sans-serif';
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

      return h('div', { className: 'nm3' },
        h('div', { className: 'nm3-top' },
          h('b', null, '神经元 · 3D 记忆星云'),
          h('span', null, '池 ' + pools.length + ' · 条目 ' + num(st.active) + ' · 海马体 ' + num(st.pending)),
          h('span', { className: 'sp' }),
          h('div', { className: 'nm3-themes' },
            THEMES.map(function (t) {
              return h('button', {
                key: t.id,
                type: 'button',
                className: 'nm3-theme' + (theme === t.id ? ' on' : ''),
                onClick: function () { setTheme(t.id); },
              }, t.label);
            })),
          h('span', null, data ? '刷新于 ' + new Date(data.at).toLocaleTimeString() : '加载中…')),
        err ? h('div', { className: 'nm3-err' }, '读取失败：' + err) : null,
        h('div', { className: 'nm3-stage', ref: stageRef },
          h('canvas', { ref: canvasRef }),
          h('div', { className: 'nm3-lg' }, pools.map(function (p) { return h('span', { key: 'lg' + p.key }, h('i', { style: { '--c': p.color } }), p.label); })),
          h('div', { className: 'nm3-hint' }, '拖动旋转（上下/左右）· 滚轮指向处缩放 · 双击聚焦 · 右键重置'),
          h('div', { className: 'nm3-side' }, side),
          sel ? h('div', { className: 'nm3-detail' },
            h('b', null, sel.kind === 'leaf' ? String(sel.label || '').slice(0, 120) : sel.label),
            sel.item ? h('div', { className: 'm' }, '池 ' + (sel.pool || '—') + ' · 权重 ' + num(sel.item.weight) + ' · ' + (sel.item.ageDays || 0) + ' 天 · 想起 ' + (sel.item.recalls || 0) + ' 次 · ' + sel.item.state) : null) : null));
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
