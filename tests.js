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
    ok(PW.filter(p => p.source === 'vampire').every(p => VAMP_OK.indexOf(p.requiresAbility) !== -1 && p.name === p.requiresAbility), 'Вампир-лорд: только способности из вашей таблицы');
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
    // Кухня: все ингредиенты ВСЕХ рецептов известны кухне (иначе блюдо невозможно приготовить)
    const CK = W.cookingIngredients || {};
    const badKitchen = [];
    (W.recipes || []).forEach(r => r.ingredients.forEach(i => { if (!CK[i.name]) badKitchen.push(`${r.name}: ${i.name}`); }));
    ok(badKitchen.length === 0, 'Кухня: все ингредиенты рецептов есть в списке продуктов кухни', badKitchen.join('; '));
    const rkeys = (W.recipes || []).map(r => r.ingredients.map(i => i.name + 'x' + i.qty).sort().join('|'));
    ok(new Set(rkeys).size === rkeys.length, 'Кухня: нет двух рецептов с одинаковым составом (второй никогда бы не сработал)');
    ok(new Set((W.recipes || []).map(r => r.name)).size === (W.recipes || []).length, 'Кухня: названия блюд уникальны');
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
