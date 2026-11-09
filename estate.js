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

    const D = () => window.ESTATE_DATA;
    const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));
    function make(name, owner, w, h, opts) {
        opts = opts || {};
        return { id: 'es' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name || 'Поместье', w: w || 50, h: h || 50, cells: {}, tokens: {}, owner: owner || null, created: Date.now(),
            found: {}, build: {}, roof: {}, plan: {}, planSeq: 0, furn: {}, stock: {}, store: {}, wings: opts.kind === 'house' ? ['kitchen', 'bedroom'] : [], wingsLocked: opts.kind === 'house', staff: {}, day: 0, dayBase: null, floors: {}, orders: [], built: {}, wingSlot: {}, used: {},
            costMult: opts.costMult || 1, kind: opts.kind || 'manor', noBuild: opts.kind === 'house', log: [] };
    }
    // Готовые участки: «Озёрный дом» — пустая земля 50×50, стройка дороже на 40%; «Гордость шпиля» — готовый городской дом.
    // ---------------- этажи ----------------
    // Этаж 0 лежит в самом участке (found/build/roof/plan/furn), остальные — в e.floors[L]. withLevel на время подменяет эти слои,
    // поэтому все правила ниже работают с «текущим этажом» без изменений; e._base — слои земли (для проверки фундамента).
    const LV = ['found', 'build', 'roof', 'plan', 'furn'];
    function withLevel(e, L, fn) {
        L = Number(L) || 0; if (!L) return fn(e);
        e.floors = e.floors || {}; const f = e.floors[L] = e.floors[L] || {}, saved = {};
        LV.forEach(k => { saved[k] = e[k]; e[k] = f[k] || {}; }); e._base = saved;
        try { return fn(e); } finally { LV.forEach(k => { f[k] = e[k]; e[k] = saved[k]; }); delete e._base; }
    }
    function getLevel(e, L) { L = Number(L) || 0; if (!L) return e; const f = (e.floors || {})[L] || {}; return { found: f.found || {}, build: f.build || {}, roof: f.roof || {}, plan: f.plan || {}, furn: f.furn || {} }; }
    function levelsOf(e) { return [0].concat(Object.keys(e.floors || {}).map(Number).sort((a, b) => a - b)).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b); }
    // Вид участка на этаже L для рисования и ходьбы (без копирования данных). Земля и местность — только на этаже 0.
    function view(e, L) { L = Number(L) || 0; if (!L) return e; const o = getLevel(e, L); return Object.assign({}, e, { cells: {}, found: o.found, build: o.build, roof: o.roof, plan: o.plan, furn: o.furn, level: L }); }
    // Все слои мебели участка (по этажам) — для лимитов и условий вроде «есть очаг».
    function allFurn(e) { const a = [e.furn]; if (e._base) a.push(e._base.furn); Object.keys(e.floors || {}).forEach(L => { const f = e.floors[L].furn; if (f && a.indexOf(f) < 0) a.push(f); }); return a; }
    const countFurn = (e, t) => allFurn(e).reduce((n, fm) => n + Object.keys(fm).filter(k => fm[k].t === t).length, 0);
    function wingCount(e, w) { return allFurn(e).reduce((n, fm) => n + Object.keys(fm).filter(k => (D().FURN[fm[k].t] || {}).wing === w).length, 0); }
    function wingActive(e, w) { const I = D().WING_INFO[w]; return e.wings.indexOf(w) >= 0 && !!I && wingCount(e, w) >= I.need; }

    function preset(id, owner) {
        const P = (D().PRESETS || {})[id]; if (!P) return null;
        const e = make(P.name, owner, P.w, P.h, { kind: P.kind, costMult: P.costMult });
        if (id === 'solitude') {
            for (let x = 8; x <= 21; x++) for (let y = 8; y <= 19; y++) {
                const k = key(x, y), edge = x === 8 || x === 21 || y === 8 || y === 19;
                e.found[k] = 1; e.roof[k] = 1; e.build[k] = edge ? 'wall' : 'floor';
            }
            e.build[key(14, 19)] = 'door'; e.build[key(8, 12)] = 'window'; e.build[key(21, 12)] = 'window';
            e.furn[key(10, 10)] = { t: 'hearth' }; e.furn[key(12, 12)] = { t: 'table' };
            e.furn[key(19, 10)] = { t: 'bed' }; e.furn[key(19, 12)] = { t: 'bed' }; e.furn[key(10, 17)] = { t: 'chest' };
            if (window.ESTATE_PLANS) window.ESTATE_PLANS.apply(e, window.ESTATE_PLANS.solShell(e), withLevel);
        }
        return e;
    }
    function typeAt(est, x, y) { return (est.cells && est.cells[key(x, y)]) || 'grass'; }
    function passable(est, x, y) {
        if (x < 0 || y < 0 || x >= est.w || y >= est.h) return false;
        const t = terrain()[typeAt(est, x, y)]; if (t && !t.pass) return false;
        const k = key(x, y), b = est.build && est.build[k]; if (b === 'wall' || b === 'window') return false;
        if (est.level && b !== 'floor' && b !== 'door') return false;
        const f = est.furn && est.furn[k]; if (f && D().FURN[f.t] && D().FURN[f.t].block) return false;
        return true;
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
        const cells = {};
        for (let x = 0; x < est.w; x++) for (let y = 0; y < est.h; y++) if (!passable(est, x, y)) cells[key(x, y)] = 'wall';
        return g.pathFeet({ w: est.w, h: est.h, cells }, from, to, null, null);
    }
    function tokenColor(uid) { let h = 0; for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 360; return 'hsl(' + h + ',65%,45%)'; }

    // ---------------- рисование ----------------
    // Текстуры (img/estate/<имя>.webp, нарисованы нейросетью в духе Скайрима): плитка в 4 клетки; нет файла — рисуется цветом.
    const TEX = {};
    function texImg(n) {
        const v = TEX[n]; if (v !== undefined) return v || null;
        TEX[n] = null; if (typeof Image === 'undefined') return null;
        const i = new Image(); i.onload = () => { TEX[n] = i; try { if (window.Estate && window.Estate.redraw) window.Estate.redraw(); } catch (e) { } }; i.onerror = () => { TEX[n] = false; }; i.src = 'img/estate/' + n + '.webp'; return null;
    }
    function fillTex(c, n, color, x, y, w, h, cs, alpha) {
        const im = texImg(n);
        if (im) { c._tp = c._tp || {}; const kk = n + '@' + cs; let p = c._tp[kk]; if (!p) { p = c.createPattern(im, 'repeat'); if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(cs * 4 / im.width)); c._tp[kk] = p; } c.fillStyle = p || color; }
        else c.fillStyle = color;
        if (alpha != null) c.globalAlpha = alpha; c.fillRect(x, y, w, h); if (alpha != null) c.globalAlpha = 1;
    }
    const LAYER_COLOR = { found: '#77716a', floor: '#8a6d4b', wall: '#4a423c', door: '#6b4423', window: '#7fb4d8' };
    // opts: cs, me (uid), names, hover, showRoof, mode
    function draw(cv, est, opts) {
        opts = opts || {}; if (!cv || !est) return;
        const cs = opts.cs || 14, W = est.w * cs, H = est.h * cs;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const c = cv.getContext('2d'), T = terrain(), FU = D() ? D().FURN : {};
        const me = opts.me, mt = est.tokens && est.tokens[me], lvl = Number(opts.level) || 0;
        const showRoof = opts.showRoof !== false && !(mt && (Number(mt.l) || 0) === lvl && est.roof && est.roof[key(mt.x, mt.y)]);
        for (let x = 0; x < est.w; x++) for (let y = 0; y < est.h; y++) {
            const k = key(x, y), d = T[typeAt(est, x, y)] || EXTRA.grass;
            if (lvl) { c.fillStyle = '#14171b'; c.fillRect(x * cs, y * cs, cs, cs); } else fillTex(c, typeAt(est, x, y), d.color, x * cs, y * cs, cs, cs, cs);
            if (lvl && opts.ghost) { const gb = opts.ghost.build && opts.ghost.build[k]; if (gb) { c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x * cs, y * cs, cs, cs); } }
            if (est.found && est.found[k]) fillTex(c, 'foundation', LAYER_COLOR.found, x * cs, y * cs, cs, cs, cs);
            const b = est.build && est.build[k];
            if (b) { fillTex(c, b === 'door' || b === 'window' ? 'floor' : b, LAYER_COLOR[b], x * cs, y * cs, cs, cs, cs); if (b === 'door' || b === 'window') { c.fillStyle = LAYER_COLOR[b]; c.globalAlpha = .55; c.fillRect(x * cs, y * cs, cs, cs); c.globalAlpha = 1; } if (b === 'wall') { c.strokeStyle = 'rgba(255,255,255,.18)'; c.strokeRect(x * cs + 1.5, y * cs + 1.5, cs - 3, cs - 3); } if (b === 'door' || b === 'window') { c.fillStyle = '#fff'; c.font = Math.floor(cs * 0.7) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b === 'door' ? '🚪' : '🪟', x * cs + cs / 2, y * cs + cs / 2 + 1); } }
        }
        c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1;
        if (cs >= 10) { for (let x = 0; x <= est.w; x++) { c.beginPath(); c.moveTo(x * cs + .5, 0); c.lineTo(x * cs + .5, H); c.stroke(); } for (let y = 0; y <= est.h; y++) { c.beginPath(); c.moveTo(0, y * cs + .5); c.lineTo(W, y * cs + .5); c.stroke(); } }
        c.textAlign = 'center'; c.textBaseline = 'middle';
        Object.keys(est.furn || {}).forEach(k => {
            const f = est.furn[k], d = FU[f.t]; if (!d) return; const [x, y] = k.split('_').map(Number);
            c.font = Math.floor(cs * 0.75) + 'px serif'; c.fillStyle = '#fff';
            c.fillText(d.icon, x * cs + cs / 2, y * cs + cs / 2 + 1);
            if (f.crop) { const ripe = (est.day || 0) - f.crop.at >= D().GROW_DAYS; c.font = Math.floor(cs * 0.5) + 'px serif'; c.fillText(ripe ? '✨' : '🌱', x * cs + cs * .72, y * cs + cs * .3); }
        });
        Object.keys(est.plan || {}).forEach(k => {
            const p = est.plan[k], [x, y] = k.replace('~r', '').split('_').map(Number);
            c.strokeStyle = '#ffd24a'; c.setLineDash([3, 2]); c.strokeRect(x * cs + 1.5, y * cs + 1.5, cs - 3, cs - 3); c.setLineDash([]);
            c.fillStyle = '#ffd24a'; c.font = Math.floor(cs * 0.55) + 'px sans-serif'; c.fillText((D().PIECES[p.t] || {}).icon ? D().PIECES[p.t].name[0] : '?', x * cs + cs / 2, y * cs + cs / 2 + 1);
        });
        if (showRoof) Object.keys(est.roof || {}).forEach(k => { const [x, y] = k.split('_').map(Number); fillTex(c, 'roof', '#7a3a2e', x * cs, y * cs, cs, cs, cs, .7); });
        if (opts.sel) { c.fillStyle = 'rgba(255,210,74,.4)'; opts.sel.forEach(q => c.fillRect(q[0] * cs, q[1] * cs, cs, cs)); }
        if (opts.hover) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(opts.hover.x * cs, opts.hover.y * cs, cs, cs); }
        const names = opts.names || {};
        Object.keys(est.tokens || {}).forEach(uid => {
            const t = est.tokens[uid]; if (!t || (Number(t.l) || 0) !== lvl) return;
            c.fillStyle = tokenColor(uid); c.beginPath(); c.arc(t.x * cs + cs / 2, t.y * cs + cs / 2, cs * 0.42, 0, 7); c.fill();
            c.lineWidth = uid === opts.me ? 3 : 1.5; c.strokeStyle = uid === opts.me ? '#ffd24a' : '#000'; c.stroke();
            c.fillStyle = '#fff'; c.font = 'bold ' + Math.max(8, Math.floor(cs * 0.55)) + 'px sans-serif';
            c.fillText(((names[uid] || '?').trim()[0] || '?').toUpperCase(), t.x * cs + cs / 2, t.y * cs + cs / 2 + 1);
        });
    }
    function cellFromEvent(cv, est, ev) {
        const r = cv.getBoundingClientRect(), p = ev.touches && ev.touches[0] ? ev.touches[0] : (ev.changedTouches && ev.changedTouches[0]) || ev;
        const sx = cv.width / r.width, sy = cv.height / r.height, cs = cv.width / est.w;
        const x = Math.floor((p.clientX - r.left) * sx / cs), y = Math.floor((p.clientY - r.top) * sy / cs);
        return x < 0 || y < 0 || x >= est.w || y >= est.h ? null : { x, y };
    }
    function visibleTo(est, uid) { return !est.members || !est.members.length || est.members.indexOf(uid) >= 0 || est.owner === uid; }

    // ---------------- правила (чистые функции: меняют копию участка и бросают Error с понятным текстом) ----------------
    const fail = m => { throw new Error(m); };
    // Разметка хранится по ключу клетки; крыша — отдельным ключом «x_y~r», чтобы её можно было размечать над разметкой пола.
    const pk = (layer, k) => layer === 'roof' ? k + '~r' : k;
    const mname = id => (D().MATERIALS[id] || {}).name || id;
    function costText(c) { return Object.keys(c).map(m => mname(m) + ' ×' + c[m]).join(', ') || 'бесплатно'; }
    function costOf(est, per, n) { const out = {}; Object.keys(per).forEach(m => { out[m] = Math.ceil(per[m] * n * (est.costMult || 1) - 1e-9); }); return out; }
    function takeMats(e, cost) {
        const lack = Object.keys(cost).filter(m => (e.stock[m] || 0) < cost[m]);
        if (lack.length) fail('Не хватает на складе: ' + lack.map(m => mname(m) + ' (нужно ' + cost[m] + ', есть ' + (e.stock[m] || 0) + ')').join(', ') + '.');
        Object.keys(cost).forEach(m => { e.stock[m] -= cost[m]; if (e.stock[m] <= 0) delete e.stock[m]; });
    }
    function giveMats(e, cost) { Object.keys(cost).forEach(m => { if (cost[m] > 0) e.stock[m] = (e.stock[m] || 0) + cost[m]; }); }
    const cellKeys = cells => cells.map(c => key(c[0], c[1])).filter((k, i, a) => a.indexOf(k) === i);
    const inb = (e, x, y) => x >= 0 && y >= 0 && x < e.w && y < e.h;
    function pushLog(e, text) { e.log = (e.log || []).concat([{ d: e.day, t: text }]).slice(-12); }

    const R = {
        // Закупка: материалы кладутся на склад поместья (деньги списывает вызывающая сторона).
        buy(e, mat, qty) { if (!D().MATERIALS[mat] || !(qty > 0)) fail('Неверный материал.'); e.stock[mat] = (e.stock[mat] || 0) + qty; return ['stock']; },
        // Разметка постройки по клеткам [[x,y],...]: материалы уходят со склада сразу, работа идёт рабочими днями.
        place(e, op, cells) {
            const P = D().PIECES[op]; if (!P) fail('Неизвестная деталь.');
            if (e.noBuild) fail('Этот дом готов: достраивать его нельзя, только обставлять.');
            const ok = [];
            cellKeys(cells).forEach(k => {
                const [x, y] = k.split('_').map(Number); if (!inb(e, x, y) || e.plan[pk(P.layer, k)]) return;
                if (P.layer === 'found') { if (e._base) return; const t = terrain()[typeAt(e, x, y)]; if ((t && !t.pass) || e.found[k]) return; }
                else {
                    if (!(e._base ? e._base.found : e.found)[k]) return;
                    if (P.layer === 'build' && (e.build[k] || (e.furn[k] && op !== 'floor'))) return;
                    if (P.layer === 'roof' && e.roof[k]) return;
                }
                ok.push(k);
            });
            if (!ok.length) fail(e._base ? 'Сюда это не построить: этаж строится над фундаментом первого этажа, на свободной клетке.' : 'Сюда это не построить (нужен фундамент, свободная клетка или проходимая местность).');
            takeMats(e, costOf(e, P.cost, ok.length));
            ok.forEach(k => { e.plan[pk(P.layer, k)] = { t: op, w: P.work, n: ++e.planSeq }; });
            return ['stock', 'plan', 'planSeq'];
        },
        cancel(e, cells) {
            let n = 0; const back = {};
            cellKeys(cells).forEach(k0 => [k0, k0 + '~r'].forEach(k => { const p = e.plan[k]; if (!p) return; delete e.plan[k]; n++; const c = D().PIECES[p.t].cost; Object.keys(c).forEach(m => { back[m] = (back[m] || 0) + c[m] * (e.costMult || 1); }); }));
            if (!n) fail('Здесь нет разметки.');
            Object.keys(back).forEach(m => { back[m] = Math.floor(back[m] + 1e-9); }); giveMats(e, back);
            return ['stock', 'plan'];
        },
        // Снос: самый верхний слой клетки (мебель, крыша, постройка, фундамент); возврат половины материалов.
        demolish(e, cells) {
            if (e.noBuild) fail('Этот дом сносить нельзя.');
            let n = 0; const back = {};
            const refund = (per, mult) => Object.keys(per).forEach(m => { back[m] = (back[m] || 0) + per[m] * mult * 0.5; });
            cellKeys(cells).forEach(k => {
                if (e.furn[k]) { refund(D().FURN[e.furn[k].t].mats, 1); delete e.furn[k]; n++; }
                else if (e.roof[k]) { refund(D().PIECES.roof.cost, e.costMult || 1); delete e.roof[k]; n++; }
                else if (e.build[k]) { refund(D().PIECES[e.build[k]].cost, e.costMult || 1); delete e.build[k]; n++; }
                else if (e.found[k]) { refund(D().PIECES.found.cost, e.costMult || 1); delete e.found[k]; n++; }
            });
            if (!n) fail('Здесь нечего сносить.');
            Object.keys(back).forEach(m => { back[m] = Math.floor(back[m] + 1e-9); }); giveMats(e, back);
            return ['stock', 'found', 'build', 'roof', 'furn'];
        },
        wings(e, list, force) {
            if (e.wingsLocked && !force) fail('Крылья уже выбраны. Менять их может только мастер.');
            list = (list || []).filter((w, i, a) => D().WINGS[w] && a.indexOf(w) === i);
            if (list.length > D().MAX_WINGS) fail('Можно выбрать не больше ' + D().MAX_WINGS + ' крыльев.');
            if (!list.length) fail('Выберите хотя бы одно крыло.');
            e.wings = list; e.wingsLocked = true; e.wingSlot = {}; list.forEach((w, i) => { e.wingSlot[w] = i; }); return ['wings', 'wingsLocked', 'wingSlot'];
        },
        // Услуга управляющего: готовая постройка по плану, строится заданное число дней партии.
        order(e, id) {
            const PL = window.ESTATE_PLANS, P = PL && PL.PKG[id]; if (!P) fail('Нет такой услуги.');
            if (P.kind !== (e.kind === 'house' ? 'house' : 'manor')) fail('Эту услугу управляющий здесь не предлагает.');
            if (!e.staff.steward) fail('Сначала наймите управляющего: услуги продаёт он.');
            e.built = e.built || {}; e.orders = e.orders || [];
            if (e.built[id]) fail('Это уже построено.'); if (e.orders.some(o => o.id === id)) fail('Этот заказ уже в работе.');
            if (P.wing && e.wings.indexOf(P.wing) < 0) fail('Это крыло не выбрано.');
            if (P.need) {
                if (P.need.indexOf('wing:') === 0) { if (e.wings.indexOf(P.need.slice(5)) < 0) fail('Нужно крыло «' + D().WINGS[P.need.slice(5)].name + '».'); }
                else if (!e.built[P.need]) fail('Сначала закажите: ' + PL.nameOf(P.need) + '.');
            }
            if (PL.conflicts(e, PL.planOf(e, id), getLevel)) fail('Место занято постройкой или разметкой: сначала снесите или отмените её.');
            e.orders.push({ id, left: P.days, since: e.day }); pushLog(e, 'Заказано у управляющего: ' + PL.nameOf(id) + ' (дней партии: ' + P.days + ').'); return ['orders', 'log'];
        },
        finishOrders(e, ev) {
            const PL = window.ESTATE_PLANS; e.built = e.built || {}; if (!(e.orders || []).length || !PL) return;
            e.orders.forEach(o => { o.left--; });
            const ready = e.orders.filter(o => o.left <= 0); e.orders = e.orders.filter(o => o.left > 0);
            ready.forEach(o => { PL.apply(e, PL.planOf(e, o.id), withLevel); e.built[o.id] = 1; ev.push('Управляющий закончил: ' + PL.nameOf(o.id) + '.'); });
        },
        // Пользование крылом раз в день партии на игрока. Возвращает описание эффекта.
        useWing(e, w, uid) {
            const I = D().WING_INFO[w]; if (!I || !I.use) fail('У этого крыла нет действия.');
            if (!wingActive(e, w)) fail('Крыло ещё не обставлено: нужно предметов крыла — ' + I.need + ' (стоит ' + wingCount(e, w) + ').');
            e.used = e.used || {}; const kk = w + '|' + uid; if (e.used[kk] === e.day) fail('Сегодня (день ' + e.day + ') ты уже пользовался этим крылом. Новый день наступит вместе с днём партии.');
            e.used[kk] = e.day; e.usedNow = I.use; return ['used'];
        },
        furn(e, t, x, y) {
            const F = D().FURN[t]; if (!F) fail('Неизвестная мебель.'); const k = key(x, y);
            if (!inb(e, x, y)) fail('Вне участка.'); if (e.furn[k]) fail('Клетка занята мебелью.');
            if (F.indoor) { if (e.build[k] !== 'floor') fail('«' + F.name + '» ставится на пол внутри дома.'); }
            else if (e._base) fail('«' + F.name + '» ставится на пол внутри дома.');
            else if (e.build[k] || e.found[k] || !passable(e, x, y)) fail('«' + F.name + '» ставится на открытую землю.');
            if (F.wing && e.wings.indexOf(F.wing) < 0) fail('Нужно крыло «' + D().WINGS[F.wing].name + '» (выберите его среди пяти крыльев).');
            if (F.limit && countFurn(e, t) >= F.limit) fail('«' + F.name + '»: не больше ' + F.limit + ' штук.');
            takeMats(e, F.mats); e.furn[k] = { t }; return ['stock', 'furn'];
        },
        plant(e, x, y, crop) {
            const k = key(x, y), f = e.furn[k]; if (!f || !D().FURN[f.t].plot) fail('Здесь нет грядки.');
            if (f.crop) fail('Грядка занята.'); if (!D().CROPS[crop]) fail('Это не посадить.');
            f.crop = { id: crop, at: e.day }; return ['furn'];
        },
        // Урожай с грядки: возвращает { name, qty } для сумки сборщика.
        harvest(e, x, y) {
            const k = key(x, y), f = e.furn[k]; if (!f || !f.crop) fail('На грядке ничего не растёт.');
            if (e.day - f.crop.at < D().GROW_DAYS) fail('Ещё не созрело: осталось ' + (D().GROW_DAYS - (e.day - f.crop.at)) + ' дн.');
            const out = { name: f.crop.id, qty: f.t === 'glassbed' ? D().YIELD_GLASSBED : D().YIELD_PLANTER };
            delete f.crop; e.harvested = out; return ['furn'];
        },
        storeCap(e) { return D().BASE_STORE_STACKS + D().CHEST_STACKS * countFurn(e, 'chest') + (wingActive(e, 'armory') ? (D().WING_INFO.armory.store || 0) : 0); },
        storeKey(name) { return String(name).replace(/[.\/\[\]*~]/g, '_'); },
        put(e, rec, qty) {
            const kk = R.storeKey(rec.itemId || rec.name);
            if (!e.store[kk] && Object.keys(e.store).length >= R.storeCap(e)) fail('Хранилище переполнено. Поставьте сундук.');
            if (!e.store[kk]) e.store[kk] = Object.assign({}, rec, { count: 0 });
            e.store[kk].count += qty; return ['store'];
        },
        take(e, kk, qty) {
            const r = e.store[kk]; if (!r || r.count < qty) fail('На складе столько нет.');
            const out = Object.assign({}, r, { count: qty }); r.count -= qty; if (r.count <= 0) delete e.store[kk]; e.taken = out; return ['store'];
        },
        brew(e) {
            const M = D().MEAD; if (!countFurn(e, 'hearth')) fail('Для медовухи нужен очаг в кухне.');
            const src = e.store[R.storeKey(M.in)]; if (!src || src.count < M.inQty) fail('Нужно мёда: ' + M.inQty + '.');
            R.take(e, R.storeKey(M.in), M.inQty); delete e.taken;
            R.put(e, { itemId: M.out, name: M.out, category: 'Напитки', weight: 1 }, M.outQty); return ['store'];
        },
        hire(e, role, kind) {
            const S = D().STAFF[role]; if (!S) fail('Нет такой должности.');
            if (e.staff[role] && role !== 'trader') fail('«' + S.name + '» уже нанят.');
            e.staff[role] = { since: e.day, paidUntil: e.day + 30, kind: kind || undefined }; return ['staff'];
        },
        pay(e, role) { const s = e.staff[role]; if (!s) fail('Он не нанят.'); s.paidUntil = Math.max(s.paidUntil, e.day) + 30; return ['staff']; },
        fire(e, role) { if (!e.staff[role]) fail('Он не нанят.'); delete e.staff[role]; return ['staff']; },
        // Выработка одного рабочего дня: стройка по очереди разметки.
        work(e, ref) {
            ref = ref || { cap: D().BASE_WORK + (e.staff.builder ? D().BUILDER_WORK : 0) }; let done = 0;
            Object.keys(e.plan).sort((a, b) => e.plan[a].n - e.plan[b].n).forEach(k => {
                if (ref.cap <= 0) return; const p = e.plan[k], cap = ref.cap;
                if (p.w <= cap + 1e-9) { ref.cap -= p.w; const P = D().PIECES[p.t]; (e[P.layer] = e[P.layer] || {})[k.replace('~r', '')] = P.layer === 'build' ? p.t : 1; delete e.plan[k]; done++; }
                else { p.w = Math.round((p.w - cap) * 100) / 100; ref.cap = 0; }
            });
            return done;
        },
        // Сутки: работа, увольнение неоплаченных, раз в неделю выработка хозяйства. Возвращает список событий.
        advance(e, days) {
            const ev = [];
            for (let i = 0; i < (days || 1); i++) {
                e.day++; const ref = { cap: D().BASE_WORK + (e.staff.builder ? D().BUILDER_WORK : 0) }; let n = 0;
                levelsOf(e).forEach(L => { n += withLevel(e, L, () => R.work(e, ref)); }); if (n) ev.push('Построено клеток: ' + n + '.');
                R.finishOrders(e, ev);
                Object.keys(e.staff).forEach(r => { if (e.staff[r].paidUntil < e.day) { ev.push(D().STAFF[r].name + ' ушёл: жалованье не продлено.'); delete e.staff[r]; } });
                if (e.day % 7 === 0) {
                    const add = {}, bump = (nm, q) => { add[nm] = (add[nm] || 0) + q; };
                    Object.keys(e.furn).forEach(k => { const F = D().FURN[e.furn[k].t]; if (F && F.weekly) Object.keys(F.weekly).forEach(nm => bump(nm, F.weekly[nm])); });
                    if (e.wings.indexOf('greenhouse') >= 0) Object.keys(D().GREENHOUSE_WEEKLY).forEach(nm => bump(nm, D().GREENHOUSE_WEEKLY[nm]));
                    if (Object.keys(e.furn).some(k => e.furn[k].t === 'mill')) { const wk = R.storeKey('Пшеница'), w = e.store[wk]; if (w && w.count > 0) { const q = Math.min(10, w.count); w.count -= q; if (w.count <= 0) delete e.store[wk]; bump('Мешок муки', q); } }
                    if (e.staff.farmhand) Object.keys(e.furn).forEach(k => { const f = e.furn[k]; if (f.crop && e.day - f.crop.at >= D().GROW_DAYS) { bump(f.crop.id, f.t === 'glassbed' ? D().YIELD_GLASSBED : D().YIELD_PLANTER); delete f.crop; } });
                    Object.keys(add).forEach(nm => { try { R.put(e, { itemId: nm, name: nm }, add[nm]); } catch (x) { ev.push('Не влезло в хранилище: ' + nm + ' ×' + add[nm] + '.'); } });
                    if (Object.keys(add).length) ev.push('Хозяйство за неделю: ' + Object.keys(add).map(nm => nm + ' ×' + add[nm]).join(', ') + '.');
                    if (e.staff.trader) { e.visitor = { kind: e.staff.trader.kind || 'general', day: e.day }; ev.push('Приехал торговец: ' + (D().TRADER_KINDS[e.visitor.kind] || e.visitor.kind) + '.'); }
                    if (e.staff.cook) ev.push('Повар приготовил обед (блюдо выдаёт мастер).');
                }
            }
            ev.forEach(t => pushLog(e, t)); return ev;
        },
        // Дни поместья = дни партии (sessions.gameDayCounter): догоняем счётчик сессии, не больше 90 суток за раз.
        sync(e, counter) {
            counter = parseInt(counter) || 0;
            if (e.dayBase == null) { e.dayBase = counter - (e.day || 0); return []; }
            const n = counter - e.dayBase - (e.day || 0); if (n <= 0) return [];
            return R.advance(e, Math.min(n, 90));
        },
        raid(e) {
            if (e.staff.steward || e.staff.guard) { pushLog(e, 'Воры сунулись в дом, но охрана их отогнала.'); return ['log']; }
            const ks = Object.keys(e.store), lost = [];
            for (let i = 0; i < 3 && ks.length; i++) { const k = ks.splice(Math.floor(Math.random() * ks.length), 1)[0]; lost.push(e.store[k].name || k); delete e.store[k]; }
            pushLog(e, lost.length ? 'Воры унесли: ' + lost.join(', ') + '.' : 'Воры нашли пустое хранилище.'); return ['store', 'log'];
        }
    };
    // ---------------- транзакции и общая часть ----------------
    const Tx = { runner: null };
    const FIELDS = ['day', 'found', 'build', 'roof', 'plan', 'planSeq', 'furn', 'stock', 'store', 'staff', 'visitor', 'log', 'wings', 'wingsLocked', 'dayBase', 'floors', 'orders', 'built', 'wingSlot', 'used'];
    function mutate(id, fn, fields, level) {
        level = Number(level) || 0; if (level && fields) fields = fields.concat(['floors']);
        const runner = Tx.runner || (window.CloudSync && window.CloudSync.estateTx);
        if (!runner) return Promise.reject(new Error('Не в сессии.'));
        let result = null;
        return runner(session => {
            const src = session.estates && session.estates[id]; if (!src) fail('Поместье не найдено.');
            const e = clone(src); e._counter = parseInt(session.gameDayCounter) || 0;
            ['found', 'build', 'roof', 'plan', 'furn', 'stock', 'store', 'staff', 'cells', 'tokens'].forEach(f => { e[f] = e[f] || {}; });
            e.floors = e.floors || {}; e.orders = e.orders || []; e.built = e.built || {}; e.wingSlot = e.wingSlot || {}; e.used = e.used || {};
            e.wings = e.wings || []; e.day = e.day || 0; e.planSeq = e.planSeq || 0; e.log = e.log || [];
            result = level ? withLevel(e, level, () => fn(e)) : fn(e); const patch = {};
            (fields || FIELDS).forEach(f => { patch['estates.' + id + '.' + f] = e[f] === undefined ? firebase.firestore.FieldValue.delete() : clone(e[f]); });
            result = { ret: result, est: e }; return patch;
        }).then(() => result);
    }
    const nowSession = () => (UI.data || {});
    const $ = id => document.getElementById(id);
    const UI = { sel: '', data: null, mode: 'walk', arg: '', showRoof: true, sig: '', drag: null, busy: false, lv: 0, lvTok: null };
    const PLN = () => window.ESTATE_PLANS || { PKG: {}, LEVELS: {}, priceOf: () => 0, nameOf: x => x };

    // ---------------- игрок ----------------
    function myUid() { return window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null; }
    function myEstates() {
        const me = myUid(), all = (UI.data && UI.data.estates) || {};
        return Object.keys(all).map(k => all[k]).filter(e => e && visibleTo(e, me)).sort((a, b) => (a.created || 0) - (b.created || 0));
    }
    function curEstate() { return myEstates().find(e => e.id === UI.sel) || null; }
    function namesOf() { const out = {}, p = (UI.data && UI.data.participants) || {}; Object.keys(p).forEach(u => { out[u] = p[u].name || p[u].charName || ''; }); return out; }
    const gold = () => parseInt(($('char-gold') || {}).value) || 0;
    function spend(n) { if (n > gold()) return false; $('char-gold').value = gold() - n; try { saveLocalStorage(true); } catch (e) { } return true; }
    function refund(n) { $('char-gold').value = gold() + n; try { saveLocalStorage(true); } catch (e) { } }
    function say(t, bad) { const i = $('estate-msg'); if (i) { i.textContent = t; i.style.color = bad ? '#e74c3c' : 'var(--accent-color)'; } }
    function run(p) { UI.busy = true; return p.catch(e => { say(e.message || String(e), true); throw e; }).finally(() => { UI.busy = false; }); }

    function fmtCost(c) { return costText(c); }
    function panelsHtml(e) {
        const d = D(), me = myUid();
        const matsHave = Object.keys(d.MATERIALS).map(m => (d.MATERIALS[m].icon + ' ' + d.MATERIALS[m].name + ': <b>' + (e.stock[m] || 0) + '</b>')).join(' · ');
        const shops = d.SHOPS.map(s => '<div style="margin:4px 0;"><b>' + esc(s.name) + '</b>: ' + s.mats.map(m => {
            const M = d.MATERIALS[m];
            return '<span style="display:inline-flex; gap:3px; align-items:center; margin:2px 6px 2px 0;">' + M.icon + ' ' + esc(M.name) + ' (' + M.price + ' зол.) <input type="number" id="estbuy-' + s.id + '-' + m + '" value="10" min="1" style="width:56px;"> <button style="width:auto; padding:2px 8px;" onclick="Estate.buyMat(\'' + m + '\',\'estbuy-' + s.id + '-' + m + '\')">Купить</button></span>';
        }).join('') + '</div>').join('');
        const tools = [['walk', '🚶 Ходить'], ['found', '▫️ Фундамент'], ['floor', '🟫 Пол'], ['wall', '🧱 Стена'], ['door', '🚪 Дверь'], ['window', '🪟 Окно'], ['roof', '🛖 Крыша'], ['demolish', '🔨 Снести'], ['cancel', '↩ Отменить разметку'], ['harvest', '🧺 Собрать'], ['sleep', '😴 Лечь спать']];
        const toolBtns = tools.map(t => '<button class="est-tool' + (UI.mode === t[0] ? ' active' : '') + '" style="width:auto; padding:3px 8px; margin:2px;' + (UI.mode === t[0] ? ' outline:2px solid var(--accent-color);' : '') + '" onclick="Estate.setMode(\'' + t[0] + '\')">' + t[1] + '</button>').join('');
        const furnOpts = Object.keys(d.FURN).map(k => { const F = d.FURN[k]; const locked = F.wing && e.wings.indexOf(F.wing) < 0; return '<option value="' + k + '"' + (UI.mode === 'furn' && UI.arg === k ? ' selected' : '') + '>' + F.icon + ' ' + esc(F.name) + ' — ' + F.gold + ' зол.' + (Object.keys(F.mats).length ? ' + ' + esc(fmtCost(F.mats)) : '') + (locked ? ' 🔒 ' + esc(d.WINGS[F.wing].name) : '') + '</option>'; }).join('');
        const cropOpts = Object.keys(d.CROPS).map(k => '<option value="' + esc(k) + '"' + (UI.mode === 'plant' && UI.arg === k ? ' selected' : '') + '>' + d.CROPS[k].icon + ' ' + esc(k) + '</option>').join('');
        const wingInfo = w => { const I = d.WING_INFO[w] || {}; return '<div style="font-size:12px; opacity:.75; margin:0 0 4px 22px;">' + esc(I.effect || '') + (I.need ? ' Нужно предметов крыла: ' + I.need + '.' : '') + '</div>'; };
        const me2 = myUid();
        const wingsHtml = e.wingsLocked ? e.wings.map(w => {
            const I = d.WING_INFO[w] || {}, on = wingActive(e, w), sl = (e.wingSlot || {})[w], slotName = sl != null && PLN().SLOTS && PLN().SLOTS[sl] ? PLN().SLOTS[sl].name : '';
            const used = (e.used || {})[w + '|' + me2] === e.day;
            return '<div style="padding:4px 0; border-bottom:1px solid var(--border-color);">' + d.WINGS[w].icon + ' <b>' + esc(d.WINGS[w].name) + '</b> — ' + (on ? '<span style="color:#2ecc71;">действует</span>' : '<span style="opacity:.7;">не обставлено (' + wingCount(e, w) + '/' + (I.need || 1) + ')</span>') + (slotName ? ' · место: ' + slotName : '') +
                (I.use && on ? ' <button style="width:auto; padding:1px 8px;"' + (used ? ' disabled' : '') + ' onclick="Estate.useWing(\'' + w + '\')">' + esc(I.use.label) + (used ? ' (сегодня уже)' : '') + '</button>' : '') +
                '<div style="font-size:12px; opacity:.75;">' + esc(I.effect || '') + '</div></div>';
        }).join('') :
            '<div>' + Object.keys(d.WINGS).map(w => '<label style="margin:0;"><input type="checkbox" class="est-wing" value="' + w + '"> ' + d.WINGS[w].icon + ' ' + esc(d.WINGS[w].name) + '</label>' + wingInfo(w)).join('') + '</div><button style="width:auto; margin-top:4px;" onclick="Estate.pickWings()">Выбрать крылья (до ' + d.MAX_WINGS + ', насовсем)</button>';
        const cap = R.storeCap(e), stacks = Object.keys(e.store);
        const storeRows = stacks.length ? stacks.map(k => '<div style="display:flex; justify-content:space-between; gap:6px; padding:2px 0; border-bottom:1px solid var(--border-color);"><span>' + esc(e.store[k].name || k) + ' ×' + e.store[k].count + '</span><button style="width:auto; padding:1px 8px;" onclick="Estate.takeItem(\'' + esc(k) + '\')">Взять</button></div>').join('') : '<span style="opacity:.6;">Пусто.</span>';
        let bag = '';
        try { bag = (typeof playerInventory !== 'undefined' ? playerInventory : []).filter(i => i && !String(i.itemId).endsWith('#stolen') && !i.equipped).map(i => '<option value="' + esc(i.itemId) + '">' + esc(i.name || i.itemId) + ' (×' + (i.count || 1) + ')</option>').join(''); } catch (x) { }
        const staffHtml = Object.keys(d.STAFF).map(r => {
            const S = d.STAFF[r], st = e.staff[r], left = st ? st.paidUntil - e.day : 0;
            const kindSel = r === 'trader' ? ' <select id="est-trader-kind">' + Object.keys(d.TRADER_KINDS).map(k => '<option value="' + k + '"' + (st && st.kind === k ? ' selected' : '') + '>' + esc(d.TRADER_KINDS[k]) + '</option>').join('') + '</select>' : '';
            return '<div style="padding:3px 0; border-bottom:1px solid var(--border-color);">' + S.icon + ' <b>' + esc(S.name) + '</b> — ' + S.wage + ' сеп./мес.' + kindSel + ' ' +
                (st ? '<span style="opacity:.8;">оплачено ещё ' + Math.max(0, left) + ' дн.</span> <button style="width:auto; padding:1px 8px;" onclick="Estate.payStaff(\'' + r + '\')">Продлить месяц</button> <button style="width:auto; padding:1px 8px;" onclick="Estate.fireStaff(\'' + r + '\')">Уволить</button>'
                    : '<button style="width:auto; padding:1px 8px;" onclick="Estate.hireStaff(\'' + r + '\')">Нанять</button>') +
                '<div style="font-size:12px; opacity:.7;">' + esc(S.desc) + '</div></div>';
        }).join('');
        const plots = Object.keys(e.furn).filter(k => e.furn[k].crop).map(k => { const f = e.furn[k], left = d.GROW_DAYS - (e.day - f.crop.at); return esc(f.crop.id) + (left > 0 ? ' (ещё ' + left + ' дн.)' : ' ✨ созрело'); }).join(', ');
        const log = (e.log || []).slice(-6).reverse().map(l => '<div style="font-size:12px; opacity:.8;">День ' + l.d + ': ' + esc(l.t) + '</div>').join('');
        const queue = Object.keys(e.plan).length;
        const PL = PLN(), kindNow = e.kind === 'house' ? 'house' : 'manor', hasSt = !!e.staff.steward;
        const svc = Object.keys(PL.PKG).filter(id => PL.PKG[id].kind === kindNow && (!PL.PKG[id].wing || e.wings.indexOf(PL.PKG[id].wing) >= 0)).map(id => {
            const P = PL.PKG[id], done = !!(e.built || {})[id], ord = (e.orders || []).find(o => o.id === id), price = PL.priceOf(e, id);
            let need = ''; if (P.need) { if (P.need.indexOf('wing:') === 0) { if (e.wings.indexOf(P.need.slice(5)) < 0) need = 'нужно крыло «' + d.WINGS[P.need.slice(5)].name + '»'; } else if (!(e.built || {})[P.need]) need = 'сначала: ' + PL.nameOf(P.need); }
            const st = done ? '<span style="color:#2ecc71;">✔ построено</span>' : ord ? '<span style="color:#e6a23c;">⏳ строится, осталось дней партии: ' + ord.left + '</span>' : need ? '<span style="opacity:.7;">🔒 ' + esc(need) + '</span>' : '<button style="width:auto; padding:1px 8px;"' + (hasSt ? '' : ' disabled title="нужен управляющий"') + ' onclick="Estate.order(\'' + id + '\')">Заказать — ' + price + ' зол.</button>';
            return '<div style="padding:4px 0; border-bottom:1px solid var(--border-color);"><b>' + esc(PL.nameOf(id)) + '</b> · ' + P.days + ' дн. · ' + st + '<div style="font-size:12px; opacity:.75;">' + esc(P.desc || ((d.WINGS[P.wing] || {}).name ? 'Крыло «' + d.WINGS[P.wing].name + '» целиком: стены, крыша, двери и обстановка по месту.' : '')) + '</div></div>';
        }).join('');
        const stewardHtml = '<details open class="panel" style="margin:6px 0;"><summary><b>Услуги управляющего</b> ' + (hasSt ? '' : '<span style="opacity:.7;">(сначала наймите его в «Персонале»)</span>') + '</summary><div style="font-size:12px; opacity:.75; margin:4px 0;">Готовые постройки и обстановка за золото, без материалов со склада. Строится сама, пока идут дни партии. Можно строить и самим руками — как раньше.</div>' + svc + '</details>';
        const lvBar = '<div style="margin:4px 0;">Этаж: ' + [-1, 0, 1].map(L => '<button style="width:auto; padding:3px 10px; margin:2px;' + (UI.lv === L ? ' outline:2px solid var(--accent-color);' : '') + '" onclick="Estate.setLevel(' + L + ')">' + esc(PL.LEVELS[String(L)] || L) + '</button>').join('') + '</div>';
        return '<div id="estate-msg" style="min-height:18px; font-size:13px; margin:4px 0;"></div>' + lvBar + stewardHtml +
            '<div class="panel" style="margin:6px 0;"><b>Режим</b><div>' + toolBtns + '</div>' +
            '<div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;"><select id="est-furn" style="flex:2 1 220px;"><option value="">🪑 Поставить мебель…</option>' + furnOpts + '</select><button style="width:auto;" onclick="Estate.setFurnMode()">Ставить</button>' +
            '<select id="est-crop" style="flex:1 1 130px;"><option value="">🌱 Посадить…</option>' + cropOpts + '</select><button style="width:auto;" onclick="Estate.setPlantMode()">Сажать</button>' +
            '<button style="width:auto;" onclick="Estate.toggleRoof()">' + (UI.showRoof ? 'Скрыть крышу' : 'Показать крышу') + '</button></div></div>' +
            '<details open class="panel" style="margin:6px 0;"><summary><b>Склад материалов и магазины</b></summary><div style="margin:6px 0;">' + matsHave + '</div>' + shops +
            '<div style="font-size:12px; opacity:.75;">Разметка: ' + queue + ' клеток ждёт работы. В сутки отряд делает ' + (d.BASE_WORK + (e.staff.builder ? d.BUILDER_WORK : 0)) + ' рабочих дней (строитель +' + d.BUILDER_WORK + '). Каждый новый день партии стройка двигается сама. Стройка дороже в ×' + (e.costMult || 1) + '. День поместья: ' + e.day + '.</div>' +
            '<div style="font-size:12px; opacity:.75;">Цена детали на клетку: ' + Object.keys(d.PIECES).map(p => d.PIECES[p].name + ' — ' + esc(fmtCost(costOf(e, d.PIECES[p].cost, 1)))).join('; ') + '.</div></details>' +
            '<details class="panel" style="margin:6px 0;"><summary><b>Крылья</b> (' + (e.wingsLocked ? e.wings.length : 0) + '/' + d.MAX_WINGS + ')</summary>' + wingsHtml + '</details>' +
            '<details class="panel" style="margin:6px 0;"><summary><b>Хранилище</b> (' + stacks.length + '/' + cap + ' мест)</summary>' + storeRows +
            '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;"><select id="est-put-item" style="flex:2 1 160px;">' + bag + '</select><input type="number" id="est-put-qty" value="1" min="1" style="width:60px;"><button style="width:auto;" onclick="Estate.putItem()">Положить</button><button style="width:auto;" onclick="Estate.brew()">🍯 Сварить медовуху (2 мёда → 1)</button></div></details>' +
            '<details class="panel" style="margin:6px 0;"><summary><b>Огород и хозяйство</b></summary><div>Растёт: ' + (plots || 'ничего') + '</div><div style="font-size:12px; opacity:.75;">Сажай через режим «Сажать» на грядку, собирай через «Собрать». Рост ' + d.GROW_DAYS + ' дней. Раз в неделю: улей — мёд, курятник — яйца, коровник — молоко, мельница — мука, теплица — лаванда.</div></details>' +
            '<details class="panel" style="margin:6px 0;"><summary><b>Персонал</b></summary>' + staffHtml + (e.visitor ? '<div style="margin-top:6px;">🧳 На этой неделе приехал: <b>' + esc(d.TRADER_KINDS[e.visitor.kind] || e.visitor.kind) + '</b> (договорись с мастером о торговле).</div>' : '') + '</details>' +
            '<div>' + log + '</div>';
    }
    function sigOf(e) {
        return JSON.stringify([UI.lv, e.orders, e.built, e.used, e.wingSlot, e.day, e.stock, e.store, e.wings, e.wingsLocked, e.staff, Object.keys(e.plan || {}).length, Object.keys(e.furn || {}).map(k => k + (e.furn[k].t) + (e.furn[k].crop ? e.furn[k].crop.at : '')).join(), e.visitor, (e.log || []).length, UI.mode, UI.arg, UI.showRoof]);
    }
    function renderPlayer() {
        const box = $('estate-box'); if (!box) return;
        const list = myEstates();
        if (!list.length) { box.innerHTML = '<p style="opacity:.7;">У вашего отряда пока нет поместья. Его открывает мастер.</p>'; return; }
        if (!list.some(e => e.id === UI.sel)) UI.sel = list[0].id;
        const est = list.find(e => e.id === UI.sel), me = myUid();
        ['found', 'build', 'roof', 'plan', 'furn', 'stock', 'store', 'staff', 'floors', 'built', 'used', 'wingSlot'].forEach(f => { est[f] = est[f] || {}; }); est.wings = est.wings || []; est.day = est.day || 0; est.orders = est.orders || [];
        { const tk = est.tokens && est.tokens[me], tl = tk ? Number(tk.l) || 0 : 0; if (UI.lvTok !== tl) { UI.lvTok = tl; UI.lv = tl; } }
        if (!$('estate-canvas')) {
            box.innerHTML = '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;"><select id="estate-select" onchange="Estate.pick(this.value)"></select>' +
                '<span id="estate-info" style="font-size:13px; opacity:.8;"></span></div>' +
                '<div style="overflow:auto; max-height:70vh; border:1px solid var(--border-color);"><canvas id="estate-canvas" style="display:block; cursor:pointer;"></canvas></div>' +
                '<div id="estate-who" style="font-size:12px; opacity:.75; margin:4px 0;"></div><div id="estate-panels"></div>';
            const cv = $('estate-canvas');
            cv.addEventListener('pointerdown', ev => Estate.down(ev));
            cv.addEventListener('pointermove', ev => Estate.move(ev));
            window.addEventListener('pointerup', ev => Estate.up(ev));
        }
        $('estate-select').innerHTML = list.map(e => '<option value="' + esc(e.id) + '"' + (e.id === UI.sel ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('');
        const t = est.tokens && est.tokens[me];
        $('estate-info').textContent = t ? 'Ты на клетке ' + t.x + ':' + t.y + ', ' + String(PLN().LEVELS[String(Number(t.l) || 0)] || 'этаж').toLowerCase() + '. Режим «Ходить»: нажми на клетку; чтобы подняться или спуститься, дойди до лестницы.' : 'Тебя нет в поместье: нажми «Войти».';
        let enter = $('estate-enter');
        if (!t && !enter) { enter = document.createElement('button'); enter.id = 'estate-enter'; enter.textContent = 'Войти в поместье'; enter.style.cssText = 'width:auto; margin:4px 0;'; enter.onclick = () => Estate.enter(); $('estate-info').after(enter); }
        if (t && enter) enter.remove();
        const nm = namesOf();
        $('estate-who').textContent = 'Здесь: ' + (Object.keys(est.tokens || {}).map(u => nm[u] || '?').join(', ') || 'никого');
        const sg = est.id + sigOf(est);
        if (sg !== UI.sig) { UI.sig = sg; const msg = $('estate-msg') ? $('estate-msg').textContent : ''; $('estate-panels').innerHTML = panelsHtml(est); if (msg && $('estate-msg')) $('estate-msg').textContent = msg; }
        $('estate-canvas').style.touchAction = UI.mode === 'walk' ? 'auto' : 'none';
        paint(est, UI.drag ? UI.drag.cells : null);
    }
    // Рисует вид текущего этажа; на верхних и нижних этажах контур первого этажа виден бледным следом.
    function paint(est, sel) {
        const cv = $('estate-canvas'); if (!cv || !est) return;
        draw(cv, view(est, UI.lv), { cs: 14, me: myUid(), names: namesOf(), showRoof: UI.showRoof, sel: sel || null, level: UI.lv, ghost: UI.lv ? est : null });
    }
    function write(patch) { return window.CloudSync && window.CloudSync.estateWrite ? window.CloudSync.estateWrite(patch) : Promise.reject(new Error('Не в сессии.')); }
    const BUILD_MODES = ['found', 'floor', 'wall', 'door', 'window', 'roof', 'demolish', 'cancel'];
    function addItemToBag(name, qty, extra) {
        const base = (typeof allItems !== 'undefined' ? allItems : []).find(i => i.name === name) || {};
        addToInventory(name, name, qty, base.weight || 0.1, base.category || '', '', extra && extra.rest || undefined);
    }
    const Estate = window.Estate = {
        make, preset, typeAt, passable, spawnCell, reach, draw, view, withLevel, getLevel, levelsOf, wingActive, wingCount, countFurn, cellFromEvent, visibleTo, terrain, PAINT, key, tokenColor, R, mutate, costOf, costText, clone,
        setRunner(fn) { Tx.runner = fn; },
        onSession(d) { UI.data = d; Estate.autoSync(d); try { renderPlayer(); } catch (e) { console.error(e); } },
        // Любой клиент (игрок или мастер) подтягивает дни поместья к дню партии; транзакция следит, чтобы день не посчитался дважды.
        autoSync(d) {
            const all = (d && d.estates) || {}, counter = parseInt(d && d.gameDayCounter) || 0; UI.synced = UI.synced || {};
            Object.keys(all).forEach(id => {
                const e = all[id]; if (!e) return;
                const need = e.dayBase == null || counter - e.dayBase > (e.day || 0); if (!need) return;
                const tag = id + ':' + counter + ':' + (e.day || 0) + ':' + (e.dayBase == null ? 'n' : 'b'); if (UI.synced[tag]) return; UI.synced[tag] = 1;
                mutate(id, x => R.sync(x, x._counter)).catch(() => { });
            });
        },
        render() { UI.sig = ''; renderPlayer(); },
        redraw() { const e = curEstate(); if (e && $('estate-canvas')) paint(e, UI.drag ? UI.drag.cells : null); },
        pick(id) { UI.sel = id; UI.sig = ''; renderPlayer(); },
        setMode(m) { UI.mode = m; UI.arg = ''; UI.sig = ''; renderPlayer(); },
        setFurnMode() { const v = $('est-furn').value; if (!v) return; UI.mode = 'furn'; UI.arg = v; UI.sig = ''; renderPlayer(); },
        setPlantMode() { const v = $('est-crop').value; if (!v) return; UI.mode = 'plant'; UI.arg = v; UI.sig = ''; renderPlayer(); },
        toggleRoof() { UI.showRoof = !UI.showRoof; UI.sig = ''; renderPlayer(); },
        enter() {
            const est = curEstate(), me = myUid(); if (!est || !me) return;
            const s = spawnCell(est, 1, 1);
            write({ ['estates.' + est.id + '.tokens.' + me]: s }).catch(e => alert('Ошибка: ' + e.message));
        },
        down(ev) {
            const est = curEstate(), me = myUid(); if (!est || !me) return;
            const cell = cellFromEvent($('estate-canvas'), est, ev); if (!cell) return;
            if (UI.mode === 'walk') return Estate.walk(est, me, cell);
            if (BUILD_MODES.indexOf(UI.mode) >= 0) { ev.preventDefault(); UI.drag = { cells: [[cell.x, cell.y]] }; paint(est, UI.drag.cells); return; }
            Estate.cellAction(est, cell);
        },
        move(ev) {
            if (!UI.drag) return; const est = curEstate(); if (!est) return;
            const cell = cellFromEvent($('estate-canvas'), est, ev); if (!cell) return;
            if (!UI.drag.cells.some(c => c[0] === cell.x && c[1] === cell.y)) { UI.drag.cells.push([cell.x, cell.y]); paint(est, UI.drag.cells); }
        },
        up() {
            if (!UI.drag) return; const cells = UI.drag.cells; UI.drag = null; const est = curEstate(); if (!est) return;
            const op = UI.mode, id = est.id;
            run(mutate(id, e => op === 'demolish' ? R.demolish(e, cells) : op === 'cancel' ? R.cancel(e, cells) : R.place(e, op, cells), undefined, UI.lv))
                .then(() => say(op === 'demolish' ? 'Снесено.' : op === 'cancel' ? 'Разметка отменена.' : 'Размечено клеток: ' + cells.length + '. Ждёт рабочего дня.')).catch(() => { });
        },
        walk(est, me, cell) {
            const t = est.tokens && est.tokens[me]; if (!t) return;
            const tl = Number(t.l) || 0;
            if (tl !== UI.lv) { UI.lv = tl; UI.sig = ''; renderPlayer(); return; }
            const v = view(est, tl);
            if (reach(v, t, cell) == null) { const i = $('estate-info'); if (i) i.textContent = 'Туда не пройти.'; return; }
            const k = key(cell.x, cell.y), f = v.furn[k], F = f && D().FURN[f.t];
            let to = { x: cell.x, y: cell.y, l: tl }, note = '';
            if (F && F.stair) {
                const L2 = tl + F.stair, o = getLevel(est, L2), g = o.furn[k], G2 = g && D().FURN[g.t];
                if (G2 && G2.stair === -F.stair && (L2 === 0 || o.build[k] === 'floor')) { to.l = L2; note = 'Ты ' + (F.stair > 0 ? 'поднялся' : 'спустился') + ': ' + (PLN().LEVELS[String(L2)] || 'этаж') + '.'; }
                else note = 'Эта лестница пока никуда не ведёт.';
            }
            write({ ['estates.' + est.id + '.tokens.' + me]: to }).then(() => { if (note) say(note, /никуда/.test(note)); }).catch(e => alert('Ошибка: ' + e.message));
        },
        setLevel(L) { UI.lv = Number(L) || 0; UI.sig = ''; renderPlayer(); },
        order(id) {
            const est = curEstate(); if (!est) return; const PL = PLN(), price = PL.priceOf(est, id);
            if (!confirm(PL.nameOf(id) + ': ' + price + ' золота, строится ' + PL.PKG[id].days + ' дн. партии. Заказать?')) return;
            if (!spend(price)) { say('Не хватает золота: нужно ' + price + '.', true); return; }
            run(mutate(est.id, e => R.order(e, id), ['orders', 'log'])).then(() => say('Заказано: ' + PL.nameOf(id) + '. Управляющий построит за ' + PL.PKG[id].days + ' дн. партии.')).catch(() => refund(price));
        },
        useWing(w) {
            const est = curEstate(), me = myUid(); if (!est || !me) return; const I = D().WING_INFO[w], t = est.tokens && est.tokens[me];
            if (!t) { say('Сначала войди в поместье.', true); return; }
            const fm = getLevel(est, Number(t.l) || 0).furn;
            const near = Object.keys(fm).some(k => { if (fm[k].t !== I.use.furn) return false; const q = k.split('_').map(Number); return Math.max(Math.abs(q[0] - t.x), Math.abs(q[1] - t.y)) <= 1; });
            if (!near) { say('Подойди к предмету: ' + D().FURN[I.use.furn].name + ' (в соседнюю клетку, на нужном этаже).', true); return; }
            run(mutate(est.id, e => R.useWing(e, w, me), ['used'])).then(() => {
                try { pushOrRefreshTimedEffect({ id: I.use.id, name: I.use.name, effectName: I.use.name, turnsRemaining: Infinity, perRound: false, hp: 0, mp: 0, value: 0, description: I.use.desc }); renderActiveEffects(); saveLocalStorage(true); } catch (x) { console.error(x); }
                say('Эффект «' + I.use.name + '» получен до следующего сна.');
            }).catch(() => { });
        },
        click(ev) { Estate.down(ev); },
        cellAction(est, cell) {
            const id = est.id;
            if (UI.mode === 'furn') {
                const F = D().FURN[UI.arg]; if (!F) return;
                if (!spend(F.gold)) { say('Не хватает золота: нужно ' + F.gold + '.', true); return; }
                run(mutate(id, e => R.furn(e, UI.arg, cell.x, cell.y), undefined, UI.lv)).then(() => say('Поставлено: ' + F.name + '.')).catch(() => refund(F.gold));
            } else if (UI.mode === 'plant') {
                run(mutate(id, e => R.plant(e, cell.x, cell.y, UI.arg), undefined, UI.lv)).then(() => say('Посажено: ' + UI.arg + '. Созреет через ' + D().GROW_DAYS + ' дней.')).catch(() => { });
            } else if (UI.mode === 'harvest') {
                run(mutate(id, e => R.harvest(e, cell.x, cell.y), undefined, UI.lv)).then(r => { const h = r.est.harvested; addItemToBag(h.name, h.qty); say('Собрано: ' + h.name + ' ×' + h.qty + ' (в сумке).'); }).catch(() => { });
            } else if (UI.mode === 'sleep') {
                const me = myUid(), t = est.tokens && est.tokens[me]; if (!t) { say('Сначала войди в поместье.', true); return; }
                const near = Object.keys(getLevel(est, Number(t.l) || 0).furn || {}).some(k => { const f = getLevel(est, Number(t.l) || 0).furn[k]; if (f.t !== 'bed') return false; const [x, y] = k.split('_').map(Number); return Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) <= 1; });
                if (!near) { say('Подойди к кровати (в соседнюю клетку).', true); return; }
                try { pushOrRefreshTimedEffect({ id: 'eff-wellrested', name: 'Выспался', effectName: 'Выспался', turnsRemaining: Infinity, perRound: false, hp: 0, mp: 0, value: 0, description: '😴 +10% к получаемому опыту до следующего сна (мастер учитывает при наградах).' }); renderActiveEffects(); saveLocalStorage(true); } catch (e) { console.error(e); }
                say('Ты выспался: +10% опыта до следующего сна.');
            }
        },
        buyMat(mat, inputId) {
            const est = curEstate(); if (!est) return; const q = Math.max(1, parseInt(($(inputId) || {}).value) || 0), M = D().MATERIALS[mat], cost = M.price * q;
            if (!spend(cost)) { say('Не хватает золота: нужно ' + cost + '.', true); return; }
            run(mutate(est.id, e => R.buy(e, mat, q), ['stock'])).then(() => say('Куплено: ' + M.name + ' ×' + q + ' за ' + cost + ' зол. (на складе поместья).')).catch(() => refund(cost));
        },
        pickWings() {
            const est = curEstate(); if (!est) return; const list = Array.prototype.map.call(document.querySelectorAll('.est-wing:checked'), c => c.value);
            if (!confirm('Выбрать крылья: ' + list.map(w => D().WINGS[w].name).join(', ') + '? Потом изменить их сможет только мастер.')) return;
            run(mutate(est.id, e => R.wings(e, list), ['wings', 'wingsLocked'])).then(() => say('Крылья выбраны.')).catch(() => { });
        },
        putItem() {
            const est = curEstate(); if (!est) return; const id = ($('est-put-item') || {}).value, q = Math.max(1, parseInt(($('est-put-qty') || {}).value) || 1); if (!id) return;
            const it = playerInventory.find(i => i.itemId === id); if (!it || (it.count || 1) < q) { say('В сумке столько нет.', true); return; }
            const rec = { itemId: it.itemId, name: it.name || it.itemId, category: it.category || '', weight: it.weight || 0 };
            removeFromInventoryByName(id, q);
            run(mutate(est.id, e => R.put(e, rec, q), ['store'])).then(() => say('Положено в хранилище: ' + rec.name + ' ×' + q + '.')).catch(() => addToInventory(rec.itemId, rec.name, q, rec.weight, rec.category));
        },
        takeItem(k) {
            const est = curEstate(); if (!est) return; const have = est.store[k]; if (!have) return;
            const q = Math.min(have.count, parseInt(prompt('Сколько взять? (есть ' + have.count + ')', '1')) || 0); if (q < 1) return;
            run(mutate(est.id, e => R.take(e, k, q), ['store'])).then(r => { const t = r.est.taken; addToInventory(t.itemId || t.name, t.name, q, t.weight || 0.1, t.category || ''); say('Взято: ' + t.name + ' ×' + q + '.'); }).catch(() => { });
        },
        brew() { const est = curEstate(); if (!est) return; run(mutate(est.id, e => R.brew(e), ['store'])).then(() => say('Сварили медовуху.')).catch(() => { }); },
        hireStaff(role) {
            const est = curEstate(); if (!est) return; const S = D().STAFF[role], kind = role === 'trader' ? ($('est-trader-kind') || {}).value : undefined;
            if (!spend(S.wage)) { say('Не хватает золота на первый месяц: ' + S.wage + '.', true); return; }
            run(mutate(est.id, e => R.hire(e, role, kind), ['staff'])).then(() => say('Нанят: ' + S.name + '.')).catch(() => refund(S.wage));
        },
        payStaff(role) {
            const est = curEstate(); if (!est) return; const S = D().STAFF[role];
            if (!spend(S.wage)) { say('Не хватает золота: ' + S.wage + '.', true); return; }
            run(mutate(est.id, e => R.pay(e, role), ['staff'])).then(() => say('Жалованье продлено на месяц.')).catch(() => refund(S.wage));
        },
        fireStaff(role) { const est = curEstate(); if (!est || !confirm('Уволить?')) return; run(mutate(est.id, e => R.fire(e, role), ['staff'])).catch(() => { }); }
    };
    if (window.CloudSync) { /* бегунок подключается в cloud.js через Estate.setRunner */ }
    window.EstateEsc = esc;
})();
