// ============================================================================
// ENEMY-PERKS.JS — перки врагов по уровню (2026-11-13): бандиты, маги-бандиты, изгои, вампиры, оборотни.
//
// Перки — из тех же веток, что у героя (названия и ранги из Книги игрока), но набираются по уровню врага:
// «навык» врага = 10 + 2×уровень (до 100), очков перков = 1 + уровень/5. Пороги рангов — как у героя.
// Числовые перки (урон оружия %, кровотечение, броня %, урон заклинаний стихии %, «Твёрдая рука») сразу
// запекаются в цифры врага — ✓ «считает сайт». Ситуативные (силовые атаки, скрытность, проклятия вампира…)
// показаны мастеру текстом — ✋ «мастер вручную».
// STRENGTH — доля силы перка героя у врага (Никита 2026-11-13: полная сила).
// ============================================================================
(function (root) {
    'use strict';
    const STRENGTH = 1; // решение Никиты 2026-11-13: «Полная сила», как у героя

    const has = (re, s) => re.test(String(s || ''));
    // Каталог: tree, name, thr — пороги «навыка» для каждого ранга, when(p) — кому подходит,
    // fx(rank) — { dmgPct, dmgFlat, atk, armorPct, spellPct: { fire|frost|shock }, text }.
    const CATALOG = [
        // --- одноручное ---
        { tree: 'Одноручное оружие', name: 'Сильная рука', thr: [0, 20, 40, 60, 80], when: p => p.weapon === '1h', fx: r => ({ dmgPct: 20 * r }) },
        { tree: 'Одноручное оружие', name: 'Рубака', thr: [30, 60, 90], when: p => p.weapon === '1h' && p.wkind === 'axe', fx: r => ({ dmgFlat: 5 * r, note: 'кровотечение' }) },
        { tree: 'Одноручное оружие', name: 'Мечник', thr: [30, 60, 90], when: p => p.weapon === '1h' && p.wkind === 'sword', fx: r => ({ text: `силовая атака мечом: +${r} к кубам, враг не отвечает` }) },
        { tree: 'Одноручное оружие', name: 'Костолом', thr: [30, 60, 90], when: p => p.weapon === '1h' && p.wkind === 'mace', fx: r => ({ text: `удар булавой игнорирует ${15 * r}% брони цели` }) },
        { tree: 'Одноручное оружие', name: 'Боевая стойка', thr: [20], when: p => p.weapon === '1h', fx: () => ({ text: 'силовые атаки одноручным: +1 к кубу' }) },
        { tree: 'Одноручное оружие', name: 'Безжалостный удар', thr: [70], when: p => p.weapon === '1h', fx: () => ({ text: 'силовая атака стоя: +25% урона, 5% отрубить голову' }) },
        // --- двуручное ---
        { tree: 'Двуручное оружие', name: 'Варвар', thr: [0, 20, 40, 60, 80], when: p => p.weapon === '2h', fx: r => ({ dmgPct: 20 * r }) },
        { tree: 'Двуручное оружие', name: 'Расчленитель', thr: [30, 60, 90], when: p => p.weapon === '2h' && p.wkind === 'axe', fx: r => ({ dmgFlat: 10 * r, note: 'кровотечение' }) },
        { tree: 'Двуручное оружие', name: 'Глубокие раны', thr: [30, 60, 90], when: p => p.weapon === '2h' && p.wkind === 'sword', fx: r => ({ text: `силовая атака двуручным мечом: +${r} к кубам, враг не отвечает` }) },
        { tree: 'Двуручное оружие', name: 'Крушитель черепов', thr: [30, 60, 90], when: p => p.weapon === '2h' && p.wkind === 'mace', fx: r => ({ text: `удар молотом игнорирует ${25 * r}% брони цели` }) },
        { tree: 'Двуручное оружие', name: 'Стойка чемпиона', thr: [20], when: p => p.weapon === '2h', fx: () => ({ text: 'силовые атаки двуручным: +1 к кубу' }) },
        { tree: 'Двуручное оружие', name: 'Сокрушительный удар', thr: [70], when: p => p.weapon === '2h', fx: () => ({ text: 'силовая атака стоя: +25% урона, 10% отрубить голову' }) },
        // --- стрельба ---
        { tree: 'Стрельба', name: 'Избыточное натяжение', thr: [0, 20, 40, 60, 80], when: p => p.weapon === 'bow', fx: r => ({ dmgPct: 20 * r }) },
        { tree: 'Стрельба', name: 'Твёрдая рука', thr: [40, 60], when: p => p.weapon === 'bow', fx: r => ({ atk: r }) },
        { tree: 'Стрельба', name: 'Орлиный взор', thr: [30], when: p => p.weapon === 'bow', fx: () => ({ text: 'видит и попадает на 90 фт.' }) },
        { tree: 'Стрельба', name: 'Мощный выстрел', thr: [50], when: p => p.weapon === 'bow', fx: () => ({ text: 'каждый 3-й выстрел: цель −1 к кубам на свой ход' }) },
        // --- блок ---
        { tree: 'Блокирование', name: 'Щитоносец', thr: [0, 20, 40, 60, 80], when: p => p.shield, fx: r => ({ text: `блок щитом эффективнее на ${15 + 5 * r}% брони щита` }) },
        { tree: 'Блокирование', name: 'Отбивание стрел', thr: [30], when: p => p.shield, fx: () => ({ text: 'стрелы, попавшие в поднятый щит, не наносят урона' }) },
        { tree: 'Блокирование', name: 'Силовой удар плашмя', thr: [40], when: p => p.shield, fx: () => ({ text: 'может ударить щитом плашмя (оглушение)' }) },
        // --- броня ---
        { tree: 'Тяжелая броня', name: 'Джаггернаут', thr: [0, 20, 40, 60, 80], when: p => p.armor === 'heavy', fx: r => ({ armorPct: 20 * r }) },
        { tree: 'Легкая броня', name: 'Ловкость в обороне', thr: [0, 20, 40, 60, 80], when: p => p.armor === 'light', fx: r => ({ armorPct: 20 * r }) },
        // --- скрытность (лучники-бандиты, изгои) ---
        { tree: 'Скрытность', name: 'Скрытность', thr: [0, 20, 40, 60, 80], when: p => p.sneak, fx: r => ({ text: `+${r} к кубам скрытности (засада)` }) },
        { tree: 'Скрытность', name: 'Удар в спину', thr: [30], when: p => p.sneak && p.weapon === '1h', fx: () => ({ text: 'скрытная атака одноручным — урон ×3' }) },
        { tree: 'Скрытность', name: 'Верный прицел', thr: [50], when: p => p.sneak && p.weapon === 'bow', fx: () => ({ text: 'скрытный выстрел — урон ×4' }) },
        // --- разрушение (маги) ---
        { tree: 'Разрушение', name: 'Усиленное пламя', thr: [30, 60], when: p => p.elems && p.elems.fire, fx: r => ({ spellPct: { fire: 25 * r } }) },
        { tree: 'Разрушение', name: 'Усиленный мороз', thr: [30, 60], when: p => p.elems && p.elems.frost, fx: r => ({ spellPct: { frost: 25 * r } }) },
        { tree: 'Разрушение', name: 'Усиленные молнии', thr: [30, 60], when: p => p.elems && p.elems.shock, fx: r => ({ spellPct: { shock: 25 * r } }) },
        { tree: 'Разрушение', name: 'Жаркое пламя', thr: [70], when: p => p.elems && p.elems.fire, fx: () => ({ text: 'огонь обращает в бегство раненую цель' }) },
        { tree: 'Разрушение', name: 'Глубокая заморозка', thr: [70], when: p => p.elems && p.elems.frost, fx: () => ({ text: 'холод парализует раненую цель' }) },
        // --- вампир (силы ночи и магия крови, как у вампира-лорда) ---
        { tree: 'Вампир', name: 'Сверхъестественные рефлексы', thr: [20], when: p => p.vampire, fx: () => ({ text: 'раз за бой: 4 атаки подряд с +4 к кубам' }) },
        { tree: 'Вампир', name: 'Трупное проклятье', thr: [40], when: p => p.vampire, fx: () => ({ text: 'раз за бой: паралич на 4 хода (спасбросок МУД героя против Сл. 17 + мод. МУД вампира)' }) },
        { tree: 'Вампир', name: 'Хватка вампира', thr: [50], when: p => p.vampire, fx: () => ({ text: 'притягивает и душит цель с менее чем 10% ХП' }) },
        { tree: 'Вампир', name: 'Вызов гаргульи', thr: [60], when: p => p.vampire, fx: () => ({ text: 'раз за бой: призывает гаргулью-союзника' }) },
        { tree: 'Вампир', name: 'Туманная форма', thr: [70], when: p => p.vampire, fx: () => ({ text: 'раз за бой: неуязвимый туман на 3 хода (не бьёт и не получает урон)' }) },
        // --- оборотень (тотемы Хирсина) ---
        { tree: 'Оборотень', name: 'Звериная сила', thr: [0, 30, 60], when: p => p.werewolf, fx: r => ({ dmgPct: 15 * r }) },
        { tree: 'Оборотень', name: 'Запах крови (Тотем Охоты)', thr: [20], when: p => p.werewolf, fx: () => ({ text: 'чует раненых и спрятавшихся рядом героев' }) },
        { tree: 'Оборотень', name: 'Жуткий вой (Тотем Страха)', thr: [40], when: p => p.werewolf, fx: () => ({ text: 'раз за бой: страх на героев рядом (спасбросок МУД)' }) },
        { tree: 'Оборотень', name: 'Вой стаи (Тотем Братства)', thr: [60], when: p => p.werewolf, fx: () => ({ text: 'раз за бой: зовёт 1–2 волков' }) }
    ];

    const skillOf = level => Math.min(100, 10 + 2 * (level || 1));
    const pointsOf = level => 1 + Math.floor((level || 1) / 5);

    // Профиль врага по оружию/броне/заклинаниям.
    function profile(o) {
        const w = String(o.weaponName || '');
        const p = Object.assign({}, o);
        if (!p.weapon) {
            if (o.isRanged || has(/(^|[^а-яё])лук([^а-яё]|$)|арбалет/i, w)) p.weapon = 'bow';
            else if (has(/двуруч|секир|боевой молот|клеймор|пик[аи]|алебард|посох/i, w)) p.weapon = '2h';
            else if (w) p.weapon = '1h';
        }
        if (!p.wkind) p.wkind = has(/топор|секир/i, w) ? 'axe' : has(/булав|молот|палиц/i, w) ? 'mace' : has(/меч|клинок|клеймор|сабл|катан/i, w) ? 'sword' : has(/кинжал/i, w) ? 'dagger' : '';
        if (o.spells && !p.elems) {
            p.elems = {};
            o.spells.forEach(s => { const t = elemOf(s.name); if (t && (s.dmg || 0) > 0) p.elems[t] = true; });
        }
        return p;
    }
    function elemOf(n) {
        n = String(n || '').toLowerCase();
        if (/огн|пламя|пламен|огненн|ожог/.test(n)) return 'fire';
        if (/лед|лёд|мороз|холод|обморож|ледян/.test(n)) return 'frost';
        if (/молни|искр|гроз|электр|цепн/.test(n)) return 'shock';
        return null;
    }

    // Набор перков: шаги «перк ранг N» доступны, если навык ≥ порога; берём по порядку порога, сколько очков.
    function roll(o) {
        const p = profile(o);
        const level = o.level || 1, skill = skillOf(level);
        let points = pointsOf(level);
        const steps = [];
        CATALOG.forEach((c, ci) => { if (c.when(p)) c.thr.forEach((t, ri) => { if (skill >= t) steps.push({ c, ci, rank: ri + 1, t }); }); });
        // Сначала главный перк своего оружия (Сильная рука / Варвар / Избыточное натяжение / Звериная сила) — враг специализируется,
        // как герой, затем остальное по порогам.
        // Порядок: главный перк оружия → другие числовые перки той же ветки (Твёрдая рука, Рубака, усиление стихии мага) →
        // главный перк брони → остальное (ситуативное) по порогам.
        const core = c => c.thr.length >= 3 && c.thr[0] === 0 && !!c.fx(1).dmgPct;
        const coreTree = (CATALOG.find(c => core(c) && c.when(p)) || {}).tree;
        const prio = c => core(c) ? 0 : (!c.fx(1).text && (c.tree === coreTree || c.tree === 'Разрушение')) ? 1 : (c.fx(1).armorPct ? 2 : 3);
        steps.sort((a, b) => prio(a.c) - prio(b.c) || a.t - b.t || a.rank - b.rank || a.ci - b.ci);
        const got = {};
        for (const s of steps) {
            if (points <= 0) break;
            if ((got[s.c.name] ? got[s.c.name].rank : 0) !== s.rank - 1) continue; // ранги по порядку
            got[s.c.name] = { tree: s.c.tree, name: s.c.name, rank: s.rank, max: s.c.thr.length };
            points--;
        }
        return Object.values(got).map(g => {
            const c = CATALOG.find(x => x.name === g.name);
            const fx = c.fx(g.rank);
            return Object.assign(g, { fx, auto: !fx.text, desc: describe(fx) });
        });
    }
    function k(v) { return Math.round(v * STRENGTH); }
    function describe(fx) {
        if (fx.text) return fx.text;
        const parts = [];
        if (fx.dmgPct) parts.push(`+${k(fx.dmgPct)}% урона оружием`);
        if (fx.dmgFlat) parts.push(`+${k(fx.dmgFlat)} урона (${fx.note || 'перк'})`);
        if (fx.atk) parts.push(`+${fx.atk} к броску выстрела`);
        if (fx.armorPct) parts.push(`+${k(fx.armorPct)}% к броне`);
        if (fx.spellPct) Object.keys(fx.spellPct).forEach(t => parts.push(`+${k(fx.spellPct[t])}% урона заклинаний ${({ fire: 'огня', frost: 'холода', shock: 'электричества' })[t]}`));
        return parts.join(', ');
    }
    // Запечь числовые перки в цифры врага. t: { weaponDmg, armor (очки брони) | physResist, spells }.
    function apply(t, perks) {
        const out = Object.assign({}, t);
        let dmgPct = 0, dmgFlat = 0, atk = 0, armorPct = 0; const sp = {};
        (perks || []).forEach(g => { const f = g.fx || {}; dmgPct += f.dmgPct || 0; dmgFlat += f.dmgFlat || 0; atk += f.atk || 0; armorPct += f.armorPct || 0; Object.keys(f.spellPct || {}).forEach(e => { sp[e] = (sp[e] || 0) + f.spellPct[e]; }); });
        if (out.weaponDmg) out.weaponDmg = Math.round(out.weaponDmg * (1 + k(dmgPct) / 100)) + k(dmgFlat);
        if (typeof out.armor === 'number' && armorPct) out.armor = Math.round(out.armor * (1 + k(armorPct) / 100));
        if (typeof out.physResist === 'number' && armorPct) out.physResist = Math.min(85, Math.round(out.physResist * (1 + k(armorPct) / 100)));
        if (Array.isArray(out.spells) && Object.keys(sp).length) out.spells = out.spells.map(s => { const e = elemOf(s.name); return e && sp[e] && (s.dmg || 0) > 0 ? Object.assign({}, s, { dmg: Math.round(s.dmg * (1 + k(sp[e]) / 100)) }) : s; });
        out.perkAtk = atk;
        return out;
    }
    // Для записи в бой: без функций и лишнего.
    function forStore(perks) { return (perks || []).map(g => ({ tree: g.tree, name: g.name, rank: g.rank, max: g.max, auto: !!g.auto, desc: g.desc })); }
    function summary(perks) { return (perks || []).map(g => g.name + (g.max > 1 ? ' ' + g.rank + '/' + g.max : '') + ' — ' + g.desc + (g.auto ? ' ✓' : ' ✋')).join('; '); }
    // Кому из базы врагов положены перки (бандиты/изгои/вампиры/оборотни).
    function eligibleName(n) { return /бандит|изго|вампир|оборот|вервольф/i.test(String(n || '')); }

    const api = { STRENGTH, CATALOG, roll, apply, forStore, summary, profile, eligibleName, skillOf, pointsOf };
    root.EnemyPerks = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
