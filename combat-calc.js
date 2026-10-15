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
    function previewDamage(enemy, dmgAmount, dmgType, penetrationPct) {
        const e = enemy || {};
        const base = Math.max(0, Number(dmgAmount) || 0);
        const notes = [];
        let resist = dmgType && e.resist ? (e.resist[dmgType] || 0) : 0;
        if (dmgType && resist) notes.push((resist > 0 ? 'резист ' : 'уязвимость ') + (TYPE_LABEL[dmgType] || dmgType) + ' ' + Math.abs(resist) + '%');
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

    root.StCombat = { previewDamage, resistSummary, TYPE_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
