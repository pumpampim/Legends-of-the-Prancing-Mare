// ============================================================================
// ESTATE.JS — поместья и дома игроков: сетка участка, рисование, ходьба (этап 1).
// Данные лежат в документе сессии: session.estates = { id: { id, name, w, h, cells: {"x_y": тип}, tokens: {uid: {x,y}},
// members: [uid] | пусто = вся сессия, owner, created } }. Клетка = 5 футов. Ходьба свободная (без очерёдности), по
// проходимой местности: путь ищет GridCore.pathFeet. Общая часть для игрока (index.html) и мастера (gm.html).
// ============================================================================
(function () {
    const G = () => window.GridCore;
    // Местность поместья: к боевой (стена, камень, дерево, вода, кусты) добавлены трава, дорожка, пол и фундамент.
    const EXTRA = {
        grass: { name: 'Трава', color: '#3f6d35', pass: true },
        path: { name: 'Дорожка', color: '#a89270', pass: true },
        floor: { name: 'Пол', color: '#8a6d4b', pass: true },
        foundation: { name: 'Фундамент', color: '#77716a', pass: true }
    };
    function terrain() { return Object.assign({}, EXTRA, (G() && G().TERRAIN) || {}); }
    const PAINT = ['grass', 'path', 'floor', 'foundation', 'wall', 'tree', 'bush', 'rock', 'water'];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const key = (x, y) => x + '_' + y;

    function make(name, owner, w, h) {
        return { id: 'es' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name || 'Поместье', w: w || 50, h: h || 50, cells: {}, tokens: {}, owner: owner || null, created: Date.now() };
    }
    function typeAt(est, x, y) { return (est.cells && est.cells[key(x, y)]) || 'grass'; }
    function passable(est, x, y) {
        if (x < 0 || y < 0 || x >= est.w || y >= est.h) return false;
        const t = terrain()[typeAt(est, x, y)]; return !t || t.pass;
    }
    // Первая свободная клетка у (x0,y0) по спирали — куда поставить нового жителя.
    function spawnCell(est, x0, y0) {
        x0 = x0 == null ? 1 : x0; y0 = y0 == null ? 1 : y0;
        for (let r = 0; r < Math.max(est.w, est.h); r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = x0 + dx, y = y0 + dy;
            if (passable(est, x, y)) return { x, y };
        }
        return { x: 0, y: 0 };
    }
    // Дойдёт ли фишка from → to по проходимым клеткам: возвращает длину пути в футах или null.
    function reach(est, from, to) {
        if (!passable(est, to.x, to.y)) return null;
        const g = G(); if (!g) return null;
        return g.pathFeet({ w: est.w, h: est.h, cells: pass1(est) }, from, to, null, null);
    }
    // GridCore знает только боевую местность; чужие типы он считает проходимыми. Непроходимое из своих (сейчас таких нет) закрываем стеной.
    function pass1(est) {
        const t = terrain(), out = {};
        Object.keys(est.cells || {}).forEach(k => { const d = t[est.cells[k]]; out[k] = d && !d.pass ? 'wall' : (G().TERRAIN[est.cells[k]] ? est.cells[k] : ''); });
        return out;
    }
    function tokenColor(uid) { let h = 0; for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 360; return 'hsl(' + h + ',65%,45%)'; }

    // Рисование. opts: cs (размер клетки), me (uid), names ({uid: имя}), hover ({x,y}).
    function draw(cv, est, opts) {
        opts = opts || {}; if (!cv || !est) return;
        const cs = opts.cs || 14, W = est.w * cs, H = est.h * cs;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const c = cv.getContext('2d'), T = terrain();
        for (let x = 0; x < est.w; x++) for (let y = 0; y < est.h; y++) {
            const d = T[typeAt(est, x, y)] || EXTRA.grass;
            c.fillStyle = d.color; c.fillRect(x * cs, y * cs, cs, cs);
        }
        c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1;
        if (cs >= 10) { for (let x = 0; x <= est.w; x++) { c.beginPath(); c.moveTo(x * cs + .5, 0); c.lineTo(x * cs + .5, H); c.stroke(); } for (let y = 0; y <= est.h; y++) { c.beginPath(); c.moveTo(0, y * cs + .5); c.lineTo(W, y * cs + .5); c.stroke(); } }
        if (opts.hover) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(opts.hover.x * cs, opts.hover.y * cs, cs, cs); }
        const names = opts.names || {};
        Object.keys(est.tokens || {}).forEach(uid => {
            const t = est.tokens[uid]; if (!t) return;
            c.fillStyle = tokenColor(uid); c.beginPath(); c.arc(t.x * cs + cs / 2, t.y * cs + cs / 2, cs * 0.42, 0, 7); c.fill();
            c.lineWidth = uid === opts.me ? 3 : 1.5; c.strokeStyle = uid === opts.me ? '#ffd24a' : '#000'; c.stroke();
            c.fillStyle = '#fff'; c.font = 'bold ' + Math.max(8, Math.floor(cs * 0.55)) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(((names[uid] || '?').trim()[0] || '?').toUpperCase(), t.x * cs + cs / 2, t.y * cs + cs / 2 + 1);
        });
    }
    function cellFromEvent(cv, est, ev) {
        const r = cv.getBoundingClientRect(), p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
        const sx = cv.width / r.width, sy = cv.height / r.height, cs = cv.width / est.w;
        const x = Math.floor((p.clientX - r.left) * sx / cs), y = Math.floor((p.clientY - r.top) * sy / cs);
        return x < 0 || y < 0 || x >= est.w || y >= est.h ? null : { x, y };
    }
    function visibleTo(est, uid) { return !est.members || !est.members.length || est.members.indexOf(uid) >= 0 || est.owner === uid; }

    // ---------------- игрок ----------------
    const UI = { sel: '', data: null };
    const $ = id => document.getElementById(id);
    function myUid() { return window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null; }
    function myEstates() {
        const me = myUid(), all = (UI.data && UI.data.estates) || {};
        return Object.keys(all).map(k => all[k]).filter(e => e && visibleTo(e, me)).sort((a, b) => (a.created || 0) - (b.created || 0));
    }
    function namesOf() { const out = {}, p = (UI.data && UI.data.participants) || {}; Object.keys(p).forEach(u => { out[u] = p[u].name || p[u].charName || ''; }); return out; }
    function renderPlayer() {
        const box = $('estate-box'); if (!box) return;
        const list = myEstates();
        if (!list.length) { box.innerHTML = '<p style="opacity:.7;">У вашего отряда пока нет поместья. Его открывает мастер.</p>'; return; }
        if (!list.some(e => e.id === UI.sel)) UI.sel = list[0].id;
        const est = list.find(e => e.id === UI.sel), me = myUid();
        if (!$('estate-canvas')) {
            box.innerHTML = '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;"><select id="estate-select" onchange="Estate.pick(this.value)"></select>' +
                '<span id="estate-info" style="font-size:13px; opacity:.8;"></span></div>' +
                '<div style="overflow:auto; max-height:70vh; border:1px solid var(--border-color);"><canvas id="estate-canvas" style="display:block; touch-action:manipulation; cursor:pointer;"></canvas></div>' +
                '<div id="estate-who" style="font-size:12px; opacity:.75; margin-top:4px;"></div>';
            $('estate-canvas').addEventListener('click', ev => Estate.click(ev));
        }
        $('estate-select').innerHTML = list.map(e => '<option value="' + esc(e.id) + '"' + (e.id === UI.sel ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('');
        const t = est.tokens && est.tokens[me];
        $('estate-info').textContent = t ? 'Ты на клетке ' + t.x + ':' + t.y + '. Нажми на клетку, чтобы пройти.' : 'Тебя нет в поместье: нажми «Войти».';
        let enter = $('estate-enter');
        if (!t && !enter) { enter = document.createElement('button'); enter.id = 'estate-enter'; enter.textContent = 'Войти в поместье'; enter.style.cssText = 'width:auto; margin:4px 0;'; enter.onclick = () => Estate.enter(); $('estate-info').after(enter); }
        if (t && enter) enter.remove();
        const nm = namesOf();
        $('estate-who').textContent = 'Здесь: ' + (Object.keys(est.tokens || {}).map(u => nm[u] || '?').join(', ') || 'никого');
        draw($('estate-canvas'), est, { cs: 14, me, names: nm });
    }
    function write(patch) { return window.CloudSync && window.CloudSync.estateWrite ? window.CloudSync.estateWrite(patch) : Promise.reject(new Error('Не в сессии.')); }
    const Estate = window.Estate = {
        make, typeAt, passable, spawnCell, reach, draw, cellFromEvent, visibleTo, terrain, PAINT, key, tokenColor,
        onSession(d) { UI.data = d; try { renderPlayer(); } catch (e) { console.error(e); } },
        render: renderPlayer,
        pick(id) { UI.sel = id; renderPlayer(); },
        enter() {
            const est = myEstates().find(e => e.id === UI.sel), me = myUid(); if (!est || !me) return;
            const s = spawnCell(est, 1, 1);
            write({ ['estates.' + est.id + '.tokens.' + me]: s }).catch(e => alert('Ошибка: ' + e.message));
        },
        click(ev) {
            const est = myEstates().find(e => e.id === UI.sel), me = myUid(); if (!est || !me) return;
            const cell = cellFromEvent($('estate-canvas'), est, ev), t = est.tokens && est.tokens[me];
            if (!cell || !t) return;
            if (reach(est, t, cell) == null) { const i = $('estate-info'); if (i) i.textContent = 'Туда не пройти.'; return; }
            write({ ['estates.' + est.id + '.tokens.' + me]: { x: cell.x, y: cell.y } }).catch(e => alert('Ошибка: ' + e.message));
        }
    };
    window.EstateEsc = esc;
})();
