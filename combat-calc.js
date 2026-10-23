// ============================================================================
// COMBAT-CALC.JS — чистые расчёты боя, общие для сайта игрока (index.html/cloud.js) и панели мастера (gm.js).
// Раньше формула урона по врагу была записана прямо внутри CloudSync.applyDamageToEnemy — предпросмотр
// («сколько реально снимется») пришлось бы дублировать и он мог бы разойтись с настоящим применением.
// Теперь расчёт один: previewDamage() вызывается и для предпросмотра, и при реальном «Применить».
// Файл не зависит от DOM и Firebase и ничего не пишет — только считает.
// ============================================================================
(function (root) {
    'use strict';

    const MAGIC_TYPES = ['fire', 'frost', 'shock', 'magic'];
    const TYPE_LABEL = { physical: 'физический', fire: 'огонь', frost: 'холод', shock: 'электричество', poison: 'яд', magic: 'магия' };

    // enemy: объект врага из сессии ({resist:{physical:25,…}, statusEffects:[{res:{…}}]}).
    // dmgType: 'physical'/'fire'/… (без типа резисты не применяются — как и раньше).
    // penetrationPct: пробитие защиты — снижает ПОЛОЖИТЕЛЬНЫЙ резист цели на этот удар (уязвимость пробитием не «лечится»).
    // Возвращает { base, finalDmg, resist (итоговый, %), notes:[…] } — notes годятся для вывода пользователю.
    // bonusesCtx (необязательно, TASK-001): { steps } из StBonuses.computePlayerWeaponAttack — тогда dmgAmount считается
    // СЫРОЙ базой оружия и бонусы применяются до резистов. Без него всё как раньше: dmgAmount — уже итоговый урон.
    function previewDamage(enemy, dmgAmount, dmgType, penetrationPct, bonusesCtx) {
        const e = enemy || {};
        if (bonusesCtx && bonusesCtx.steps && typeof window !== 'undefined' && window.StBonuses) {
            dmgAmount = window.StBonuses.applyBonuses(dmgAmount, bonusesCtx.steps);
        }
        const base = Math.max(0, Number(dmgAmount) || 0);
        const notes = [];
        let resist = dmgType && e.resist ? (e.resist[dmgType] || 0) : 0;
        if (dmgType && resist) notes.push((resist > 0 ? 'резист ' : 'уязвимость ') + (TYPE_LABEL[dmgType] || dmgType) + ' ' + Math.abs(resist) + '%');
        // Общий магический резист врага (Жрец-дракон 50%, автоматоны и Луркеры 25%) действует и на огонь/холод/электричество —
        // раньше прибавлялся только магический резист от статусов, а базовый — лишь к урону типа «магия».
        if (dmgType && dmgType !== 'magic' && MAGIC_TYPES.indexOf(dmgType) !== -1 && e.resist && e.resist.magic) {
            const before = resist; resist = Math.max(resist, Math.min(100, resist + e.resist.magic)); notes.push('резист магии +' + (resist - before) + '%');
        }
        if (penetrationPct && resist > 0) {
            const before = resist;
            resist = Math.max(0, resist - penetrationPct);
            notes.push('пробитие −' + (before - resist) + '%');
        }
        // Статус-эффекты на враге с резистами/уязвимостями (яды и зелья). Для огня/холода/электричества дополнительно действует общий «магический».
        if (dmgType && Array.isArray(e.statusEffects)) {
            let delta = 0;
            e.statusEffects.forEach(st => {
                if (!st || !st.res) return;
                delta += (st.res[dmgType] || 0);
                if (MAGIC_TYPES.indexOf(dmgType) !== -1 && dmgType !== 'magic') delta += (st.res.magic || 0);
            });
            if (delta) { resist += delta; notes.push('статусы на цели ' + (delta > 0 ? '+' : '') + delta + '%'); }
        }
        const finalDmg = Math.max(0, Math.round(base * (1 - resist / 100)));
        return { base, finalDmg, resist, notes };
    }

    // Короткая подпись резистов врага для списков: «(резист: физический 25%, огонь −50%)»; пусто, если резистов нет.
    function resistSummary(enemy) {
        const r = (enemy && enemy.resist) || {};
        const parts = Object.keys(r).filter(k => r[k]).map(k => (TYPE_LABEL[k] || k) + ' ' + (r[k] < 0 ? '−' + Math.abs(r[k]) : r[k]) + '%');
        return parts.length ? '(резист: ' + parts.join(', ') + ')' : '';
    }

    // ---- Статусы на врагах: что они реально делают ----
    // noAttack — не может атаковать (мастер не бросит атаку); helpless — любая атака по нему попадает;
    // advantage — следующая атака по нему с преимуществом (снимается после броска); breakOnDamage — спадает от урона;
    // rollPenalty — штраф к его кубам (и атаке, и защите); frenzy — бьёт любую цель; slow — замедлен.
    const STATUS_RULES = {
        'Страх': { noAttack: true }, 'Бегство': { noAttack: true },
        'Успокоение': { noAttack: true }, 'Умиротворение': { noAttack: true },
        'Паралич': { noAttack: true, helpless: true },
        'Полиморф': { noAttack: true, helpless: true, breakOnDamage: true },
        'Оглушение': { noAttack: true },
        'Под контролем': { noAttack: true },
        'Потеря равновесия': { rollPenalty: -2 }, 'Шатается': { advantage: true },
        'Ярость': { frenzy: true }, 'Бешенство': { frenzy: true },
        'Ошеломление': { rollPenalty: -3 }, 'Ослабление': { rollPenalty: -2 },
        'Гравитационная клетка': { immobile: true }
    };
    function statusRule(name) {
        const n = String(name || '');
        if (STATUS_RULES[n]) return Object.assign({}, STATUS_RULES[n]);
        if (/^Замедление/.test(n)) return { slow: true };
        return {};
    }
    // Сводка по всем статусам врага: флаги из самих статусов + правила по имени (старые записи без флагов тоже работают).
    function statusFlags(enemy) {
        const out = { noAttack: null, helpless: false, helplessName: '', advantage: false, rollPenalty: 0, frenzy: null, slow: false };
        ((enemy && enemy.statusEffects) || []).forEach(function (st) {
            if (!st) return;
            const r = Object.assign(statusRule(st.name), st);
            if (r.noAttack && !out.noAttack) out.noAttack = st;
            if (r.helpless) { out.helpless = true; out.helplessName = st.name; }
            if (r.advantage) out.advantage = true;
            if (typeof r.rollPenalty === 'number') out.rollPenalty += r.rollPenalty;
            if (r.frenzy) out.frenzy = st;
            if (r.slow) out.slow = true;
        });
        return out;
    }

    root.StCombat = { previewDamage, resistSummary, TYPE_LABEL, statusRule, statusFlags, STATUS_RULES };
})(typeof window !== 'undefined' ? window : globalThis);
