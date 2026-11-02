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

    // party: [{ curHp, maxHp, dmg, level }], enemies: [{ curHp, maxHp, weaponDmg, ... }]
    function difficulty(party, enemies) {
        const alivePc = (party || []).filter(p => p && (Number(p.curHp) || 0) > 0);
        const aliveEn = (enemies || []).filter(e => e && (Number(e.curHp) || 0) > 0 && !e.summoned);
        if (!alivePc.length || !aliveEn.length) return null;
        const pcHp = alivePc.reduce((s, p) => s + (Number(p.curHp) || 0), 0);
        const pcDmg = alivePc.reduce((s, p) => s + Math.max(1, Number(p.dmg) || 0), 0);
        const enHp = aliveEn.reduce((s, e) => s + (Number(e.curHp) || 0), 0);
        const enDmg = aliveEn.reduce((s, e) => s + enemyRoundDmg(e), 0);
        const roundsToWin = Math.max(1, Math.ceil(enHp / pcDmg));
        const roundsToLose = enDmg > 0 ? Math.max(1, Math.ceil(pcHp / enDmg)) : Infinity;
        const ratio = roundsToLose / roundsToWin;
        let level;
        if (ratio >= 3) level = { id: 'easy', name: 'Легко', color: '#7fb069' };
        else if (ratio >= 1.5) level = { id: 'normal', name: 'Нормально', color: '#d8c27a' };
        else if (ratio >= 0.8) level = { id: 'hard', name: 'Тяжело', color: '#e8a25a' };
        else level = { id: 'deadly', name: 'Смертельно', color: '#e05a4f' };
        const lvls = alivePc.map(p => Number(p.level) || 0).filter(Boolean);
        const avgLvl = lvls.length ? Math.round(lvls.reduce((a, b) => a + b, 0) / lvls.length) : 0;
        return { level, roundsToWin, roundsToLose, ratio, pcHp, pcDmg, enHp, enDmg, avgLvl, enemies: aliveEn.length, players: alivePc.length };
    }

    window.EnemyRanks = { RANKS, rankById, recommend, apply, enemyRoundDmg, difficulty };
})();
