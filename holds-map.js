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
        [/пещер/i, '#b08968'], [/логов.*дракон|дракон/i, '#c0392b'], [/форт/i, '#d35400'], [/шахт/i, '#f1c40f'],
        [/руин|башн|гробниц|захорон|храм/i, '#aab7c4'], [/камн/i, '#3498db'], [/лагер/i, '#6ab04c'],
        [/даэдр/i, '#a569bd'], [/корабл|доки|пристан|маяк/i, '#48c9b0']
    ];
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

    // opts: hold (приблизить к владению), hl (подсветить владение), party {hold,name,x,y}, pins {hold:{loc:{x,y,cat}}},
    //       sel {x,y}, onHold(h), onSettlement(h,name,x,y), onPin(h,name), onMap(x,y,hold), onPinMove(h,name,x,y)
    function render(container, o) {
        o = o || {};
        const zoom = o.hold && HOLDS[o.hold] ? o.hold : null;
        let vb = { x: 0, y: 0, w: W, h: H };
        if (zoom) {
            const b = bbox(HOLDS[zoom].poly), pad = 30;
            let w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
            const ratio = W / H;
            if (w / h < ratio) w = h * ratio; else h = w / ratio;
            vb = { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2, w, h };
        }
        const u = vb.w / W;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" style="width:100%; height:auto; display:block; background:#0e1820; border:1px solid #363025; border-radius:6px; touch-action:${o.onPinMove ? 'none' : 'auto'};" role="img" aria-label="Схематичная карта Скайрима">
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
        // владения
        Object.keys(HOLDS).forEach(k => {
            const h = HOLDS[k];
            const dim = zoom && zoom !== k;
            const hl = o.hl === k || zoom === k;
            s += `<polygon class="hp${hl ? ' hl' : ''}" data-hold="${esc(k)}" points="${ptsStr(h.poly)}" fill="${h.fill}" fill-opacity="${dim ? 0.35 : (hl ? 0.95 : 0.78)}"><title>${esc(k)}</title></polygon>`;
        });
        // подписи владений
        Object.keys(HOLDS).forEach(k => {
            const h = HOLDS[k];
            if (zoom && zoom !== k) {
                s += `<text class="lbl" x="${h.label[0]}" y="${h.label[1]}" text-anchor="middle" font-size="${12 * u}" stroke-width="${3 * u}" opacity=".6">${esc(h.short)}</text>`;
            } else if (!zoom) {
                s += `<text class="lbl" x="${h.label[0]}" y="${h.label[1]}" text-anchor="middle" font-size="17" font-weight="700" stroke-width="3.5" letter-spacing="1">${esc(h.short.toUpperCase())}</text>`;
            } else {
                s += `<text class="lbl" x="${h.label[0]}" y="${(bbox(h.poly).y0 + 20)}" text-anchor="middle" font-size="${20 * u}" font-weight="700" stroke-width="${4 * u}" opacity=".55" letter-spacing="${2 * u}">${esc(h.short.toUpperCase())}</text>`;
            }
        });
        // поселения
        Object.keys(SETTLE).forEach(hk => {
            if (zoom && zoom !== hk) return;
            const names = Object.keys(SETTLE[hk]);
            names.forEach((n, i) => {
                const [x, y] = SETTLE[hk][n];
                const showName = zoom || i === 0;
                const r = (i === 0 ? 7 : 5) * u;
                s += `<g class="st" data-set="${esc(n)}" data-sh="${esc(hk)}" data-x="${x}" data-y="${y}"><title>${esc(n)}</title>
<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" transform="rotate(45 ${x} ${y})" fill="#e8d9a8" stroke="#14100a" stroke-width="${1.5 * u}"/>
${showName ? `<text class="lbl" x="${x}" y="${y + 17 * u}" text-anchor="middle" font-size="${(i === 0 ? 15 : 13) * u}" stroke-width="${3 * u}">${esc(n)}</text>` : ''}</g>`;
            });
        });
        // метки подземелий (только при приближении)
        // pinsAll — показывать метки всех владений и при общем виде (карта игрока: открытые места)
        const pinHolds = zoom ? (o.pins && o.pins[zoom] ? [zoom] : []) : (o.pinsAll && o.pins ? Object.keys(o.pins) : []);
        pinHolds.forEach(ph => {
            const pins = o.pins[ph];
            Object.keys(pins).forEach(n => {
                const p = pins[n];
                s += `<g class="pin" data-pin="${esc(n)}" data-ph="${esc(ph)}" data-x="${p.x}" data-y="${p.y}" transform="translate(${p.x} ${p.y})"><title>${esc(n)}${p.cat ? ' · ' + esc(p.cat) : ''}</title>
<circle r="${6 * u}" fill="${catColor(p.cat)}" stroke="#14100a" stroke-width="${1.5 * u}"/>
<text class="lbl" y="${-10 * u}" text-anchor="middle" font-size="${11 * u}" stroke-width="${3 * u}">${esc(n)}</text></g>`;
            });
        });
        if (o.sel && typeof o.sel.x === 'number') {
            s += `<g pointer-events="none"><circle cx="${o.sel.x}" cy="${o.sel.y}" r="${10 * u}" fill="none" stroke="#2ecc71" stroke-width="${2.5 * u}"/><circle cx="${o.sel.x}" cy="${o.sel.y}" r="${2.5 * u}" fill="#2ecc71"/></g>`;
        }
        if (o.party && typeof o.party.x === 'number') {
            const p = o.party;
            s += `<g pointer-events="none"><circle class="pulse" cx="${p.x}" cy="${p.y}" r="${9 * u}"/>
<circle cx="${p.x}" cy="${p.y}" r="${8 * u}" fill="#f1c40f" stroke="#14100a" stroke-width="${2 * u}"/>
<text class="lbl" x="${p.x}" y="${p.y - 15 * u}" text-anchor="middle" font-size="${14 * u}" font-weight="700" stroke-width="${3.5 * u}" style="fill:#ffe27a">⚑ Партия${p.name ? ': ' + esc(p.name) : ''}</text></g>`;
        }
        if (!zoom) {
            s += `<g pointer-events="none" opacity=".75"><text class="lbl" x="1050" y="740" text-anchor="middle" font-size="14" stroke-width="3">С</text><path d="M1050 705 L1043 735 L1050 727 L1057 735 Z" fill="#f2e9d0"/></g>
<text class="lbl" x="20" y="785" font-size="12" stroke-width="3" opacity=".7">Схема — границы и расстояния условные</text>`;
        }
        s += '</svg>';
        container.innerHTML = s;
        const svg = container.querySelector('svg');
        const toSvg = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
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
            if (drag && moved && o.onPinMove) o.onPinMove(drag.h, drag.n, Math.round(drag.x), Math.round(drag.y));
            drag = null;
        });
        svg.addEventListener('click', ev => {
            if (moved) { moved = false; return; }
            const pin = ev.target.closest('.pin');
            if (pin) { if (o.onPin) o.onPin(pin.dataset.ph, pin.dataset.pin); return; }
            const st = ev.target.closest('.st');
            if (st) { if (o.onSettlement) o.onSettlement(st.dataset.sh, st.dataset.set, +st.dataset.x, +st.dataset.y); return; }
            const p = toSvg(ev);
            const hp = ev.target.closest('.hp');
            if (zoom || o.onMap) { if (o.onMap) o.onMap(Math.round(p.x), Math.round(p.y), holdAt(p.x, p.y)); if (zoom) return; }
            if (hp && o.onHold) o.onHold(hp.dataset.hold);
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

    window.HoldsMap = { W, H, HOLDS, SETTLE, render, holdAt, partyFromSession, loadPins, savePins, catColor };
})();
