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

    // ---------- АЛХИМИЯ (формула: база × (1+навык/200) × (1+ранг×0.2) × перки) ----------
    const A = W.calcAlchemyValue;
    eq(A(20, 50, 0, false, false, false, 0, 'positive', 'Восстановление здоровья'), 25, 'Алхимия: база 20, навык 50 → 25');
    eq(A(20, 100, 0, false, false, false, 0, 'positive', 'Восстановление здоровья'), 30, 'Алхимия: база 20, навык 100 → 30');
    eq(A(20, 50, 5, false, false, false, 0, 'positive', 'Восстановление здоровья'), 50, 'Алхимия: ранг Алхимика 5 → 50');
    eq(A(20, 50, 0, true, false, false, 0, 'positive', 'Восстановление здоровья'), 31, 'Алхимия: Провизор +25% → 31');
    eq(A(20, 50, 0, false, true, false, 0, 'positive', 'Восстановление здоровья'), 31, 'Алхимия: Целитель +25% на лечение → 31');
    // 10 × 1.25 (навык) × 1.25 (Отравитель) = 15.6 → 16 (в предложенных извне тестах было ошибочное 13)
    eq(A(10, 50, 0, false, false, true, 0, 'negative', 'Урон здоровью'), 16, 'Алхимия: Отравитель +25% на яд → 16');

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
    // Известные пробелы (не опечатки, а отсутствие данных): Dragonborn-ингредиенты без записанных эффектов.
    const KNOWN_NO_EFFECTS = ['Желе пепельного прыгуна', 'Желе нетча', 'Перья фельсадской крачки', 'Пепельная ползучая лоза', 'Императорский зонтичный мох', 'Стручок пепельной травы', 'Пепел порождения', 'Корень трамы', 'Кабаний клык', 'Вредозобник'];
    const KNOWN_NO_ITEM = ['Корень жарницы', 'Прах Берита'];
    const noEffects = alchItems.filter(n => !alch[n]);
    const noItem = Object.keys(alch).filter(k => alchItems.indexOf(k) === -1);
    ok(noEffects.filter(n => KNOWN_NO_EFFECTS.indexOf(n) === -1).length === 0, 'Алхимия: у каждого ингредиента-предмета есть эффекты (кроме известных пробелов)', noEffects.filter(n => KNOWN_NO_EFFECTS.indexOf(n) === -1).join(', '));
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

    // ---------- ОСОБЫЕ СПОСОБНОСТИ (powers-data.js) ----------
    const PW = W.powersData || [];
    const RACE_KEYS = ['nord', 'altmer', 'breton', 'orc', 'khajiit', 'redguard', 'argonian', 'bosmer', 'dunmer', 'imperial'];
    const SIGN_KEYS = ['warrior', 'mage', 'thief', 'atronach', 'apprentice', 'steed', 'lady', 'lord', 'zmey', 'ritual', 'lover', 'shadow', 'tower'];
    ok(PW.length > 0, 'Способности: данные загружены');
    ok(new Set(PW.map(p => p.id)).size === PW.length, 'Способности: id уникальны');
    ok(PW.every(p => ['race', 'sign', 'werewolf', 'vampire'].indexOf(p.source) !== -1), 'Способности: у каждой допустимый source');
    ok(PW.filter(p => p.source === 'race').every(p => RACE_KEYS.indexOf(p.race) !== -1), 'Способности: расовые привязаны к существующим расам');
    ok(PW.filter(p => p.source === 'sign').every(p => SIGN_KEYS.indexOf(p.sign) !== -1), 'Способности: знаковые привязаны к существующим знакам');
    // Четыре расовые силы из списка рас (Берсерк, Адреналин, Кора Хиста, Голос императора) обязаны быть описаны
    ['Берсерк', 'Адреналин', 'Кора Хиста', 'Голос императора'].forEach(n => ok(PW.some(p => p.name === n), `Способности: есть «${n}»`));
    ok(PW.filter(p => p.perDay).every(p => p.desc && p.desc.length > 10), 'Способности: у каждой "раз в день" есть описание');

    // ---------- ВРАГИ ----------
    const en = (W.enemiesData || []).map(e => e.name);
    ok(en.length === new Set(en).size, 'Враги: нет дублей по имени', en.filter((n, i) => en.indexOf(n) !== i).join(', '));

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
