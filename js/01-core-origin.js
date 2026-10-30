    // Массив всех 19 навыков игровой системы Скурим
    const skillNames = [
        "Одноручное оружие", "Двуручное оружие", "Стрельба", "Блокирование", 
        "Тяжелая броня", "Легкая броня", "Скрытность", "Взлом", 
        "Карманные кражи", "Красноречие", "Разрушение", "Восстановление", 
        "Колдовство", "Иллюзия", "Изменение", "Алхимия", "Кузнечное дело", "Зачарование", "Кулинария"
    ];

    // 6.4: 1234 → «1 234». Раньше голые числа (золото, вес, цены) в длинных суммах читались с трудом.
    // ТОЛЬКО для отображения: в <input> остаются сырые числа, иначе parseInt('1 234') даст 1.
    function formatNumber(n) {
        if (n === null || n === undefined || n === '' || isNaN(Number(n))) return n;
        const num = Number(n);
        const parts = String(num).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join('.');
    }
    window.formatNumber = formatNumber;

    // Глобальный массив для хранения пользовательских кастомных заклинаний
    let customSpells = [];
    let playerMapNotes = [];      // личные точки игрока на карте [{id, hold, name, desc, x, y, u?, v?, ts}] — в данных персонажа
    let _spellSeq = 0;            // порядок добавления заклинаний (сохраняется — порядок больше не зависит от школы/перерисовки)
    let _unrenderedSpells = [];   // заклинания, которые не удалось нарисовать при загрузке: хранятся и сохраняются, чтобы не пропасть
    let scrollWisdomSpent = 0; // Счётчик потраченной Мудрости на свитки
    let playerInventory = []; // Общий инвентарь: [{itemId, name, count, weight, category, effect}]
    let _allPerkCheckboxes = []; // кэш .perk-checkbox — строится в initSkills(), см. задачу 16
    // Книга удачных рецептов — раньше успешная готовка/варка нигде не запоминалась (сохранялись только
    // открытые свойства ингредиентов, в кулинарии — вообще ничего). Теперь каждый удачный результат
    // записывается и сохраняется вместе с персонажем; из списка можно одним нажатием подставить рецепт.
    let knownCookRecipes = {}; // { 'Название блюда': { ingredients: [{name, qty}], effect } }
    let knownBrewRecipes = {}; // { 'Ингр1|Ингр2|Ингр3' (по алфавиту): { ingredients: [имена], effects: [названия эффектов], itemName } }

    function renderKnownRecipes() {
        const kc = document.getElementById('kitchen-recipes-count'); if (kc) kc.textContent = '(' + Object.keys(knownCookRecipes).length + ')';
        const ac = document.getElementById('alch-recipes-count'); if (ac) ac.textContent = '(' + Object.keys(knownBrewRecipes).length + ')';
        const kEl = document.getElementById('kitchen-known-recipes');
        if (kEl) {
            const kq = alchNorm((document.getElementById('kitchen-recipe-search') || {}).value);
            const allCook = Object.keys(knownCookRecipes).sort();
            const names = allCook.filter(n => !kq || alchNorm(n).indexOf(kq) !== -1 || (knownCookRecipes[n].ingredients || []).some(i => alchNorm(i.name).indexOf(kq) !== -1));
            kEl.innerHTML = names.length ? names.map(n => {
                const r = knownCookRecipes[n];
                const ing = r.ingredients.map(i => `${escHtml(i.name)} ×${i.qty}`).join(', ');
                return `<div class="party-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; padding:4px 8px;">
                    <span style="flex:0 1 220px; min-width:0;"><strong>${escHtml(n)}</strong></span>
                    <span style="flex:1 1 200px; min-width:0; font-size:13px; opacity:.85;">${ing}</span>
                    <button style="width:auto; padding:3px 12px; margin:0;" onclick="loadCookRecipe('${jsq(n)}')">В котёл</button>
                </div>`;
            }).join('') : (allCook.length ? '<p style="opacity:.6; font-size:13px;">Ничего не найдено.</p>' : '<p style="opacity:.6; font-size:13px;">Пока пусто — удачные блюда запишутся сюда сами.</p>');
        }
        const aEl = document.getElementById('alch-known-recipes');
        if (aEl) {
            const q = alchNorm((document.getElementById('alch-recipe-search') || {}).value);
            const mode = (document.getElementById('alch-recipe-group') || {}).value || 'effect';
            const keys = Object.keys(knownBrewRecipes).sort().filter(k => {
                if (!q) return true;
                const r = knownBrewRecipes[k];
                return alchNorm(r.itemName).indexOf(q) !== -1 || r.ingredients.some(n => alchNorm(n).indexOf(q) !== -1) || (r.effects || []).some(e => alchNorm(e).indexOf(q) !== -1);
            });
            const rowHtml = (k, skipEffect) => {
                const r = knownBrewRecipes[k];
                const others = (r.effects || []).filter(e => e !== skipEffect);
                const kind = /^Яд/.test(r.itemName || '') ? '☠ яд' : '🧪 зелье';
                return `<div class="party-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; padding:4px 8px;">
                    <span style="flex:0 1 240px; min-width:0;"><strong>${skipEffect ? escHtml(kind) : escHtml(r.itemName)}</strong>${skipEffect && others.length ? `<br><span style="font-size:12px; opacity:.7;">также: ${others.map(escHtml).join(', ')}</span>` : ''}</span>
                    <span style="flex:1 1 200px; min-width:0; font-size:13px; opacity:.85;">${r.ingredients.map(escHtml).join(' + ')}</span>
                    <button style="width:auto; padding:3px 12px; margin:0;" onclick="loadBrewRecipe('${jsq(k)}')">Загрузить</button>
                </div>`;
            };
            if (!keys.length) {
                aEl.innerHTML = Object.keys(knownBrewRecipes).length ? '<p style="opacity:.6; font-size:13px;">Ничего не найдено.</p>' : '<p style="opacity:.6; font-size:13px;">Пока пусто — удачные зелья и яды запишутся сюда сами.</p>';
            } else if (mode === 'list') {
                aEl.innerHTML = keys.map(k => rowHtml(k, null)).join('');
            } else {
                const groups = {};
                keys.forEach(k => { const r = knownBrewRecipes[k]; ((r.effects && r.effects.length) ? r.effects : ['Без свойств']).forEach(e => (groups[e] = groups[e] || []).push(k)); });
                aEl.innerHTML = Object.keys(groups).sort((x, y) => x.localeCompare(y, 'ru')).map(e => {
                    const isOpen = !!q || alchOpenSet().has(e);
                    return `<details data-g="${escHtml(e)}" ${isOpen ? 'open' : ''} ontoggle="toggleAlchRecipeGroup(this)" style="margin-bottom:4px;">
                        <summary style="cursor:pointer;">${alchEffectMark(e)}<strong>${escHtml(e)}</strong> <span style="opacity:.6;">— рецептов: ${groups[e].length}</span></summary>
                        ${groups[e].map(k => rowHtml(k, e)).join('')}
                    </details>`;
                }).join('');
            }
        }
    }
    function alchOpenSet() { return (window._alchRecipeOpen = window._alchRecipeOpen || new Set()); }
    window.toggleAlchRecipeGroup = function (el) {
        const g = el.getAttribute('data-g');
        if (el.open) alchOpenSet().add(g); else alchOpenSet().delete(g);
    };

    // Подставляет рецепт в котёл (в пределах того, что есть в инвентаре).
    window.loadCookRecipe = function (name) {
        const r = knownCookRecipes[name];
        if (!r) return;
        potSelections = {};
        const lacking = [];
        r.ingredients.forEach(i => {
            const have = countInInventory(i.name);
            if (have >= i.qty) potSelections[i.name] = i.qty;
            else { if (have > 0) potSelections[i.name] = have; lacking.push(`${i.name} (нужно ${i.qty}, есть ${have})`); }
        });
        renderKitchenPot();
        const res = document.getElementById('kitchen-result');
        if (res) res.innerHTML = lacking.length ? `<span style="color:#e67e22;">Рецепт «${escHtml(name)}» загружен не полностью — не хватает: ${lacking.map(escHtml).join(', ')}.</span>` : `<span style="color:#2ecc71;">Рецепт «${escHtml(name)}» загружен в котёл.</span>`;
    };

    // Выбирает три ингредиента рецепта в списках варки (если они есть в инвентаре).
    window.loadBrewRecipe = function (key) {
        const r = knownBrewRecipes[key];
        if (!r) return;
        renderAlchIngredientSelects();
        const lacking = [];
        ['alch-ing-0', 'alch-ing-1', 'alch-ing-2'].forEach((id, idx) => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const name = r.ingredients[idx] || '';
            if (name && countInInventory(name) > 0) sel.value = name;
            else { sel.value = ''; if (name) lacking.push(name); }
        });
        if (typeof updateBrewPreview === 'function') updateBrewPreview();
        const res = document.getElementById('alch-brew-result');
        if (res) res.innerHTML = lacking.length ? `<span style="color:#e67e22;">Нет в инвентаре: ${lacking.map(escHtml).join(', ')}.</span>` : `<span style="color:#2ecc71;">Рецепт загружен — осталось нажать «Сварить».</span>`;
    };

    let potSelections = {}; // Текущий "котёл": { itemId: qty }
    let knownSmithingRecipes = []; // Список названий рецептов, которые открыл мастер (см. gm.html)
    // Единый полный список слотов — используется и для начальной инициализации, и при загрузке
    // сейва (applyCharacterData), чтобы новый слот не забывался в одном из двух мест.
    const FULL_EQUIPPED_SLOTS = { helmet: null, chest: null, robe: null, gloves: null, boots: null, shield: null, pouch: null, ring: null, neck: null, circlet: null, backpack: null, meleeWeapon: null, meleeWeaponOffhand: null, rangedWeapon: null, ammo: null };
    let equippedSlots = Object.assign({}, FULL_EQUIPPED_SLOTS);
    let craftQueue = [];   // эпик 2.7: [{ id, type:'alchemy', params:{ingredients,mode}, status }]
    let craftOrders = [];  // эпик 2.8: [{ id, npc, hold, itemName, qty, reward, status:'active'|'done' }]
    let playerPortrait = '', playerPortraitThumb = ''; // эпик 2.6
    let equipmentSets = []; // эпик 2.3: [{ id, name, slots: { helmet: itemId, ... } }], не больше 5
    let knownIngredientProps = {}; // { "Имя ингредиента": [true, false, true, false] } — по индексам свойств
    let knownEnchantments = []; // ["Урон огнем", ...] — узнаётся разрушением зачарованного предмета
    let pouchContents = []; // [{ itemId, name, effect, alchemyEffects }]
    let playerQuests = []; // [{ id, title, desc, requirement, reward, status: 'active'|'done' }]
    let activeSummons = []; // [{ id, category, name, curHp, maxHp, dmg, dmgType, speed, turnsRemaining, permanent }]

    // Шаблоны призываемых/поднимаемых существ. Урон/хп/длительность оружия и трупов —
    // цифры прямо из описаний заклинаний (магия.xlsx). Атронахи в файлах даны только
    // качественно ("сильнее", без цифр) — их хп/урон я оценил по общеизвестным ванильным
    // значениям Skyrim, это явно помечено ниже как оценка.
    const summonTemplates = [
        { category: 'weapon', name: 'Призванный меч', dmgBase: 13, dmgEnh: 17, dmgType: 'физический', durBase: 10, durEnh: 15, spellName: 'Призванный меч' },
        { category: 'weapon', name: 'Призванный кинжал', dmgBase: 8, dmgEnh: 14, dmgType: 'физический', durBase: 10, durEnh: 15, spellName: 'Призванный кинжал' },
        { category: 'weapon', name: 'Призванная секира', dmgBase: 17, dmgEnh: 22, dmgType: 'физический', durBase: 12, durEnh: 17, spellName: 'Призванная секира' },
        { category: 'weapon', name: 'Призванный лук', dmgBase: 20, dmgEnh: 27, dmgType: 'физический', durBase: 14, durEnh: 20, spellName: 'Призванный лук' },
        { category: 'corpse', name: 'Слабый мертвец', hpBase: 100, hpEnh: 120, dmgBase: 20, dmgEnh: 25, dmgType: 'физический', durBase: 10, durEnh: 15, spellName: 'Оживление зомби' },
        { category: 'corpse', name: 'Мертвец (ур.7)', hpBase: 140, hpEnh: 160, dmgBase: 35, dmgEnh: 40, dmgType: 'физический', durBase: 10, durEnh: 16, spellName: 'Оживление трупа' },
        { category: 'corpse', name: 'Призрак (ур.13)', hpBase: 180, hpEnh: 200, dmgBase: 45, dmgEnh: 50, dmgType: 'физический', durBase: 11, durEnh: 18, spellName: 'Призрак' },
        { category: 'corpse', name: 'Ужасный зомби (ур.17)', hpBase: 200, hpEnh: 200, dmgBase: 55, dmgEnh: 65, dmgType: 'физический', durBase: 20, durEnh: 24, spellName: 'Ужасный зомби' },
        { category: 'wolf', name: 'Огненный волк', hpBase: 80, dmgBase: 20, dmgType: 'физический', durBase: 6, durEnh: 6, note: 'При истечении времени взрывается: 30/50 урона огнём в большом радиусе', spellName: 'Огненный питомец' },
        { category: 'pet', name: 'Призрачный питомец', hpBase: 50, dmgBase: 30, dmgType: 'физический', durBase: 10, durEnh: 15, enhCount: 2, note: 'ХП и урон — как у Волка из базы врагов', spellName: 'Вызов питомца' },
        { category: 'daedra', name: 'Лорд дремора', hpBase: 390, dmgBase: 71, dmgType: 'физический', durBase: 20, durEnh: 28, enhCount: 2, note: 'ХП и урон — как у Лорда дремора из базы врагов', spellName: 'Вызов лорда дремора' },
        { category: 'atronach', name: 'Огненный атронах', hpBase: 180, dmgBase: 20, dmgType: 'огонь', durBase: 15, durEnh: 18, enhCount: 2, estimated: true, spellName: 'Вызов огненного атронаха' },
        { category: 'atronach', name: 'Ледяной атронах', hpBase: 240, dmgBase: 15, dmgType: 'холод', durBase: 16, durEnh: 20, enhCount: 2, estimated: true, note: 'Замедляет цель', spellName: 'Вызов ледяного атронаха' },
        { category: 'atronach', name: 'Грозовой атронах', hpBase: 250, dmgBase: 25, dmgType: 'электричество', durBase: 20, durEnh: 24, enhCount: 2, estimated: true, spellName: 'Вызов грозового атронаха' },
        { category: 'skeleton', name: 'Скелет-компаньон', hpBase: 50, dmgBase: 12, dmgType: 'физический', speed: 30, permanent: true, requiresItem: 'Кучка костей' },
        // Настоящие 10 вариантов "Вызов скелета" из книги заклинаний (spell-data.js, школа
        // Колдовство) — раньше НИ ОДИН из них не был в этом списке, только не связанный с ними
        // "Скелет-компаньон" выше. Из-за этого призыв скелета вообще не распознавался как призыв
        // и уходил в обычный расчёт урона по описанию — с неправильными числами. permanent:true —
        // в тексте у всех явно "бессрочно" (держится пока не убьют/не отзовут, не по счётчику ходов).
        { category: 'skeleton', name: 'Скелет солдата', hpBase: 50, dmgBase: 15, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Вызов скелета солдата' },
        { category: 'skeleton', name: 'Скелет мага', hpBase: 50, dmgBase: 16, dmgType: 'холод', speed: 35, permanent: true, spellName: 'Вызов Скелета мага', note: 'Атакует обморожением (мана 120)' },
        { category: 'skeleton', name: 'Скелет лучника', hpBase: 100, dmgBase: 35, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Вызов скелета лучника' },
        { category: 'skeleton', name: 'Скелет-танк', hpBase: 190, dmgBase: 20, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Вызов скелета танка' },
        { category: 'skeleton', name: 'Сильный скелет воин', hpBase: 130, dmgBase: 30, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Призыв сильного скелета воина' },
        { category: 'skeleton', name: 'Сильный скелет маг', hpBase: 100, dmgBase: 16, dmgType: 'холод', speed: 35, permanent: true, spellName: 'Призыв сильного скелета мага', note: 'Обморожение(15мп)/Ледяной шип(25мп, 25 урона)/Ледяная буря(70мп, 70 урона)' },
        { category: 'skeleton', name: 'Сильный скелет лучник', hpBase: 130, dmgBase: 40, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Призыв сильного скелета лучника' },
        { category: 'skeleton', name: 'Скелет-герой', hpBase: 180, dmgBase: 50, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Призыв Скелета героя' },
        { category: 'skeleton', name: 'Скелет-эксперт', hpBase: 140, dmgBase: 16, dmgType: 'холод', speed: 35, permanent: true, spellName: 'Призыв Скелета эксперта', note: 'Обморожение(10мп)/Ледяной шип(20мп,25)/Ледяная буря(50мп,70)/Морозная нова(150мп)' },
        { category: 'skeleton', name: 'Скелет-снайпер', hpBase: 170, dmgBase: 50, dmgType: 'физический', speed: 35, permanent: true, spellName: 'Призыв Скелета снайпера' },
        // «Плоть» — временная броня поверх кирасы (слот «Одеяние» не трогается).
        { category: 'armor', name: 'Дубовая плоть', armorBase: 40, armorEnh: 120, durBase: 9, durEnh: 13, spellName: 'Дубовая плоть' },
        { category: 'armor', name: 'Каменная плоть', armorBase: 60, armorEnh: 180, durBase: 9, durEnh: 12, spellName: 'Каменная плоть' },
        { category: 'armor', name: 'Железная плоть', armorBase: 80, armorEnh: 240, durBase: 12, durEnh: 15, spellName: 'Железная плоть' },
        { category: 'armor', name: 'Эбонитовая плоть', armorBase: 120, armorEnh: 300, durBase: 12, durEnh: 18, spellName: 'Эбонитовая плоть' }
    ];
    // Любой постоянный скелет требует «Кучку костей» (расходуется при призыве, возвращается, когда существо развеяно).
    summonTemplates.forEach(t => { if (t.category === 'skeleton' && !t.requiresItem) t.requiresItem = 'Кучка костей'; }); // любой скелет — из кучки костей

    function findSummonTemplateBySpellName(name) {
        // Без учёта регистра — раньше у части заклинаний название было строчным ("вызов скелета
        // танка"); после исправления в базе у игроков с уже сохранённой старой версией точное
        // сравнение потеряло бы связь с шаблоном призыва.
        const lname = String(name || '').toLowerCase();
        if (!lname) return undefined;
        // У части шаблонов (например "Скелет-компаньон", создаётся предметом) поля spellName НЕТ —
        // без проверки t.spellName это роняло TypeError в renderAttackActionSelect → updateAll, и ломались
        // призыв, баффы одеяния, экипировка и применение данных персонажа.
        return summonTemplates.find(t => t.spellName && t.spellName.toLowerCase() === lname);
    }

    let activeTimedEffects = []; // [{ id, name, effectName, description, turnsRemaining, hp, mp }]

    // Стакинг баффов: повторный каст ТОГО ЖЕ заклинания/эффекта (по имени) не добавляет вторую
    // копию — просто обновляет оставшееся время до нового значения (и остальные числа, на случай
    // усиленного каста поверх обычного). Разные эффекты — разные записи, как раньше.
    // Раньше «+N к здоровью» от зелья/еды/заклинания поднимало только МАКСИМУМ хп, а текущие оставались прежними — игрок получал
    // пустую полоску вместо лечения. Теперь прирост максимума сразу добавляется и к текущим хп (но не выше нового максимума;
    // при ручной блокировке максимума — не выше заблокированного). Когда бафф спадает, лишнее срезается в updateAll().
    function stGrantBuffHp(delta) {
        if (!(delta > 0)) return;
        const cur = document.getElementById('cur-hp'), max = document.getElementById('max-hp'), lock = document.getElementById('manual-hp-lock');
        if (!cur || !max) return;
        const c = parseInt(cur.value) || 0, m = parseInt(max.value) || 0;
        const newMax = (lock && lock.checked) ? m : m + delta;
        cur.value = Math.max(c, Math.min(newMax, c + delta));
        if (typeof scheduleUpdateAll === 'function') scheduleUpdateAll();
    }
    function pushOrRefreshTimedEffect(entry) {
        const key = entry.effectName || entry.name;
        const existing = activeTimedEffects.find(e => (e.effectName || e.name) === key);
        if (existing) {
            const keepId = existing.id;
            const hpGain = (entry.hp || 0) - (existing.hp || 0);
            Object.assign(existing, entry, { id: keepId });
            stGrantBuffHp(hpGain);
            return existing;
        }
        activeTimedEffects.push(entry);
        stGrantBuffHp(entry.hp || 0);
        return entry;
    }
    let gameTurn = 0, gameRound = 0;
    let sessionTurnSync = { code: '', tick: 0 }; // до какого общего «тика» сессии эффекты уже прокручены (см. syncSessionTurns)

    // Знак «Маг»: ОДИН бесплатный каст заклинания 1-го уровня в день. Раньше стоимость всех заклинаний
    // 1-го уровня была 0 постоянно. Флаг сохраняется в сейве и сбрасывается в nextDay().
    let mageSignFreeUsed = false;

    // Знак «Ученик»: уязвимость 10% к ОДНОМУ типу магического урона. Тип выбирается случайно при выборе знака
    // и сохраняется в сейве (Sistema 2.2: «Вы уязвимы к одному из типов магического урона»).
    const APPRENTICE_VULN_TYPES = { fire: 'огонь', frost: 'холод', shock: 'электричество' };
    let apprenticeVuln = null;
    function rollApprenticeVuln() {
        const keys = Object.keys(APPRENTICE_VULN_TYPES);
        apprenticeVuln = keys[Math.floor(Math.random() * keys.length)];
        return apprenticeVuln;
    }
    // ---------- Раса и Камень судьбы: выбор один раз ----------
    // Выбранные раса и знак рождения закрепляются навсегда, как взятые перки. Чтобы не наказывать за мисклик,
    // первые 5 минут после первого выбора их можно менять; потом оба поля блокируются. Отсчёт идёт от первого
    // изменения любого из двух полей, хранится в сейве (originLock), поэтому перезагрузка страницы его не сбрасывает.
    // С уровнем 2+ выбор закрепляется сразу: персонаж уже играет.
    const ORIGIN_GRACE_MS = 5 * 60 * 1000;
    let originLock = { startedAt: null, locked: false };
    let _originPrev = { race: 'nord', sign: 'none' };
    function originGraceLeftMs() {
        if (originLock.locked || !originLock.startedAt) return originLock.locked ? 0 : null;
        return Math.max(0, originLock.startedAt + ORIGIN_GRACE_MS - Date.now());
    }
    function originIsLocked() {
        if (originLock.locked) return true;
        if ((characterLevel || 1) >= 2) return true;
        const left = originGraceLeftMs();
        return left !== null && left <= 0;
    }
    // Характеристики игрок распределяет сам только на 1-м уровне (создание персонажа); дальше — уровнем от мастера.
    function renderStatLock() {
        const lockedS = (characterLevel || 1) >= 2;
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => { const el = document.getElementById('stat-' + k); if (el) { el.readOnly = lockedS; el.title = lockedS ? 'Характеристики растут уровнем (мастер) — вручную не меняются' : ''; } });
    }
    function renderOriginLock() {
        try { renderStatLock(); } catch (e) { }
        const race = document.getElementById('char-race'), sign = document.getElementById('char-sign'), box = document.getElementById('origin-lock-status');
        if (!race || !sign) return;
        if (originIsLocked() && !originLock.locked) { originLock.locked = true; saveLocalStorage(true); } // время вышло — фиксируем в сейве
        const locked = originLock.locked;
        race.disabled = locked; sign.disabled = locked;
        race.title = sign.title = locked ? 'Раса и камень судьбы выбраны окончательно' : '';
        if (!box) return;
        const left = originGraceLeftMs();
        if (locked) { box.style.display = 'block'; box.className = 'st-origin-lock st-origin-locked'; box.textContent = '🔒 Раса и камень судьбы выбраны окончательно.'; }
        else if (left !== null) {
            const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
            box.style.display = 'block'; box.className = 'st-origin-lock st-origin-grace';
            box.textContent = `⏳ Расу и камень ещё можно изменить: ${m}:${String(sec).padStart(2, '0')}. Потом выбор закрепится навсегда.`;
        } else { box.style.display = 'block'; box.className = 'st-origin-lock'; box.textContent = 'Выбери расу и камень судьбы. После первого выбора будет 5 минут, чтобы передумать, — потом выбор закрепится навсегда.'; }
    }
    // Возвращает true, если изменение принято; иначе откатывает поле к прежнему значению.
    function acceptOriginChange(kind) {
        const elx = document.getElementById(kind === 'race' ? 'char-race' : 'char-sign');
        if (originIsLocked()) {
            elx.value = _originPrev[kind];
            renderOriginLock();
            alert('Раса и камень судьбы уже выбраны окончательно — изменить их нельзя.');
            return false;
        }
        if (!originLock.startedAt) originLock.startedAt = Date.now();
        _originPrev[kind] = elx.value;
        renderOriginLock();
        return true;
    }
    window.onRaceChanged = function () {
        if (!acceptOriginChange('race')) return;
        updateAll();
        saveLocalStorage();
    };
    // Старые сейвы без originLock: если персонаж уже явно выбран (знак, не-дефолтная раса или уровень 2+) — закреплён;
    // чистый новый лист — отсчёт начнётся с первого выбора.
    function restoreOriginLock(data) {
        const lvl = parseInt(data.characterLevel) || 1;
        if (data.originLock && typeof data.originLock === 'object') {
            originLock = { startedAt: Number(data.originLock.startedAt) || null, locked: !!data.originLock.locked };
        } else {
            const chosen = lvl >= 2 || (data.sign && data.sign !== 'none') || (data.race && data.race !== 'nord');
            originLock = { startedAt: null, locked: !!chosen };
        }
        _originPrev = { race: data.race || 'nord', sign: data.sign || 'none' };
        renderOriginLock();
    }
    setInterval(() => { if (!originLock.locked && originLock.startedAt) renderOriginLock(); }, 1000);
    window.addEventListener('load', () => { try { renderOriginLock(); } catch (e) { } });

    window.onSignChanged = function () {
        if (!acceptOriginChange('sign')) return;
        const sign = (document.getElementById('char-sign') || {}).value;
        if (sign === 'apprentice') { if (!apprenticeVuln) rollApprenticeVuln(); }
        else apprenticeVuln = null;
        syncSignStatSelect();
        updateAll();
        saveLocalStorage();
    };
    // «Маг» (+2) и «Тень» (+1) дают бонус к ОДНОЙ характеристике на выбор (Sistema 2.2).
    var SIGN_STAT_CHOICES = { mage: { amount: 2, keys: ['int', 'wis'] }, shadow: { amount: 1, keys: ['int', 'cha', 'wis'] } };
    var SIGN_STAT_LABELS = { int: 'Интеллект', cha: 'Харизма', wis: 'Мудрость' };
    function getSignStatBonuses(sign) {
        const out = {};
        if (sign === 'warrior') { out.str = 2; out.con = 2; }
        if (sign === 'thief') out.dex = 2;
        if (sign === 'lady') { out.wis = 2; out.con = 2; }
        if (sign === 'steed') out.con = 2;
        const ch = SIGN_STAT_CHOICES[sign];
        if (ch) {
            const el = document.getElementById('char-sign-stat');
            const k = el && ch.keys.indexOf(el.value) !== -1 ? el.value : ch.keys[0];
            out[k] = ch.amount;
        }
        return out;
    }
    function syncSignStatSelect() {
        const sign = (document.getElementById('char-sign') || {}).value;
        const row = document.getElementById('sign-stat-row'), el = document.getElementById('char-sign-stat');
        if (!row || !el) return;
        const ch = SIGN_STAT_CHOICES[sign];
        row.style.display = ch ? '' : 'none';
        if (!ch) return;
        const cur = el.value;
        const want = ch.keys.map(k => `${k}:${ch.amount}`).join(',');
        if (el.getAttribute('data-for') !== want) {
            el.innerHTML = ch.keys.map(k => `<option value="${k}">${SIGN_STAT_LABELS[k]} +${ch.amount}</option>`).join('');
            el.setAttribute('data-for', want);
        }
        el.value = ch.keys.indexOf(cur) !== -1 ? cur : ch.keys[0];
    }
    window.onSignStatChanged = function () {
        if (!acceptOriginChange('sign')) { const el = document.getElementById('char-sign-stat'); if (el) el.value = el.getAttribute('data-saved') || el.value; return; }
        const el = document.getElementById('char-sign-stat'); if (el) el.setAttribute('data-saved', el.value);
        updateAll();
        saveLocalStorage();
    };
    window.rerollApprenticeVuln = function () {
        if (!confirm('Перебросить тип уязвимости? Делать это нужно только по решению мастера.')) return;
        rollApprenticeVuln();
        updateAll();
        saveLocalStorage();
    };
    function consumeMageSignFreeCast(costInput) {
        if (!costInput || !costInput.dataset) return;
        // Причину бесплатности проставляет расчёт стоимости (updateAll): 'spirit' — «Призыв духа» бретона,
        // 'mage' — знак «Маг». Так списывается именно тот лимит, из-за которого каст стоил 0.
        const reason = costInput.dataset.freeReason;
        if (reason === 'spirit' && !powersUsedToday['breton_spirit']) {
            powersUsedToday['breton_spirit'] = true;
            scheduleUpdateAll();
        } else if (reason === 'mage' && !mageSignFreeUsed) {
            mageSignFreeUsed = true;
            scheduleUpdateAll(); // пересчитать стоимости остальных заклинаний 1 ур. — теперь они платные
        }
    }
