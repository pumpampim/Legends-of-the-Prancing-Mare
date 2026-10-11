// Схематичная карта Скайрима: 9 владений на материке + остров Схолстейм.
// Это СХЕМА, не карта в масштабе: границы и положение городов условные.
// Модуль самодостаточный (не зависит от holds-data.js): используется у игроков (index.html),
// у мастера (gm.html) и в справочнике владений (holds.html).
(function () {
    const W = 1100, H = 800;
    const HOLDS = {
        'Солитьюд (Хаафингар)': { short: 'Хаафингар', fill: '#5b6b7a', label: [205, 240],
            poly: [[90, 150], [150, 95], [250, 75], [335, 100], [325, 235], [325, 300], [255, 295], [165, 300], [100, 255], [60, 205]] },
        'Хьялмарк (Морфал)': { short: 'Хьялмарк', fill: '#4f6b55', label: [385, 200],
            poly: [[335, 100], [425, 90], [440, 175], [430, 285], [375, 335], [325, 300], [325, 235]] },
        'Белый берег (Данстар)': { short: 'Белый берег', fill: '#6f7f8f', label: [525, 185],
            poly: [[425, 90], [545, 65], [625, 110], [610, 230], [525, 275], [430, 285], [440, 175]] },
        'Винтерхолд': { short: 'Винтерхолд', fill: '#7d8da1', label: [745, 90],
            poly: [[625, 110], [705, 60], [860, 45], [935, 105], [905, 170], [785, 200], [700, 190], [640, 235], [610, 230]] },
        'Истмарк (Виндхельм)': { short: 'Истмарк', fill: '#7a6a5a', label: [845, 345],
            poly: [[640, 235], [700, 190], [785, 200], [905, 170], [925, 260], [905, 355], [800, 385], [700, 345], [665, 405], [645, 300]] },
        'Вайтран': { short: 'Вайтран', fill: '#8a7a45', label: [525, 410],
            poly: [[430, 285], [525, 275], [610, 230], [640, 235], [645, 300], [665, 405], [600, 465], [500, 475], [430, 435], [410, 350], [375, 335]] },
        'Маркарт (Предел)': { short: 'Предел', fill: '#7a5a48', label: [170, 420],
            poly: [[60, 205], [100, 255], [165, 300], [255, 295], [325, 300], [375, 335], [410, 350], [430, 435], [380, 475], [300, 505], [200, 545], [100, 525], [50, 425], [40, 320]] },
        'Фолкрит': { short: 'Фолкрит', fill: '#3f6b4a', label: [430, 575],
            poly: [[430, 435], [500, 475], [600, 465], [620, 545], [590, 650], [470, 705], [350, 685], [250, 625], [200, 545], [300, 505], [380, 475]] },
        'Рифт': { short: 'Рифт', fill: '#9a6b3a', label: [780, 520],
            poly: [[600, 465], [665, 405], [700, 345], [800, 385], [905, 355], [945, 455], [905, 585], [825, 645], [700, 650], [590, 650], [620, 545]] },
        'Схолстейм': { short: 'Схолстейм', fill: '#6a5a7a', label: [1025, 175], island: true,
            poly: [[975, 215], [1010, 190], [1060, 200], [1085, 245], [1060, 295], [1000, 305], [970, 262]] }
    };
    // Города и поселения: [x, y]. Положение условное.
    const SETTLE = {
        'Вайтран': { 'Вайтран': [540, 360], 'Ривервуд': [520, 448], 'Рорикстед': [448, 392] },
        'Винтерхолд': { 'Винтерхолд': [840, 112] },
        'Рифт': { 'Рифтен': [850, 548], 'Айварстед': [680, 525], 'Камень Шора': [775, 435], 'Деревня Лесная': [800, 605] },
        'Фолкрит': { 'Фолкрит': [425, 610] },
        'Солитьюд (Хаафингар)': { 'Солитьюд': [190, 168], 'Драконий Мост': [268, 262] },
        'Хьялмарк (Морфал)': { 'Морфал': [385, 248] },
        'Истмарк (Виндхельм)': { 'Виндхельм': [815, 268], 'Порт Виндхельма': [880, 215], 'Пригород Виндхельма': [780, 305], 'Роща Кин': [735, 318], 'Чёрный Брод': [755, 240] },
        'Белый берег (Данстар)': { 'Данстар': [545, 100], 'Окрестности Данстара': [575, 155] },
        'Маркарт (Предел)': { 'Маркарт': [130, 432], 'Картвастен': [208, 352] },
        'Схолстейм': { 'Рейвен-Рок (Бастион)': [1002, 272], 'Деревня Скаалов': [1040, 218], 'Тель-Митрин': [1060, 262] }
    };
    const CAT_COLORS = [
        [/метка для игроков/i, '#e74c3c'],
        [/пещер/i, '#b08968'], [/логов.*дракон|дракон/i, '#c0392b'], [/форт/i, '#d35400'], [/шахт/i, '#f1c40f'],
        [/руин|башн|гробниц|захорон|храм/i, '#aab7c4'], [/камн/i, '#3498db'], [/лагер/i, '#6ab04c'],
        [/даэдр/i, '#a569bd'], [/корабл|доки|пристан|маяк/i, '#48c9b0']
    ];
    // Картинки владений (карты с вики) — в приближении вместо схемы. Размер — после обрезки полей.
    // settle: точные положения столиц/городов НА КАРТИНКЕ (доли ширины/высоты); остальные поселения ставятся приближённо.
    const IMG = {
        'Истмарк (Виндхельм)': { src: 'maps/eastmarch.webp', w: 911, h: 818, settle: { 'Виндхельм': [0.393, 0.1589] } },
        'Фолкрит': { src: 'maps/falkreath.webp', w: 951, h: 612, settle: { 'Фолкрит': [0.4227, 0.6307] } },
        'Солитьюд (Хаафингар)': { src: 'maps/haafingar.webp', w: 949, h: 598, settle: { 'Солитьюд': [0.7387, 0.6488] } },
        'Хьялмарк (Морфал)': { src: 'maps/hjaalmarch.webp', w: 935, h: 906, settle: { 'Морфал': [0.6011, 0.5541] } },
        'Маркарт (Предел)': { src: 'maps/reach.webp', w: 834, h: 925, settle: { 'Маркарт': [0.0719, 0.6486] } },
        'Рифт': { src: 'maps/rift.webp', w: 990, h: 647, settle: { 'Рифтен': [0.7596, 0.5873] } },
        'Белый берег (Данстар)': { src: 'maps/pale.webp', w: 828, h: 941, settle: { 'Данстар': [0.4601, 0.356] } },
        'Вайтран': { src: 'maps/whiterun.webp', w: 954, h: 508, settle: { 'Вайтран': [0.6258, 0.315] } },
        'Винтерхолд': { src: 'maps/winterhold.webp', w: 899, h: 789, settle: { 'Винтерхолд': [0.4761, 0.5108] } },
        'Схолстейм': { src: 'maps/solstheim.webp', w: 800, h: 970, settle: { 'Рейвен-Рок (Бастион)': [0.2725, 0.7299], 'Деревня Скаалов': [0.7625, 0.3247], 'Тель-Митрин': [0.79, 0.799] } }
    };
    // Основные дороги между поселениями (схема) и морской путь. Названия — как в SETTLE.
    const ROADS = [
        ['Солитьюд', 'Драконий Мост'], ['Драконий Мост', 'Морфал'], ['Морфал', 'Вайтран'],
        ['Вайтран', 'Рорикстед'], ['Рорикстед', 'Картвастен'], ['Картвастен', 'Маркарт'],
        ['Вайтран', 'Ривервуд'], ['Ривервуд', 'Фолкрит'], ['Ривервуд', 'Айварстед'], ['Айварстед', 'Рифтен'],
        ['Вайтран', 'Данстар'], ['Данстар', 'Окрестности Данстара'], ['Данстар', 'Винтерхолд'],
        ['Вайтран', 'Роща Кин'], ['Роща Кин', 'Пригород Виндхельма'], ['Пригород Виндхельма', 'Виндхельм'],
        ['Виндхельм', 'Чёрный Брод'], ['Виндхельм', 'Порт Виндхельма'], ['Виндхельм', 'Винтерхолд'],
        ['Виндхельм', 'Камень Шора'], ['Камень Шора', 'Рифтен'], ['Рифтен', 'Деревня Лесная'],
        ['Рейвен-Рок (Бастион)', 'Деревня Скаалов'], ['Рейвен-Рок (Бастион)', 'Тель-Митрин']
    ];
    const SEA = [['Порт Виндхельма', 'Рейвен-Рок (Бастион)']];
    function catColor(cat) { for (const [re, c] of CAT_COLORS) if (re.test(cat || '')) return c; return '#d0d3d4'; }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function ptsStr(p) { return p.map(q => q.join(',')).join(' '); }
    function bbox(poly) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        poly.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
        return { x0, y0, x1, y1 };
    }
    function inPoly(x, y, poly) {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i], [xj, yj] = poly[j];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
        }
        return c;
    }
    function holdAt(x, y) { for (const k in HOLDS) if (inPoly(x, y, HOLDS[k].poly)) return k; return null; }

    // ---------- Картинка владения: система координат ----------
    // Положения хранятся в «схематичных» координатах всей карты (x, y), а для картинки владения — ещё и долями картинки (u, v).
    // Картинка покрывает рамку владения целиком с сохранением пропорций (расстояния одинаковы по обеим осям): любая точка схемы внутри владения попадает на картинку.
    function frame(hold) {
        const im = IMG[hold], b = bbox(HOLDS[hold].poly);
        return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s: Math.max((b.x1 - b.x0) * 1.05 / im.w, (b.y1 - b.y0) * 1.05 / im.h), im };
    }
    function toLocal(hold, x, y) { const f = frame(hold); return { u: 0.5 + (x - f.cx) / (f.s * f.im.w), v: 0.5 + (y - f.cy) / (f.s * f.im.h) }; }
    function toGlobal(hold, u, v) { const f = frame(hold); return { x: f.cx + (u - 0.5) * f.s * f.im.w, y: f.cy + (v - 0.5) * f.s * f.im.h }; }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    // положение объекта p (с x,y и, возможно, u,v,hold) на картинке владения zoom
    function localOf(zoom, p) {
        if (p.u != null && p.v != null && (!p.hold || p.hold === zoom)) return { u: p.u, v: p.v };
        const im = IMG[zoom];
        if (p.name && im && im.settle && im.settle[p.name] && (!p.hold || p.hold === zoom)) return { u: im.settle[p.name][0], v: im.settle[p.name][1] };
        return toLocal(zoom, p.x, p.y);
    }
    function settleLocal(hold, name) {
        const im = IMG[hold];
        if (im && im.settle && im.settle[name]) return { u: im.settle[name][0], v: im.settle[name][1], exact: true };
        const c = SETTLE[hold][name], l = toLocal(hold, c[0], c[1]);
        return { u: clamp(l.u, 0.03, 0.97), v: clamp(l.v, 0.03, 0.97), approx: true };
    }

    // ---------- Туман войны ----------
    // fog: { on, holds:[открытые целиком], circles:[{x,y,r,u?,v?,hold?}], current, preview }
    function holdKnown(fog, hold) {
        if (!fog || !fog.on || fog.preview) return true;
        if ((fog.holds || []).indexOf(hold) !== -1 || fog.current === hold) return true;
        const poly = HOLDS[hold] && HOLDS[hold].poly;
        return !!poly && (fog.circles || []).some(c => inPoly(c.x, c.y, poly));
    }
    function revealedAt(fog, x, y, hold) {
        if (!fog || !fog.on || fog.preview) return true;
        if (hold && (fog.holds || []).indexOf(hold) !== -1) return true;
        return (fog.circles || []).some(c => (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= c.r * c.r);
    }
    // Круги тумана из документа сессии: сохранённые + вокруг партии, открытых мест и меток мастера
    function fogFromSession(session, preview) {
        const f = session && session.mapFog;
        if (!f || !f.on) return null;
        const R = f.r || 35, circles = (f.circles || []).slice();
        const party = partyFromSession(session);
        if (party) circles.push({ x: party.x, y: party.y, u: party.u, v: party.v, hold: party.hold, r: R * 1.2 });
        [].concat(session.openPlaces || [], session.mapMarks || []).forEach(p => {
            if (p && typeof p.x === 'number' && typeof p.y === 'number') circles.push({ x: p.x, y: p.y, u: p.u, v: p.v, hold: p.hold, r: R * 0.5 });
        });
        return { on: true, holds: f.holds || [], circles, current: (session.currentHold || (party && party.hold) || null), preview: !!preview };
    }

    // ---------- Маршруты и расстояния ----------
    // 1 единица схемы = kmPerUnit км (по умолчанию 1: вся карта ≈ 1100 км). Скорости — км в день.
    const TRAVEL_DEFAULTS = { kmPerUnit: 1, foot: 30, horse: 50, cart: 40, ship: 80, roadF: 1.15, offF: 1.35, offSpeed: 0.65 };
    function travelCfg(c) {
        const o = Object.assign({}, TRAVEL_DEFAULTS);
        if (c) ['kmPerUnit', 'foot', 'horse', 'cart', 'ship'].forEach(k => { if (typeof c[k] === 'number' && c[k] > 0) o[k] = c[k]; });
        return o;
    }
    const NODES = {};
    Object.keys(SETTLE).forEach(h => Object.keys(SETTLE[h]).forEach(n => { NODES[n] = { name: n, hold: h, x: SETTLE[h][n][0], y: SETTLE[h][n][1] }; }));
    const ROADSET = {}, SEASET = {};
    ROADS.forEach(([a, b]) => { ROADSET[a + '|' + b] = ROADSET[b + '|' + a] = 1; });
    SEA.forEach(([a, b]) => { SEASET[a + '|' + b] = SEASET[b + '|' + a] = 1; });
    // Маршрут из точки a в точку b ({x,y,name?}). Дороги предпочтительны, между остальными точками — бездорожье.
    function planRoute(a, b, cfg) {
        cfg = travelCfg(cfg);
        const nodes = Object.keys(NODES).map(n => NODES[n]);
        const A = { name: a.name || '', x: a.x, y: a.y, id: 'A', hold: a.hold, u: a.u, v: a.v }, B = { name: b.name || '', x: b.x, y: b.y, id: 'B', hold: b.hold, u: b.u, v: b.v };
        const all = nodes.concat([A, B]);
        const speedFoot = t => t === 'road' ? cfg.foot : t === 'sea' ? cfg.ship : cfg.foot * cfg.offSpeed;
        const edge = (p, q) => {
            const d = Math.hypot(p.x - q.x, p.y - q.y) * cfg.kmPerUnit;
            if (p.name && q.name && p.name === q.name) return { type: 'road', straight: 0, km: 0 };
            const key = p.name + '|' + q.name;
            if (p.id !== 'A' && p.id !== 'B' && q.id !== 'A' && q.id !== 'B') {
                if (SEASET[key]) return { type: 'sea', straight: d, km: d };
                if (ROADSET[key]) return { type: 'road', straight: d, km: d * cfg.roadF };
            }
            return { type: 'off', straight: d, km: d * cfg.offF };
        };
        const n = all.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
        const iA = n - 2, iB = n - 1; dist[iA] = 0;
        for (let it = 0; it < n; it++) {
            let u = -1; for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
            if (u < 0 || dist[u] === Infinity) break; done[u] = true; if (u === iB) break;
            for (let v = 0; v < n; v++) {
                if (done[v] || v === u) continue;
                const e = edge(all[u], all[v]), t = e.km / speedFoot(e.type);
                if (dist[u] + t < dist[v]) { dist[v] = dist[u] + t; prev[v] = u; }
            }
        }
        const path = []; for (let i = iB; i !== -1; i = prev[i]) path.push(i); path.reverse();
        const legs = [], pts = path.map(i => ({ x: all[i].x, y: all[i].y, name: all[i].name || '', hold: all[i].hold, u: all[i].u, v: all[i].v }));
        let km = 0, kmRoad = 0, kmOff = 0, kmSea = 0, straight = 0, dFoot = 0, dHorse = 0, dCart = 0;
        for (let i = 0; i + 1 < path.length; i++) {
            const e = edge(all[path[i]], all[path[i + 1]]);
            if (e.km > 0) legs.push({ from: all[path[i]].name || '', to: all[path[i + 1]].name || '', type: e.type, km: e.km });
            km += e.km; straight += e.straight;
            if (e.type === 'road') { kmRoad += e.km; dFoot += e.km / cfg.foot; dHorse += e.km / cfg.horse; dCart += e.km / cfg.cart; }
            else if (e.type === 'sea') { kmSea += e.km; dFoot += e.km / cfg.ship; dHorse += e.km / cfg.ship; dCart += e.km / cfg.ship; }
            else { kmOff += e.km; dFoot += e.km / (cfg.foot * cfg.offSpeed); dHorse += e.km / (cfg.horse * cfg.offSpeed); dCart += e.km / (cfg.foot * cfg.offSpeed); }
        }
        const direct = Math.hypot(a.x - b.x, a.y - b.y) * cfg.kmPerUnit;
        return { pts, legs, km, kmRoad, kmOff, kmSea, direct, days: { foot: dFoot, horse: dHorse, cart: dCart }, cfg };
    }
    function plural(n, a, b, c) { const m = n % 100, d = n % 10; if (m > 10 && m < 15) return c; if (d === 1) return a; if (d >= 2 && d <= 4) return b; return c; }
    // 1 день пути ≈ 10 часов хода
    function fmtDays(d) {
        if (d < 0.05) return 'на месте';
        if (d < 1) return '~' + Math.max(1, Math.round(d * 10)) + ' ч';
        const r = Math.round(d * 2) / 2;
        if (r % 1) return '~' + String(r).replace('.', ',') + ' дня';
        return '~' + r + ' ' + plural(r, 'день', 'дня', 'дней');
    }
    function describeRoute(r) {
        if (!r) return '';
        const k = x => Math.round(x);
        let t = `≈ ${k(r.km)} км пути (по прямой ${k(r.direct)} км)`;
        const parts = [];
        if (r.kmRoad > 0.5) parts.push(`дороги ${k(r.kmRoad)}`);
        if (r.kmOff > 0.5) parts.push(`бездорожье ${k(r.kmOff)}`);
        if (r.kmSea > 0.5) parts.push(`море ${k(r.kmSea)}`);
        if (parts.length) t += ' — ' + parts.join(', ') + ' км';
        t += `. Пешком ${fmtDays(r.days.foot)}, верхом ${fmtDays(r.days.horse)}, на повозке ${fmtDays(r.days.cart)}`;
        return t + '.';
    }

    // opts: hold (приблизить к владению), hl (подсветить владение), party {hold,name,x,y,u?,v?}, pins {hold:{loc:{x,y,u?,v?,cat,show?}}},
    //       sel {x,y,u?,v?}, route {pts:[{x,y}]}, fog {on,holds,circles,current,preview}, schematic (не использовать картинку),
    //       onHold(h), onSettlement(h,name,x,y,u,v), onPin(h,name), onMap(x,y,hold,u,v), onPinMove(h,name,x,y,u,v)
    let _uid = 0;
    function render(container, o) {
        o = o || {};
        const zoom = o.hold && HOLDS[o.hold] ? o.hold : null;
        const img = zoom && IMG[zoom] && !o.schematic ? IMG[zoom] : null;
        const fog = o.fog && o.fog.on ? o.fog : null;
        const hide = !!(fog && !fog.preview);           // игрок: скрываем неоткрытое
        let vb = { x: 0, y: 0, w: W, h: H };
        if (img) {
            vb = { x: 0, y: 0, w: 1000, h: 1000 * img.h / img.w };
        } else if (zoom) {
            const b = bbox(HOLDS[zoom].poly), pad = 30;
            let w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
            const ratio = W / H;
            if (w / h < ratio) w = h * ratio; else h = w / ratio;
            vb = { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w, h };
        }
        const u = vb.w / W;
        // перевод объекта в координаты SVG
        const P = p => { if (img) { const l = localOf(zoom, p); return [l.u * vb.w, l.v * vb.h]; } return [p.x, p.y]; };
        const lscale = img ? (vb.w / img.w) / frame(zoom).s : 1;   // локальных единиц SVG в одной единице схемы
        const id = 'fm' + (++_uid);
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" style="width:100%; height:auto; display:block; background:#0e1820; border:1px solid #363025; border-radius:6px; touch-action:${o.onPinMove ? 'none' : 'auto'};" role="img" aria-label="Карта Скайрима">
<style>
.hp{stroke:#1d1710;stroke-width:${2 * u};stroke-linejoin:round;cursor:pointer;transition:opacity .15s,filter .15s}
.hp:hover{filter:brightness(1.25)}
.hl{stroke:#f1c40f;stroke-width:${4 * u}}
.st{cursor:pointer}.st:hover rect{fill:#fff}
.pin text{display:none;pointer-events:none}.pin:hover text{display:block}.pin{cursor:${o.onPinMove ? 'grab' : 'pointer'}}
.lbl{font-family:'Cinzel','EB Garamond',serif;fill:#f2e9d0;paint-order:stroke;stroke:#14100a;stroke-linejoin:round;pointer-events:none}
@keyframes pr{0%{r:${9 * u}px;opacity:.9}100%{r:${26 * u}px;opacity:0}}
.pulse{animation:pr 1.8s ease-out infinite;fill:none;stroke:#f1c40f;stroke-width:${2 * u}}
</style>
<rect x="${vb.x - 5}" y="${vb.y - 5}" width="${vb.w + 10}" height="${vb.h + 10}" fill="#0e1820" data-bg="1"/>`;
        if (img) {
            s += `<image href="${esc(img.src)}" x="0" y="0" width="${vb.w}" height="${vb.h}" preserveAspectRatio="none" data-img="${esc(zoom)}"/>`;
        } else {
            // владения
            Object.keys(HOLDS).forEach(k => {
                const h = HOLDS[k];
                const dim = zoom && zoom !== k;
                const hl = o.hl === k || zoom === k;
                s += `<polygon class="hp${hl ? ' hl' : ''}" data-hold="${esc(k)}" points="${ptsStr(h.poly)}" fill="${h.fill}" fill-opacity="${dim ? 0.35 : (hl ? 0.95 : 0.78)}"><title>${hide && !holdKnown(fog, k) ? 'Неизведанные земли' : esc(k)}</title></polygon>`;
            });
            // подписи владений
            Object.keys(HOLDS).forEach(k => {
                const h = HOLDS[k];
                if (hide && !holdKnown(fog, k)) return;
                if (zoom && zoom !== k) {
                    s += `<text class="lbl" x="${h.label[0]}" y="${h.label[1]}" text-anchor="middle" font-size="${12 * u}" stroke-width="${3 * u}" opacity=".6">${esc(h.short)}</text>`;
                } else if (!zoom) {
                    s += `<text class="lbl" x="${h.label[0]}" y="${h.label[1]}" text-anchor="middle" font-size="17" font-weight="700" stroke-width="3.5" letter-spacing="1">${esc(h.short.toUpperCase())}</text>`;
                } else {
                    s += `<text class="lbl" x="${h.label[0]}" y="${(bbox(h.poly).y0 + 20)}" text-anchor="middle" font-size="${20 * u}" font-weight="700" stroke-width="${4 * u}" opacity=".55" letter-spacing="${2 * u}">${esc(h.short.toUpperCase())}</text>`;
                }
            });
        }
        // поселения
        Object.keys(SETTLE).forEach(hk => {
            if (zoom && zoom !== hk) return;
            const names = Object.keys(SETTLE[hk]);
            names.forEach((n, i) => {
                let [x, y] = SETTLE[hk][n], px = x, py = y, lu, lv, approx = false;
                if (img) { const l = settleLocal(hk, n); lu = l.u; lv = l.v; approx = !!l.approx; px = l.u * vb.w; py = l.v * vb.h; if (approx && !o.showApprox) return; }
                if (hide) {
                    const gp = img && IMG[hk].settle && IMG[hk].settle[n] ? toGlobal(hk, lu, lv) : { x, y };
                    if (!revealedAt(fog, gp.x, gp.y, hk) && !revealedAt(fog, x, y, hk)) return;
                }
                const showName = zoom || i === 0;
                const r = (i === 0 ? 7 : 5) * u;
                s += `<g class="st" data-set="${esc(n)}" data-sh="${esc(hk)}" data-x="${x}" data-y="${y}"${img ? ` data-u="${lu.toFixed(4)}" data-v="${lv.toFixed(4)}"` : ''}${approx ? ' data-approx="1"' : ''}><title>${esc(n)}${approx ? ' (положение на картинке условное)' : ''}</title>
<rect x="${px - r}" y="${py - r}" width="${r * 2}" height="${r * 2}" transform="rotate(45 ${px} ${py})" fill="${approx ? 'none' : '#e8d9a8'}" stroke="${approx ? '#e8d9a8' : '#14100a'}"${approx ? ` stroke-dasharray="${2 * u} ${2 * u}"` : ''} stroke-width="${(approx ? 2 : 1.5) * u}"/>
${showName ? `<text class="lbl" x="${px}" y="${py + 17 * u}" text-anchor="middle" font-size="${(i === 0 ? 15 : 13) * u}" stroke-width="${3 * u}">${esc(n)}</text>` : ''}</g>`;
            });
        });
        // метки (при приближении — владения; для игрока pinsAll — все). show:true — метки, выданные мастером, видны и в тумане
        const pinHolds = zoom ? (o.pins && o.pins[zoom] ? [zoom] : []) : (o.pinsAll && o.pins ? Object.keys(o.pins) : []);
        let pinsOver = '';
        pinHolds.forEach(ph => {
            const pins = o.pins[ph];
            Object.keys(pins).forEach(n => {
                const p = pins[n];
                if (hide && !p.show && !revealedAt(fog, p.x, p.y, ph)) return;
                const pp = Object.assign({ hold: ph }, p), [px, py] = P(pp);
                const g = `<g class="pin" data-pin="${esc(n)}" data-ph="${esc(ph)}" data-x="${p.x}" data-y="${p.y}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><title>${esc(n)}${p.cat ? ' · ' + esc(p.cat) : ''}</title>
<circle r="${6 * u}" fill="${catColor(p.cat)}" stroke="#14100a" stroke-width="${1.5 * u}"/>
<text class="lbl" y="${-10 * u}" text-anchor="middle" font-size="${11 * u}" stroke-width="${3 * u}">${esc(n)}</text></g>`;
                if (hide && p.show) pinsOver += g; else s += g;
            });
        });
        // туман войны: тёмная завеса с «окнами» вокруг открытого
        if (fog) {
            const wholeOpen = img && (fog.holds || []).indexOf(zoom) !== -1;
            if (!wholeOpen) {
                let holes = '';
                (fog.circles || []).forEach(c => {
                    const [cx, cy] = P(c);
                    const r = c.r * lscale;
                    holes += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${id}g)"/>`;
                });
                if (!img) (fog.holds || []).forEach(h => { if (HOLDS[h]) holes += `<polygon points="${ptsStr(HOLDS[h].poly)}" fill="#000"/>`; });
                s += `<defs><radialGradient id="${id}g"><stop offset="0" stop-color="#000"/><stop offset=".62" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<mask id="${id}m" maskUnits="userSpaceOnUse" x="${vb.x - 5}" y="${vb.y - 5}" width="${vb.w + 10}" height="${vb.h + 10}"><rect x="${vb.x - 5}" y="${vb.y - 5}" width="${vb.w + 10}" height="${vb.h + 10}" fill="#fff"/>${holes}</mask></defs>
<rect data-fog="1" x="${vb.x - 5}" y="${vb.y - 5}" width="${vb.w + 10}" height="${vb.h + 10}" fill="#070b0f" fill-opacity="${fog.preview ? 0.55 : 0.97}" mask="url(#${id}m)" pointer-events="none"/>`;
            }
        }
        s += pinsOver;
        // маршрут
        if (o.route && o.route.pts && o.route.pts.length > 1) {
            const RP = q => {
                if (img && q.name && NODES[q.name] && NODES[q.name].hold === zoom && q.u == null) { const l = settleLocal(zoom, q.name); return [l.u * vb.w, l.v * vb.h]; }
                return P(q);
            };
            const pts = o.route.pts.map(q => RP(q).map(v => v.toFixed(1)).join(',')).join(' ');
            s += `<g pointer-events="none"><polyline data-route="1" points="${pts}" fill="none" stroke="#ffd166" stroke-width="${3 * u}" stroke-dasharray="${8 * u} ${6 * u}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        }
        if (o.sel && typeof o.sel.x === 'number') {
            const [sx, sy] = P(o.sel);
            s += `<g pointer-events="none"><circle cx="${sx}" cy="${sy}" r="${10 * u}" fill="none" stroke="#2ecc71" stroke-width="${2.5 * u}"/><circle cx="${sx}" cy="${sy}" r="${2.5 * u}" fill="#2ecc71"/></g>`;
        }
        if (o.party && typeof o.party.x === 'number') {
            const p = o.party, [px, py] = P(p);
            s += `<g pointer-events="none"><circle class="pulse" cx="${px}" cy="${py}" r="${9 * u}"/>
<circle cx="${px}" cy="${py}" r="${8 * u}" fill="#f1c40f" stroke="#14100a" stroke-width="${2 * u}"/>
<text class="lbl" x="${px}" y="${py - 15 * u}" text-anchor="middle" font-size="${14 * u}" font-weight="700" stroke-width="${3.5 * u}" style="fill:#ffe27a">⚑ Партия${p.name ? ': ' + esc(p.name) : ''}</text></g>`;
        }
        if (!zoom) {
            s += `<g pointer-events="none" opacity=".75"><text class="lbl" x="1050" y="740" text-anchor="middle" font-size="14" stroke-width="3">С</text><path d="M1050 705 L1043 735 L1050 727 L1057 735 Z" fill="#f2e9d0"/></g>
<text class="lbl" x="20" y="785" font-size="12" stroke-width="3" opacity=".7">Схема — границы и расстояния условные</text>`;
        }
        s += '</svg>';
        container.innerHTML = s;
        const svg = container.querySelector('svg');
        const toSvg = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
        // из точки SVG — в схематичные координаты (+ доли картинки)
        const fromSvg = p => {
            if (!img) return { x: p.x, y: p.y };
            const lu = p.x / vb.w, lv = p.y / vb.h, g = toGlobal(zoom, lu, lv);
            return { x: g.x, y: g.y, u: lu, v: lv };
        };
        const r4 = v => Math.round(v * 10000) / 10000;
        let drag = null, moved = false;
        svg.addEventListener('pointerdown', ev => {
            const g = ev.target.closest('.pin');
            if (g && o.onPinMove) { drag = { g, h: g.dataset.ph, n: g.dataset.pin }; moved = false; try { g.setPointerCapture(ev.pointerId); } catch (e) { } ev.preventDefault(); }
        });
        svg.addEventListener('pointermove', ev => {
            if (!drag) return;
            const p = toSvg(ev); moved = true; drag.x = p.x; drag.y = p.y;
            drag.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        });
        svg.addEventListener('pointerup', () => {
            if (drag && moved && o.onPinMove) { const g = fromSvg({ x: drag.x, y: drag.y }); o.onPinMove(drag.h, drag.n, Math.round(g.x), Math.round(g.y), g.u != null ? r4(g.u) : undefined, g.v != null ? r4(g.v) : undefined); }
            drag = null;
        });
        svg.addEventListener('click', ev => {
            if (moved) { moved = false; return; }
            const pin = ev.target.closest('.pin');
            if (pin) { if (o.onPin) o.onPin(pin.dataset.ph, pin.dataset.pin); return; }
            const st = ev.target.closest('.st');
            if (st) { if (o.onSettlement) o.onSettlement(st.dataset.sh, st.dataset.set, +st.dataset.x, +st.dataset.y, st.dataset.u != null ? +st.dataset.u : undefined, st.dataset.v != null ? +st.dataset.v : undefined); return; }
            const p = toSvg(ev), g = fromSvg(p);
            const hp = ev.target.closest('.hp');
            if (zoom || o.onMap) {
                if (o.onMap) o.onMap(Math.round(g.x), Math.round(g.y), img ? zoom : holdAt(g.x, g.y), g.u != null ? r4(g.u) : undefined, g.v != null ? r4(g.v) : undefined);
                if (zoom) return;
            }
            if (hp && o.onHold) { if (hide && !holdKnown(fog, hp.dataset.hold)) return; o.onHold(hp.dataset.hold); }
        });
        return svg;
    }

    // Положение партии из сессии → объект для render()
    function partyFromSession(session) {
        const p = session && session.partyPos;
        return p && typeof p.x === 'number' ? p : null;
    }
    function loadPins() { try { return JSON.parse(localStorage.getItem('holdsMapPins') || '{}') || {}; } catch (e) { return {}; } }
    function savePins(p) { try { localStorage.setItem('holdsMapPins', JSON.stringify(p)); } catch (e) { } }

    window.HoldsMap = { W, H, HOLDS, SETTLE, IMG, ROADS, NODES, render, holdAt, partyFromSession, loadPins, savePins, catColor, frame, toLocal, toGlobal, localOf, settleLocal, holdKnown, revealedAt, fogFromSession, planRoute, describeRoute, fmtDays, travelCfg, TRAVEL_DEFAULTS };
})();
