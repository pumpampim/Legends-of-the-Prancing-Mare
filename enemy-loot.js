// ============================================================================
// ENEMY-LOOT.JS — лут с трупов ЛЮБЫХ врагов + генераторы драугров и изгоев.
//
// 1) EnemyLoot.rollFromText(text, ctx)  — превращает «вики-текст» дропа из enemies-data.js
//    («Шкура медведя, Медвежьи когти», «золото (до 10)», «Костная мука 1-2», «маленький шанс
//    на до 15 монет» …) в конкретную добычу: { gold, items:[…] }. Предметы ищутся в базе
//    предметов по названию (с поиском по основе слов — «шкуру/шкура»), общие слова вроде
//    «драг. камень», «яды», «свитки заклинаний» заменяются случайным предметом нужной категории.
//    Если предмета нет в базе, он всё равно выдаётся (имя из текста, без цены) — ничего не теряется.
// 2) EnemyGear.generate(dbEnemy, ctx) — как генератор бандитов: случайное оружие и броня
//    по типу врага (драугры — древненордское, возможно зачарованное; изгои — оружие и броня
//    изгоев), плюс остальной лут из текста. Заклинания и крики берутся из записи врага.
//
// ctx = { pool: [предметы базы (gmAllItems)], level: N } — модуль сам ничего не грузит.
// Файл подключается ДО gm.js и не зависит от Firebase/DOM.
// ============================================================================
(function (root) {
    'use strict';

    const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”()\[\]{}.,;:!?\/\\*]/g, ' ').replace(/\s+/g, ' ').trim();
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

    // ---------- общий формат предмета-добычи (совместим с lootItems бандитов) ----------
    function toLoot(db, qty) {
        const o = { name: db.name, price: db.price || 0, weight: db.weight || 0, category: db.category || '' };
        if (typeof db.dmg === 'number') o.dmg = db.dmg; else if (typeof db.damage === 'number') o.dmg = db.damage;
        if (typeof db.armor === 'number') o.armor = db.armor; else if (typeof db.resistance === 'number') o.armor = db.resistance;
        if (db.slot) o.slot = db.slot;
        if (db.effect) o.effect = db.effect;
        if (db.enchantment) o.enchantment = JSON.parse(JSON.stringify(db.enchantment));
        if (qty && qty > 1) o.qty = qty;
        return o;
    }

    // ---------- пулы предметов из базы ----------
    function isUnique(i) { return !!i.unique || /^Уникальн/.test(i.category || '') || /Даэдрическ|Азидал|Маски жрецов|Мораг/.test(i.category || ''); }
    function byCat(pool, re) { return pool.filter(i => re.test(i.category || '')); }
    function isAmmoName(n) { return /стрел|болт/i.test(n); }
    function weaponsOf(pool, nameRe) {
        return pool.filter(i => typeof i.dmg === 'number' && (i.slot === 'melee' || i.slot === 'ranged') && !isAmmoName(i.name) &&
            !isUnique(i) && !/\[.*\]/.test(i.name) && nameRe.test(i.name));
    }
    const SLOT_RU = { 'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield' };
    function armorSlot(i) { return SLOT_RU[i.slot] || i.slot; }
    function armorsOf(pool, nameRe) {
        const out = {};
        pool.filter(i => typeof i.armor === 'number' && i.slot && !isUnique(i) && !/\[.*\]/.test(i.name) && nameRe.test(i.name)).forEach(i => {
            const k = armorSlot(i);
            if (['helmet', 'chest', 'gloves', 'boots', 'shield'].includes(k)) (out[k] = out[k] || []).push(i);
        });
        return out;
    }

    // ---------- зачарование: тот же формат, что у игрока (index.html → enchantItem) ----------
    // обруч (circlet) носят на голове — в enchant-data для него нет своих эффектов, берём эффекты для шлема
    const ENCH_SLOT = { chest: 'armor', gloves: 'gauntlets', neck: 'amulet', circlet: 'helmet' };
    function makeEnchantment(slot, level, prefer) {
        const isWeapon = slot === 'melee' || slot === 'ranged';
        let effects = isWeapon ? (root.enchantWeaponEffects || []) : (root.enchantArmorEffects || []).filter(e => e.slots.includes(ENCH_SLOT[slot] || slot));
        if (!effects.length) return null;
        let ef = null;
        if (prefer && prefer.length) { const pf = effects.filter(e => prefer.includes(e.name)); if (pf.length) ef = pickWeighted(pf, prefer); }
        if (!ef) ef = pick(effects);
        const lvl = Math.max(0, Math.min(1, (level || 1) / 30));
        let value = null, desc;
        if (ef.maxValue === null || ef.maxValue === undefined) { desc = ef.description; }
        else if (ef.maxValue <= 1) { value = ef.maxValue; desc = ef.name + ': ' + value + (ef.unit ? ' ' + ef.unit : ''); }
        else {
            // сила: 35%…100% от максимума в зависимости от уровня врага, ±15% разброс
            value = Math.max(1, Math.round(ef.maxValue * (0.35 + 0.65 * lvl) * (0.85 + Math.random() * 0.3) * 10) / 10);
            value = Math.min(ef.maxValue, value);
            desc = ef.name + ': ' + value + (ef.unit ? ' ' + ef.unit : '');
        }
        return { name: ef.name, value, unit: ef.unit || '', description: desc };
    }
    // prefer — список имён эффектов; ближе к началу списка = вероятнее (первый ~60%)
    function pickWeighted(effects, prefer) {
        // indexOf даёт -1 для «непредпочитаемых» — их надо отправлять В КОНЕЦ, а не в начало
        const rank = n => { const i = prefer.indexOf(n); return i === -1 ? 9999 : i; };
        const sorted = effects.slice().sort((a, b) => rank(a.name) - rank(b.name));
        return Math.random() < 0.6 ? sorted[0] : pick(sorted);
    }
    // Превращает обычный предмет-добычу в зачарованный: «Имя [Эффект]», цена как у игрока (×1.5 + 50).
    function enchantLoot(loot, level, prefer) {
        const ench = makeEnchantment(loot.slot, level, prefer);
        if (!ench) return loot;
        loot.name = loot.name + ' [' + ench.name + ']';
        loot.enchantment = ench;
        loot.effect = ench.description;
        loot.price = Math.round((loot.price || 0) * 1.5) + 50;
        if (loot.slot === 'melee' || loot.slot === 'ranged') loot.chargeDaysLeft = rnd(2, 5);
        return loot;
    }

    // ---------- поиск предмета по названию (с учётом падежей) ----------
    const _wordsCache = new Map();
    function wordsOf(s) {
        let w = _wordsCache.get(s);
        if (!w) { w = norm(s).split(' ').filter(x => x.length >= 3); _wordsCache.set(s, w); }
        return w;
    }
    function wordMatch(a, b) {
        if (a === b) return true;
        const m = Math.min(a.length, b.length);
        let k = 0; while (k < m && a[k] === b[k]) k++;
        return k >= Math.max(3, m - 2);
    }
    function findByName(pool, token, includeUnique) {
        const tw = wordsOf(token);
        if (!tw.length) return null;
        let best = null, bestScore = 0;
        for (const it of pool) {
            if (/\[.*\]/.test(it.name)) continue;
            const iw = wordsOf(it.name);
            if (!iw.length) continue;
            let common = 0;
            tw.forEach(w => { if (iw.some(x => wordMatch(w, x))) common++; });
            const score = common / Math.max(tw.length, iw.length);
            if (isUnique(it) && !includeUnique) continue;   // уникальное в автолут не попадает (мастер выдаёт его вручную)
            if (isUnique(it) && score < 1) continue;
            if (score > bestScore || (score === bestScore && best && it.name.length < best.name.length)) { best = it; bestScore = score; }
        }
        return bestScore >= 0.67 ? best : null;
    }

    // ---------- разбор текста ----------
    function expandAbbr(t) {
        t = t.replace(/\s+и\/или\s+/gi, ', ');
        t = t.replace(/(\S+)\/(\S+)(\s+кам(?:ен|н)\S*\s+душ)/gi, (m, a, b, c) => (Math.random() < 0.5 ? a : b) + c);
        return t.replace(/пещ\./gi, 'пещерного ').replace(/снеж\./gi, 'снежного ').replace(/гр\./gi, 'грязевого ')
            .replace(/драг\./gi, 'драгоценный ').replace(/\u00a0/g, ' ');
    }
    function splitTopLevel(str, seps) {
        const out = []; let depth = 0, cur = '';
        for (const ch of str) {
            if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
            if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = ''; } else cur += ch;
        }
        out.push(cur);
        return out.map(s => s.trim()).filter(Boolean);
    }
    function chanceOf(str) {
        if (/маленьк\S*\s+шанс|небольш\S*\s+шанс|редко/i.test(str)) return 0.25;
        if (/больш\S*\s+шанс|часто/i.test(str)) return 0.75;
        if (/иногда/i.test(str)) return 0.35;
        if (/шанс|возможно/i.test(str)) return 0.5;
        return 1;
    }
    function stripChanceWords(str) {
        return str.replace(/(маленьк\S*|небольш\S*|больш\S*)\s+шанс\s+(на\s+)?/ig, '').replace(/(^|\s)шанс\s+(на\s+)?/ig, ' ')
            .replace(/(^|\s)(иногда|редко|возможно|часто)(?=\s|$)/ig, ' ').replace(/\s+/g, ' ').trim();
    }
    function qtyOf(str) {
        // «Костная мука 1-2», «2 яд обморожения», «(12 шт)», «по 2-3»
        let m = str.match(/\((\d+)\s*шт\.?\)/i);
        if (m) return { qty: [+m[1], +m[1]], text: str.replace(m[0], '').trim() };
        m = str.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s+(?=\D)/);
        if (m) return { qty: [+m[1], +m[2]], text: str.slice(m[0].length).trim() };
        m = str.match(/^\s*(\d+)\s+(?=[^\d%\s])/);
        if (m && !/^\s*\d+\s*%/.test(str)) return { qty: [+m[1], +m[1]], text: str.slice(m[0].length).trim() };
        m = str.match(/\s+(\d+)\s*[-–—]\s*(\d+)(?:\s*шт\.?)?\s*$/);
        if (m) return { qty: [+m[1], +m[2]], text: str.slice(0, m.index).trim() };
        m = str.match(/\s+(\d+)\s*шт\.?\s*$/i);
        if (m) return { qty: [+m[1], +m[1]], text: str.slice(0, m.index).trim() };
        return { qty: null, text: str.trim() };
    }
    function goldAmount(str, level) {
        const lvl = Math.max(1, level || 1);
        let m = str.match(/(\d+)\s*[-–—]\s*(\d+)/);
        if (m) return rnd(+m[1], +m[2]);
        m = str.match(/до\s*(\d+)/i);
        if (m) return rnd(1, +m[1]);
        m = str.match(/(\d+)/);
        if (m) return +m[1];
        if (/пар[уы]/i.test(str)) return rnd(2, 8);
        return Math.max(2, Math.round(rnd(3, 12) * (1 + lvl * 0.08)));
    }
    const GOLD_RE = /(?:^|\s)(?:уровнев\S*\s+)?(?:сумм\S*\s+денег|золот\S*|монет\S*|септим\S*|денег|денежк\S*)/i;
    const JEWEL_RE = /(колец|кольц|обруч|ожерель|амулет)/i;

    function jewelryOf(pool, word, wantEnchant, level) {
        const kind = /обруч/i.test(word) ? /обруч/i : /ожерель|амулет/i.test(word) ? /ожерель|амулет/i : /кольц|колец/i;
        const list = byCat(pool, /^Ювелирн/).filter(i => kind.test(i.name));
        if (!list.length) return null;
        const loot = toLoot(pick(list));
        return wantEnchant ? enchantLoot(loot, level) : loot;
    }

    // Общие слова → случайный предмет категории. Срабатывают, только если токен целиком — «общее слово».
    function genericItem(token, ctx) {
        const t = norm(token), pool = ctx.pool || [], lvl = ctx.level || 1;
        let m;
        if (/^(драг\S*\s+)?кам(?:ен|н)\S*$|^драг\S*(\s+кам(?:ен|н)\S*)?$/.test(t) && !/душ/.test(t)) {
            const l = byCat(pool, /^Драгоценные камни/); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/кам(?:ен|н)\S*\s+душ|душ\S*\s+камн/.test(t)) {
            let l = byCat(pool, /^Камни душ/).filter(i => !/Заполненн|Чёрн|Черн/i.test(i.name));
            const sizes = [['крохотн', /крохотн/i], ['маленьк', /маленьк/i], ['обычн', /обычн/i], ['больш', /больш/i], ['велик', /велик/i]];
            const named = sizes.filter(s => s[0] && t.indexOf(s[0]) !== -1).map(s => s[1]);
            if (named.length) l = l.filter(i => named.some(re => re.test(i.name)));
            else if (/разн/.test(t)) l = l.slice(0, Math.max(2, Math.min(l.length, 1 + Math.floor(lvl / 8))));
            return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/^свитк\S*(\s+заклинани\S*)?$/.test(t)) {
            const l = byCat(pool, /^Свитки/); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/^яд(ы|а)?$/.test(t)) {
            const l = (root.alchemyPremadePotions || []).filter(p => /^Яд/.test(p.name));
            if (!l.length) return null;
            const pz = pick(l);
            return { it: toLoot({ name: pz.name, category: pz.category, weight: pz.weight, price: pz.price, effect: pz.effect }) };
        }
        if (/^зель[яеи]$/.test(t)) {
            const l = pool.filter(i => /^Зелье \(лут\)/.test(i.category || '')); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/^книг[аи]?$/.test(t)) {
            const l = byCat(pool, /^Книга умения/); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/^украшени\S*$/.test(t)) {
            const l = byCat(pool, /^Ювелирн/); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/^(случайн\S*\s+(кол-?во|количество)\s+)?руд\S*$/.test(t)) {
            // руда по уровню: чем выше уровень, тем дороже металл; количество 1-3
            const l = pool.filter(i => /руда$/i.test(i.name) && /^Кузнечные/.test(i.category || '')).sort((a, b) => (a.price || 0) - (b.price || 0));
            if (!l.length) return null;
            const upto = Math.max(2, Math.min(l.length, Math.ceil(l.length * Math.min(1, lvl / 30))));
            const it = toLoot(pick(l.slice(0, upto))); it.qty = rnd(1, 3);
            return { it };
        }
        if (/^(случайн\S*\s+)?ингредиент\S*$/.test(t)) {
            const l = byCat(pool, /^Ингредиенты для алхимии/); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        if (/^(немного\s+)?(еда|еды|пища|пищи|провизи\S*|продукт\S*)$/.test(t)) {
            const l = byCat(pool, /^(Готовые продукты|Сырые продукты)/); return l.length ? { it: toLoot(pick(l)) } : null;
        }
        // «оружие с тела», «броня» (бандиты и др. люди): случайная обычная вещь по уровню врага
        if (/^оружи\S*(\s+с\s+тел\S*)?$/.test(t) || /^брон\S*(\s+с\s+тел\S*)?$/.test(t)) {
            const isW = /^оружи/.test(t);
            const gp = typeof ctx.gearPool === 'function' ? ctx.gearPool(lvl) : null;
            let list = gp ? (isW ? gp.weapons : gp.armors) : null;
            if (!list || !list.length) {
                const FACTION = /древн|фалмер|изгое|двемер|даэдр|драконь|нордск|небесн/i;
                list = isW ? weaponsOf(pool, /./).filter(i => !FACTION.test(i.name) && i.dmg <= 7 + lvl * 0.6)
                           : pool.filter(i => typeof i.armor === 'number' && i.slot && !isUnique(i) && !/\[.*\]/.test(i.name) && !FACTION.test(i.name) && i.armor <= 10 + lvl * 1.1);
            }
            if (!list.length) return null;
            const src = pick(list);
            const it = toLoot({ name: src.name, price: src.price, weight: src.weight, dmg: src.damage !== undefined ? src.damage : src.dmg,
                armor: src.resistance !== undefined ? src.resistance : src.armor, slot: isW ? src.slot : armorSlot(src), category: isW ? 'Оружие (с трупа)' : 'Броня (с трупа)' });
            return { it };
        }
        // оружие фракций одним словом: «древне нордское оружие», «фалмерское оружие», «оружие изгоев»
        if ((m = t.match(/оружи/))) {
            const re = /древн\S*\s+норд|нордск\S*\s+древн/.test(t) ? /древн/i : /фалмер/.test(t) ? /фалмер/i : /изгое/.test(t) ? /изгое/i : null;
            if (re) {
                const l = weaponsOf(pool, re); if (l.length) return { it: toLoot(pickByLevel(l, lvl)) };
            }
        }
        return null;
    }
    // Более сильное оружие чаще выпадает у более высокоуровневых врагов
    function pickByLevel(list, lvl) {
        const ok = list.filter(i => (i.dmg || 0) <= 8 + lvl * 0.9);
        return pick(ok.length ? ok : list.slice().sort((a, b) => a.dmg - b.dmg).slice(0, 2));
    }

    // Один токен → { gold } или { items:[…] } (с шансом выпадения и количеством)
    function resolveToken(raw, ctx, opts) {
        let tok = raw.trim();
        if (!tok) return null;
        const p = chanceOf(tok);
        tok = stripChanceWords(tok);
        const q = qtyOf(tok);
        tok = q.text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();   // пояснения в скобках («20 урона ядом») — не предмет
        tok = tok.replace(/^(?:ее|её|его|их)\s+/i, '').replace(/^а также\s+/i, '').replace(/^также\s+/i, '').trim();
        if (!tok) return null;
        if (GOLD_RE.test(tok) && !/кам(?:ен|н)/i.test(tok)) return { chance: p, gold: goldAmount(raw, ctx.level) };
        // оружие/броня фракции в генераторе берутся из экипировки врага
        if (opts && opts.skipGear && /оружи|кинжал|щит\b|брон[яи]|шлем|топор|меч\b|лук\b|стрел[аыу]\s+(?:изгое|древн|нордск)/i.test(tok) && /изгое|древн|нордск|фалмер|железн/i.test(tok)) return null;
        if (JEWEL_RE.test(tok)) {
            const enchant = /(^|\s)зачарован/i.test(tok) && !/незачарован/i.test(tok);
            const it = jewelryOf(ctx.pool || [], tok, enchant, ctx.level);
            if (it) return { chance: p, items: [it] };
        }
        const g = genericItem(tok, ctx);
        if (g) {
            const plural = /^драг\S*\s+камни$|^драгоценные$/.test(norm(tok));
            const n = q.qty ? rnd(q.qty[0], q.qty[1]) : (plural ? rnd(1, 2) : 1);
            if (n > 1) g.it.qty = n;
            return { chance: p, items: [g.it] };
        }
        // Название уникальной вещи в тексте дропа (маска жреца и т.п.) — не автолут: пропускаем, мастер выдаст её вручную.
        if (/^маск\S*\s+жрец/.test(norm(tok))) return null;   // маски жрецов Солстхейма — уникальные, в базе названы иначе; не заглушка, а пропуск
        const anyMatch = findByName(ctx.pool || [], tok, true);
        if (anyMatch && isUnique(anyMatch)) return null;
        const found = findByName(ctx.pool || [], tok);
        let item;
        if (found) item = toLoot(found);
        else {
            // Описание эффекта (не предмет) пропускаем; всё остальное выдаём как есть из текста.
            if (tok.length > 48 || /\d+\s*%|нейтрализ|действует|доказывает|что это/i.test(tok)) return null;
            item = { name: cap(tok), price: 0, weight: 0.5, category: 'Добыча (с трупа)' };
        }
        let n = q.qty ? rnd(q.qty[0], q.qty[1]) : 1;
        if (!q.qty && isAmmoName(item.name)) n = rnd(4, 12);
        if (n > 1) item.qty = n;
        return { chance: p, items: [item] };
    }

    function rollFromText(text, ctx, opts) {
        ctx = ctx || {}; opts = opts || {};
        const result = { gold: 0, items: [] };
        if (!text || !String(text).trim()) return result;
        const t = expandAbbr(String(text));
        const clauses = t.split(/;|\n|\.(?=\s*[А-ЯЁA-Z])/).map(s => s.trim()).filter(Boolean);
        let last = [];
        const add = (r) => {
            if (!r || Math.random() >= r.chance) return;
            if (r.gold) result.gold += r.gold;
            (r.items || []).forEach(it => { result.items.push(it); last.push(it); });
        };
        clauses.forEach(clause => {
            // «Обычно встречаются по 2-3» — уточнение количества к предыдущим предметам
            const mq = clause.match(/^(?:обычно\s+)?(?:встречаются\s+)?по\s+(\d+)\s*[-–—]\s*(\d+)/i);
            if (mq) { last.forEach(it => { it.qty = rnd(+mq[1], +mq[2]); }); return; }
            last = [];
            // «50 % шанс на каждый предмет из списка: a, b, c, что доказывает …» / «20 % шанс получения …»
            let m = clause.match(/^\s*(\d+)\s*%\s*шанс[^:]*:\s*(.*)$/i);
            if (m) {
                const list = m[2].split(/\s+что\s+/i)[0];
                splitTopLevel(list, [',']).forEach(part => splitOr(part).forEach(tk => {
                    const r = resolveToken(tk, ctx, opts); if (r) { r.chance = +m[1] / 100; add(r); }
                }));
                return;
            }
            m = clause.match(/^\s*(\d+)\s*%\s*шанс\s+(?:получения\s+|на\s+)?(.*)$/i);
            if (m) { const r = resolveToken(m[2], ctx, opts); if (r) { r.chance = +m[1] / 100; add(r); } return; }
            // «1 зачарованное ожерелье, кольцо или обруч» — один предмет из перечисленных
            m = clause.match(/^\s*(\d+)\s+зачарованн\S*\s+(.*)$/i);
            if (m) {
                const kinds = m[2].split(/,|\s+или\s+/).map(s => s.trim()).filter(Boolean);
                for (let i = 0; i < +m[1]; i++) {
                    const it = jewelryOf(ctx.pool || [], pick(kinds), true, ctx.level);
                    if (it) add({ chance: 1, items: [it] });
                }
                return;
            }
            splitTopLevel(clause, [',', '/']).forEach(part => {
                splitAnd(part).forEach(tk => add(resolveToken(tk, ctx, opts)));
            });
        });
        return result;
    }
    function splitAnd(s) { return s.split(/\s+и\s+|\s+а также\s+/i).map(x => x.trim()).filter(Boolean); }
    function splitOr(s) { return s.split(/\s+или\s+/i).map(x => x.trim()).filter(Boolean); }

    // Лут конкретного врага (по текстовому полю loot), с учётом его уровня.
    function rollForEnemy(enemy, pool) {
        return rollFromText(enemy && enemy.loot, { pool: pool || [], level: (enemy && enemy.level) || 1 });
    }

    // ===========================================================================
    // Генератор снаряжения: драугры и изгои
    // ===========================================================================
    const DRAUGR_RE = /драугр/i;
    const FORSWORN_RE = /^изгой/i;
    function familyOf(name) { return DRAUGR_RE.test(name || '') ? 'draugr' : FORSWORN_RE.test(name || '') ? 'forsworn' : null; }

    function cleanOptionName(o) { return String(o).replace(/^Зачарованн\S*\s+/i, '').trim(); }

    // Подбор допустимого оружия: по списку из записи врага, иначе по «окну» урона от уровня.
    function allowedWeapons(pool, enemy, rx) {
        const all = weaponsOf(pool, rx);
        const opts = (enemy.weaponOptions || []);
        let force = false;
        const matched = [];
        opts.forEach(o => {
            if (/щит/i.test(o)) return;
            if (/^Зачарованн/i.test(o)) force = true;
            const f = findByName(all, cleanOptionName(o));
            if (f && !matched.includes(f)) matched.push(f);
        });
        if (matched.length) return { list: matched, forceEnchant: force };
        const lvl = enemy.level || 1;
        const win = all.filter(i => i.dmg <= 8 + lvl * 0.9);
        return { list: win.length ? win : all.slice().sort((a, b) => a.dmg - b.dmg).slice(0, 2), forceEnchant: force };
    }

    const CAN_SHIELD = e => (e.weaponOptions || []).some(o => /щит/i.test(o));

    function generate(enemy, ctx) {
        ctx = ctx || {};
        const pool = ctx.pool || [];
        const fam = familyOf(enemy.name);
        if (!fam) return null;
        const level = enemy.level || 1;
        const isDraugr = fam === 'draugr';
        const rx = isDraugr ? /древн/i : /изгое/i;

        // --- оружие ---
        const unarmed = /безоруж/i.test(enemy.weaponNote || '');
        let weapon = null, forceEnchant = false, weaponNames = [];
        if (!unarmed) {
            const aw = allowedWeapons(pool, enemy, rx);
            forceEnchant = aw.forceEnchant;
            let list = aw.list;
            // у Изгоя-шамана по записи — кинжал; кинжала изгоев в базе нет, делаем «по образцу» их топора (половина урона)
            if (!isDraugr && /кинжал/i.test((enemy.weaponNote || '') + ' ' + (enemy.loot || ''))) {
                const axe = weaponsOf(pool, /изгое/i).find(i => i.slot === 'melee');
                if (axe) list = [{ name: 'Кинжал изгоев', slot: 'melee', category: 'Оружие (с трупа)', dmg: Math.max(3, Math.round(axe.dmg * 0.5)), weight: Math.max(1, Math.round((axe.weight || 4) * 0.25)), price: Math.round((axe.price || 20) * 0.5) }];
            }
            if (list.length) weapon = pick(list);
        }

        // --- броня ---
        const armorBy = armorsOf(pool, rx);
        const worn = {}, wornEnch = {};
        let totalArmor = 0;
        const armorMult = /×\s*2|x\s*2/i.test(enemy.weaponNote || '') && /брон/i.test(enemy.weaponNote || '') ? 2 : 1;
        ['helmet', 'chest', 'gloves', 'boots'].forEach(k => {
            if (armorBy[k] && armorBy[k].length && Math.random() < 0.85) { worn[k] = pick(armorBy[k]); }
        });
        let shield = null;
        if (CAN_SHIELD(enemy) && Math.random() < 0.7) {
            const sh = findByName(pool.filter(i => typeof i.armor === 'number' && armorSlot(i) === 'shield'), (enemy.weaponOptions.find(o => /щит/i.test(o)) || 'щит'));
            if (sh) shield = sh;
        }
        const armorEnchChance = isDraugr ? (forceEnchant ? 0.3 : Math.min(0.2, Math.max(0, (level - 4) * 0.015))) : 0;

        // --- сборка добычи и характеристик ---
        const lootItems = [];
        let weaponLoot = null, enchBonus = 0, enchText = '';
        if (weapon) {
            weaponLoot = toLoot(weapon);
            if (weaponLoot.category === '' || !weaponLoot.category) weaponLoot.category = 'Оружие (с трупа)';
            const wChance = isDraugr ? (forceEnchant ? 1 : Math.min(0.5, Math.max(0, (level - 4) * 0.03))) : 0;
            if (Math.random() < wChance) {
                enchantLoot(weaponLoot, level, ['Урон холодом', 'Урон огнем', 'Урон электричеством', 'Паралич', 'Страх']);
                const e = weaponLoot.enchantment;
                if (e && /урон/i.test(e.name) && typeof e.value === 'number') enchBonus = Math.round(e.value);
                enchText = e ? ' [' + e.name + (typeof e.value === 'number' ? ' ' + e.value : '') + ']' : '';
            }
            if (Math.random() < 0.8) lootItems.push(weaponLoot);
        }
        Object.keys(worn).forEach(k => {
            const it = worn[k];
            totalArmor += (it.armor || 0) * armorMult;
            const l = toLoot(it); l.category = 'Броня (с трупа)';
            if (Math.random() < armorEnchChance) enchantLoot(l, level);
            if (Math.random() < 0.6) lootItems.push(l);
        });
        if (shield) { totalArmor += shield.armor || 0; const l = toLoot(shield); l.category = 'Броня (с трупа)'; if (Math.random() < 0.6) lootItems.push(l); }
        if (weapon && weapon.slot === 'ranged') {
            const arrows = pool.filter(i => isAmmoName(i.name) && rx.test(i.name) && !isUnique(i) && !/герои/i.test(i.name)).sort((a, b) => (a.dmg || 0) - (b.dmg || 0));
            const arrow = arrows[0] || (isDraugr ? { name: 'Древняя нордская стрела', price: 2, weight: 0.04, category: 'Стрелы (особые)' } : { name: 'Стрела Изгоев', price: 2, weight: 0.04, category: 'Стрелы (особые)' });
            if (Math.random() < 0.9) { const a = toLoot(arrow); a.qty = rnd(3, 10); lootItems.push(a); }
        }

        // --- остальной лут (золото, костная мука, камни, свитки…) — из текста вики, без оружия/брони ---
        const rest = rollFromText(enemy.loot, { pool, level }, { skipGear: true });
        rest.items.forEach(i => lootItems.push(i));

        // --- урон: базовый урон записи × отношение урона выбранного оружия к среднему по допустимым ---
        let dmg = enemy.weaponDmg || 0;
        if (weapon && enemy.weaponDmg) {
            const aw = unarmed ? { list: [weapon] } : allowedWeapons(pool, enemy, rx);
            const ref = aw.list.reduce((s, i) => s + (i.dmg || 0), 0) / aw.list.length || weapon.dmg || 1;
            const factor = Math.max(0.75, Math.min(1.25, (weapon.dmg || ref) / ref));
            dmg = Math.round(enemy.weaponDmg * factor);
        }
        // Тип врага, у которого оружие зачаровано «по записи» (Главный палач, Повелитель), уже имеет урон с учётом зачарования —
        // сверху не прибавляем. У остальных бонус от случайного зачарования ограничен 30% базового урона.
        if (enchBonus) enchBonus = forceEnchant ? 0 : Math.min(enchBonus, Math.max(1, Math.round((enemy.weaponDmg || 0) * 0.3)));
        dmg += enchBonus;

        const gearNames = [];
        if (weapon) gearNames.push((weaponLoot ? weaponLoot.name : weapon.name));
        if (shield) gearNames.push(shield.name);
        // Из заметки записи оставляем только особые свойства (похищение хп/мп и т.п.) — перечень брони/оружия там дублировал бы подбор.
        const dbNote = (enemy.weaponNote || '').split(/\.\s+(?=[А-ЯЁ])/).filter(x => /похищает|крад|вытягив|отравл/i.test(x)).join('. ');
        const weaponNote = (gearNames.join(' + ') || (unarmed ? 'Безоружный — только крики' : ''))
            + (armorMult > 1 ? ' · броня изгоев ×' + armorMult : '')
            + (dbNote ? ' · ' + dbNote : '')
            + (enchBonus ? ' (в уроне +' + enchBonus + ' от зачарования)' : '');

        const resist = Object.assign({}, enemy.resist || {});
        resist.physical = Math.min(85, Math.max(resist.physical || 0, Math.round(totalArmor / 10)));

        return {
            family: fam,
            name: enemy.name, level, hp: enemy.hp || 0, mp: enemy.mana || 0,
            weaponDmg: dmg, weaponNote, isRanged: !!(weapon && weapon.slot === 'ranged'),
            armor: totalArmor, resist,
            spells: (enemy.spells || []).map(s => Object.assign({}, s)),
            shouts: (enemy.shouts || []).map(s => Object.assign({}, s)),
            soul: enemy.soul || null, kind: enemy.kind || (isDraugr ? 'undead' : 'people'),
            gold: rest.gold, lootItems,
            gear: { weapon: weaponLoot ? weaponLoot.name : null, shield: shield ? shield.name : null, worn: Object.keys(worn).map(k => worn[k].name) }
        };
    }

    const api = { rollFromText, rollForEnemy, generate, familyOf, makeEnchantment, enchantLoot, findByName, toLoot };
    root.EnemyLoot = api;
    root.EnemyGear = { generate, familyOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
