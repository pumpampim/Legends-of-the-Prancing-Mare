// ============================================================================
// tools/build-dungeon-presets.js — собирает dungeon-presets-data.js (ТЗ-2, эпик 2.3).
// Запуск из корня проекта:  node tools/build-dungeon-presets.js
//
// Зачем отдельный сборщик, а не разбор в браузере: тексты локаций в holds-data.js написаны по вики живым языком
// («сундук с замком уровня «эксперт» к юго-западу от костра; 4 миски с мамонтовым сыром»). Разбирать это каждый раз
// у мастера на лету — значит каждый раз получать разный и непроверенный результат. Здесь разбор делается один раз,
// с фиксированным зерном случайности (одна локация → всегда один и тот же лут), результат можно просмотреть глазами
// и закоммитить. Переписали holds-data или базу предметов — запусти сборщик заново.
//
// Правила разбора (что где взято):
//  • Враги — по ключевым словам из текста «enemies»; количество — число перед словом, иначе по форме слова
//    (мн. число → 3, «несколько» → 3, «босс/главарь» → 1). Тип по уровню локации (бандит → разбойник → громила…),
//    как в базе enemies-data.js. Кого в базе нет (хаурусы, некроманты, драконы…) — шаблон ближайшего по силе врага
//    базы с другим именем (поле base), это решение «на усмотрение», помечено в notes врага.
//  • Лут — по фразам текста «loot»: золото, камни душ, зелья/яды, книги навыков (по навыку), оружие/броня по типу,
//    предметы базы по названию (в т.ч. уникальные, если названы точно). Сундуки — отдельные контейнеры: содержимое
//    по тому же принципу, что «Генератор лута (сундук)» мастера (цена предметов по уровню замка/босса).
//    Уникальные вещи базы, у которых location совпадает с локацией, кладутся в сундук босса (или в «Добычу»).
//  • Что разобрать не удалось — не выдумывается, а остаётся в заметках мастера дословно.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

// ---------- загрузка данных проекта так же, как их видит gm.html ----------
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
['items-data.js', 'spell-data.js', 'smithing-data.js', 'enchant-data.js', 'alchemy-data.js', 'cooking-data.js', 'fish-data.js', 'hunt-data.js',
    'skill-books-data.js', 'unique-weapons-data.js', 'spell-tomes-data.js', 'holds-data.js', 'enemies-data.js', 'enemy-loot.js'
].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const W = ctx.window;
// Пул предметов = тот же, что gmAllItems у мастера (loadGmItems): база + кузница + книги + уникальное оружие + тома.
const gmSrc = fs.readFileSync(path.join(ROOT, 'gm.js'), 'utf8');
const grab = (re) => { const m = gmSrc.match(re); if (!m) throw new Error('не нашёл в gm.js: ' + re); return m[0]; };
vm.runInContext(grab(/const GM_SMITHING_SLOT_MAP = \{[\s\S]*?\};/) + '\n' + grab(/function getSmithingGiveableItems\(\) \{[\s\S]*?\n    \}\n/) + '\n' +
    grab(/function dedupeGmItems\(list\) \{[\s\S]*?\n    \}\n/) + '\nwindow.__smith = getSmithingGiveableItems; window.__dedupe = dedupeGmItems;', ctx);
let POOL = W.allItems.map(i => Object.assign({}, i, { id: i.name }))
    .concat(W.__smith(), W.skillBooksData || [], W.uniqueWeaponsData || [], W.spellTomesData || []);
POOL = W.__dedupe(POOL);
// Свитков заклинаний «на поддержании» в игре нет (window.isSustainSpell из spell-data.js) — и в добыче данжей тоже.
{
    const descOf = n => { const S = W.spellsData || {}; for (const sc in S) for (const t in S[sc]) { const sp = (S[sc][t] || []).find(x => x.name === n); if (sp) return sp.desc; } return ''; };
    const sustainScroll = i => /^Свиток:/.test(i.name) && !!W.isSustainSpell && (W.isSustainSpell(i.effect || '') || W.isSustainSpell(descOf(i.name.replace(/^Свиток:\s*/, ''))));
    POOL = POOL.filter(i => !sustainScroll(i));
}
const POOL_BY_NAME = new Map(POOL.map(i => [i.name, i]));
const EL = W.EnemyLoot;

// ---------- детерминированная случайность: одна локация → всегда один и тот же результат ----------
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rand = Math.random;
const rnd = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(rand() * arr.length)];
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');

// ---------- уровень локации ----------
const CAT_LEVEL = { 'Пещеры': 6, 'Шахты': 4, 'Форты': 9, 'Нордские руины': 10, 'Двемерские руины': 14, 'Логова драконов': 16, 'Даэдрические святилища': 12,
    'Лагеря великанов': 6, 'Лагеря': 5, 'Хижины': 5, 'Достопримечательности': 5, 'Кораблекрушения': 5, 'Рощи': 6 };
function levelOf(loc, cat) {
    const m = /мин\.?\s*уров\S*\s*(\d+)/i.exec((loc.desc || '') + ' ' + (loc.features || '') + ' ' + (loc.enemies || ''));
    if (m) return Math.max(1, parseInt(m[1]));
    return CAT_LEVEL[cat] || 6;
}

// ---------- враги ----------
// Ступени по уровню — как в базе (Бандит → … → Мародёр); выбираем самую сильную, чей level ≤ уровня локации.
const ENEMY_DB = new Map((W.enemiesData || []).map(e => [e.name, e]));
function tierPick(names, level) {
    const list = names.map(n => ENEMY_DB.get(n)).filter(Boolean).sort((a, b) => (a.level || 0) - (b.level || 0));
    let best = list[0];
    list.forEach(e => { if ((e.level || 0) <= level) best = e; });
    return best ? best.name : names[0];
}
const BANDITS = ['Бандит', 'Разбойник', 'Громила', 'Грабитель', 'Головорез', 'Мародер'];
const BANDIT_MAGES = ['Бандит-маг', 'Разбойник-маг', 'Громила-маг', 'Грабитель-маг', 'Головорез-маг', 'Мародер-маг'];
const DRAUGR = ['Неуклюжий драугр', 'Беспокойный драугр', 'Драугр', 'Драугр-призрак'];
const FALMER_W = ['Фалмер (воин)', 'Фалмер-мастер укрытий (воин)', 'Фалмер-сумрачный страж (воин)', 'Фалмер-ночной охотник (воин)'];
const FALMER_S = ['Фалмер (шаман)', 'Фалмер-мастер укрытий (шаман)', 'Фалмер-сумрачный страж (шаман)', 'Фалмер-ночной охотник (шаман)'];
const VAMPS = ['Вампир', 'Кровавый вампир', 'Вампир ночной охотник', 'Мастер вампир', 'Древний вампир'];
// Порядок важен: более длинные/конкретные слова раньше общих. fn(level) → имя врага базы;
// custom — нет в базе: base = шаблон статов, name — как назовётся в бою.
const ENEMY_RULES = [
    [/главар|вожак|вожд\S* бандит|атаман|предводител/, () => 'Главарь бандитов', 'boss'],
    [/бандит\S*[- ]маг|маг\S* бандит/, l => tierPick(BANDIT_MAGES, l)],
    [/бандит|разбойник|налетчик|мародер|грабител/, l => tierPick(BANDITS, l)],
    [/драугр\S*[- ]повелител|повелител\S* драугр/, () => 'Драугр-повелитель', 'boss'],
    [/главн\S* палач/, () => 'Драугр-главный палач', 'boss'],
    [/палач/, () => 'Драугр-палач'],
    [/драугр/, l => tierPick(DRAUGR, l)],
    [/жрец[- ]дракон|жреца[- ]дракона/, () => 'Жрец-дракон', 'boss'],
    [/фалмер\S*[- ]?шаман|шаман\S* фалмер/, l => tierPick(FALMER_S, l)],
    [/фалмер/, l => tierPick(FALMER_W, l)],
    [/изго\S*[- ]?шаман/, () => 'Изгой-шаман'],
    [/верескове сердце|вересковое сердце|вересков\S* сердц/, () => 'Изгой вересковое сердце', 'boss'],
    [/изго|форсворн/, () => 'Изгой'],
    [/ворожея|хагр[еэ]йвен|хаградевен|карг[аи]/, () => 'Ворожея'],
    [/мастер[- ]вампир|вампир\S*[- ]мастер/, () => 'Мастер вампир', 'boss'],
    [/вампир/, l => tierPick(VAMPS, l)],
    [/вервольф|оборотн/, () => 'Вервольф (враг)'],
    [/скелет\S*[- ]маг/, () => 'Скелет-маг'],
    [/скелет/, () => 'Скелет'],
    [/спригган\S*[- ]матрон|матрон/, () => 'Сприган-матрона'],
    [/спригган|сприган/, () => 'Сприган'],
    [/ледян\S* тролл/, () => 'Ледяной тролль'],
    [/тролл/, () => 'Тролль'],
    [/ледян\S* (привиден|приведен)|привиден|приведен/, () => 'Ледяное приведение'],
    [/двемерск\S* сфер|сфер/, () => 'Двемерская сфера'],
    [/центурион/, () => 'Двемерский центурион', 'boss'],
    [/двемерск\S* паук|паук\S*[- ]рабоч/, () => 'Двемерский паук'],
    [/балист/, () => 'Двемерская балиста'],
    [/автоматон|двемерск\S* (страж|машин)/, () => 'Двемерский паук'],
    [/гигантск\S* (морозн\S* )?паук/, () => 'Гигантский морозный паук', 'boss'],
    [/паук/, l => l >= 12 ? 'Морозный паук' : 'Морозный паук'],
    [/дремор/, () => 'Лорд дремора', 'boss'],
    [/огнен\S* атронах/, () => 'Огненный атронах'],
    [/ледян\S* атронах|морозн\S* атронах/, () => 'Ледяной атронах'],
    [/грозов\S* атронах|атронах\S* бур/, () => 'Грозовой атронах'],
    [/великан/, () => 'Великан'],
    [/мамонт/, () => 'Мамонт'],
    [/пещерн\S* медвед/, () => 'Пещерный медведь'],
    [/снежн\S* медвед/, () => 'Снежный медведь'],
    [/медвед/, () => 'Медведь'],
    [/снежн\S* саблезуб/, () => 'Снежный саблезуб'],
    [/саблезуб/, () => 'Саблезуб'],
    [/снежн\S* волк|ледян\S* волк/, () => 'Снежный волк'],
    [/волк/, () => 'Волк'],
    [/скивер|скипер|злокрыс/, () => 'Злокрыс'],
    [/грязекраб|грязев\S* краб|краб/, () => 'Грязевой краб'],
    [/хоркер/, () => 'Хоркер'],
    [/риклинг/, () => 'Риклинг'],
    [/лурк/, () => 'Луркер'],
    [/нетч/, () => 'Нетч'],
    [/пепельн\S* прыгун/, () => 'Пепельный прыгун'],
    [/порожден\S* пепл|пепельн\S* порожд/, () => 'Порождение пепла'],
    [/щетиноспин/, () => 'Щетиноспин'],
    [/гончая смерти/, () => 'Гончая смерти'],
    [/горгуль/, () => 'Горгулья'],
    [/корус/, () => 'Корус'],
    [/рыба[- ]убийц|рыбы[- ]убийц|убийц\S* рыб/, () => 'Рыба-убийца'],
    // нет в базе — шаблон ближайшего по силе врага (на моё усмотрение)
    [/солдат|стражник|стража|легионер|братьев бури|братья бури|воин\S* бури/, l => ({ name: 'Солдат', base: tierPick(BANDITS, Math.max(l, 8)), note: 'нет в базе: статы бандита' })],
    [/серебрян\S* рук/, l => ({ name: 'Член Серебряной Руки', base: tierPick(BANDITS, Math.max(l, 8)), note: 'нет в базе: статы бандита' })],
    [/хаурус/, () => ({ name: 'Хаурус', base: 'Морозный паук', note: 'нет в базе: статы морозного паука, яд' })],
    [/некромант|колдун|чародей|заклинател\S* (?!с ледяным)|(?<![а-яё])маг(и|ов|а)?(?![а-яё])/, l => ({ name: /некромант/.test(norm(_curTok)) ? 'Некромант' : 'Колдун', base: tierPick(BANDIT_MAGES, l), note: 'нет в базе: статы мага-бандита по уровню' })],
    [/ведьм/, l => ({ name: 'Ведьма', base: tierPick(BANDIT_MAGES, l), note: 'нет в базе: статы мага-бандита по уровню' })],
    [/(?<!о |квест\S* о )(?<!жрец\S*[- ])дракон(?!ь)/, () => ({ name: 'Дракон', base: 'Жрец-дракон', note: 'нет в базе: статы жреца-дракона как черновик — мастеру поправить и добавить крики', boss: true })],
    [/призрак/, l => ({ name: 'Призрак', base: l >= 12 ? 'Драугр-призрак' : 'Беспокойный драугр', note: 'нет в базе: статы драугра по уровню локации' })],
    [/охотник/, l => ({ name: 'Охотник', base: tierPick(BANDITS, l), note: 'нет в базе: статы бандита по уровню' })],

    [/культист/, l => ({ name: 'Культист', base: tierPick(BANDIT_MAGES, l), note: 'нет в базе: статы мага-бандита' })],
    [/корсар|пират/, l => ({ name: 'Корсар', base: tierPick(BANDITS, l), note: 'нет в базе: статы бандита по уровню' })]
];
const NUM_WORDS = { 'один': 1, 'одна': 1, 'одного': 1, 'два': 2, 'две': 2, 'двое': 2, 'двух': 2, 'пара': 2, 'пары': 2, 'три': 3, 'трое': 3, 'трех': 3,
    'четыре': 4, 'четверо': 4, 'пять': 5, 'пятеро': 5, 'шесть': 6, 'шестеро': 6, 'семь': 7, 'восемь': 8, 'несколько': 3, 'много': 5, 'дюжины': 12, 'десяток': 10, 'десятка': 10, 'дюжина': 12 };
let _curTok = '';
function countIn(tok) {
    const t = norm(tok);
    let m = /(\d+)\s*[-–—]\s*(\d+)/.exec(t); if (m) return Math.round((+m[1] + +m[2]) / 2);
    m = /(?:^|\D)(\d+)(?!\s*(?:уров|дн|%|фут|фт|м(?![а-яё])))/.exec(t); if (m && +m[1] <= 30) return +m[1];
    for (const w of t.split(/[^а-я]+/)) if (NUM_WORDS[w]) return NUM_WORDS[w];
    return null;
}
function parseEnemies(text, level) {
    // содержимое скобок — отдельный кусок («Гатрик (главный палач)»), а не мусор
    const t = norm(text).replace(/\(/g, ', ').replace(/\)/g, ', ');
    if (!t.trim() || /^(нет|нету|отсутствуют|врагов нет)(?![а-яё])/.test(t.trim())) return [];
    const byName = new Map();
    // режем по запятым/«и»/точке с запятой — каждый кусок даёт не больше одного типа врага (первое совпадение)
    t.split(/[,;]|\s+и\s+|\s+а также\s+|\.\s/).forEach(raw => {
        const tok = raw.trim(); if (!tok) return;
        if (/трупы|трупов|мертв|мирн|не враждеб|дружелюб|живут|живет|обитател/.test(tok)) return; // не противники
        if (/^(до|после)\s+«?(рожден|возвращ|квест)/.test(tok)) return; // «(до «Рождения дракона»)» — условие, а не враг
        _curTok = tok;
        for (const [re, fn, flag] of ENEMY_RULES) {
            if (!re.test(tok)) continue;
            if (/ловушк|ловушек/.test(tok) && !/драугр|скелет/.test(tok)) break; // «ловушка-заклинатель» — не враг
            // «маги», «лучники» без существительного — обычно подтипы уже названных врагов («драугры (лучники и маги)»)
            if (re.source.indexOf('(?<![а-яё])маг') !== -1 && byName.size && !/некромант|колдун|чародей|заклинател/.test(tok)) break;
            const r = fn(level);
            const rec = typeof r === 'string' ? { name: r } : r;
            let n = countIn(tok);
            const isBoss = flag === 'boss' || rec.boss || /босс|вожд|глав/.test(tok);
            if (n === null) n = isBoss ? 1 : (/(ы|и|ов|ей)$/.test(tok.split(/\s+/).find(w => re.test(w)) || '') ? 3 : 1);
            n = Math.max(1, Math.min(isBoss ? 2 : 12, n));
            if (rec.name === 'Дракон') n = 1; // в логове/у башни дракон один; второй прилетает сюжетно — решит мастер
            const explicit = countIn(tok) !== null;
            const key = rec.name;
            const prev = byName.get(key);
            // Одну и ту же группу вики часто упоминает дважды («…бандиты требуют плату… заплатив, бандиты пропустят») —
            // складываем только явные числа, иначе берём большее.
            if (prev) prev.count = Math.min(12, explicit ? prev.count + n : Math.max(prev.count, n));
            if (prev && prev.name === 'Дракон') prev.count = 1;
            else byName.set(key, Object.assign({ name: rec.name, count: n }, rec.base ? { base: rec.base } : {}, rec.note ? { note: rec.note } : {}));
            // «банда бандитов во главе с главарём»: главарь найден — ищем в том же куске и рядовых
            if (flag === 'boss' && /(ов|ы|и)(?![а-яё])/.test(tok)) {
                const rest = tok.replace(/главар\S*|вожак\S*|вожд\S*|атаман\S*|предводител\S*|босс\S*|во главе с/g, ' ');
                for (const [re2, fn2, flag2] of ENEMY_RULES) {
                    if (flag2 === 'boss' || !re2.test(rest)) continue;
                    const r2 = fn2(level); const rec2 = typeof r2 === 'string' ? { name: r2 } : r2;
                    if (rec2.name !== rec.name && !byName.has(rec2.name)) byName.set(rec2.name, Object.assign({ name: rec2.name, count: countIn(rest) || 3 }, rec2.base ? { base: rec2.base } : {}, rec2.note ? { note: rec2.note } : {}));
                    break;
                }
            }
            break;
        }
    });
    // Отдельный «босс» без типа («босс у трона») — главарь/повелитель семейства, которое уже есть в списке.
    if (/босс/.test(t) && ![...byName.values()].some(e => /Главарь|повелитель|палач|Жрец|Лорд|матрона|сердце|Мастер вампир|Гигантский|центурион|Дракон/.test(e.name))) {
        const names = [...byName.keys()].join(' ');
        const boss = /Драугр|драугр/.test(names) ? 'Драугр-повелитель' : /Разбойник|Бандит|Громила|Грабитель|Головорез|Мародер/.test(names) ? 'Главарь бандитов'
            : /Фалмер/.test(names) ? tierPick(FALMER_W, level + 10) : /Изгой/.test(names) ? 'Изгой вересковое сердце' : /Вампир|вампир/.test(names) ? 'Мастер вампир' : null;
        if (boss && !byName.has(boss)) byName.set(boss, { name: boss, count: 1 });
    }
    return [...byName.values()];
}

// ---------- лут ----------
const isUnique = i => !!i.unique || /^Уникальн|Даэдрическ|Азидал|Маски жрецов|Мораг/.test(i.category || '');
const LOOT_TIERS = { // как LOOT_TIERS в gm.js (Генератор лута)
    poor: { label: 'бедный', gold: [5, 40], price: [1, 30], n: [1, 2] },
    common: { label: 'обычный', gold: [30, 150], price: [20, 150], n: [2, 3] },
    rich: { label: 'богатый', gold: [150, 600], price: [100, 800], n: [2, 4] }
};
const LOOT_EXCLUDE = /Ингредиенты для алхимии|Кузнечные ингредиенты|Шкуры|Двемерские детали|Магические одеяния|Блюдо|Книги заклинаний|Книга умения/;
function chestPool(tier) {
    return POOL.filter(i => typeof i.price === 'number' && i.price >= tier.price[0] && i.price <= tier.price[1] && !isUnique(i) &&
        !LOOT_EXCLUDE.test(i.category || '') && !/\[.*\]/.test(i.name) && !/стрел|болт/i.test(i.name) && !/\+/.test(i.name));
}
const ref = (it, qty) => Object.assign({ name: it.name }, qty && qty > 1 ? { qty } : {});
// Предмет, которого нет в базе под этим именем (зачарованный «Меч [Огонь]»), хранится снимком целиком.
const snap = (loot) => { const o = Object.assign({}, loot); if (o.qty === 1) delete o.qty; return o; };
function chestContents(tierKey, level) {
    const tier = LOOT_TIERS[tierKey];
    const items = [];
    // Потолок цены по уровню локации: эбонит в сундуке пещеры 6-го уровня — перебор (на моё усмотрение: 60 + 25×уровень).
    const cap = 60 + 25 * level;
    let pool = chestPool(tier).filter(i => i.price <= cap && !/^(Сырые продукты|Бытовые предметы)$/.test(i.category || ''));
    if (pool.length < 5) pool = chestPool(tier);
    const n = rnd(tier.n[0], tier.n[1]);
    for (let k = 0; k < n && pool.length; k++) items.push(ref(pick(pool)));
    const cat = re => POOL.filter(i => re.test(i.category || '') && !isUnique(i));
    if (rand() < 0.5) { const f = cat(/^(Готовые продукты|Напитки)$/); if (f.length) items.push(ref(pick(f))); }
    if (rand() < 0.35) items.push({ name: 'Отмычка', qty: rnd(1, 3) });
    if (rand() < 0.3) { const g = cat(/^Камни душ$/).filter(i => !/Заполненн|Чёрн|Черн/.test(i.name) && (!/Велик|Больш/.test(i.name) || level >= 15)); if (g.length) items.push(ref(pick(g))); }
    if (rand() < (tierKey === 'rich' ? 0.6 : 0.2)) { const g = cat(/^Драгоценные камни$/); if (g.length) items.push(ref(pick(g))); }
    const gold = Math.round(rnd(tier.gold[0], tier.gold[1]) * (1 + Math.min(level, 40) / 40));
    return { gold, items };
}
function chestTier(tok, level) {
    const t = norm(tok);
    if (/босс/.test(t)) return level >= 14 ? 'rich' : 'common';
    if (/мастер/.test(t)) return 'rich';
    if (/эксперт/.test(t)) return level >= 10 ? 'rich' : 'common';
    if (/адепт|ученик|с замком|запер/.test(t)) return 'common';
    return 'poor';
}
function chestLabel(tok) {
    const t = norm(tok);
    const lock = /мастер/.test(t) ? 'мастер' : /эксперт/.test(t) ? 'эксперт' : /адепт/.test(t) ? 'адепт' : /ученик/.test(t) ? 'ученик' : /новичок/.test(t) ? 'новичок' : '';
    const base = /босс/.test(t) ? 'Сундук босса' : /ящик ост-империи/.test(t) ? 'Ящик Ост-Империи' : /ящик/.test(t) ? 'Ящик' : /урн/.test(t) ? 'Погребальная урна' :
        /мешок|сумк|котомк|рюкзак/.test(t) ? 'Сумка' : /бочк/.test(t) ? 'Бочка' : /кошел/.test(t) ? 'Кошелёк' : 'Сундук';
    // где стоит — первые слова после «у/в/на/за/возле» (коротко), чтобы игроки различали сундуки
    const where = /(?:^|\s)((?:у|в|на|за|возле|около|рядом с|под|под мостом|к [а-яё-]+у)\s+[^,;]{2,32})$/i.exec(String(tok).replace(/\([^)]*\)/g, '').trim());
    const w = where && !/сундук|ящик/.test(where[1]) ? ' — ' + where[1].trim().replace(/\s+/g, ' ') : '';
    return base + (lock ? ' (' + lock + ')' : '') + w;
}
const SKILLS = { 'алхими': 'Алхимия', 'изменени': 'Изменение', 'колдовств': 'Колдовство', 'разрушени': 'Разрушение', 'зачаровани': 'Зачарование',
    'иллюзи': 'Иллюзия', 'восстановлени': 'Восстановление', 'стрельб': 'Стрельба', 'блок': 'Блокирование', 'тяжел': 'Тяжелая броня', 'легк': 'Легкая броня',
    'взлом': 'Взлом', 'одноручн': 'Одноручное оружие', 'двуручн': 'Двуручное оружие', 'карманн': 'Карманные кражи', 'красноречи': 'Красноречие',
    'торговл': 'Красноречие', 'скрытн': 'Скрытность', 'кузнеч': 'Кузнечное дело', 'ковк': 'Кузнечное дело' };
function skillBook(tok) {
    const t = norm(tok);
    const books = W.skillBooksData || [];
    // точное название книги (в базе оригинальные названия) — редко, но бывает
    const exact = books.find(b => t.indexOf(norm(b.name)) !== -1);
    if (exact) return exact;
    for (const k of Object.keys(SKILLS)) if (t.indexOf(k) !== -1) { const l = books.filter(b => norm(b.skill).indexOf(norm(SKILLS[k]).slice(0, 6)) === 0); if (l.length) return pick(l); }
    return null; // навык не назван/не узнан — не подсовываем случайную книгу, фраза уйдёт в заметки
}
const FAMILY = (cat, enemies) => {
    const n = enemies.map(e => e.name).join(' ');
    if (/Двемерск/.test(cat) || /Двемер/.test(n)) return /двемер/i;
    if (/Нордск|Древне|Драконьи/.test(cat) || /Драугр/.test(n)) return /древн/i;
    if (/Фалмер/.test(n)) return /фалмер/i;
    if (/Изгой/.test(n)) return /изгое/i;
    return null;
};
function gearOf(kind, level, famRe) {
    const KIND = { 'кинжал': /кинжал/i, 'меч': /(?<!двуручн\S* )меч(?!.*двуруч)/i, 'двуручн': /двуруч|секир|молот/i, 'булав': /булав/i, 'топор': /топор(?!.*дровосек)/i,
        'лук': /(^|\s)лук(\s|$)/i, 'шлем': /шлем/i, 'щит': /щит/i, 'сапог': /сапог|ботин/i, 'перчат': /перчат|наруч/i, 'брон': /брон|доспех|кирас/i };
    const re = KIND[kind]; if (!re) return null;
    const isArmor = /шлем|щит|сапог|перчат|брон/.test(kind);
    let list = POOL.filter(i => !isUnique(i) && !/\[.*\]/.test(i.name) && re.test(i.name) && (isArmor ? typeof i.armor === 'number' && i.slot : typeof i.dmg === 'number' && i.slot));
    const FACTION = /древн|фалмер|изгое|двемер|даэдр|драконь|небесн|стеклянн|эбонит|орочь|эльфийск|соратник|волчь|сталгрим|нордск|хитин/i;
    const fam = famRe ? list.filter(i => famRe.test(i.name)) : [];
    if (fam.length) list = fam;
    else list = list.filter(i => !FACTION.test(i.name) || (level >= 18 && /орочь|эльфийск|стеклянн/i.test(i.name)) || (level >= 28 && /эбонит|двемер/i.test(i.name)));
    if (!list.length) return null;
    // чем выше уровень, тем дороже вещь (как у бандитов): берём из нижней части списка по цене
    list.sort((a, b) => (a.price || 0) - (b.price || 0));
    const upto = Math.max(1, Math.ceil(list.length * Math.min(1, 0.25 + level / 40)));
    return pick(list.slice(0, upto));
}

function resolvePhrase(tok, level, famRe, out) {
    const raw = tok.trim(); if (!raw) return;
    const t = norm(raw).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || /^(нет|именных предметов нет|книг навыков нет|станций нет|руд и станций нет)$/.test(t)) return;
    if (/жил[аы]|залеж|станок|верстак|кузниц|алхимическ\S* лаборатор|стол зачарован|дубильн/.test(t)) { out.notes.push(raw); return; } // это особенности места, не лут
    let n = countIn(t);
    // «4 миски с мамонтовым сыром», «бутылка скумы», «корзина с яблоками» — посуда/тара не предмет, предмет — то, что в ней
    const vessel = /^(?:\d+\s+|несколько\s+|пара\s+|две\s+|два\s+|три\s+)?(?:миск|тарелк|блюд|корзин|бутыл|кувшин|мешоч|горст|чаш|ведр|кружк)\S*\s+(?:с\s+|со\s+)?(.+)$/.exec(t);
    if (vessel && !/кам(ен|н)\S* душ/.test(t)) {
        const what = vessel[1].replace(/^(с|со)\s+/, '');
        const it = EL.findByName(POOL, what) || EL.findByName(POOL, what.replace(/(ым|им|ой|ою|ами|ями|ов|ей|ы|и|у|а)(?=\s|$)/g, ''));
        if (it) { out.items.push(ref(it, n || 1)); return; }
    }
    // золото
    if (/(золот|септим|монет)/.test(t) && !/кольц|ожерель|слит|руд|кубок|амулет|корон/.test(t)) { out.gold += n || Math.round(rnd(10, 40) * (1 + level / 20)); return; }
    if (/кошел|кошель/.test(t)) { out.gold += Math.round(rnd(/больш/.test(t) ? 60 : /средн/.test(t) ? 30 : 10, /больш/.test(t) ? 150 : 60) * (n || 1)); return; }
    // камни душ
    if (/кам(ен|н)\S* душ/.test(t)) {
        const sizes = ['крохотн', 'маленьк', 'обычн', 'больш', 'велик', 'черн'];
        const filled = /заполн|наполн/.test(t);
        let l = POOL.filter(i => /^Камни душ$/.test(i.category || '') && (filled ? /Заполненн/.test(i.name) : !/Заполненн/.test(i.name)) && !/Чёрн|Черн/.test(i.name));
        const named = sizes.filter(s => t.indexOf(s) !== -1);
        if (named.length) l = l.filter(i => named.some(s => norm(i.name).indexOf(s) !== -1));
        else l = l.filter(i => !/велик/i.test(i.name) || level >= 20);
        if (l.length) out.items.push(ref(pick(l), n || (/камни/.test(t) ? rnd(2, 3) : 1)));
        return;
    }
    // зелья и яды (берём «лутовые» зелья базы; конкретный эффект — если назван)
    if (/зель|(?<![а-яё])яд(ы|а|ов)?(?![а-яё])|отрав/.test(t) && !/ядовит\S* (гриб|шип)/.test(t)) {
        const poison = /яд|отрав/.test(t) && !/зель/.test(t);
        // Только однокомпонентные «готовые» зелья (без «+»): смеси вроде «Уязвимость к холоду + Восстановление магии» в
        // сундуках выглядят как мусор. Мастерские — с 15 уровня локации, раньше базовые.
        const grade = level >= 15 && rand() < 0.5 ? 'Мастерское' : 'Базовое';
        const premade = (W.alchemyPremadePotions || []).filter(p => !/\+/.test(p.name) && p.name.indexOf(grade) !== -1 && (poison ? /^Яд/.test(p.name) : !/^Яд/.test(p.name)));
        const EFF = { 'лечен': 'восстановление здоровья', 'здоров': 'здоров', 'магии': 'магии', 'выносл': 'выносл', 'регенер': 'регенер', 'невидим': 'невидим', 'паралич': 'паралич', 'сопротивлен': 'сопротивлен' };
        const ek = Object.keys(EFF).find(w => t.indexOf(w) !== -1);
        let l = premade.filter(p => !ek || norm(p.name).indexOf(EFF[ek]) !== -1);
        if (!l.length) l = premade;
        if (l.length) { const p = pick(l); out.items.push(ref(p, n || (/зелья|яды/.test(t) ? rnd(2, 3) : 1))); }
        return;
    }
    // книги
    if (/книг\S* навык|книга умени|книги навык|учебник/.test(t)) { const b = skillBook(norm(raw)); if (b) out.items.push(ref(b)); else out.notes.push(raw); return; } // навык часто в скобках — ищем в исходной фразе
    if (/^(т\.|том)\s*\d|^\S*\s*т\.\s*\d/.test(t)) { out.notes.push(raw); return; } // хвост названия книги после запятой («…, т. 2»)
    if (/том\S* заклинан|книг\S* заклинан/.test(t)) {
        const tomes = W.spellTomesData || [];
        const named = tomes.find(x => t.indexOf(norm(x.spellName)) !== -1);
        const l = named ? [named] : tomes.filter(x => (x.tier || 1) <= (level >= 20 ? 3 : level >= 10 ? 2 : 1));
        if (l.length) out.items.push(ref(pick(l)));
        return;
    }
    if (/^(книги|книга|разные книги|несколько книг)$/.test(t)) { out.notes.push(raw + ' (обычные книги — в базе нет, не выданы)'); return; }
    // двемерский лом/металл
    if (/двемерск\S* (лом|металл|слит)|слитк\S* двемер/.test(t)) { const it = POOL_BY_NAME.get('Двемерский металлический слиток') || POOL.find(i => /двемерск\S* металл/i.test(i.name)); if (it) out.items.push(ref(it, n && n < 40 ? Math.min(n, 10) : rnd(2, 5))); return; }
    // стрелы
    if (/стрел/.test(t)) { const l = POOL.filter(i => /стрел/i.test(i.name) && !isUnique(i) && (!famRe || famRe.test(i.name))); const l2 = l.length ? l : POOL.filter(i => /^Железные стрелы|Стальные стрелы/i.test(i.name)); if (l2.length) out.items.push(ref(pick(l2), n || rnd(6, 15))); return; }
    // оружие и броня по типу
    const ench = /зачарован/.test(t) && !/незачарован/.test(t);
    for (const kind of ['кинжал', 'двуручн', 'булав', 'топор', 'меч', 'лук', 'шлем', 'щит', 'сапог', 'перчат', 'брон']) {
        if (t.indexOf(kind) === -1) continue;
        if (kind === 'топор' && /дровосек/.test(t)) break; // «топор дровосека» — предмет базы, ниже по имени
        // точное имя предмета базы («Стальной двуручный меч») важнее случайного по типу
        const exact = EL.findByName(POOL, t);
        const it = exact && !ench && (typeof exact.dmg === 'number' || typeof exact.armor === 'number') ? exact : gearOf(kind, level, /древн|фалмер|двемер|изгое/.test(t) ? (/древн/.test(t) ? /древн/i : /фалмер/.test(t) ? /фалмер/i : /двемер/.test(t) ? /двемер/i : /изгое/i) : famRe);
        if (!it) break;
        if (ench && EL.enchantLoot) out.items.push(snap(EL.enchantLoot(EL.toLoot(it), level)));
        else out.items.push(ref(it, n && n < 10 ? n : 1));
        return;
    }
    if (/^(оружие|броня|случайное оружие|случайная броня|железное оружие|снаряжение)$/.test(t)) { const it = gearOf(/брон/.test(t) ? 'брон' : pick(['меч', 'топор', 'булав', 'кинжал']), level, famRe); if (it) out.items.push(ref(it)); return; }
    // драгоценности общим словом
    if (/^(самоцвет|самоцветы|драгоценност\S*|драгоценн\S* камн\S*|необычн\S* самоцвет)$/.test(t)) { const l = POOL.filter(i => /^Драгоценные камни$/.test(i.category || '')); if (l.length) out.items.push(ref(pick(l), n || 1)); return; }
    if (/^(ингредиенты|разные ингредиенты|др\. ингредиенты|случайные ингредиенты)$/.test(t)) { const l = POOL.filter(i => /^Ингредиенты для алхимии$/.test(i.category || '')); for (let k = 0; k < rnd(2, 3); k++) out.items.push(ref(pick(l))); return; }
    if (/^(еда|немного еды|продукты|провизия)$/.test(t)) { const l = POOL.filter(i => /^(Готовые продукты|Сырые продукты)$/.test(i.category || '')); for (let k = 0; k < rnd(1, 3); k++) out.items.push(ref(pick(l))); return; }
    // предмет базы по названию (в т.ч. уникальный, если назван точно)
    // синонимы вики → названия базы (на моё усмотрение)
    const SYN = [[/ахзидал/g, 'азидал'], [/фиолетов\S*|пурпурн\S*/g, 'лиловый'], [/горн\S* цвет\S*|горноцвет\S*/g, 'горноцвет'], [/гриб(ы|ов)?(?=\s|$)/g, 'гриб']];
    let tSyn = t; SYN.forEach(([re, to]) => { tSyn = tSyn.replace(re, to); });
    const t2 = tSyn.replace(/^(случайн\S*|несколько|пара|пару|обычн\S*|разн\S*|\d+)\s+/, '').replace(/\s+(у|в|на|за|возле|около|рядом|под)\s.*$/, '').trim();
    // «уникальный комплект Азидала (маска, броня, сапоги…)» — все уникальные вещи с этим именем
    const kit = /комплект\S*\s+([а-яё]+)/.exec(tSyn);
    if (kit) {
        const stem = kit[1].slice(0, Math.max(5, kit[1].length - 2));
        const set = POOL.filter(i => isUnique(i) && norm(i.name).indexOf(stem) !== -1);
        if (set.length) { set.forEach(u => { out.items.push(ref(u)); out.uniques.push(u.name); }); return; }
    }
    const uniq = EL.findByName(POOL, t2, true);
    if (uniq && isUnique(uniq)) { const iw = norm(uniq.name); if (t2.indexOf(iw.split(' ')[0]) !== -1) { out.items.push(ref(uniq)); out.uniques.push(uniq.name); return; } }
    const found = EL.findByName(POOL, t2);
    if (found) { out.items.push(ref(found, n && n < 30 ? n : 1)); return; }
    out.notes.push(raw);
}

// ---------- дополнения по вики ----------
// Локации, где в holds-data.js нет врагов/лута, а место важное. Тексты — пересказ UESP (en.uesp.net, страницы мест),
// поданы тем же языком, что holds-data, и проходят через тот же разбор. Уникальные вещи, которых нет в базе
// предметов (Щит Исграмора, части амулета Гаулдура), не выдумываются — остаются в заметках для ручной выдачи.
const WIKI_OVERRIDES = {
    'Гробница Исграмора': { src: 'UESP: Skyrim:Ysgramor\'s Tomb', level: 6,
        enemies: 'около 20 призраков Соратников, 2 злокрыса, 6 морозных пауков, 1 гигантский морозный паук',
        loot: 'большой кошелёк; 2 кошелька; зелье выносливости; 2 зелья лечения; зелье магии; древний нордский лук; древний нордский меч; древний нордский двуручный меч; железный шлем; боевой топор; сумка аптекаря; книга навыка «Легендарный Санкр Тор» (Двуручное оружие); незапертый сундук; сундук «адепт»; сундук босса',
        notes: 'Щит Исграмора — в сундуке босса (уникальный, в базе предметов нет — выдать вручную). Проход дальше первого зала открыт только в квесте «Слава мёртвым».' },
    'Саартал': { src: 'UESP: Skyrim:Saarthal', level: 6,
        enemies: 'драугры, босс Джирик Гаулдурсон (драугр-повелитель)',
        loot: 'сундук босса; зелья; камни душ',
        notes: 'Важные вещи по вики: фрагмент амулета Гаулдура, Амулет Саартала, посох Джирика Гаулдурсона — квестовые, в базе нет, выдать вручную. Вход заперт до квеста Коллегии «Под Саарталом».' },
    'Скелетный гребень': { src: 'UESP: Skyrim:Bonestrewn Crest',
        enemies: '3 скелета (до «Рождения дракона»); после — 1 дракон по уровню у Стены Слов',
        loot: 'сундук босса к северу от Стены Слов',
        notes: 'Стена Слов: Ледяное дыхание. 2 железные жилы и 1 жила орихалка рядом.' }
};
function buildPreset(hold, cat, loc0) {
    const ov = WIKI_OVERRIDES[loc0.name];
    const loc = ov ? Object.assign({}, loc0, { enemies: ov.enemies || loc0.enemies, loot: ov.loot || loc0.loot || loc0.reward,
        desc: [loc0.desc, ov.level ? 'Мин. уровень ' + ov.level + '.' : ''].filter(Boolean).join(' ') }) : loc0;
    rand = mulberry32(hashStr(hold + '|' + loc.name));
    EL_SEED(rand);
    const level = levelOf(loc, cat);
    const enemies = parseEnemies(loc.enemies || '', level);
    const famRe = FAMILY(cat, enemies);
    const text = loc.loot || loc.reward || '';
    const containers = [];
    const loose = { gold: 0, items: [], notes: [], uniques: [] };
    // Сундуки — свои контейнеры; всё остальное — «Добыча» (вещи на виду: на столах, алтарях, телах у входа).
    String(text).split(/;|\.(?=\s*[А-ЯЁ])/).forEach(seg => {
        // запятые внутри скобок не режем: «2 запертых сундука (ученик и эксперт)»
        let depth = 0, cur = ''; const parts = [];
        for (const ch of seg) { if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1); if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
        parts.push(cur);
        parts.forEach(p0 => {
            const p = p0.trim(); if (!p) return;
            const t = norm(p);
            // «на алтаре книга навыка» → «книга навыка»; «и книги» → «книги»
            const items = p.split(/\s+и\s+(?![^(]*\))/).map(s => s.replace(/^(на|в|у|за)\s+[а-яё]+\s+(?=[а-яё])/i, m => /^(на|в|у)\s+(алтар|стол|полк|тел|трон|сундук)/i.test(m) ? '' : m).trim());
            const tc = t.replace(/\([^)]*\)/g, ' ');
            const CHEST = /(сундук|ящик|урн[аыу](?![а-яё])|мешок|сумк|котомк|рюкзак|бочк)\S*/;
            // «у сундука», «в сундуке» — это ориентир, а не сам сундук; предметы с ориентиром идут в «Добычу»
            const chestAsPlace = /(^|\s)(у|возле|около|рядом с|за|под|из|в|во|на)\s+(\S+\s+)?(сундук|ящик|урн|мешк|сумк|бочк)/.test(tc) && !/^(\S+\s+){0,2}(сундук|ящик)/.test(tc);
            if (CHEST.test(tc) && !chestAsPlace && !/^(в|из)\s/.test(tc) && !/мастер-замков нет|сундуков нет|без сундуков/.test(tc)) {
                if (/бочк\S* со? стрел/.test(t)) { resolvePhrase('стрелы', level, famRe, loose); return; }
                if (/сумк\S* аптекар|бочк\S* с ингредиент/.test(t)) { resolvePhrase('ингредиенты', level, famRe, loose); return; }
                const before = /((?:\d+|два|две|три|четыре|пять|несколько|пара)\s+)(?:\S+\s+){0,2}(?:сундук|ящик|урн|мешк|сумк|бочк)/.exec(tc);
                const nChests = !before ? 1 : /несколько/.test(before[1]) ? rnd(2, 3) : Math.min(4, countIn(before[1]) || 1);
                const locks = ((/\(([^)]*)\)/.exec(p) || [])[1] || '').split(/\s+и\s+|,/).map(s => s.trim()).filter(Boolean);
                for (let k = 0; k < nChests; k++) {
                    const lockTok = locks[k] ? p.replace(/\([^)]*\)/, '') + ' ' + locks[k] : p;
                    const tierKey = chestTier(lockTok, level);
                    const c = chestContents(tierKey, level);
                    // «сундук с картой», «ящик … с кулоном Ост-Империи» — названное содержимое кладём внутрь
                    const inside = /\sс\s+(?!замк|мастер-замк)([^,;(]+)$/i.exec(p.replace(/\([^)]*\)/g, ''));
                    if (inside && k === 0) { const sub = { gold: 0, items: [], notes: [], uniques: [] }; resolvePhrase(inside[1], level, famRe, sub); c.items = sub.items.concat(c.items); c.gold += sub.gold; loose.notes.push(...sub.notes.map(x => 'в сундуке: ' + x)); loose.uniques.push(...sub.uniques); }
                    containers.push({ id: 'c' + (containers.length + 1), label: chestLabel(lockTok) + (nChests > 1 ? ' #' + (k + 1) : ''), gold: c.gold, items: c.items, tier: tierKey });
                }
                return;
            }
            // «сундуки с замками ученика, адепта, эксперта» — после разреза по запятым уровни замков остаются одни: это ещё сундуки
            const lockOnly = /^(\d+\s+)?«?(новичк\S*|ученик\S*|адепт\S*|эксперт\S*|мастер\S*)»?$/.exec(tc.trim());
            if (lockOnly) {
                const c = chestContents(chestTier(lockOnly[2], level), level);
                containers.push({ id: 'c' + (containers.length + 1), label: chestLabel('сундук ' + lockOnly[2]), gold: c.gold, items: c.items });
                return;
            }
            if (/^(\d+\s+)?(незапер\S*|без замка)$/.test(tc.trim())) {
                const c = chestContents('poor', level);
                containers.push({ id: 'c' + (containers.length + 1), label: 'Сундук', gold: c.gold, items: c.items });
                return;
            }
            items.forEach(x => resolvePhrase(x, level, famRe, loose));
        });
    });
    // Уникальные вещи базы, «прописанные» в этой локации (поле location у предмета) — в сундук босса или в «Добычу».
    const ln = norm(loc.name);
    POOL.filter(i => isUnique(i) && i.location && (norm(i.location).indexOf(ln) !== -1 || (ln.length > 6 && ln.indexOf(norm(i.location)) !== -1)))
        .forEach(u => {
            if (loose.uniques.includes(u.name) || containers.some(c => c.items.some(x => x.name === u.name))) return;
            const boss = containers.find(c => /босс/i.test(c.label)) || null;
            (boss ? boss.items : loose.items).push(ref(u)); loose.uniques.push(u.name);
        });
    if (loose.items.length || loose.gold) containers.unshift({ id: 'c0', label: 'Добыча на виду', gold: loose.gold, items: loose.items });
    // склеиваем одинаковые предметы в контейнере
    containers.forEach(c => {
        const m = new Map(); const out = [];
        c.items.forEach(it => { const k = it.price === undefined ? it.name : null; if (k && m.has(k)) { m.get(k).qty = (m.get(k).qty || 1) + (it.qty || 1); } else { const cp = Object.assign({}, it); if (k) m.set(k, cp); out.push(cp); } });
        c.items = out; delete c.tier;
    });
    const notesParts = [];
    if (loc.desc) notesParts.push(String(loc.desc).trim());
    if (loc.enemies) notesParts.push('Враги (вики): ' + String(loc.enemies).trim());
    if (text) notesParts.push('Лут (вики): ' + String(text).trim());
    if (loose.notes.length) notesParts.push('Не выдано автоматически: ' + loose.notes.join('; '));
    if (loc.features) notesParts.push('Особенности: ' + String(loc.features).trim());
    if (ov) notesParts.push('Дополнено по вики (' + ov.src + '): ' + ov.notes);
    return {
        id: 'auto-' + hashStr(hold + '|' + loc.name).toString(36),
        name: loc.name, hold, category: cat, level,
        mapX: null, mapY: null,
        notes: notesParts.join('\n'),
        enemies, loot: containers, uniques: loose.uniques,
        autoGenerated: true
    };
}
// EnemyLoot внутри зовёт Math.random — подменяем на время сборки, чтобы результат был воспроизводимым.
function EL_SEED(r) { ctx.Math = Object.create(Math); vm.runInContext('Math.random = function(){ return __r(); }', Object.assign(ctx, { __r: r })); }

const out = [];
Object.entries(W.holdsData).forEach(([hold, h]) => (h.categories || []).forEach(c => (c.locations || []).forEach(loc => {
    if (!loc || !loc.name) return;
    try { out.push(buildPreset(hold, c.name, loc)); } catch (e) { console.error('Ошибка в', hold, loc.name, e.message); }
})));
// проверка: все предметы-ссылки (без снимка) существуют в пуле
let missing = 0;
out.forEach(p => p.loot.forEach(c => c.items.forEach(it => { if (it.price === undefined && !POOL_BY_NAME.has(it.name) && it.name !== 'Отмычка') { missing++; console.warn('нет в базе:', p.name, it.name); } })));
const header = '// АВТОСГЕНЕРИРОВАНО tools/build-dungeon-presets.js — не править руками, перезапусти сборщик.\n' +
    '// Черновики пресетов данжей (ТЗ-2, эпик 2.3): враги и контейнеры с лутом для ' + out.length + ' локаций из holds-data.js.\n' +
    '// Мастер видит их в «Пресетах данжей» с пометкой «(черновик)»; сохранённый (отредактированный) пресет уходит в Firestore и черновик заменяет.\n';
fs.writeFileSync(path.join(ROOT, 'dungeon-presets-data.js'), header + 'window.dungeonPresetsAuto = ' + JSON.stringify(out) + ';\n');
const stats = { presets: out.length, withEnemies: out.filter(p => p.enemies.length).length, containers: out.reduce((s, p) => s + p.loot.length, 0),
    items: out.reduce((s, p) => s + p.loot.reduce((a, c) => a + c.items.length, 0), 0), uniques: out.reduce((s, p) => s + p.uniques.length, 0), missing,
    bytes: fs.statSync(path.join(ROOT, 'dungeon-presets-data.js')).size };
console.log(JSON.stringify(stats));
if (process.argv.includes('--dump')) out.forEach(p => console.log(`\n## ${p.hold} / ${p.name} (ур.${p.level})\n  враги: ${p.enemies.map(e => e.name + '×' + e.count + (e.base ? '[' + e.base + ']' : '')).join(', ') || '—'}\n` +
    p.loot.map(c => `  ${c.label}: ${c.gold ? c.gold + ' зол., ' : ''}${c.items.map(i => i.name + (i.qty > 1 ? '×' + i.qty : '')).join(', ')}`).join('\n') +
    (/Не выдано автоматически: (.*)/.exec(p.notes) ? '\n  ⚠ ' + /Не выдано автоматически: (.*)/.exec(p.notes)[1] : '')));
