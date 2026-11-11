// ============================================================================
// ESTATE-PLANS.JS — готовые планировки поместий и услуги управляющего (2026-11-09).
// Планировки сделаны под нашу сетку (клетка = 5 футов) по мотивам Озёрного дома (Hearthfire) и Гордости шпиля (Солитьюд):
// Озёрный дом: главный зал 12×12 клеток, над ним второй этаж, под ним погреб, пять мест под крылья вокруг зала.
// Гордость шпиля: готовый городской дом с подвалом, первым и вторым этажом; управляющий обставляет комнаты.
// Всё считается по клеткам и ключам «x_y»; этаж 0 — земля, 1 — второй этаж, -1 — подвал.
// ============================================================================
window.ESTATE_PLANS = (function () {
    const key = (x, y) => x + '_' + y;
    const LEVELS = { '-1': 'Подвал', '0': 'Первый этаж', '1': 'Второй этаж' };
    const mk = () => ({ found: [], build: {}, roof: [], furn: {} });
    const newPlan = () => ({ levels: { '-1': mk(), '0': mk(), '1': mk() }, unroof: [] });
    // Коробка комнаты: стены по краю, пол внутри; на земле ещё фундамент.
    function box(p, L, x0, y0, x1, y1, roof) {
        const o = p.levels[L];
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            const k = key(x, y), edge = x === x0 || x === x1 || y === y0 || y === y1;
            if (String(L) === '0') o.found.push(k);
            o.build[k] = edge ? 'wall' : 'floor';
            if (roof) o.roof.push(k);
        }
    }
    const piece = (p, L, x, y, t) => { p.levels[L].build[key(x, y)] = t; };
    const furn = (p, L, x, y, t) => { p.levels[L].furn[key(x, y)] = { t }; };

    // ---------- Озёрный дом ----------
    const HOUSE = { x0: 19, y0: 24, x1: 30, y1: 35 };
    // Места под крылья: по порядку выбора крыльев. Каждое крыло 7×6 примыкает к стене главного зала, две клетки-двери ведут внутрь.
    const SLOTS = [
        { name: 'западное', x0: 12, y0: 24, doors: [[18, 26], [19, 26]] },
        { name: 'юго-западное', x0: 12, y0: 30, doors: [[18, 32], [19, 32]] },
        { name: 'восточное', x0: 31, y0: 24, doors: [[31, 26], [30, 26]] },
        { name: 'юго-восточное', x0: 31, y0: 30, doors: [[31, 32], [30, 32]] },
        { name: 'северное', x0: 21, y0: 18, doors: [[24, 23], [24, 24]] }
    ];

    // Обстановка крыла: [dx, dy, предмет] от угла крыла (внутри dx 1..5, dy 1..4).
    const WING_FURN = {
        armory: [[1, 1, 'rack'], [3, 1, 'rack'], [5, 1, 'rack'], [2, 3, 'dummy'], [4, 3, 'dummy'], [1, 4, 'lamp']],
        library: [[1, 1, 'bookcase'], [2, 1, 'bookcase'], [4, 1, 'bookcase'], [5, 1, 'bookcase'], [3, 3, 'table'], [2, 3, 'chair'], [4, 3, 'chair'], [5, 4, 'lamp']],
        kitchen: [[1, 1, 'hearth'], [3, 1, 'larder'], [5, 1, 'larder'], [3, 3, 'table'], [2, 3, 'chair'], [4, 3, 'chair']],
        alchemy: [[2, 1, 'alchtable'], [4, 1, 'alchtable'], [1, 3, 'shelf'], [5, 3, 'shelf'], [3, 4, 'lamp']],
        enchant: [[3, 2, 'enchtable'], [1, 1, 'soulcase'], [5, 1, 'soulcase'], [1, 4, 'lamp'], [5, 4, 'lamp']],
        greenhouse: [[1, 1, 'glassbed'], [2, 1, 'glassbed'], [4, 1, 'glassbed'], [5, 1, 'glassbed'], [1, 4, 'glassbed'], [5, 4, 'glassbed']],
        smithy: [[1, 1, 'forge'], [3, 1, 'grindstone'], [5, 1, 'chest'], [3, 3, 'table'], [1, 4, 'lamp']],
        trophy: [[1, 1, 'trophy'], [3, 1, 'trophy'], [5, 1, 'trophy'], [3, 3, 'rug'], [1, 4, 'lamp'], [5, 4, 'lamp']],
        bedroom: [[1, 1, 'bed'], [3, 1, 'bed'], [1, 3, 'bed'], [3, 3, 'bed'], [5, 1, 'chest'], [5, 4, 'lamp']]
    };

    function lvHouse(p) {
        const H = HOUSE;
        box(p, 0, H.x0, H.y0, H.x1, H.y1, true);
        piece(p, 0, 24, 35, 'door'); piece(p, 0, 25, 35, 'door');
        [[21, 35], [28, 35], [22, 24], [27, 24]].forEach(q => piece(p, 0, q[0], q[1], 'window'));
        furn(p, 0, 21, 26, 'hearth'); furn(p, 0, 24, 29, 'table'); furn(p, 0, 23, 29, 'chair'); furn(p, 0, 25, 29, 'chair'); furn(p, 0, 24, 31, 'rug');
        furn(p, 0, 28, 26, 'chest'); furn(p, 0, 21, 34, 'lamp'); furn(p, 0, 28, 34, 'lamp');
    }
    function lvFloor1(p) {
        const H = HOUSE;
        box(p, 1, H.x0, H.y0, H.x1, H.y1, true);
        for (let x = H.x0; x <= H.x1; x++) for (let y = H.y0; y <= H.y1; y++) p.unroof.push(key(x, y));
        [[22, 24], [27, 24], [21, 35], [28, 35], [19, 29], [30, 29]].forEach(q => piece(p, 1, q[0], q[1], 'window'));
        furn(p, 0, 28, 33, 'stairup'); furn(p, 1, 28, 33, 'stairdown');
        furn(p, 1, 22, 27, 'table'); furn(p, 1, 21, 27, 'chair'); furn(p, 1, 23, 27, 'chair'); furn(p, 1, 21, 25, 'shelf'); furn(p, 1, 23, 25, 'shelf'); furn(p, 1, 28, 26, 'chest'); furn(p, 1, 25, 30, 'rug'); furn(p, 1, 21, 34, 'lamp');
    }
    function lvCellar(p) {
        const H = HOUSE;
        box(p, -1, H.x0 + 1, H.y0 + 1, H.x1 - 1, H.y1 - 1, false);
        furn(p, 0, 21, 33, 'stairdown'); furn(p, -1, 21, 33, 'stairup');
        [[22, 26], [24, 26], [26, 26]].forEach(q => furn(p, -1, q[0], q[1], 'chest')); [[21, 26], [27, 26], [28, 29]].forEach(q => furn(p, -1, q[0], q[1], 'shelf')); furn(p, -1, 28, 33, 'lamp');
    }
    function lvWing(p, wing, slot) {
        const S = SLOTS[slot]; if (!S) return; const x1 = S.x0 + 6, y1 = S.y0 + 5;
        box(p, 0, S.x0, S.y0, x1, y1, true);
        S.doors.forEach(d => piece(p, 0, d[0], d[1], 'door'));
        piece(p, 0, S.x0 + 3, S.y0 + (S.y0 <= 19 ? 0 : 5), 'window');
        (WING_FURN[wing] || []).forEach(f => furn(p, 0, S.x0 + f[0], S.y0 + f[1], f[2]));
    }

    // ---------- Гордость шпиля ----------
    // Дом уже построен (участок 8..21 × 8..19); подвал и второй этаж достроены сразу, управляющий обставляет комнаты.
    const SOL = { x0: 8, y0: 8, x1: 21, y1: 19 };
    function solShell(e) {
        const p = newPlan(), S = SOL;
        box(p, 1, S.x0, S.y0, S.x1, S.y1, true);
        for (let x = S.x0; x <= S.x1; x++) for (let y = S.y0; y <= S.y1; y++) p.unroof.push(key(x, y));
        [[8, 12], [21, 12], [8, 16], [21, 16], [12, 8], [17, 8]].forEach(q => piece(p, 1, q[0], q[1], 'window'));
        furn(p, 0, 18, 17, 'stairup'); furn(p, 1, 18, 17, 'stairdown');
        box(p, -1, S.x0 + 1, S.y0 + 1, S.x1 - 1, S.y1 - 1, false);
        furn(p, 0, 10, 15, 'stairdown'); furn(p, -1, 10, 15, 'stairup'); furn(p, -1, 12, 12, 'lamp');
        return p;
    }
    function solDining(p) { furn(p, 0, 16, 10, 'table'); furn(p, 0, 16, 12, 'table'); furn(p, 0, 15, 11, 'chair'); furn(p, 0, 17, 11, 'chair'); furn(p, 0, 18, 10, 'chair'); furn(p, 0, 18, 12, 'chair'); furn(p, 0, 17, 14, 'rug'); furn(p, 0, 15, 9, 'lamp'); furn(p, 0, 20, 9, 'lamp'); }
    function solKitchen(p) { furn(p, 0, 10, 12, 'larder'); furn(p, 0, 10, 13, 'larder'); furn(p, 0, 12, 9, 'shelf'); furn(p, 0, 13, 9, 'shelf'); furn(p, 0, 14, 9, 'shelf'); furn(p, 0, 12, 14, 'chair'); }
    function solBedrooms(p) { furn(p, 1, 10, 10, 'bed'); furn(p, 1, 12, 10, 'bed'); furn(p, 1, 19, 10, 'chest'); furn(p, 1, 19, 13, 'rug'); furn(p, 1, 10, 12, 'lamp'); furn(p, 1, 20, 10, 'lamp'); }
    function solStudy(p) { furn(p, 1, 16, 15, 'table'); furn(p, 1, 15, 15, 'chair'); furn(p, 1, 17, 15, 'chair'); furn(p, 1, 14, 17, 'shelf'); furn(p, 1, 15, 17, 'shelf'); furn(p, 1, 16, 17, 'shelf'); furn(p, 1, 20, 17, 'chest'); furn(p, 1, 17, 13, 'rug'); }
    function solCellar(p) { [[11, 10], [13, 10], [15, 10]].forEach(q => furn(p, -1, q[0], q[1], 'chest')); [[11, 17], [13, 17], [15, 17], [19, 17]].forEach(q => furn(p, -1, q[0], q[1], 'shelf')); furn(p, -1, 19, 11, 'lamp'); }

    // ---------- каталог услуг управляющего ----------
    // days — сколько дней партии идёт работа; labour — работа мастеров в золоте (материалы и мебель считаются по ценам магазинов).
    const PKG = {
        lv_house: { kind: 'manor', name: 'Главный зал', desc: 'Каменный дом 12×12 с залом, очагом, столом и сундуком. Это основа: крылья и этажи пристраиваются к нему.', days: 7, labour: 4200, build: p => lvHouse(p) },
        lv_floor1: { kind: 'manor', name: 'Второй этаж', desc: 'Верхний зал над главным: кабинет, полки, сундук. Лестница из главного зала.', days: 3, labour: 900, need: 'lv_house', build: p => lvFloor1(p) },
        lv_cellar: { kind: 'manor', name: 'Погреб', desc: 'Подвал под главным залом: сундуки и полки для запасов. Спуск из главного зала.', days: 3, labour: 700, need: 'lv_house', build: p => lvCellar(p) },
        sol_dining: { kind: 'house', name: 'Столовая', desc: 'Два стола, стулья, ковёр и светильники в восточной части первого этажа.', days: 1, labour: 150, build: solDining },
        sol_kitchen: { kind: 'house', name: 'Кухня', desc: 'Кладовые и полки в западной части первого этажа (очаг уже есть).', days: 1, labour: 200, need: 'wing:kitchen', build: solKitchen },
        sol_bedrooms: { kind: 'house', name: 'Спальни наверху', desc: 'Две кровати, сундук, ковёр и светильники на втором этаже.', days: 2, labour: 250, need: 'wing:bedroom', build: solBedrooms },
        sol_study: { kind: 'house', name: 'Кабинет', desc: 'Письменный стол, стулья, три полки и сундук на втором этаже.', days: 2, labour: 250, build: solStudy },
        sol_cellar: { kind: 'house', name: 'Подвал с кладовой', desc: 'Три сундука и четыре полки под домом.', days: 2, labour: 300, build: solCellar }
    };
    Object.keys(WING_FURN).forEach(w => { PKG['lv_wing_' + w] = { kind: 'manor', name: 'Крыло: ', wing: w, desc: '', days: 3, labour: 1500, need: 'lv_house', build: null }; });

    // Состав услуги для участка e: { levels, unroof }.
    function planOf(e, id) {
        const P = PKG[id]; if (!P) return null;
        const p = newPlan();
        if (P.wing) { const slot = (e.wingSlot || {})[P.wing]; lvWing(p, P.wing, slot == null ? 0 : slot); }
        else if (P.build) P.build(p);
        return p;
    }
    // Стоимость услуги в золоте для участка e (материалы по ценам магазинов × множитель участка + мебель + работа).
    function priceOf(e, id) {
        const D = window.ESTATE_DATA, P = PKG[id], p = planOf(e, id); if (!P || !p) return 0;
        let mats = 0, gold = 0; const add = (per, n) => Object.keys(per).forEach(m => { mats += per[m] * n * ((D.MATERIALS[m] || {}).price || 0); });
        const mult = e.costMult || 1;
        Object.keys(p.levels).forEach(L => {
            const o = p.levels[L];
            add(D.PIECES.found.cost, o.found.length);
            Object.keys(o.build).forEach(k => add(D.PIECES[o.build[k]].cost, 1));
            add(D.PIECES.roof.cost, o.roof.length);
            Object.keys(o.furn).forEach(k => { const F = D.FURN[o.furn[k].t]; gold += F.gold; add(F.mats, 1); });
        });
        return Math.round(P.labour * (P.kind === 'manor' ? mult : 1) + mats * mult + gold);
    }
    function nameOf(id) { const P = PKG[id]; if (!P) return id; if (P.wing) return 'Крыло: ' + (window.ESTATE_DATA.WINGS[P.wing] || {}).name; return P.name; }
    // Применяет состав услуги к участку (клетки, которые уже заняты, пропускаются). Нужен estate.withLevel.
    function apply(e, p, withLevel) {
        Object.keys(p.levels).forEach(L => {
            const o = p.levels[L]; if (!o.found.length && !Object.keys(o.build).length && !Object.keys(o.furn).length && !o.roof.length) return;
            withLevel(e, Number(L), () => {
                o.found.forEach(k => { if (!e.found[k]) e.found[k] = 1; });
                Object.keys(o.build).forEach(k => { if (!e.build[k] || (o.build[k] === 'door' && e.build[k] === 'wall')) e.build[k] = o.build[k]; });
                o.roof.forEach(k => { e.roof[k] = 1; });
                Object.keys(o.furn).forEach(k => { if (!e.furn[k]) e.furn[k] = { t: o.furn[k].t }; });
            });
        });
        (p.unroof || []).forEach(k => { delete e.roof[k]; });
    }
    // Клетки, которые услуга займёт заново (для проверки места): по уровням.
    function conflicts(e, p, getLevel) {
        let n = 0;
        Object.keys(p.levels).forEach(L => {
            const o = p.levels[L], lv = getLevel(e, Number(L));
            o.found.forEach(k => { if (lv.found[k] || lv.plan[k]) n++; });
            Object.keys(o.build).forEach(k => { if ((lv.build[k] && lv.build[k] !== o.build[k] && !(o.build[k] === 'door' && lv.build[k] === 'wall')) || lv.plan[k]) n++; });
            Object.keys(o.furn).forEach(k => { if (lv.furn[k]) n++; });
        });
        return n;
    }
    return { LEVELS, SLOTS, HOUSE, SOL, WING_FURN, PKG, planOf, priceOf, nameOf, apply, conflicts, solShell, newPlan };
})();
