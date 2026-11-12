// ============================================================================
// ENEMY-RANKS.JS — ранги врагов и оценка сложности боя (для мастера).
//
// Ранги. У врагов из базы фиксированные цифры (самый сильный ~1500 ОЗ), а герой растёт до 65 уровня.
// Мастер при добавлении выбирает ранг, и враг становится крепче. Цифры — в RANKS, их можно править.
//
// Сложность. Грубая прикидка «кто кого быстрее»: сколько кругов отряду нужно, чтобы снять ОЗ всех
// врагов своим уроном, и сколько врагам — чтобы снять ОЗ отряда. Попадания, броня, резисты и
// заклинания игроков не учитываются, поэтому это подсказка, а не расчёт.
// ============================================================================
(function () {
    const RANKS = [
        { id: 'normal', name: 'Обычный', tag: '', hp: 1, dmg: 1, mp: 1, phys: 0, lvl: 0, minLvl: 1 },
        { id: 'veteran', name: 'Ветеран', tag: 'ветеран', hp: 1.5, dmg: 1.25, mp: 1.25, phys: 5, lvl: 5, minLvl: 15 },
        { id: 'elite', name: 'Элита', tag: 'элита', hp: 2.5, dmg: 1.5, mp: 1.5, phys: 10, lvl: 10, minLvl: 30 },
        { id: 'legend', name: 'Легенда', tag: 'легенда', hp: 4, dmg: 2.5, mp: 2, phys: 20, lvl: 15, minLvl: 45 }
    ];
    const PHYS_CAP = 85; // как у поля «Физ. резист» в форме мастера

    function rankById(id) { return RANKS.find(r => r.id === id) || RANKS[0]; }

    // Какой ранг подходит отряду со средним уровнем lvl.
    function recommend(lvl) {
        let best = RANKS[0];
        RANKS.forEach(r => { if ((lvl || 1) >= r.minLvl) best = r; });
        return best;
    }

    // Применяет ранг к готовому объекту врага (тому, что мастер кладёт в sessions.enemies). Возвращает новый объект.
    function apply(enemy, rankId) {
        const r = rankById(rankId);
        if (!enemy || r.id === 'normal') return enemy;
        const e = JSON.parse(JSON.stringify(enemy));
        const mul = (v, k) => Math.round((Number(v) || 0) * k);
        e.maxHp = mul(e.maxHp, r.hp); e.curHp = e.maxHp;
        if (e.maxMp) { e.maxMp = mul(e.maxMp, r.mp); e.curMp = e.maxMp; }
        if (e.weaponDmg) e.weaponDmg = mul(e.weaponDmg, r.dmg);
        if (Array.isArray(e.spells)) e.spells = e.spells.map(s => Object.assign({}, s, typeof s.dmg === 'number' ? { dmg: mul(s.dmg, r.dmg) } : {}));
        if (r.phys) {
            const res = Object.assign({}, e.resist || {});
            res.physical = Math.min(PHYS_CAP, (Number(res.physical) || 0) + r.phys);
            e.resist = res;
        }
        if (r.lvl) e.levelBonus = r.lvl; // +уровень для заклинаний контроля («до N уровня»), см. getEnemyMeta
        e.rank = r.id;
        if (r.tag && !new RegExp('\\(' + r.tag + '\\)$').test(e.name || '')) e.name = (e.name || 'Враг') + ' (' + r.tag + ')';
        return e;
    }

    // Урон врага за круг: оружие (+Сила/Ловкость, если есть) или самое сильное заклинание — что больше.
    function enemyRoundDmg(e) {
        let w = Number(e.weaponDmg) || 0;
        if (w) w += Number(e.isRanged ? e.dex : e.str) || 0;
        const sp = Array.isArray(e.spells) ? Math.max(0, ...e.spells.map(s => Number(s.dmg) || 0)) : 0;
        return Math.max(w, sp);
    }

    // party: [{ curHp, maxHp, dmg, level, physRes }], enemies: [{ curHp, maxHp, weaponDmg, resist, ... }]
    // Реальные цифры: урон отряда режется физическим сопротивлением врагов (в среднем по их ОЗ), урон врагов оружием —
    // физическим сопротивлением героев (из брони, если игрок прислал). Заклинания врагов магическое сопротивление героев не режет:
    // оно неизвестно мастеру, поэтому берутся как есть. Шанс попасть у обеих сторон принят равным (бросок против броска).
    function difficulty(party, enemies) {
        const alivePc = (party || []).filter(p => p && (Number(p.curHp) || 0) > 0);
        const aliveEn = (enemies || []).filter(e => e && (Number(e.curHp) || 0) > 0 && !e.summoned);
        if (!alivePc.length || !aliveEn.length) return null;
        const pcHp = alivePc.reduce((s, p) => s + (Number(p.curHp) || 0), 0);
        const pcDmgRaw = alivePc.reduce((s, p) => s + Math.max(1, Number(p.dmg) || 0), 0);
        const enHp = aliveEn.reduce((s, e) => s + (Number(e.curHp) || 0), 0);
        // средняя защита врагов, взвешенная по ОЗ: большой враг с бронёй важнее мелкого без неё
        const enRes = enHp ? aliveEn.reduce((s, e) => s + Math.min(PHYS_CAP, Math.max(0, Number(e.resist && e.resist.physical) || 0)) * (Number(e.curHp) || 0), 0) / enHp : 0;
        const pcDmg = pcDmgRaw * (1 - enRes / 100);
        const known = alivePc.filter(p => p.physRes != null);
        const pcRes = known.length ? known.reduce((s, p) => s + Math.min(PHYS_CAP, Math.max(0, Number(p.physRes) || 0)), 0) / known.length : 0;
        const enDmg = aliveEn.reduce((s, e) => {
            const w = Number(e.weaponDmg) || 0;
            const wd = w ? (w + (Number(e.isRanged ? e.dex : e.str) || 0)) * (1 - pcRes / 100) : 0;
            const sp = Array.isArray(e.spells) ? Math.max(0, ...e.spells.map(x => Number(x.dmg) || 0)) : 0;
            return s + Math.max(wd, sp);
        }, 0);
        const roundsToWin = Math.max(1, Math.ceil(enHp / Math.max(1, pcDmg)));
        const roundsToLose = enDmg > 0 ? Math.max(1, Math.ceil(pcHp / enDmg)) : Infinity;
        const ratio = roundsToLose === Infinity ? Infinity : roundsToLose / roundsToWin;
        let level;
        if (ratio >= 3) level = { id: 'easy', name: 'Легко', color: '#7fb069' };
        else if (ratio >= 1.5) level = { id: 'normal', name: 'Нормально', color: '#d8c27a' };
        else if (ratio >= 0.8) level = { id: 'hard', name: 'Тяжело', color: '#e8a25a' };
        else level = { id: 'deadly', name: 'Смертельно', color: '#e05a4f' };
        const lvls = alivePc.map(p => Number(p.level) || 0).filter(Boolean);
        const avgLvl = lvls.length ? Math.round(lvls.reduce((a, b) => a + b, 0) / lvls.length) : 0;
        // совет: во сколько раз изменить ОЗ врагов, чтобы бой стал «Нормально» (отношение ≈ 2)
        let advice = '';
        if (ratio !== Infinity && ratio < 1.5) {
            const cut = Math.min(80, Math.round((1 - ratio / 2) * 100));
            advice = 'Чтобы стало «Нормально»: убавь ОЗ врагов примерно на ' + cut + '% или возьми ранг ниже.';
        } else if (ratio >= 3 && ratio !== Infinity) {
            const up = Math.min(300, Math.round((ratio / 2 - 1) * 100));
            advice = 'Бой лёгкий: можно добавить врагов или поднять ранг (ОЗ врагов ≈ +' + up + '%).';
        }
        return { level, roundsToWin, roundsToLose, ratio, pcHp, pcDmg, pcDmgRaw, enHp, enDmg, enRes: Math.round(enRes), pcRes: Math.round(pcRes), pcResKnown: known.length > 0, advice, avgLvl, enemies: aliveEn.length, players: alivePc.length };
    }

    window.EnemyRanks = { RANKS, rankById, recommend, apply, enemyRoundDmg, difficulty };
})();
