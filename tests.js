// Автотесты данных и формул. Запуск: открыть test.html в браузере (лежит рядом с index.html).
// Они ловят именно тот класс ошибок, что находили вручную: регистры названий, пустые/неточные
// материалы улучшения, дубли, перепутанные категории оружия, неверные значения yieldCount.
// Формулы (calcAlchemyValue/calcEnchantPower) здесь только ПРОВЕРЯЮТСЯ, не меняются.
(function () {
    const W = window;
    const results = [];
    function ok(cond, label, detail) { results.push({ pass: !!cond, label, detail: cond ? '' : (detail || '') }); }
    function eq(actual, expected, label) {
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        results.push({ pass, label, detail: pass ? '' : `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}` });
    }
    function warn(label, detail) { results.push({ pass: true, warn: true, label, detail }); }

    // ---------- АЛХИМИЯ (таблица автора, версия 3) ----------
    // Формула: база × (1+навык/200)/(1+5/200) × (1+0.25×ранг алхимика) × провизор|отравитель × целитель × (1+снаряжение/100).
    // На навыке 5 без перков значения ровно из таблицы; округление до целого; длительность — навык максимум 80, сила — 100.
    const CE = W.calcAlchemyEffect;
    const calc = (n, ctx) => CE(n, ctx);
    eq(calc('Восстановление здоровья', { skill: 5 }).magnitude, 20, 'Алхимия: навык 5 → Восстановление здоровья ровно 20 (таблица)');
    eq(calc('Восстановление магии', { skill: 5 }).magnitude, 25, 'Алхимия: навык 5 → Восстановление магии 25');
    eq(calc('Увеличение физ.урона', { skill: 5 }).magnitude, 9, 'Алхимия: навык 5 → Увеличение физ.урона 9%');
    eq(calc('Урон здоровью', { skill: 5 }).magnitude, 10, 'Алхимия: навык 5 → Урон здоровью 10');
    eq(calc('Урон магии', { skill: 5 }).magnitude, 12, 'Алхимия: навык 5 → Урон магии 12');
    eq(calc('Регенерация здоровья', { skill: 5 }).magnitude, 5, 'Алхимия: навык 5 → Регенерация здоровья 5');
    eq(calc('Невидимость', { skill: 5 }).duration, 1, 'Алхимия: навык 5 → Невидимость 1 круг');
    eq(calc('Водное дыхание', { skill: 5 }).duration, 2, 'Алхимия: навык 5 → Водное дыхание 2 круга');
    eq(calc('Невидимость', { skill: 5 }).magnitude, null, 'Алхимия: у Невидимости нет «силы», только длительность');
    eq(calc('Исцеление ядов', { skill: 5 }).magnitude, null, 'Алхимия: у лечения ядов нет ни силы, ни длительности');
    eq(calc('Восстановление здоровья', { skill: 100 }).magnitude, 29, 'Алхимия: навык 100 → 20×1.5/1.025 = 29');
    eq(calc('Восстановление здоровья', { skill: 200 }).magnitude, 29, 'Алхимия: навык выше 100 силу не повышает (потолок 100)');
    eq(calc('Регенерация здоровья', { skill: 100, alchemistRank: 5 }).duration, calc('Регенерация здоровья', { skill: 80, alchemistRank: 5 }).duration, 'Алхимия: для длительности навык считается максимум до 80');
    eq(calc('Восстановление здоровья', { skill: 5, alchemistRank: 2 }).magnitude, 30, 'Алхимия: ранг Алхимика 2 = +50% → 30');
    eq(calc('Восстановление здоровья', { skill: 5, alchemistRank: 9 }).magnitude, 45, 'Алхимия: ранг алхимика не выше 5 (+125% → 45)');
    eq(calc('Восстановление здоровья', { skill: 5, hasProvisor: true, mode: 'potion' }).magnitude, 25, 'Алхимия: Провизор +25% на зелье → 25');
    eq(calc('Восстановление здоровья', { skill: 5, hasProvisor: true, mode: 'poison' }).magnitude, 20, 'Алхимия: Провизор не работает на яды');
    eq(calc('Восстановление здоровья', { skill: 5, hasHealer: true, mode: 'potion' }).magnitude, 25, 'Алхимия: Целитель +25% на лечение здоровья → 25');
    eq(calc('Повышение здоровья', { skill: 5, hasHealer: true, mode: 'potion' }).magnitude, 15, 'Алхимия: Целитель НЕ усиливает «Повышение здоровья» (максимум)');
    eq(calc('Регенерация здоровья', { skill: 5, hasHealer: true, mode: 'potion' }).magnitude, 5, 'Алхимия: Целитель НЕ усиливает регенерацию');
    eq(calc('Увеличение физ.урона', { skill: 5, hasHealer: true, hasProvisor: true, mode: 'potion' }).magnitude, 14, 'Алхимия: Целитель и Провизор вместе на физ. урон: 9×1.25×1.25 = 14');
    eq(calc('Урон здоровью', { skill: 5, hasPoisoner: true, mode: 'poison' }).magnitude, 13, 'Алхимия: Отравитель +25% на отрицательное свойство яда → 13');
    eq(calc('Урон здоровью', { skill: 5, hasPoisoner: true, mode: 'potion' }).magnitude, 10, 'Алхимия: Отравитель не работает на зелья');
    eq(calc('Восстановление здоровья', { skill: 5, hasPoisoner: true, mode: 'poison' }).magnitude, 20, 'Алхимия: Отравитель не усиливает положительное свойство яда');
    eq(calc('Урон здоровью', { skill: 5, hasProvisor: true, mode: 'potion' }).magnitude, 10, 'Алхимия: Провизор не усиливает отрицательное свойство зелья');
    eq(calc('Восстановление здоровья', { skill: 5, gear: 24 }).magnitude, 25, 'Алхимия: зачарование на алхимию +24% → 25');
    eq(calc('Увеличение скорости передвижения', { skill: 5 }).magnitude, 5, 'Алхимия: скорость — минимум 5');
    eq(calc('Увеличение скорости передвижения', { skill: 100, alchemistRank: 5, hasProvisor: true }).magnitude % 5, 0, 'Алхимия: скорость кратна 5');
    eq(calc('Замедление', { skill: 5 }).magnitude, 5, 'Алхимия: замедление тоже не меньше 5 фт (база 3 → 5)');

    // Правило автора про сочетания
    const SH = W.getSharedAlchemyEffectsFor;
    eq(SH('Пшеница', 'Крыло монарха', null).indexOf('Восстановление здоровья') !== -1, true, 'Алхимия: пример автора — Пшеница + Крыло монарха = восстановление здоровья');
    eq(SH('Пшеница', 'Крыло монарха', 'Палец великана').indexOf('Повышение здоровья') !== -1, true, 'Алхимия: пример автора — палец великана добавляет «Повышение здоровья»');
    eq(SH('Абесинский окунь', 'Алый корень Нирна', null), [], 'Алхимия: нет общих свойств у первых двух — варево не получится');
    // Третий ингредиент не спасает пару без общих свойств
    (function () {
        const names = Object.keys(W.alchemyIngredients); let found = null;
        for (let i = 0; i < names.length && !found; i++) for (let j = i + 1; j < names.length && !found; j++) {
            if (SH(names[i], names[j], null).length) continue;
            for (let k = 0; k < names.length; k++) if (k !== i && k !== j) { found = [names[i], names[j], names[k]]; break; }
        }
        ok(!!found && SH(found[0], found[1], found[2]).length === 0, 'Алхимия: если у первых двух нет общих свойств, третий ингредиент ничего не даёт', found ? found.join(' + ') : 'не нашлось примера');
    })();

    // Данные: 110 ингредиентов таблицы, у каждого 4 известных эффекта
    const AI = W.alchemyIngredients || {};
    eq(Object.keys(AI).length, 110, 'Алхимия: в базе ровно 110 ингредиентов таблицы автора');
    const badEff = [];
    Object.keys(AI).forEach(n => { if (AI[n].effects.length !== 4) badEff.push(n + ' (эффектов ' + AI[n].effects.length + ')'); AI[n].effects.forEach(e => { if (!W.alchemyBaseEffects[e]) badEff.push(n + ': «' + e + '»'); }); });
    ok(badEff.length === 0, 'Алхимия: у каждого ингредиента 4 свойства, все описаны в таблице эффектов', badEff.join('; '));
    const noKind = Object.keys(W.alchemyBaseEffects).filter(n => !W.alchemyBaseEffects[n].kind);
    ok(noKind.length === 0, 'Алхимия: у каждого эффекта есть kind для движка', noKind.join(', '));
    const skillEff = Object.keys(W.alchemyBaseEffects).filter(n => W.alchemyBaseEffects[n].kind === 'skill');
    eq(skillEff.length, 16, 'Алхимия: 16 эффектов усиления навыков (колонка G таблицы)');
    ok(skillEff.every(n => W.alchemyBaseEffects[n].desc && W.alchemyBaseEffects[n].desc.indexOf('N') !== -1), 'Алхимия: у каждого усиления навыка есть описание из таблицы');
    ok(W.alchemyBaseEffects['Повышение навыка: Тяжелая броня'].desc.indexOf('тяжёлой брони') !== -1 || W.alchemyBaseEffects['Повышение навыка: Тяжелая броня'].desc.indexOf('тяжелой брони') !== -1 || /Тяж/i.test(W.alchemyBaseEffects['Повышение навыка: Тяжелая броня'].desc), 'Алхимия: описание тяжёлой брони из таблицы');
    ok((W.alchemyPremadePotions || []).length > 100 && W.alchemyPremadePotions.every(p => p.alchemyEffects && p.alchemyEffects.length), 'Алхимия: «лут»-зелья построены из новой таблицы и несут эффекты');
    ok(typeof W.ALCHEMY_RULES_VERSION === 'number' && W.ALCHEMY_RULES_VERSION >= 2, 'Алхимия: есть версия правил (для одноразового сброса знаний игроков)');

    // ---------- ЗАЧАРОВАНИЕ ----------
    const E = W.calcEnchantPower, effDmg = { name: 'Урон огнем', maxValue: 20, unit: 'урона' };
    eq(E(effDmg, 'Обычный', 50, {}).value, 10, 'Зачарование: макс 20, Обычный камень, навык 50 → 10');
    eq(E(effDmg, 'Великий', 100, {}).value, 30, 'Зачарование: макс 20, Великий камень, навык 100 → 30');
    eq(E({ name: 'Захват души', maxValue: null }, 'Обычный', 100, {}).boolean, true, 'Зачарование: булев эффект (Захват души)');

    // ---------- КУЗНЯ ----------
    const recipes = [].concat(W.armorRecipes || [], W.jewelryRecipes || [], W.weaponRecipes || []);
    const byName = n => recipes.find(r => r.name === n);
    eq(byName('Железная секира') && byName('Железная секира').category, 'Двуручное', 'Кузня: секира — двуручное');
    eq(byName('Железный боевой топор') && byName('Железный боевой топор').category, 'Одноручное', 'Кузня: боевой топор — одноручное');
    eq(byName('Орочий лук') && byName('Орочий лук').slot, 'ranged', 'Кузня: лук — слот ranged');

    const items = W.allItems || [];
    const itemNames = new Set(items.map(i => i.name));
    // Материал улучшения должен существовать как предмет ТОЧНО по имени (countInInventory ищет по точному)
    const KNOWN_MISSING_MATERIALS = []; // пробелов нет (Хитиновая пластина добавлена в items-data.js)
    const badMat = [], emptyMat = [];
    (W.armorRecipes || []).forEach(r => {
        if (!r.upgradeMaterial) { emptyMat.push(r.name); return; }
        if (!itemNames.has(r.upgradeMaterial)) badMat.push(`${r.name}: «${r.upgradeMaterial}»`);
    });
    ok(emptyMat.length === 0, 'Кузня: у всей брони заполнен upgradeMaterial', emptyMat.join(', '));
    const unexpected = badMat.filter(b => !KNOWN_MISSING_MATERIALS.some(k => b.indexOf(k) !== -1));
    ok(unexpected.length === 0, 'Кузня: upgradeMaterial брони точно совпадает с именем предмета', unexpected.join('; '));
    if (badMat.length > unexpected.length) warn('Известный пробел: материала нет в базе предметов', KNOWN_MISSING_MATERIALS.join(', '));

    const ammo = [].concat(W.weaponRecipes || [], W.weaponsNonCraftable || []).filter(w => w.isAmmo && w.ingredients);
    const plainAmmo = ammo.filter(w => w.ingredients.length === 2 && w.ingredients.some(g => g.name === 'Полено'));
    ok(plainAmmo.length > 0 && plainAmmo.every(w => w.yieldCount === 20), 'Кузня: обычные стрелы/болты (Полено + материал) дают 20 за крафт', plainAmmo.filter(w => w.yieldCount !== 20).map(w => w.name).join(', '));
    const weaponNames = [].concat(W.weaponRecipes || [], W.weaponsNonCraftable || []).map(w => w.name);
    ok(weaponNames.every(n => n[0] === n[0].toUpperCase()), 'Кузня: названия оружия начинаются с заглавной', weaponNames.filter(n => n[0] !== n[0].toUpperCase()).join(', '));
    ok(weaponNames.every(n => !/болт$/.test(n) || n.split(' ').length >= 2), 'Кузня: у болтов название из двух слов (не «эбонитовый» без «болт»)', weaponNames.filter(n => /болт$/.test(n) && n.split(' ').length < 2).join(', '));

    // ---------- ПРЕДМЕТЫ ----------
    const find = n => items.find(i => i.name === n);
    eq(find('Подсумок на 2 зелья') && [find('Подсумок на 2 зелья').slot, find('Подсумок на 2 зелья').capacity], ['pouch', 2], 'Предметы: подсумок на 2 зелья');
    ['Мешочек:25', 'Небольшой рюкзак:50'].forEach(s => { const [n, c] = s.split(':'); const it = items.find(i => i.name === n && i.slot === 'backpack'); eq(it && it.carryBonus, +c, `Предметы: рюкзак «${n}» → +${c}`); });
    eq(items.filter(i => i.slot === 'backpack' && i.name === 'Походный рюкзак').map(i => i.carryBonus), [75], 'Предметы: экипируемый «Походный рюкзак» → +75');
    eq([find('Дракр') && find('Дракр').price, find('Думак') && find('Думак').price], [4, 5], 'Предметы: валюты Дракр=4, Думак=5');

    // Материалы Солстейма (данные UESP): пластина 1/5, шкура нетча 2/10, сердечный камень 1/100
    [['Хитиновая пластина', 1, 5], ['Шкура нетча', 2, 10], ['Сердечный камень', 1, 100]].forEach(([n, w, p]) => {
        eq(find(n) && [find(n).weight, find(n).price], [w, p], `Предметы: «${n}» — вес ${w}, цена ${p}`);
    });

    // Ингредиенты рецептов должны существовать как предметы (иначе рецепт никогда не скуётся).
    // Известные пробелы — предупреждение; ЛЮБОЙ новый пробел — падение.
    const KNOWN_MISSING_INGREDIENTS = []; // все ингредиенты рецептов теперь существуют как предметы
    const productNames = new Set(recipes.concat(W.weaponsNonCraftable || []).map(r => r.name));
    const missingIng = new Set();
    recipes.forEach(r => (r.ingredients || []).forEach(g => { if (!itemNames.has(g.name) && !productNames.has(g.name)) missingIng.add(g.name); }));
    const newGaps = [...missingIng].filter(n => KNOWN_MISSING_INGREDIENTS.indexOf(n) === -1);
    ok(newGaps.length === 0, 'Кузня: у всех ингредиентов рецептов есть предмет в базе (кроме известных пробелов)', newGaps.join(', '));
    const stillMissing = [...missingIng].filter(n => KNOWN_MISSING_INGREDIENTS.indexOf(n) !== -1);
    if (stillMissing.length) warn('Известные пробелы: этих ингредиентов нет в базе, рецепты на них не скуются', stillMissing.join(', '));

    // Рецепт с пустым списком ингредиентов раньше ковался бесплатно. Сейчас код такие рецепты блокирует,
    // но данные стоит дозаполнить: известные пробелы — предупреждение, любой НОВЫЙ — падение.
    const KNOWN_EMPTY_RECIPES = ['Меховые боевые перчатки', 'Сыромятные боевые наручи', 'Железные боевые наручи', 'Стальные боевые перчатки', 'Ламеллярные боевые наручи', 'Пластинчатые боевые перчатки', 'Эльфийские боевые перчатки', 'Двемерские боевые перчатки', 'Орочьи боевые перчатки', 'Стеклянные боевые перчатки', 'Нордские боевые рукавицы', 'Эбонитовые боевые перчатки'];
    const emptyRecipes = recipes.filter(r => !r.ingredients || !r.ingredients.length).map(r => r.name);
    const newEmpty = emptyRecipes.filter(n => KNOWN_EMPTY_RECIPES.indexOf(n) === -1);
    ok(newEmpty.length === 0, 'Кузня: у всех рецептов указаны ингредиенты (кроме известных пробелов)', newEmpty.join(', '));
    if (emptyRecipes.length) warn(`Кастеты пока намеренно не куются: у ${emptyRecipes.length} рецептов не указаны материалы — ковка заблокирована`, emptyRecipes.join(', '));

    // ---------- АЛХИМИЯ: предметы-ингредиенты и алхимическая база должны совпадать по имени ----------
    // Раньше один и тот же ингредиент жил под двумя написаниями ("Паслён" в предметах и "Паслен" в базе
    // эффектов; то же с жёлудем, бивнем, хвостом злокрыса) — ингредиент нельзя было применить в зельях.
    const alch = W.alchemyIngredients || {};
    const alchItems = items.filter(i => i.category === 'Ингредиенты для алхимии').map(i => i.name);
    const normName = s => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const alchNormMap = new Map(Object.keys(alch).map(k => [normName(k), k]));
    const spellingPairs = alchItems.filter(n => !alch[n] && alchNormMap.has(normName(n))).map(n => `«${n}» ≠ «${alchNormMap.get(normName(n))}»`);
    ok(spellingPairs.length === 0, 'Алхимия: нет ингредиентов с разным написанием в предметах и алхимической базе', spellingPairs.join('; '));
    // Известные пробелы: ингредиенты-предметы без свойств в таблице автора (рыба, часть Dragonborn). Они не годятся в зелья — это не ошибка.
        const KNOWN_NO_ITEM = [];
    const noEffects = alchItems.filter(n => !alch[n]);
    const noItem = Object.keys(alch).filter(k => alchItems.indexOf(k) === -1);
    // ингредиенты-предметы без свойств в таблице автора — только предупреждение (в зельях не используются)
    ok(noItem.filter(n => KNOWN_NO_ITEM.indexOf(n) === -1).length === 0, 'Алхимия: у каждого ингредиента из базы эффектов есть предмет (кроме известных пробелов)', noItem.filter(n => KNOWN_NO_ITEM.indexOf(n) === -1).join(', '));
    if (noEffects.length) warn(`Известный пробел: у ${noEffects.length} ингредиентов-предметов не записаны алхимические эффекты — в зельях не используются`, noEffects.join(', '));
    if (noItem.length) warn('Известный пробел: ингредиенты с эффектами, но без предмета', noItem.join(', '));
    // Недостающие предметы по вики
    [['Серебряная руда', 1, 25], ['Серебряный слиток', 1, 50], ['Золотой слиток', 1, 100], ['Козьи рога', 1, 5]].forEach(([n, w, p]) => eq(find(n) && [find(n).weight, find(n).price], [w, p], `Предметы: «${n}» — вес ${w}, цена ${p}`));

    // ---------- ПОСОХИ-ЗАКЛИНАТЕЛИ (рецепты по рангу заклинания) ----------
    const SR = W.magicStaffRecipes || {};
    ok([1, 2, 3, 4].every(k => Array.isArray(SR[k]) && SR[k].length), 'Посохи: есть рецепт для каждого ранга 1-4');
    const badStaffIng = [];
    [1, 2, 3, 4].forEach(k => (SR[k] || []).forEach(g => { if (!itemNames.has(g.name)) badStaffIng.push(`ранг ${k}: ${g.name}`); }));
    ok(badStaffIng.length === 0, 'Посохи: все ингредиенты рецептов существуют как предметы', badStaffIng.join('; '));
    const qtyOf = (k, n) => ((SR[k] || []).find(g => g.name === n) || {}).qty || 0;
    ok([1, 2, 3, 4].every(k => qtyOf(k, 'Сердечный камень') > 0), 'Посохи: в каждом рецепте участвует Сердечный камень');
    const heart = [1, 2, 3, 4].map(k => qtyOf(k, 'Сердечный камень'));
    ok(heart.every((v, i) => i === 0 || v > heart[i - 1]), 'Посохи: сердечных камней строго больше с каждым рангом', heart.join(' < '));
    const total = [1, 2, 3, 4].map(k => (SR[k] || []).reduce((s, g) => s + g.qty, 0));
    ok(total.every((v, i) => i === 0 || v > total[i - 1]), 'Посохи: рецепт Новичка легче Ученика, Ученика легче Адепта и т.д. (суммарно ингредиентов)', total.join(' < '));

    // ---------- УНИКАЛЬНОЕ НЕ ДОЛЖНО ПАДАТЬ ИЗ СЛУЧАЙНЫХ СУНДУКОВ ----------
    // Правило из gm.js (isUniqueLootItem): флаг unique ИЛИ категория на "Уникальн".
    const uniq = (W.uniqueWeaponsData || []);
    ok(uniq.length > 0 && uniq.every(u => u.unique || /^Уникальн/.test(u.category || '')), 'Лут: всё уникальное оружие помечено так, что генераторы его отсекают', uniq.filter(u => !(u.unique || /^Уникальн/.test(u.category || ''))).map(u => u.name).join(', '));

    // ---------- ЗАКЛИНАНИЯ ----------
    const spellNames = [];
    ['destr', 'restor', 'alter', 'illus', 'conj'].forEach(school => {
        ok(W.spellsData && W.spellsData[school], `Заклинания: школа ${school} существует`);
        [1, 2, 3, 4].forEach(t => ((W.spellsData[school] || {})[t] || []).forEach(s => spellNames.push(s.name)));
    });
    ok(spellNames.every(n => n[0] === n[0].toUpperCase()), 'Заклинания: названия начинаются с заглавной', spellNames.filter(n => n[0] !== n[0].toUpperCase()).join(', '));
    const nameSet = new Set(spellNames);
    const tomes = W.spellTomesData || [];
    ok(tomes.every(t => nameSet.has(t.spellName)), 'Тома: spellName каждого тома точно совпадает с названием заклинания', tomes.filter(t => !nameSet.has(t.spellName)).map(t => t.spellName).join(', '));
    const fireball = ((W.spellsData.destr || {})[3] || []).find(s => s.name === 'Огненный шар');
    ok(fireball && fireball.desc.indexOf('50') !== -1, 'Заклинания: у Огненного шара в описании 50 урона');

    // ---------- ОСОБЫЕ СПОСОБНОСТИ (powers-data.js) — строго по Sistema 2.2.docx и Фракции.xlsx ----------
    const PW = W.powersData || [];
    const RACE_KEYS = ['nord', 'altmer', 'breton', 'orc', 'khajiit', 'redguard', 'argonian', 'bosmer', 'dunmer', 'imperial'];
    const SIGN_KEYS = ['warrior', 'mage', 'thief', 'atronach', 'apprentice', 'steed', 'lady', 'lord', 'zmey', 'ritual', 'lover', 'shadow', 'tower'];
    ok(PW.length > 0, 'Способности: данные загружены');
    ok(new Set(PW.map(p => p.id)).size === PW.length, 'Способности: id уникальны');
    ok(PW.every(p => ['race', 'sign', 'werewolf', 'vampire'].indexOf(p.source) !== -1), 'Способности: у каждой допустимый source');
    ok(PW.filter(p => p.source === 'race').every(p => RACE_KEYS.indexOf(p.race) !== -1), 'Способности: расовые привязаны к существующим расам');
    ok(PW.filter(p => p.source === 'sign').every(p => SIGN_KEYS.indexOf(p.sign) !== -1), 'Способности: знаковые привязаны к существующим знакам');
    // Расы с «Боевым кличем» в Word-файле — ровно эти шесть; у остальных его нет
    const cry = PW.filter(p => p.name === 'Боевой клич').map(p => p.race).sort();
    eq(cry, ['argonian', 'imperial', 'khajiit', 'nord', 'orc', 'redguard'], 'Способности: «Боевой клич» у аргонианина, имперца, каджита, норда, орка, редгарда (как в Sistema 2.2)');
    const byRace = r => PW.filter(p => p.source === 'race' && p.race === r).map(p => p.name).sort();
    eq(byRace('argonian'), ['Боевой клич', 'Кора хиста'], 'Способности аргонианина: Кора хиста + Боевой клич');
    eq(byRace('orc'), ['Агрессия', 'Берсерк', 'Боевой клич'], 'Способности орка: Берсерк, Агрессия, Боевой клич');
    eq(byRace('redguard'), ['Боевой клич', 'Выброс адреналина'], 'Способности редгарда: Выброс адреналина + Боевой клич');
    ['altmer', 'bosmer', 'dunmer', 'breton'].forEach(r => eq(byRace(r), [], `Способности расы «${r}»: активных нет (пассивные особенности в списке рас)`));
    const bySign = s => PW.filter(p => p.source === 'sign' && p.sign === s).map(p => p.name).sort();
    eq(bySign('ritual'), ['Благословенное Слово', 'Дар Мары'], 'Знак Ритуал: Дар Мары + Благословенное Слово');
    eq(bySign('lover'), ['Поцелуй любовника'], 'Знак Любовник: Поцелуй любовника');
    eq(bySign('lord'), ['Кровь Севера'], 'Знак Лорд: Кровь Севера');
    eq(bySign('shadow'), ['Лунная тень'], 'Знак Тень: Лунная тень');
    eq(bySign('tower'), ['Башенный ключ'], 'Знак Башня: Башенный ключ');
    eq(bySign('zmey').length, 2, 'Знак Змей: два варианта (очищение / яд)');
    ok(new Set(PW.filter(p => p.sign === 'zmey').map(p => p.group)).size === 1, 'Знак Змей: общий дневной лимит на оба варианта');
    // Числа из документа
    const f = id => PW.find(p => p.id === id);
    eq(f('histskin').effect.healLevelMult, 10, 'Кора хиста: лечение 10 × уровень');
    eq(f('berserk').effect.tempHpLevelMult, 10, 'Берсерк: временные ХП = уровень × 10');
    eq(f('berserk').turns, 10, 'Берсерк: 10 ходов');
    eq([f('adrenaline').turns, f('adrenaline').effect.speed], [3, 10], 'Выброс адреналина: 3 хода, +10 фт.');
    eq(f('battlecry_orc').effect.taunt, 15, 'Боевой клич: 15 ходов');
    eq(f('ritual_mara').effect.healDiceByLevel, [[1, 2], [5, 3], [11, 4], [17, 5]], 'Дар Мары: 2d10 / 3d10 с 5 / 4d10 с 11 / 5d10 с 17 уровня');
    eq(f('lord_blood').effect.healLevelMod, 2, 'Кровь Севера: 2 × уровень × мод. Телосложения');
    // Оборотень — по одному умению на каждый из трёх тотемов Хирсина (названия тотемов — как в мастерской панели)
    eq(PW.filter(p => p.source === 'werewolf').map(p => p.requiresTotem).sort(), ['Тотем Братства', 'Тотем Охоты', 'Тотем Страха'], 'Оборотень: умение на каждый тотем Хирсина');
    ok(PW.filter(p => p.source === 'werewolf').every(p => p.requiresTransformed), 'Оборотень: умения только в облике зверя');
    // Вампир-лорд — только способности из VAMPIRE_ABILITIES (gm.js), без выдуманных
    const VAMP_OK = ['Хватка вампира', 'Вызов гаргульи', 'Трупное проклятье', 'Обнаружение существ', 'Туманная форма', 'Сверхъестественные рефлексы'];
    ok(PW.filter(p => p.source === 'vampire' && p.perk).every(p => VAMP_OK.indexOf(p.perk) !== -1 && p.name === p.perk) && PW.filter(p => p.source === 'vampire' && p.base).length === 2, 'Вампир/лорд: способности лорда из таблицы + 2 бесплатных заклинания вампира')
    ok(PW.filter(p => p.perDay).every(p => p.desc && p.desc.length > 20), 'Способности: у каждой «раз за отдых» есть описание');

    // ---------- РЫБЫ AE (fish-data.js) и рецепты кухни ----------
    const FD = W.fishData || [];
    ok(FD.length === 28, `Рыбы: все 28 видов AE на месте (сейчас ${FD.length})`);
    ok(new Set(FD.map(f => f.name)).size === FD.length, 'Рыбы: названия уникальны');
    const WATERS = ['freezing', 'lake', 'stream', 'underground'], WEATHERS = ['any', 'clear', 'rain'], RARITIES = ['common', 'uncommon', 'rare'];
    ok(FD.every(f => f.habitats.length && f.habitats.every(h => WATERS.indexOf(h[0]) !== -1 && WEATHERS.indexOf(h[1]) !== -1 && RARITIES.indexOf(h[2]) !== -1)), 'Рыбы: у каждой есть положение (вода/погода/редкость) из допустимых значений');
    ok(FD.every(f => itemNames.has(f.name)), 'Рыбы: у каждой есть предмет в базе', FD.filter(f => !itemNames.has(f.name)).map(f => f.name).join(', '));
    // Каждую рыбу реально можно поймать хотя бы в одной воде при какой-то погоде
    const catchable = f => f.habitats.some(h => WATERS.indexOf(h[0]) !== -1);
    ok(FD.every(catchable), 'Рыбы: каждая ловится хотя бы где-то');
    ['freezing', 'lake', 'stream', 'underground'].forEach(w => ok(FD.some(f => f.habitats.some(h => h[0] === w)), `Рыбы: в воде «${w}» есть что ловить`));
    ok(FD.filter(f => f.estimated).length <= 3, 'Рыбы: оценочных (без точных цифр с вики) не больше трёх', FD.filter(f => f.estimated).map(f => f.name).join(', '));
    // ---------- ОХОТА (hunt-data.js) ----------
    const HD = W.huntData || { animals: {}, holdFauna: {}, regionMod: {} };
    const HA = HD.animals, enemyByName = {};
    (W.enemiesData || []).forEach(e => { enemyByName[e.name] = e; });
    ok(Object.keys(HA).length >= 6, `Охота: звери на месте (${Object.keys(HA).length})`);
    ok(Object.keys(HA).every(n => enemyByName[n]), 'Охота: каждый зверь есть в базе врагов (категория «Животные»)', Object.keys(HA).filter(n => !enemyByName[n]).join(', '));
    ok(Object.keys(HA).every(n => enemyByName[n] && enemyByName[n].category === 'Животные' && (enemyByName[n].weaponDmg || 0) <= 15), 'Охота: только небоевые животные (урон ≤ 15, нет хищников)');
    ok(Object.keys(HA).every(n => HA[n].drops.length && HA[n].drops.every(d => itemNames.has(d.item) && d.min >= 1 && d.max >= d.min)), 'Охота: вся добыча есть в базе предметов', Object.keys(HA).map(n => HA[n].drops.filter(d => !itemNames.has(d.item)).map(d => d.item)).flat().join(', '));
    ok(Object.keys(HD.holdFauna).length === 10, `Охота: фауна заведена для всех 10 владений (${Object.keys(HD.holdFauna).length})`);
    ok(Object.keys(HD.holdFauna).every(h => Object.keys(HD.holdFauna[h]).every(n => HA[n])), 'Охота: в фауне владений нет неизвестных зверей');
    ok(Object.keys(HA).every(n => Object.keys(HD.holdFauna).some(h => HD.holdFauna[h][n])), 'Охота: каждый зверь водится хотя бы в одном владении');
    const HF = HD.holdFauna || {};
    ok(['Кролик', 'Олень (самка)', 'Олень (самец)', 'Лось', 'Лиса', 'Коза'].every(n => HF['Фолкрит'][n] && HF['Вайтран'][n]) && HF['Фолкрит']['Олень (самка)'] > HF['Вайтран']['Олень (самка)'] && HF['Фолкрит']['Олень (самец)'] > HF['Вайтран']['Олень (самец)'] && !HF['Фолкрит']['Снежная лиса'], 'Охота: Фолкрит — звери как в Вайтране, но оленей больше');
    ok(!HF['Маркарт (Предел)']['Олень (самка)'] && !HF['Маркарт (Предел)']['Олень (самец)'] && Object.keys(HF['Маркарт (Предел)']).every(n => HF['Вайтран'][n]) && ['Кролик', 'Лиса', 'Коза'].every(n => HF['Маркарт (Предел)'][n]), 'Охота: Предел — как в Вайтране, но без оленей');
    ok(Object.keys(HF['Вайтран']).concat(Object.keys(HF['Белый берег (Данстар)'])).every(n => HF['Солитьюд (Хаафингар)'][n]), 'Охота: Хаафингар — звери и Вайтрана, и Белого берега');
    ok(typeof W.getHuntingPool === 'function' && W.getHuntingPool('Рифт', 'Подземелье').length === 0, 'Охота: под землёй дичи нет');
    ok(W.getHuntingPool('Рифт', 'Лес').length > 0 && W.getHuntingPool(null, null).length > 0, 'Охота: без владения тоже есть дичь по умолчанию');
    ok(W.getHuntingPool('Винтерхолд', null).some(p => p.name === 'Снежная лиса') && !W.getHuntingPool('Рифт', null).some(p => p.name === 'Снежная лиса'), 'Охота: снежная лиса — на севере, не в Рифте');
    ok(W.rollHunt('Рифт', 'Лес', () => 0.05).nothing === true, 'Охота: при низком броске — «зверь ушёл»');
    const hr = W.rollHunt('Рифт', 'Лес', () => 0.99);
    ok(!hr.nothing && hr.drops.length && hr.drops.every(d => d.qty >= 1), 'Охота: при высоком броске есть добыча');
    ok(W.rollHunt('Рифт', 'Подземелье', () => 0.99).noGame === true, 'Охота: в подземелье rollHunt сообщает «дичи нет»');
    // Кухня: все ингредиенты ВСЕХ рецептов известны кухне (иначе блюдо невозможно приготовить)
    const CK = W.cookingIngredients || {};
    const badKitchen = [];
    (W.recipes || []).forEach(r => r.ingredients.forEach(i => { if (!CK[i.name]) badKitchen.push(`${r.name}: ${i.name}`); }));
    ok(badKitchen.length === 0, 'Кухня: все ингредиенты рецептов есть в списке продуктов кухни', badKitchen.join('; '));
    const rkeys = (W.recipes || []).map(r => r.ingredients.map(i => i.name + 'x' + i.qty).sort().join('|'));
    ok(new Set(rkeys).size === rkeys.length, 'Кухня: нет двух рецептов с одинаковым составом (второй никогда бы не сработал)');
    ok(new Set((W.recipes || []).map(r => r.name)).size === (W.recipes || []).length, 'Кухня: названия блюд уникальны');
    // Кузня: цена боеприпасов с эффектом — за ШТУКУ (в таблице была за пачку из 20: пачка стрел продавалась за 5600)
    const badAmmo = (W.weaponRecipes || []).filter(r => r.isAmmo && (r.yieldCount || 1) > 1 && r.price * r.yieldCount > 400).map(r => r.name);
    ok(badAmmo.length === 0, 'Кузня: цены боеприпасов за штуку, пачка не дороже 400', badAmmo.join('; '));
    ok((W.recipes || []).length === 44, `Кухня: 44 рецепта (21 прежний + 23 новых), сейчас ${(W.recipes || []).length}`);
    // Эффекты блюд на «+N хп»/«Запас магии/здоровья увеличен на N» срабатывают автоматически — таких среди новых рецептов должно быть не меньше 4
    const autoRe = /^(\+\s*\d+\s*(хп|мп)|Запас (магии|здоровья) увеличен на \d+)/i;
    ok((W.recipes || []).slice(21).filter(r => autoRe.test(r.effect)).length >= 4, 'Кухня: среди новых рецептов не меньше 4 с автоприменяемым эффектом (хп/мана)');

    // ---------- ВРАГИ ----------
    const en = (W.enemiesData || []).map(e => e.name);
    ok(en.length === new Set(en).size, 'Враги: нет дублей по имени', en.filter((n, i) => en.indexOf(n) !== i).join(', '));

    // Захват душ: у каждого существа задан размер души (null = неизвестно, игрока спросят)
    const SOULS = ['petty', 'lesser', 'common', 'greater', 'grand', 'black', 'none'];
    const noSoulField = (W.enemiesData || []).filter(e => !('soul' in e)).map(e => e.name);
    ok(noSoulField.length === 0, 'Души: поле soul есть у всех существ', noSoulField.join(', '));
    const badSoul = (W.enemiesData || []).filter(e => e.soul !== null && SOULS.indexOf(e.soul) === -1).map(e => e.name + ':' + e.soul);
    ok(badSoul.length === 0, 'Души: размер души — из допустимых значений', badSoul.join(', '));
    const unknownSoul = (W.enemiesData || []).filter(e => e.soul === null).map(e => e.name);
    ok(unknownSoul.length <= 8, 'Души: существ без известного размера души немного (' + unknownSoul.length + ')', unknownSoul.join(', '));
    ['Олень (самка)', 'Олень (самец)', 'Лось', 'Лиса', 'Кролик', 'Коза', 'Корова', 'Курица', 'Хоркер', 'Жрец-дракон'].forEach(n =>
        ok((W.enemiesData || []).some(e => e.name === n), 'Враги: добавлено существо «' + n + '»'));
    const sz = (n) => ((W.enemiesData || []).find(e => e.name === n) || {}).soul;
    ok(sz('Олень (самец)') === 'petty' && sz('Мамонт') === 'grand' && sz('Бандит') === 'black' && sz('Двемерский центурион') === 'none', 'Души: олень — крохотная, мамонт — великая, бандит — чёрная, двемерские машины — без души');

    // Одеяния по школам: у каждой из 5 школ есть роба 4 рангов, 2 капюшона и перчатки; общих «(школы)» не осталось
    const SCHOOLS5 = ['Разрушение', 'Изменение', 'Иллюзия', 'Колдовство', 'Восстановление'];
    const allIt = W.allItems || [];
    const missRobes = [];
    SCHOOLS5.forEach(s => {
        ['новичка', 'ученика', 'адепта', 'эксперта'].forEach(t => { if (!allIt.some(i => i.name === `Одеяние ${t} (${s})` && i.slot === 'robe' && /дешевле/.test(i.effect))) missRobes.push(`Одеяние ${t} (${s})`); });
        ['адепта', 'эксперта'].forEach(t => { if (!allIt.some(i => i.name === `Капюшон ${t} (${s})` && i.slot === 'helmet')) missRobes.push(`Капюшон ${t} (${s})`); });
        if (!allIt.some(i => i.name === `Перчатки магистра (${s})` && i.slot === 'gloves')) missRobes.push(`Перчатки магистра (${s})`);
    });
    ok(missRobes.length === 0, 'Одеяния: все 35 вещей по школам на месте', missRobes.join('; '));
    ok(!allIt.some(i => /\(школы\)/.test(i.name)), 'Одеяния: общих «(школы)» без указания школы не осталось');
    ok(new Set(allIt.filter(i => i.category === 'Магические одеяния').map(i => i.name)).size === allIt.filter(i => i.category === 'Магические одеяния').length, 'Одеяния: нет дублей по названию');

    // Уровни и типы врагов (для заклинаний «до N уровня»)
    const KINDS = ['animal', 'monster', 'people', 'undead', 'daedra', 'automaton'];
    const noLvl = (W.enemiesData || []).filter(e => !(e.level > 0) || KINDS.indexOf(e.kind) === -1).map(e => e.name);
    ok(noLvl.length === 0, 'Враги: у каждого есть уровень (>0) и тип', noLvl.join(', '));
    const kd = (n) => ((W.enemiesData || []).find(e => e.name === n) || {}).kind;
    ok(kd('Драугр') === 'undead' && kd('Лорд дремора') === 'daedra' && kd('Волк') === 'animal' && kd('Двемерский центурион') === 'automaton' && kd('Бандит') === 'people', 'Враги: типы нежити/даэдра/зверя/механизма/человека расставлены');
    // Данные заклинаний, исправленные в этом раунде
    const spellText = (n) => { let t = ''; Object.keys(W.spellsData || {}).forEach(sc => Object.keys(W.spellsData[sc]).forEach(tr => W.spellsData[sc][tr].forEach(s => { if (s.name === n) t = s.desc; }))); return t; };
    ok(/замок/.test(spellText('Стук 3')) && !/Изгоняет/.test(spellText('Стук 3')), 'Заклинания: «Стук 3» — про замок, а не про изгнание даэдра');
    ok(!/Ставит под контроль/.test(spellText('Луч огня')), 'Заклинания: у «Луча огня» нет текста от «Приказа даэдра»');

    // ---------- ЛУТ ВРАГОВ И ГЕНЕРАТОРЫ (enemy-loot.js) ----------
    if (W.EnemyLoot && W.EnemyGear) {
        // Пул — как у мастера: база предметов + то, что куётся/лутится
        const lootPool = (W.allItems || []).slice()
            .concat((W.armorRecipes || []).map(r => ({ name: r.name, category: r.armorType, weight: r.weight, price: r.price, armor: r.resistance, dmg: null, slot: ({ 'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield' })[r.slot] || r.slot })))
            .concat((W.armorNonCraftable || []).map(a => ({ name: a.name, category: a.armorType + ' (лут)', weight: a.weight, price: a.price, armor: a.resistance, dmg: null, slot: a.slot })))
            .concat((W.weaponRecipes || []).map(r => ({ name: r.name, category: r.category, weight: r.weight, price: r.price, armor: null, dmg: r.damage, slot: r.isAmmo ? null : r.slot })))
            .concat((W.weaponsNonCraftable || []).map(w => ({ name: w.name, category: w.category + ' (лут)', weight: w.weight, price: w.price, armor: null, dmg: w.damage, slot: w.isAmmo ? null : w.slot })));
        const roll = (txt, lvl) => W.EnemyLoot.rollFromText(txt, { pool: lootPool, level: lvl || 5 });
        const many = (txt, n) => { const out = []; for (let i = 0; i < (n || 60); i++) out.push(roll(txt)); return out; };

        ok(many('Костная мука 1-2').every(r => r.items.length === 1 && r.items[0].name === 'Костная мука' && (r.items[0].qty || 1) >= 1 && (r.items[0].qty || 1) <= 2), 'Лут: «Костная мука 1-2» — один стек 1-2 штуки');
        ok(many('золото (до 10)').every(r => r.gold >= 1 && r.gold <= 10 && !r.items.length), 'Лут: «золото (до 10)» — золото 1-10, без предметов');
        ok(many('Волчья шкура, маленький шанс на до 15 монет').every(r => !r.items.some(i => /монет/i.test(i.name)) && r.gold <= 15), 'Лут: «маленький шанс на до 15 монет» — это золото с шансом, а не предмет «До 15 монет»');
        ok(many('Волчья шкура, маленький шанс на до 15 монет', 300).some(r => r.gold === 0) && many('Волчья шкура, маленький шанс на до 15 монет', 300).some(r => r.gold > 0), 'Лут: «маленький шанс» — золото выпадает не всегда, но иногда выпадает');
        ok(many('драг камень').every(r => r.items.length === 1 && r.items[0].category === 'Драгоценные камни'), 'Лут: «драг камень» — случайный драгоценный камень из базы');
        ok(many('крохотный/маленький камень душ').every(r => r.items.length === 1 && /^(Крохотный|Маленький) камень душ$/.test(r.items[0].name)), 'Лут: «крохотный/маленький камень душ» — один из двух размеров');
        ok(many('1 зачарованное ожерелье, кольцо или обруч', 20).every(r => r.items.length === 1 && r.items[0].enchantment && r.items[0].enchantment.name && /\[/.test(r.items[0].name)), 'Лут: «1 зачарованное ожерелье/кольцо/обруч» — украшение с зачарованием');
        ok(many('Фалмерские уши,золото,яды,фалмерское оружие', 30).every(r => r.items.some(i => /фалмер/i.test(i.name) && i.slot) && r.items.some(i => /^Яд/.test(i.name))), 'Лут: «фалмерское оружие» и «яды» заменяются реальными предметами');
        ok(many('Древне нордское оружие, Костная мука 1-2, золото (до 10), драг камень, свитки заклинаний', 30).every(r => r.items.some(i => /древн/i.test(i.name) && typeof i.dmg === 'number') && r.items.some(i => /^Свиток/.test(i.name))), 'Лут: текст драугра даёт древненордское оружие и свиток');
        ok(many('Зубы ледяного привидения эссенция ледяного привидения.Нейтрализует 20% урона от холода, действует 10 ходов', 20).every(r => r.items.every(i => !/нейтрализ/i.test(i.name))), 'Лут: описание эффекта после точки не превращается в предмет');
        ok(many('Зубы ледяного привидения, Эссенция ледяного привидения', 10).every(r => r.items.some(i => i.name === 'Эссенция ледяного привидения' && i.alchemyEffects && i.alchemyEffects[0].kind === 'res_frost' && i.alchemyEffects[0].magnitude === 20 && i.alchemyEffects[0].duration === 10)), 'Лут: «Эссенция ледяного привидения» — зелье с эффектом сопротивления холоду 20% на 10 кругов');

        // Уникальное (таблица «Уникальная броня и оружие», Азидал, даэдрические артефакты, маски жрецов) в автолут не попадает
        const uniqNames = new Set((W.allItems || []).filter(i => /^Уникальн|Азидал|Даэдрическ|Маски жрецов|Мораг/.test(i.category || '')).map(i => i.name).concat((W.uniqueWeaponsData || []).map(i => i.name)));
        const priest = many('Маска жреца-дракона, древнее нордское оружие, золото, драг. камни', 40);
        ok(priest.every(r => r.items.every(i => !uniqNames.has(i.name) && !/Маска жреца/.test(i.name))), 'Лут: «Маска жреца-дракона» из текста дропа не выдаётся автоматически (уникальное — только руками мастера)');
        ok(many('Оружие с тела, броня, золото, отмычки, драг. камни', 60).every(r => r.items.every(i => !uniqNames.has(i.name))), 'Лут: «оружие с тела / броня» не выбирает уникальные вещи');

        // Приоритет предпочитаемых зачарований (pickWeighted раньше инвертировал порядок: -1 у «непредпочитаемых» шёл первым)
        let frost = 0; const N = 400;
        for (let i = 0; i < N; i++) { const e = W.EnemyLoot.makeEnchantment('melee', 18, ['Урон холодом', 'Урон огнем']); if (e && e.name === 'Урон холодом') frost++; }
        ok(frost / N > 0.5, 'Лут: предпочитаемое зачарование («Урон холодом») выпадает чаще остальных', 'доля: ' + (frost / N).toFixed(2));

        // Драугры и изгои: правильная фракция, зачарование как у игрока, входные данные не мутируют
        const frozen = JSON.stringify(W.enemiesData);
        const fam = W.enemiesData.filter(e => W.EnemyGear.familyOf(e.name));
        ok(fam.length >= 10, 'Генератор: в базе найдены драугры и изгои (' + fam.length + ')');
        let famBad = [];
        fam.forEach(e => {
            for (let k = 0; k < 25; k++) {
                const g = W.EnemyGear.generate(e, { pool: lootPool, level: e.level });
                const isDr = /драугр/i.test(e.name);
                const gearOk = g.lootItems.filter(i => i.slot && (typeof i.dmg === 'number' || typeof i.armor === 'number') && !/Железный щит|Стрела|стрела/.test(i.name))
                    .every(i => (isDr ? /древн|Древн/.test(i.name) : /изгое|Изгое/i.test(i.name)));
                if (!gearOk) famBad.push(e.name + ': ' + g.lootItems.map(i => i.name).join(', '));
                g.lootItems.forEach(i => { if (i.enchantment && (!i.enchantment.name || !/\[/.test(i.name))) famBad.push(e.name + ': плохое зачарование ' + i.name); });
            }
        });
        ok(famBad.length === 0, 'Генератор: у драугров только древненордская экипировка, у изгоев — изгоев; зачарования в формате игрока', famBad.slice(0, 3).join(' | '));
        ok(JSON.stringify(W.enemiesData) === frozen, 'Генератор: generate() не меняет записи базы врагов');
        const palach = W.enemiesData.find(e => e.name === 'Драугр-главный палач');
        ok(palach && Array.from({ length: 30 }, () => W.EnemyGear.generate(palach, { pool: lootPool, level: 18 })).every(g => /\[/.test(g.gear.weapon || '')), 'Генератор: у «Главного палача» оружие зачаровано всегда (по записи в базе)');
        const unarmed = W.enemiesData.find(e => e.name === 'Неуклюжий драугр');
        ok(unarmed && W.EnemyGear.generate(unarmed, { pool: lootPool, level: 22 }).gear.weapon === null, 'Генератор: «Неуклюжий драугр» безоружен (только крики)');
    }

    // ---------- Разрыв характеристик обычной экипировки (balance_gear.py) ----------
    // У каждой группы (слот брони / тип оружия) порядок предметов по силе сохраняется — расширение не должно их переставлять.
    (function () {
        const bySlotRu = { 'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield' };
        const armor = (W.armorRecipes || []).concat(W.armorNonCraftable || []);
        const chest = armor.filter(a => (bySlotRu[a.slot] || a.slot) === 'chest').map(a => a.resistance);
        ok(Math.min(...chest) === 22 && Math.max(...chest) >= 55, 'Баланс: нагрудники — минимум прежний (22), максимум вырос (≥55)', Math.min(...chest) + '..' + Math.max(...chest));
    })();

    // ---------- Дубли в данных оружия и брони ----------
    // Раньше 12 кастетов лежали и в weaponRecipes, и в weaponsNonCraftable (с разным уроном) — в списках всё было по два раза.
    (function () {
        const dupNames = list => { const seen = {}, d = []; list.forEach(x => { const k = String(x.name).toLowerCase(); if (seen[k]) d.push(x.name); seen[k] = 1; }); return d; };
        const weapons = (W.weaponRecipes || []).concat(W.weaponsNonCraftable || []);
        const armor = (W.armorRecipes || []).concat(W.armorNonCraftable || []);
        ok(dupNames(weapons).length === 0, 'Данные: названия оружия (ковка + лут) не повторяются', dupNames(weapons).join(', '));
        ok(dupNames(armor).length === 0, 'Данные: названия брони (ковка + лут) не повторяются', dupNames(armor).join(', '));
        ok((W.weaponRecipes || []).filter(r => /Кастет/.test(r.subcat || '')).length === 12, 'Данные: кастетов ровно 12 (по одному на название)');
    })();

    // ---------- Уникальная броня: свои названия из таблицы ----------
    (function () {
        const regular = new Set((W.armorRecipes || []).concat(W.armorNonCraftable || []).map(a => a.name.toLowerCase()));
        const unique = (W.allItems || []).filter(i => /^Уникальн/.test(i.category || ''));
        const clash = unique.filter(i => regular.has(i.name.toLowerCase())).map(i => i.name);
        ok(clash.length === 0, 'Уникальная броня: названия не совпадают с названиями обычной брони', clash.join(', '));
        const names = (W.allItems || []).map(i => i.name);
        ['Шлем дезертира Стражи Рассвета', 'Броня дезертира Стражи Рассвета', 'Перчатки дезертира Стражи Рассвета', 'Сапоги дезертира Стражи Рассвета',
         'Шлем инквизитора', 'Броня инквизитора', 'Перчатки инквизитора', 'Сапоги инквизитора', 'Бастион', 'Щит налетчика'].forEach(n =>
            eq(names.filter(x => x === n).length, 1, 'Уникальная броня: «' + n + '» есть ровно один раз'));
        ok(!names.includes('Ламеллярный щит') && names.filter(n => n === 'Прочный железный щит').length === 0, 'Уникальная броня: лишние «Ламеллярный щит» и уникальный «Прочный железный щит» удалены');
        eq((W.allItems || []).filter(i => i.name === 'Походный рюкзак').length, 1, 'Предметы: «Походный рюкзак» ровно один (лагерный вариант удалён)');
    })();

    // Эффекты удалённых дублей объединены с оставшимися записями
    (function () {
        const eff = n => ((W.allItems || []).find(i => i.name === n) || {}).effect || '';
        ok(/холоду \+20%/.test(eff('Броня дезертира Стражи Рассвета')) && /\+15%/.test(eff('Броня дезертира Стражи Рассвета')) && /\+10 ХП/.test(eff('Броня дезертира Стражи Рассвета')) && /\+25 брони/.test(eff('Броня дезертира Стражи Рассвета')), 'Уникальная броня: эффекты «Брони дезертира Стражи Рассвета» объединены с ламеллярным нагрудником');
        ok(/кровотечением/.test(eff('Щит налетчика')) && /\+10 ХП/.test(eff('Щит налетчика')) && /\+25 брони/.test(eff('Щит налетчика')), 'Уникальная броня: эффекты «Щита налетчика» объединены с ламеллярным щитом');
        ok(/\+10% урона оружием/.test(eff('Бастион')) && /\+20 ХП/.test(eff('Бастион')) && /отражения/.test(eff('Бастион')), 'Уникальная броня: эффекты «Бастиона» объединены с прочным железным щитом');
    })();

    // ---------- Карта: адресная видимость, положение поселений (holds-map.js) ----------
    if (W.HoldsMap) {
        const HM = W.HoldsMap;
        ok(HM.visibleTo({}, 'a') && HM.visibleTo({ toUids: [] }, 'a'), 'Карта: метка без адресата видна всем');
        ok(HM.visibleTo({ toUids: ['a'] }, 'a') && !HM.visibleTo({ toUids: ['a'] }, 'b') && !HM.visibleTo({ toUids: ['a'] }, undefined), 'Карта: личная метка видна только адресату');
        const sess = { mapFog: { on: true, r: 35 }, openPlaces: [{ x: 100, y: 100 }, { x: 300, y: 300, toUids: ['a'] }], mapMarks: [{ x: 500, y: 500, toUids: ['b'] }] };
        eq([HM.fogFromSession(sess, false, 'a').circles.length, HM.fogFromSession(sess, false, 'b').circles.length, HM.fogFromSession(sess, false, 'c').circles.length], [2, 2, 1], 'Карта: туман войны открывается только вокруг того, что видно игроку');
        eq(HM.fogFromSession(sess, true).circles.length, 3, 'Карта: предпросмотр мастера (с туманом) видит всё');
        const ovp = { 'Драконий Мост': { hold: 'Солитьюд (Хаафингар)', x: 250, y: 200, u: 0.3, v: 0.45 } };
        const sl = HM.settleLocal('Солитьюд (Хаафингар)', 'Драконий Мост', ovp);
        ok(sl.u === 0.3 && sl.v === 0.45 && sl.custom && !sl.approx, 'Карта: назначенное мастером положение поселения важнее условного');
        ok(HM.settleLocal('Солитьюд (Хаафингар)', 'Драконий Мост').approx === true, 'Карта: без назначения положение условное (approx)');
        ok(HM.settleOvOf(ovp, 'Рифт', 'Драконий Мост') === null, 'Карта: положение, назначенное в другом владении, не применяется');
        const base = HM.planRoute({ name: 'Солитьюд', x: 190, y: 168 }, { name: 'Морфал', x: 385, y: 248 });
        const moved = HM.planRoute({ name: 'Солитьюд', x: 190, y: 168 }, { name: 'Морфал', x: 385, y: 248 }, null, { 'Драконий Мост': { hold: 'Солитьюд (Хаафингар)', x: 900, y: 700 } });
        ok(moved.km > base.km, 'Карта: маршрут учитывает назначенное положение поселения (дорога через сдвинутый «Драконий Мост» длиннее)', base.km + ' → ' + moved.km);
    }

    // «Соль» одна (раньше три записи с разными категориями — у торговцев она вела себя по-разному); мусорной «Сырая» нет
    eq((W.allItems || []).filter(i => i.name === 'Соль').map(i => i.category), ['Ингредиенты для алхимии'], 'Данные: «Соль» — одна запись (ингредиент алхимии)');
    ok(!Object.prototype.hasOwnProperty.call(W.cookingIngredients || {}, 'Сырая'), 'Данные: в кулинарии нет мусорной записи «Сырая»');

    // ---------- Расчёт урона по врагу (combat-calc.js) — один на предпросмотр и на реальное применение ----------
    if (W.StCombat) {
        const pd = W.StCombat.previewDamage;
        eq(pd({ resist: { physical: 25 } }, 34, 'physical', 0).finalDmg, 26, 'Урон: резист 25% и урон 34 → 26');
        eq(pd({ resist: { fire: -50 } }, 20, 'fire', 0).finalDmg, 30, 'Урон: уязвимость к огню −50% → ×1.5');
        eq(pd({ resist: { physical: 40 } }, 100, 'physical', 15).finalDmg, 75, 'Урон: пробитие 15% снижает резист 40% → 25%');
        eq(pd({ resist: { fire: -50 } }, 20, 'fire', 30).finalDmg, 30, 'Урон: пробитие не «лечит» уязвимость');
        eq(pd({ resist: { fire: 10 }, statusEffects: [{ res: { fire: 10, magic: 20 } }] }, 100, 'fire', 0).finalDmg, 60, 'Урон: статусы на цели добавляют резист (огонь + магия)');
        eq(pd({}, 50, undefined, 0).finalDmg, 50, 'Урон: без типа резисты не применяются');
        ok(pd({ resist: { physical: 200 } }, 10, 'physical', 0).finalDmg === 0, 'Урон: не уходит в минус');
        ok(/физический 25%/.test(W.StCombat.resistSummary({ resist: { physical: 25 } })) && /огонь −50%/.test(W.StCombat.resistSummary({ resist: { fire: -50 } })), 'Урон: подпись резистов для списка целей');
    }

    // ---------- ВЫВОД ----------
    const passed = results.filter(r => r.pass).length, failed = results.length - passed;
    if (typeof document !== 'undefined') {
        const box = document.getElementById('results');
        box.innerHTML = results.map(r => `<div class="${r.warn ? 'warn' : (r.pass ? 'pass' : 'fail')}">${r.warn ? '⚠' : (r.pass ? '✓' : '✗')} ${r.label}${r.detail ? `<pre>${r.detail.replace(/</g, '&lt;')}</pre>` : ''}</div>`).join('');
        document.getElementById('summary').innerHTML = `<strong class="${failed ? 'fail' : 'pass'}">Итого: ${passed} прошло, ${failed} упало из ${results.length}</strong>`;
    } else {
        results.filter(r => !r.pass).forEach(r => console.log('FAIL:', r.label, '|', r.detail));
        console.log(`Итого: ${passed} прошло, ${failed} упало из ${results.length}`);
    }
})();
