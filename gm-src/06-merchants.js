
    // ---------- Задача C: живые торговцы ----------
    // Категории даны как в items-data.js/allItems; кузнец дополнительно берёт из weaponRecipes/
    // armorRecipes (базовые скованные вещи туда не всегда дублируются в allItems).
    const LIVING_MERCHANT_TYPES = {
        innkeeper: { label: 'Трактирщик', gold: 750, categories: ['Готовые продукты', 'Напитки'] },
        alchemist2: { label: 'Алхимик', gold: 1250, categories: ['Ингредиенты для алхимии'] },
        grocer: { label: 'Бакалейщик', gold: 1250, categories: ['Сырые продукты', 'Шкуры', 'Бытовые предметы'] },
        blacksmith2: { label: 'Кузнец', gold: 1500, categories: ['Легкая броня (лут)', 'Тяжелая броня (лут)', 'Одноручное (лут)', 'Двуручное (лут)'] },
        // "Торговец одеждой" (clothier) убран из списка по прямой просьбе — объединён с придворным
        // колдуном (магические одеяния теперь в его ассортименте). Тип вернётся отдельно, когда
        // появится база ПРОСТОЙ (не магической) одежды — пока такого файла нет.
        fletcher: { label: 'Торговец луками и стрелами', gold: 1500, categories: ['Луки (лут)'] },
        jeweler: { label: 'Ювелир', gold: 1500, categories: ['Ювелирное изделие (лут)', 'Ювелирные изделия', 'Драгоценные камни'] },
        foodVendor: { label: 'Торговец едой', gold: 750, categories: ['Сырые продукты'] },
        courtWizard: { label: 'Придворный колдун', gold: 1500, categories: ['Свитки (прописанные)', 'Посохи', 'Магические одеяния'] },
        khajiitCaravan: { label: 'Каджитский караван', gold: 1500, categories: ['Сырые продукты', 'Бытовые предметы', 'Ювелирные изделия', 'Шкуры'] },
        // Раньше "барахольщик" существовал ТОЛЬКО как получатель продажи (сторона продажи у
        // игрока) — тип живого торговца с собственным ассортиментом для покупки отсутствовал
        // вообще. Добавлен по прямой просьбе, общий профиль (всякая всячина), плюс слитки ниже.
        pawnbrokerLive: { label: 'Барахольщик', gold: 1000, categories: ['Бытовые предметы', 'Сырые продукты', 'Ювелирные изделия'] }
    };
    // Торговцы животными (pets-data.js: PET_MERCHANTS) — в общем списке типов; товар у них — животные, а не вещи.
    Object.keys(window.PET_MERCHANTS || {}).forEach(k => { const d = window.PET_MERCHANTS[k]; LIVING_MERCHANT_TYPES[k] = { label: d.label, gold: d.gold, categories: [], pets: true }; });
    window.LIVING_MERCHANT_TYPES = LIVING_MERCHANT_TYPES;

    // Предметы, которые торговец не продаёт, даже если формально попадают в его категорию
    // (например, человечье мясо — никто не торгует им легально).
    // Предметы, которые НЕ должны попадать в ассортимент живых торговцев, хотя формально имеют
    // цену и подходящую категорию: человечье мясо (неаппетитно для витрины алхимика), одеяния
    // Коллегии магов (выдаются только за полное изучение школы, не продаются торговцами), одежда
    // повара (рабочая форма, не то, что носят обычные покупатели).
    const MERCHANT_EXCLUDED_ITEMS = new Set([
        'Человечье мясо',
        'Перчатки магистра (Разрушение)', 'Перчатки магистра (Изменение)', 'Перчатки магистра (Иллюзия)', 'Перчатки магистра (Колдовство)', 'Перчатки магистра (Восстановление)', 'Роба разрушения', 'Великий созидатель', 'Создатель обмана',
        'Мастер даэдра', 'Великий свет', 'Выпускник Коллегии Магов Винтерхолда',
        'Одение повара', 'Колпак повара',
        // Скума и лунный сахар — эксклюзив каджитского каравана, у остальных торговцев их быть
        // не должно (по прямой просьбе).
        'Красноводная скума', 'Лунный сахар',
        // Вампирский напиток — в таверне его не наливают
        'Зелье крови',
        // Прах Берита у торговцев не продаётся (по просьбе)
        'Прах Берита'
    ]);
    // Одеяния и перчатки мастеров школ «выдаются в Коллегии при полном изучении школы» — купить их
    // нельзя ни у кого. Раньше в списке исключений были не все (не хватало Робы разрушения,
    // Великого созидателя, Создателя обмана и Перчаток магистра (Восстановление)), поэтому
    // исключаем и по самому описанию предмета: «Выдаётся/Выдаются/Выдаёт в Коллегии…».
    function isMerchantExcluded(i) {
        if (MERCHANT_EXCLUDED_ITEMS.has(i.name)) return true;
        return /выд[а-яё]*\s+в\s+коллеги/i.test(i.effect || '');
    }

    // Стрелы для продажи: обычные материальные стрелы из таблицы кузнеца (по цене за штуку).
    // Раньше торговец луками продавал безымянную «Стрелу» за 1 септим — заглушку.
    const MERCHANT_ARROW_NAMES = ['Железная стрела', 'Стальная стрела', 'Орочья стрела', 'Нордская стрела', 'Двемерская стрела', 'Эльфийская стрела', 'Стеклянная стрела', 'Эбонитовая стрела'];
    function merchantArrowPool() {
        return (window.weaponRecipes || []).filter(w => w.isAmmo && MERCHANT_ARROW_NAMES.includes(w.name))
            .map(w => ({ name: w.name, category: 'Боеприпасы', price: w.price, weight: w.weight, dmg: w.damage }));
    }

    function getMerchantItemPool(typeKey) {
        const def = LIVING_MERCHANT_TYPES[typeKey];
        if (!def) return [];
        let pool = (gmAllItems || []).filter(i => def.categories.includes(i.category) && typeof i.price === 'number' && i.price > 0 && !isMerchantExcluded(i));
        if (typeKey === 'blacksmith2') {
            pool = pool.concat((window.weaponRecipes || []).filter(w => !/лук/i.test(w.name) && !w.isAmmo).map(w => ({ name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.armorRecipes || []).map(a => ({ name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot: GM_SMITHING_SLOT_MAP[a.slot] || null })));
            pool = pool.concat(merchantArrowPool());
            pool = pool.concat((window.thrownRecipes || []).map(w => ({ name: w.name, category: 'Метательное', price: w.price, weight: w.weight, dmg: w.damage, thrown: true, throwKind: w.throwKind })));
            pool = pool.concat((window.weaponsNonCraftable || []).filter(w => !/лук/i.test(w.name)).map(w => ({ name: w.name, category: /стрел|болт/i.test(w.name) ? 'Боеприпасы' : 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.armorNonCraftable || []).map(a => ({ name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot: normalizeArmorSlot(a.slot) })));
        }
        if (typeKey === 'fletcher') {
            pool = pool.concat(merchantArrowPool());
            // "Луки (лут)" в allItems — только зачарованные варианты; базовые луки лежат в
            // weaponRecipes/weaponsNonCraftable, раньше торговец луками их вообще не продавал.
            pool = pool.concat((window.weaponRecipes || []).filter(w => /лук/i.test(w.name)).map(w => ({ name: w.name, category: 'Луки', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.weaponsNonCraftable || []).filter(w => /лук/i.test(w.name)).map(w => ({ name: w.name, category: 'Луки', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
        }
        if (typeKey === 'khajiitCaravan') {
            // Скума и лунный сахар — эксклюзив каравана (исключены у всех остальных выше через
            // MERCHANT_EXCLUDED_ITEMS), добавляем их сюда напрямую в обход этого исключения.
            const skooma = (window.allItems || gmAllItems).find(i => i.name === 'Красноводная скума');
            const moonSugar = (window.allItems || gmAllItems).find(i => i.name === 'Лунный сахар');
            if (skooma) pool.push(skooma);
            if (moonSugar) pool.push(moonSugar);
        }
        if (typeKey === 'courtWizard') {
            // Тома заклинаний (новичок/ученик) — по прямой просьбе, ~в 1.5 раза больше в продаже,
            // чем посохов. Отбор идёт по УНИКАЛЬНЫМ именам (в refreshMerchantStock), поэтому
            // дублирование записей тут не работает — увеличивает лишь шанс попасть хоть раз, а не
            // количество копий в итоге. Вместо этого напрямую уменьшаем число РАЗНЫХ посохов в
            // пуле (было 42) — меньше вариантов физически означает меньше посохов в ассортименте,
            // пока рядом лежат 85 разных томов, которые никто не трогал.
            pool = pool.concat(window.spellTomesData || []);
            const staves = pool.filter(i => i.category === 'Посохи');
            const otherItems = pool.filter(i => i.category !== 'Посохи');
            const keepStaffCount = Math.max(3, Math.round(staves.length * 0.4)); // 42 → ~17 видов
            const shuffledStaves = staves.slice().sort(() => Math.random() - 0.5).slice(0, keepStaffCount);
            pool = otherItems.concat(shuffledStaves);
        }
        return pool.filter(i => !(MERCH_GEAR_CATS.test(i.category || '') && MERCH_NEVER_RE.test(i.name)));
    }

    // Генерирует новый ассортимент (10-20 предметов) + сбрасывает золото до базового. Ключ —
    // "тип@владение", т.к. кузнец в Вайтране и кузнец в Маркарте — разные лавки с разным товаром.
    // Привязка "что добывают в этом краю" к владению — используется у кузнеца, чтобы его
    // витрина отражала местные месторождения/традиции, а не была одинаковой по всему Скайриму.
    // Не эксклюзивно (не единственный материал), просто выпадает заметно чаще.
    const HOLD_MATERIAL_AFFINITY = {
        'Вайтран': /^(Железн|Стальн)/i,
        'Рифт': /^(Стальн|Орочь)/i,
        'Хаафингар': /^(Стальн|Эльфийск)/i,
        'Хьялмарк': /^(Железн|Стальн)/i,
        'Истмарк': /^(Стальн|Нордск)/i,
        'Фолкрит': /^(Железн|Стальн)/i,
        'Предел': /^(Двемерск|Эльфийск)/i,
        'Белый Берег': /^(Железн|Стальн)/i,
        'Винтерхолд': /^(Стальн|Стеклянн)/i
    };

    // ---------- Ассортимент «как в Скайриме» ----------
    // Раньше витрина была случайной выборкой из ОДНОГО общего списка: чего в базе больше (например, 16 видов
    // луков против 8 видов стрел), того больше и на прилавке. Теперь у каждого типа торговца есть РАЗДЕЛЫ с
    // долей товара (как у списков торговцев в игре: кузнец — оружие, броня, слитки, кожа; торговец луками —
    // луки, стрелы, болты…), внутри раздела дешёвое попадается чаще дорогого, а обязательные товары лежат всегда.
    // Фалмерское, изгойское и древненордское оружие/броня у торговцев не продаётся вообще (по просьбе)
    const MERCH_NEVER_RE = /фалмер|изгое|древн/i;
    const MERCH_GEAR_CATS = /^(Оружие|Броня|Луки|Боеприпасы|Легкая броня \(лут\)|Тяжелая броня \(лут\)|Одноручное \(лут\)|Двуручное \(лут\)|Луки \(лут\))$/;
    const MERCH_SPECIAL_RE = /небесн|риклинг|бич магов/i; // редкое: максимум пара позиций
    // снаряжение, которое продают только в «своих» владениях
    const MERCH_REGION_ONLY = [[/хитинов/i, ['Схолстейм']], [/братьев бури/i, ['Истмарк']]];
    // Региональные пристрастия: во сколько раз чаще (>1) или реже (<1) встречается материал в лавке владения.
    // Двемерское — у Маркарта, нордское резное — в Истмарке, имперское — в Солитьюде и т.д.
    const MERCH_AFFINITY = {
        'Вайтран': [[/^железн/i, 2], [/^стальн/i, 2], [/^имперск/i, 1.5], [/^(охотнич|длинн)/i, 1.5], [/^нордск/i, 1.3], [/^двемерск/i, 0.4], [/^эбонит/i, 0.5], [/^стеклянн/i, 0.6]],
        'Рифт': [[/^стальн/i, 2], [/^орочь/i, 2], [/^железн/i, 1.5], [/^эльфийск/i, 1.3], [/^(кожан|мехов)/i, 1.5], [/^нордск/i, 1.2], [/^двемерск/i, 0.6]],
        'Хаафингар': [[/^имперск/i, 3], [/^эльфийск/i, 2], [/^стальн/i, 1.5], [/^стеклянн/i, 1.5], [/^нордск/i, 0.7], [/^двемерск/i, 0.5], [/^мехов/i, 0.6]],
        'Хьялмарк': [[/^железн/i, 2], [/^кожан/i, 2], [/^(мехов|сыромятн)/i, 1.5], [/^орочь/i, 1.2], [/^двемерск/i, 0.5], [/^эльфийск/i, 0.6], [/^стеклянн/i, 0.5]],
        'Истмарк': [[/^нордск/i, 4], [/^мехов/i, 2], [/братьев бури/i, 4], [/^стальн/i, 1.5], [/^железн/i, 1.3], [/^имперск/i, 0.5], [/^двемерск/i, 0.3], [/^эльфийск/i, 0.4]],
        'Фолкрит': [[/^(кожан|сыромятн)/i, 2], [/^мехов/i, 1.5], [/^железн/i, 1.5], [/^охотнич/i, 2], [/^имперск/i, 1.2], [/^двемерск/i, 0.4], [/^эбонит/i, 0.4]],
        'Предел': [[/^двемерск/i, 5], [/^эльфийск/i, 2], [/^орочь/i, 2], [/серебр/i, 2], [/^нордск/i, 0.6], [/^имперск/i, 0.7], [/^мехов/i, 0.8]],
        'Белый Берег': [[/^нордск/i, 2], [/^стальн/i, 2], [/^железн/i, 2], [/^мехов/i, 2], [/^небесн/i, 1.5], [/^двемерск/i, 0.5], [/^эльфийск/i, 0.5]],
        'Винтерхолд': [[/^стеклянн/i, 2], [/^эльфийск/i, 1.5], [/^стальн/i, 1.5], [/^мехов/i, 2], [/^сталгрим/i, 2], [/^нордск/i, 1.3], [/^двемерск/i, 0.7]],
        'Схолстейм': [[/хитинов/i, 4], [/^сталгрим/i, 3], [/^эбонит/i, 2], [/^нордск/i, 1.5], [/^мехов/i, 2], [/^орочь/i, 0.7], [/^имперск/i, 0.4]]
    };
    // Региональные пристрастия алхимика и торговцев едой — по описанию флоры и фауны владений (справочник «Владения»).
    // Правило: [регулярка по названию, {владение: во сколько раз чаще/реже}, множитель для остальных владений (по умолчанию 1)].
    const _V = 'Вайтран', _R = 'Рифт', _H = 'Хаафингар', _K = 'Хьялмарк', _E = 'Истмарк', _F = 'Фолкрит', _P = 'Предел', _B = 'Белый Берег', _W = 'Винтерхолд', _S = 'Схолстейм';
    const MERCH_ING_AFFINITY = [
        [/^(Лаванда|Пушица)$/, { [_V]: 3, [_R]: 1.3, [_W]: 0.2, [_B]: 0.2, [_P]: 0.5 }],
        [/горноцвет/, { [_V]: 2, [_F]: 2, [_R]: 2, [_H]: 1.5, [_B]: 1.5, [_K]: 1.5, [_P]: 0.6, [_W]: 0.6 }],
        [/^Голубой горноцвет$/, { [_K]: 2.5, [_B]: 1.5 }],
        [/^Желтый горноцвет$/, { [_V]: 0.15 }],
        [/^Мора тапинелла$/, { [_V]: 1.5, [_R]: 2, [_F]: 2.5, [_H]: 1.5, [_K]: 1.5, [_E]: 2, [_P]: 0.8, [_W]: 0.3, [_B]: 0.3, [_S]: 0.5 }],
        [/^Ветка чертополоха$/, { [_V]: 1.5, [_R]: 2, [_F]: 3, [_H]: 1.5, [_E]: 2, [_K]: 0.7, [_P]: 0.7, [_W]: 0.3, [_B]: 0.3 }],
        [/^Паслён$/, { [_F]: 3, [_K]: 1.5, [_H]: 1.5, [_E]: 0.7 }, 0.5],
        [/^Снежные ягоды$/, { [_W]: 3, [_B]: 3, [_E]: 2, [_S]: 2, [_F]: 1.5, [_H]: 1.5, [_K]: 1.5 }],
        [/^Морской жёлудь$/, { [_H]: 3, [_B]: 2.5, [_E]: 1.5, [_S]: 1 }, 0.4],
        [/^Собачий корень$/, { [_H]: 2, [_K]: 2.5 }, 0.6],
        [/^(Ядовитый колокольчик|Болотный стручок|Гигантский лишайник)$/, { [_K]: 4 }, 0.25],
        [/^(Хвост злокрыса|Клешня грязевого краба)$/, { [_K]: 3, [_S]: 1.5 }, 0.7],
        [/^(Яйцо коруса|Усик коруса-охотника)$/, { [_K]: 3 }, 0.5],
        [/^(Язык дракона|Виноград джазби|Ползучая лоза)$/, { [_E]: 4 }, 0.3],
        [/^(Ягоды можжевельника|Бородатый мох)$/, { [_P]: 4 }, 0.4],
        [/^(Пепельная ползучая лоза|Императорский зонтичный мох|Стручок пепельной травы|Пепел порождения|Корень трамы|Желе пепельного прыгуна|Желе нетча|Перья фельсадской крачки|Кабаний клык|Древесина горелого сприггана)$/, { [_S]: 5 }, 0.15],
        [/^(Корень Нирна|Алый корень Нирна)$/, { [_K]: 2.5, [_E]: 1.2 }, 0.8],
        [/^(Морозная мириам|Морозная соль|Зубы ледяного привидения|Жир тролля|Глаз саблезуба|Клык саблезуба|Медвежьи когти)$/, { [_W]: 2.5, [_B]: 2.5, [_E]: 1.5, [_K]: 1.5, [_H]: 1.3, [_P]: 0.7 }, 0.8],
        [/^(Палец великана|Толчёный бивень мамонта)$/, { [_V]: 2, [_F]: 1.5, [_H]: 1.5, [_B]: 1.5, [_E]: 1.5, [_P]: 1.5, [_R]: 0.1, [_W]: 0.7 }],
        [/^Большие рога$/, { [_F]: 2.5, [_W]: 2, [_R]: 1.5, [_P]: 0.1 }],
        [/^Маленькие рога$/, { [_F]: 2, [_W]: 2, [_R]: 1.5, [_P]: 0.6 }],
        [/^(Крыло монарха|Крыло синей бабочки|Крыло лунного мотылька|Торакс светлячка)$/, { [_V]: 2, [_R]: 2.5, [_W]: 0.5, [_B]: 0.5 }],
        [/^(Синяя стрекоза|Оранжевая стрекоза)$/, { [_R]: 2.5, [_K]: 1.5, [_H]: 1.5, [_W]: 0.4, [_B]: 0.4 }],
        [/^(Абесинский окунь|Серебристый окунь|Бойцовая рыбка|Сиродильский лопатохвост|Хисткарп|Лососевая икра)$/, { [_F]: 2.5, [_V]: 1.5, [_R]: 2, [_K]: 1.5, [_W]: 0.5, [_B]: 0.5 }, 0.7],
        [/^(Пчела|Пчелиное гнездо|Медовые соты)$/, { [_R]: 2.5, [_V]: 2, [_F]: 1.5, [_W]: 0.4 }, 0.8],
        [/^(Пшеница|Чеснок|Куриное яйцо)$/, { [_V]: 2, [_E]: 1.5, [_R]: 1.5, [_H]: 1.5, [_W]: 0.5, [_B]: 0.7, [_P]: 0.7 }],
        [/^Сердце даэдра$/, {}, 4],   // редкость как у эбонитового и сталгримового снаряжения (около 3% витрин)
        [/^(Яйцо соснового дрозда|Яйцо ястреба|Перья ястреба|Клюв ястреба)$/, { [_V]: 1.5, [_F]: 1.5, [_P]: 1.3 }],
        [/^Паучье яйцо$/, { [_K]: 1.5, [_B]: 1.5, [_W]: 1.5 }]
    ];
    const MERCH_FOOD_AFFINITY = [
        [/^Оленина$/, { [_F]: 3, [_W]: 2, [_R]: 2, [_S]: 1.5, [_P]: 0.1 }],
        [/^Козий окорок$/, { [_W]: 2, [_P]: 2.5, [_V]: 1.5, [_E]: 1.5 }],
        [/кроличья ножка/, { [_W]: 2, [_R]: 1.5, [_S]: 1.5, [_V]: 1.3 }],
        [/^Мясо хоркера$/, { [_W]: 3, [_S]: 3, [_B]: 2, [_H]: 1.5 }, 0.5],
        [/^Хобот мамонта$/, { [_V]: 2, [_F]: 2, [_H]: 2, [_P]: 1.5, [_B]: 1.3, [_R]: 0.1 }],
        [/^Конина$/, { [_V]: 2, [_H]: 1.5, [_F]: 1.2 }],
        [/^Сырая говядина$/, { [_V]: 2, [_R]: 1.5, [_E]: 1.5, [_H]: 1.5, [_W]: 0.6 }],
        [/^Куриная грудка$/, { [_V]: 1.5, [_E]: 1.5, [_R]: 1.5 }],
        [/^Фазанья грудка$/, { [_R]: 2.5, [_V]: 1.2 }],
        [/^Мясо кабана$/, { [_S]: 3 }, 0.8],
        [/^Мясо устрицы$/, { [_H]: 3, [_B]: 2, [_W]: 1.5, [_S]: 1.5 }, 0.4],
        [/пепельн/, { [_S]: 6 }, 0.1],
        [/^Полярный/, { [_W]: 3, [_B]: 3, [_E]: 1.5, [_K]: 1.5 }, 0.5],
        [/^(Карп|Сом|Страж-рыба|Мелководный окунь|Лосось|Лососина|Стеклянный окунь|Стеклянный сомик|Люторыба|Лирохвостый окунь|Золотая рыбка)$/, { [_F]: 2.5, [_V]: 1.5, [_R]: 2, [_K]: 1.5, [_H]: 1.2, [_W]: 0.6, [_B]: 0.6, [_P]: 0.5 }, 0.7],
        [/^(Треска|Скорпена)$/, { [_H]: 2, [_B]: 2, [_W]: 2, [_S]: 1.5 }, 0.6],
        [/^(Капуста|Морковь|Тыква|Картофель|Лук-порей|Помидор|Капустный суп|Печёный картофель|Жареный лук-порей)$/, { [_V]: 2, [_E]: 2, [_R]: 2, [_H]: 2, [_F]: 1.3, [_B]: 0.7, [_W]: 0.5, [_P]: 0.5, [_S]: 0.7 }],
        [/яблок|Яблочный пирог/, { [_R]: 2, [_H]: 2, [_F]: 1.5, [_V]: 1.2, [_W]: 0.5, [_B]: 0.6 }],
        [/^Мёд Хоннинга$/, { [_V]: 4 }],
        [/^Черновересковый мёд/, { [_R]: 4 }],
        [/^Нордский мёд$/, { [_E]: 2, [_V]: 1.5, [_B]: 1.5, [_W]: 1.5 }],
        [/^Мед с можжевеловыми ягодами$/, { [_P]: 4 }],
        [/^Аргонианский эль$/, { [_K]: 3 }],
        [/^(Суджамма|Флин|Шейн|Мацт)$/, { [_E]: 3, [_S]: 2 }],
        [/^Зольный мед/, { [_S]: 4 }, 0.3],
        [/^Угольное вино$/, { [_S]: 2, [_E]: 1.5 }],
        [/^(Вино «Алто»|Коловианский бренди|Пряное вино)$/, { [_H]: 3, [_V]: 1.3 }],
        [/^Строс М'Кайский ром$/, { [_H]: 1.5, [_E]: 1.5 }]
    ];
    // Уникальная броня владений (поле location у предмета) → в лавке какого владения продаётся
    const MERCH_REGIONAL_ARMOR = { 'Фолкрит': 'Фолкрит', 'Хьялмарк': 'Хьялмарк', 'Белый Берег': 'Белый берег и Винтерхолд', 'Винтерхолд': 'Белый берег и Винтерхолд' };
    function merchantCatalogue() {
        const WR = window.weaponRecipes || [], WN = window.weaponsNonCraftable || [], AR = window.armorRecipes || [], AN = window.armorNonCraftable || [];
        const C = { w1: [], w2: [], gaunt: [], bow: [], xbow: [], arrow: [], bolt: [], fxAmmo: [], light: [], heavy: [], shield: [], specialMelee: [], specialRanged: [], specialArmor: [], thrownLight: [], thrownSpear: [] };
        const seen = new Set();
        const ammoCat = n => /болт/i.test(n) ? 'bolt' : 'arrow';
        const put = (kind, e, dom) => {
            if (!(typeof e.price === 'number' && e.price > 0) || seen.has(e.name)) return;
            seen.add(e.name);
            if (MERCH_NEVER_RE.test(e.name)) return;
            if (MERCH_SPECIAL_RE.test(e.name)) { (C['special' + dom] || C.specialMelee).push(e); return; }
            if (C[kind]) C[kind].push(e);
        };
        const weapon = w => {
            const sub = w.subcat || '', cat = w.category || '';
            if (/Кастет/.test(sub) || cat === 'Кастеты') return put('gaunt', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Melee');
            if (cat === 'Луки') return put('bow', { name: w.name, category: 'Луки', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Ranged');
            if (cat === 'Арбалеты') return put('xbow', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Ranged');
            if (cat === 'Стрелы' || cat === 'Болты') {
                const e = { name: w.name, category: 'Боеприпасы', price: w.price, weight: w.weight, dmg: w.damage };
                if (w.price >= 50) return put('fxAmmo', e, 'Ranged');
                if (cat === 'Стрелы') return MERCHANT_ARROW_NAMES.includes(w.name) ? put('arrow', e, 'Ranged') : (MERCH_SPECIAL_RE.test(w.name) ? put('arrow', e, 'Ranged') : undefined);
                return /сталгрим|серебр/i.test(w.name) ? undefined : put('bolt', e, 'Ranged');
            }
            if (cat === 'Двуручное') return put('w2', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Melee');
            if (cat === 'Одноручное') return put('w1', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Melee');
        };
        WR.forEach(weapon); WN.forEach(weapon);
        (window.thrownRecipes || []).forEach(w => { // метательное: ножи, топорики, дротики — обычные товары, копья — реже
            const e = { name: w.name, category: 'Метательное', price: w.price, weight: w.weight, dmg: w.damage, thrown: true, throwKind: w.throwKind };
            if (!(w.price > 0) || seen.has(w.name)) return;
            seen.add(w.name); (w.throwKind === 'spear' ? C.thrownSpear : C.thrownLight).push(e);
        });
        const armor = (a, slot) => {
            const kind = slot === 'shield' ? 'shield' : (/Тяжел/i.test(a.armorType) ? 'heavy' : 'light');
            put(kind, { name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot }, 'Armor');
        };
        AR.forEach(a => armor(a, GM_SMITHING_SLOT_MAP[a.slot] || null));
        AN.forEach(a => armor(a, normalizeArmorSlot(a.slot)));
        return C;
    }

    window.__buildMerchantItems = (t, h) => buildMerchantItems(t, h); // для тестов
    // Животные на прилавке: снимок шаблона (pet) едет с товаром, покупка у игрока создаёт животное, а не вещь в рюкзаке.
    function buildPetMerchantItems(typeKey, hold) {
        const def = (window.PET_MERCHANTS || {})[typeKey] || {}, q = def.qty || [1, 2];
        const custom = (lastData && Array.isArray(lastData.customPets) && lastData.customPets.length) ? lastData.customPets : _gmPets;
        return (window.petsForMerchant ? window.petsForMerchant(typeKey, hold, custom) : []).map(t => {
            const hp = Math.max(1, parseInt(t.hp) || 1);
            return { name: t.name, category: 'Животные', price: Math.max(0, parseInt(t.price) || 0), weight: 0, qty: randInt(q[0], q[1]),
                effect: `${t.icon || '🐾'} ХП ${hp}${t.rideable ? ` · верховое: +${(window.PET_RIDING || {}).speed || 15} скорости, +${(window.PET_RIDING || {}).carry || 100} к весу` : ''}`,
                pet: { id: t.id || '', icon: t.icon || '🐾', name: t.name, kind: t.kind || t.name, hp, loot: Array.isArray(t.loot) ? t.loot : [], rideable: !!t.rideable } };
        });
    }
    function buildMerchantItems(typeKey, hold) {
        if (LIVING_MERCHANT_TYPES[typeKey] && LIVING_MERCHANT_TYPES[typeKey].pets) return buildPetMerchantItems(typeKey, hold);
        const C = merchantCatalogue(), out = [], used = new Set();
        const ALL = ((window.allItems && window.allItems.length ? window.allItems : gmAllItems) || []).filter(i => !gmIsSustainScroll(i));
        const STACK = ['Готовые продукты', 'Сырые продукты', 'Напитки', 'Ингредиенты для алхимии', 'Боеприпасы', 'Метательное', 'Драгоценные камни', 'Камни душ'];
        const affList = (typeKey === 'blacksmith2' || typeKey === 'fletcher') ? (MERCH_AFFINITY[hold] || []) : [];
        const floraRules = typeKey === 'alchemist2' ? MERCH_ING_AFFINITY : (['foodVendor', 'grocer', 'innkeeper'].indexOf(typeKey) !== -1 ? MERCH_FOOD_AFFINITY : []);
        const affMult = name => {
            let m = affList.reduce((m, [re, k]) => re.test(name) ? m * k : m, 1);
            floraRules.forEach(([re, map, d]) => { if (re.test(name)) m *= (map[hold] != null ? map[hold] : (d != null ? d : 1)); });
            return m;
        };
        const regionBlocked = name => MERCH_REGION_ONLY.some(([re, hs]) => re.test(name) && hs.indexOf(hold) === -1);
        const itemsOf = (cats, f) => ALL.filter(i => cats.includes(i.category) && typeof i.price === 'number' && i.price > 0 && !isMerchantExcluded(i) && (!f || f(i)));
        const push = (i, qty) => {
            const q = qty ? randInt(qty[0], qty[1]) : (i.category === 'Боеприпасы' ? randInt(10, 30) : (STACK.includes(i.category) ? randInt(2, 6) : 1));
            // Firestore отвергает undefined — добавляем поле, только если оно есть
            const o = { name: i.name, category: i.category, price: i.price, weight: i.weight || 0, effect: i.effect || '', qty: q };
            if (typeof i.dmg === 'number') o.dmg = i.dmg; else if (typeof i.damage === 'number') o.dmg = i.damage;
            if (typeof i.armor === 'number') o.armor = i.armor;
            if (i.slot) o.slot = i.slot;
            if (i.weaponType) o.weaponType = i.weaponType;
            if (i.thrown) { o.thrown = true; o.throwKind = i.throwKind; }
            if (typeof i.capacity === 'number') o.capacity = i.capacity;
            out.push(o); used.add(i.name);
        };
        // раздел: от lo до hi РАЗНЫХ позиций; дешёвое попадается чаще дорогого (вес ~ 1/(1+цена/медиана)^0.8)
        const take = (list, lo, hi, o) => {
            o = o || {};
            const c = (list || []).filter(i => i && typeof i.price === 'number' && i.price > 0 && !used.has(i.name) && !regionBlocked(i.name));
            const n = Math.min(c.length, randInt(lo, hi));
            if (n <= 0) return;
            const pr = c.map(i => i.price).sort((x, y) => x - y), ref = Math.max(5, pr[Math.floor(pr.length / 2)]);
            c.map(i => { const w = (1 / Math.pow(1 + i.price / ref, 0.8)) * affMult(i.name); return { i, k: Math.pow(Math.random(), 1 / w) }; })
                .sort((x, y) => y.k - x.k).slice(0, n).forEach(x => push(x.i, o.qty));
        };
        // обязательный товар (всегда на прилавке)
        const always = (name, lo, hi) => {
            const it = ALL.find(i => i.name === name) || [].concat(C.arrow, C.bolt, C.bow, C.w1, C.w2).find(i => i.name === name);
            if (it && !used.has(name)) push(it, [lo, hi]);
        };
        const POT = i => !/^(Пергамент|Чернила)$/.test(i.name);
        switch (typeKey) {
            case 'blacksmith2':
                take(C.w1, 3, 5); take(C.w2, 1, 3);
                take(C.heavy, 3, 5); take(C.light, 2, 4); take(C.shield, 1, 2);
                take(itemsOf(['Кузнечные ингредиенты'], i => /руда/i.test(i.name) && i.name !== 'Серебряная руда'), 1, 3, { qty: [2, 6] });
                always('Кожа', 3, 8); always('Полоски кожи', 4, 12);
                // ножны под ближнее оружие и держатель щита — всегда, утяжелённые — частью
                ['Ножны для кинжала', 'Ножны для меча', 'Ножны для боевого топора', 'Ножны для булавы', 'Ножны для двуручного меча', 'Ножны для секиры', 'Ножны для боевого молота', 'Ножны для копья', 'Ножны для пики', 'Ножны для посоха', 'Держатель для щита'].forEach(n => always(n, 1, 3));
                take(itemsOf(['Ножны и колчаны'], i => i.sheathArmor && !/лука|арбалета/.test(i.name)), 2, 4);
                take(C.arrow, 1, 2); take(C.gaunt, 0, 1);
                take(C.thrownLight, 1, 3, { qty: [3, 8] }); take(C.thrownSpear, 0, 1, { qty: [1, 2] });
                take(C.specialMelee.concat(C.specialArmor), 0, 2);
                if (MERCH_REGIONAL_ARMOR[hold]) take(itemsOf(['Уникальная броня'], i => i.location === MERCH_REGIONAL_ARMOR[hold]), 1, 3);
                take(itemsOf(['Одноручное (лут)', 'Двуручное (лут)', 'Тяжелая броня (лут)', 'Легкая броня (лут)']), 0, 2);
                break;
            case 'fletcher':
                always('Железная стрела', 15, 30);
                ['Колчан для стрел', 'Колчан для болтов', 'Ножны для лука', 'Ножны для арбалета'].forEach(n => always(n, 1, 3));
                take(itemsOf(['Ножны и колчаны'], i => i.sheathArmor && /лука|арбалета/.test(i.name)), 0, 2);
                take(C.bow, 5, 7); take(C.xbow, 0, 2);
                take(C.arrow, 5, 7); take(C.bolt, 2, 4);
                take(C.thrownLight, 0, 2, { qty: [3, 8] });
                take(C.fxAmmo, 0, 2, { qty: [2, 6] });
                take(C.specialRanged, 0, 1);
                take(itemsOf(['Луки (лут)']), 0, 1);
                break;
            case 'alchemist2':
                always('Лечебная припарка', 3, 8);
                take(itemsOf(['Ингредиенты для алхимии']), 14, 20);
                break;
            case 'pawnbrokerLive':
                always('Пергамент', 3, 8); always('Чернила', 2, 6); always('Соль', 2, 6);
                take(itemsOf(['Бытовые предметы'], POT), 5, 8);
                take(itemsOf(['Ножны и колчаны'], i => !i.sheathArmor), 3, 5, { qty: [1, 2] });
                take(itemsOf(['Ножны и колчаны'], i => i.sheathArmor), 1, 2);
                take(itemsOf(['Походное снаряжение']), 2, 4);
                take(itemsOf(['Сырые продукты']), 2, 4);
                take(itemsOf(['Ювелирные изделия']), 1, 2);
                take(itemsOf(['Драгоценные камни']), 0, 2);
                take(itemsOf(['Шкуры']), 1, 2);
                break;
            case 'courtWizard':
                always('Пергамент', 3, 8); always('Чернила', 2, 6);
                take(itemsOf(['Свитки (прописанные)']), 4, 7);
                take(window.spellTomesData || [], 4, 7);
                take(itemsOf(['Посохи']), 2, 4);
                take(itemsOf(['Магические одеяния']), 2, 4);
                take(itemsOf(['Камни душ'], i => !/^Заполненный/.test(i.name)), 2, 4, { qty: [1, 4] });
                take(itemsOf(['Камни душ'], i => /^Заполненный/.test(i.name)), 0, 1, { qty: [1, 2] });
                break;
            case 'jeweler':
                take(itemsOf(['Ювелирные изделия', 'Ювелирное изделие (лут)']), 6, 10);
                take(itemsOf(['Драгоценные камни']), 3, 6);
                take(itemsOf(['Кузнечные ингредиенты'], i => /^(Золотая|Серебряная) руда$/.test(i.name)), 0, 2, { qty: [2, 5] });
                break;
            case 'innkeeper':
                take(itemsOf(['Готовые продукты']), 5, 9); take(itemsOf(['Напитки']), 4, 7); take(itemsOf(['Сырые продукты']), 2, 4);
                break;
            case 'grocer':
                always('Соль', 3, 8);
                take(itemsOf(['Сырые продукты']), 8, 12); take(itemsOf(['Готовые продукты']), 1, 3); take(itemsOf(['Напитки']), 1, 2);
                take(itemsOf(['Шкуры']), 1, 3); take(itemsOf(['Бытовые предметы'], POT), 2, 4);
                break;
            case 'foodVendor':
                always('Соль', 2, 6);
                take(itemsOf(['Сырые продукты']), 6, 9); take(itemsOf(['Готовые продукты']), 3, 6); take(itemsOf(['Напитки']), 1, 3);
                break;
            case 'khajiitCaravan':
                // скума и лунный сахар — эксклюзив каравана (у остальных исключены), здесь лежат всегда
                [['Красноводная скума', 2, 5], ['Лунный сахар', 2, 5]].forEach(([nm, lo, hi]) => { const it = ALL.find(i => i.name === nm); if (it) push(it, [lo, hi]); });
                take(itemsOf(['Сырые продукты']), 3, 5); take(itemsOf(['Бытовые предметы'], POT), 3, 5);
                take(itemsOf(['Ювелирные изделия']), 2, 4); take(itemsOf(['Шкуры']), 1, 3);
                take(itemsOf(['Ингредиенты для алхимии']), 4, 7);
                break;
            default:
                take(getMerchantItemPool(typeKey), 15, 26);
        }
        // Слитки: у кузнеца и барахольщика гарантированно 2-5 (по прямой просьбе), у ювелира — серебряный и золотой.
        // Золотой слиток по вики купить нельзя вообще, серебряный почти не продаётся — их у них нет; серебряную руду продают.
        if (typeKey === 'blacksmith2' || typeKey === 'pawnbrokerLive') {
            const NOT_FOR_SALE = ['Золотой слиток', 'Серебряный слиток'];
            const ingots = ALL.filter(i => i.category === 'Кузнечные ингредиенты' && (/слиток/i.test(i.name) || i.name === 'Серебряная руда') && NOT_FOR_SALE.indexOf(i.name) === -1 && !used.has(i.name)).sort(() => Math.random() - 0.5);
            const cnt = Math.min(ingots.length, randInt(2, 5));
            for (let k = 0; k < cnt; k++) push(ingots[k], [2, 6]);
        }
        if (typeKey === 'jeweler') {
            ['Серебряный слиток', 'Золотой слиток'].forEach(nm => { const it = ALL.find(i => i.name === nm); if (it && !used.has(nm)) push(it, [2, 5]); });
        }
        // Солстейм: хитиновую пластину и шкуру нетча продают кузнецы и торговцы общими товарами только там
        if (hold === 'Схолстейм' && (typeKey === 'blacksmith2' || typeKey === 'pawnbrokerLive')) {
            [['Хитиновая пластина', 3, 8], ['Шкура нетча', 2, 5]].forEach(([nm, lo, hi]) => { const it = ALL.find(i => i.name === nm); if (it && !used.has(nm)) push(it, [lo, hi]); });
        }
        return out;
    }


    window.refreshMerchantStock = function () {
        const typeKey = el('merchant-type-select').value;
        const hold = el('merchant-hold-select').value;
        if (!hold) { alert('Выбери владение.'); return; }
        const def = LIVING_MERCHANT_TYPES[typeKey];
        const finalItems = buildMerchantItems(typeKey, hold);
        if (!finalItems.length) {
            if (def.pets) {
                const places = window.petMerchantPlaces ? window.petMerchantPlaces(typeKey) : [];
                alert(places.length ? `«${def.label}» в «${hold}» нет. Есть в: ${places.join(', ')}.` : 'Своих животных с продавцом в этом владении нет — добавь их в «🐾 Животные и питомцы» и укажи, где продаются.');
            } else alert('Нет предметов в базе для этого типа торговца.');
            return;
        }
        const key = typeKey + '@' + hold;
        const ref = db.collection('sessions').doc(currentCode);
        let goldNow = def.gold;
        // Транзакцией по свежим данным: другие лавки и вклады игроков, сделанные только что, не затираются.
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const stocks = Object.assign({}, ((doc.exists && doc.data()) || {}).merchantStocks || {});
            const old = stocks[key] || {};
            // disposition (-2..+2, отношение конкретного торговца к группе) — СОХРАНЯЕМ существующее
            // значение при обновлении ассортимента (это про товар, не про отношение), 0 только для
            // нового торговца. Меняется отдельно, кнопками ниже (setMerchantDisposition), без
            // необходимости перегенерировать весь ассортимент заново.
            // Вклады по перку «Вкладчик» — «навсегда»: вложившие и их +500 к запасу золота переживают обновление
            // ассортимента (и «Скупщик» у этого торговца продолжает работать).
            const investors = Array.isArray(old.investors) ? old.investors.slice() : [];
            goldNow = def.gold + 500 * investors.length;
            stocks[key] = { gold: goldNow, items: stripUndefinedDeep(finalItems), updatedAt: Date.now(), generatedOnDay: lastData.gameDayCounter || 0, label: def.label, hold: hold, disposition: old.disposition || 0 };
            if (investors.length) stocks[key].investors = investors;
            if (def.pets) stocks[key].pets = true; // игрок не продаёт таким торговцам свои вещи
            tx.update(ref, { merchantStocks: stocks });
        })).then(() => {
            el('merchant-gen-result').innerHTML = `<span style="color:#2ecc71;">✅ ${def.label} в «${hold}»: ${finalItems.length} позиций, золото ${formatNumber(goldNow)}.</span>`;
            renderMerchantStaleness();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Задача C: "раз в неделю" не бывает автоматически без общего счётчика игровых дней (у
    // календаря на листе игрока нет привязки к сессии) — вместо тихого автосброса посреди игры
    // мастер явно видит, у кого ассортимент устарел (7+ игровых дней), и жмёт обновить сам.
    function renderMerchantStaleness() {
        const box = el('merchant-staleness-list');
        if (!box) return;
        const stocks = lastData.merchantStocks || {};
        const keys = Object.keys(stocks);
        const currentDay = lastData.gameDayCounter || 0;
        if (!keys.length) { box.innerHTML = '<p style="opacity:.6; font-size:13px;">Торговцев ещё нет.</p>'; return; }
        const DISPOSITION_LABELS = { '-2': 'Вражда (торговля закрыта)', '-1': 'Неприязнь (+25%)', '0': 'Нейтрально', '1': 'Друг (−10%)', '2': 'Союзник (−20%)' };
        box.innerHTML = keys.map(k => {
            const s = stocks[k];
            const daysAgo = currentDay - (s.generatedOnDay || 0);
            const stale = daysAgo >= 7;
            const disp = s.disposition || 0;
            return `<div style="font-size:13px; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; ${stale ? 'color:#e67e22;' : ''}">
                <span>${stale ? '⚠️ ' : ''}${escapeHtml(s.label)} — ${escapeHtml(s.hold)}: ${daysAgo} игр. дн. назад${stale ? ' (пора обновить)' : ''}</span>
                <select style="width:auto; font-size:11px; padding:1px;" onchange="setMerchantDisposition('${jsq(k)}', this.value)">
                    ${Object.keys(DISPOSITION_LABELS).map(v => `<option value="${v}" ${String(disp) === v ? 'selected' : ''}>${DISPOSITION_LABELS[v]}</option>`).join('')}
                </select>
                <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:11px; flex-shrink:0;" onclick="removeMerchant('${jsq(k)}')">Убрать</button>
            </div>`;
        }).join('');
    }

    // disposition конкретного торговца (-2 Вражда .. +2 Союзник) — отношение влияет на цены, по которым
    // торговец ПРОДАЁТ свои вещи игроку (buyFromMerchant, index.html; цену скупки не меняет) и может полностью заблокировать
    // торговлю при -2. Меняется отдельно от ассортимента, без нужды его перегенерировать.
    window.setMerchantDisposition = function (key, value) {
        db.collection('sessions').doc(currentCode).update({ ['merchantStocks.' + key + '.disposition']: parseInt(value) || 0 })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    // Убрать торговца совсем (не просто обновить ассортимент) — раньше такой возможности не
    // было вообще, только сброс товара у уже существующего.
    window.removeMerchant = function (key) {
        if (!confirm('Убрать этого торговца из сессии? Игроки перестанут видеть его в списке для покупки.')) return;
        db.collection('sessions').doc(currentCode).update({ ['merchantStocks.' + key]: firebase.firestore.FieldValue.delete() })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    function renderMerchantHoldSelect() {
        const sel = el('merchant-hold-select');
        if (!sel || sel.options.length) return; // уже заполнен один раз
        sel.innerHTML = '<option value="">— выбери владение —</option>' + REPUTATION_HOLDS.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
    }

    function renderMerchantTypeSelect() {
        const sel = el('merchant-type-select');
        if (!sel || sel.options.length) return;
        const opt = ([k, v]) => {
            const places = v.pets && window.petMerchantPlaces ? window.petMerchantPlaces(k) : [];
            return `<option value="${k}">${escapeHtml(v.label)} (${v.pets ? (places.length ? escapeHtml(places.join(', ')) : 'свои животные мастера') : 'база ' + formatNumber(v.gold) + ' золота'})</option>`;
        };
        const all = Object.entries(LIVING_MERCHANT_TYPES);
        sel.innerHTML = all.filter(([, v]) => !v.pets).map(opt).join('') + '<optgroup label="🐾 Животные">' + all.filter(([, v]) => v.pets).map(opt).join('') + '</optgroup>';
    }

    let currentSupernaturalState = defaultSupernaturalState();

    function renderGuildsPanel() {
        const listEl = el('guilds-list');
        if (!listEl) return;
        if (!currentInvPlayerUid) { listEl.innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>'; return; }
        listEl.innerHTML = GUILD_NAMES.map(g => {
            const gd = currentGuildsData[g] || { member: false, orders: 0 };
            const rank = getGuildRank(g, gd.orders);
            return `
            <div class="party-row" style="display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                    <label style="display:flex; align-items:center; gap:6px; margin:0;">
                        <input type="checkbox" ${gd.member ? 'checked' : ''} onchange="toggleGuildMembership('${jsq(g)}', this.checked)">
                        <strong>${escapeHtml(g)}</strong>
                    </label>
                    ${gd.member ? `<span style="font-size:12px; opacity:.8;">${escapeHtml(rank.rankName)}${rank.next ? ' → ещё ' + (rank.next.at - gd.orders) + ' до «' + escapeHtml(rank.next.name) + '»' : ' (максимум)'}</span>` : ''}
                </div>
                ${gd.member ? `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                    <span>Заказов: <strong>${gd.orders}</strong></span>
                    <span style="display:flex; gap:4px;">
                        <button style="width:auto; padding:2px 8px;" onclick="adjustGuildOrders('${jsq(g)}', 1)">+1</button>
                        <button style="width:auto; padding:2px 8px;" onclick="adjustGuildOrders('${jsq(g)}', 5)">+5</button>
                        <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resetGuildOrders('${jsq(g)}')">Сброс</button>
                    </span>
                </div>` : ''}
            </div>`;
        }).join('');
    }

    function renderGuildInfoSelect() {
        const sel = el('guild-info-select');
        if (!sel || sel.options.length) return;
        sel.innerHTML = GUILD_NAMES.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }

    // Задача "Бойцовский клуб — турниры": эта гильдия не подходит под общую систему {member,orders}
    // — награды привязаны к победе в конкретном турнире по УРОВНЮ ПЕРСОНАЖА, не к счётчику заказов
    // гильдии. Сами бои разыгрываются обычным боевым инструментом; тут только запись+награда.
    const TOURNAMENT_BRACKETS = {
        'Новички': { levelRange: '1-5', rewards: ['50 золота', 'Мешочек самоцветов (~100 золота)', 'Серебряное украшение'] },
        'Ученики': { levelRange: '5-10', rewards: ['150 золота', 'Мешочек самоцветов (~250 золота)', 'Золотое украшение', 'Зачарованное стальное оружие'] },
        'Адепты': { levelRange: '10-15', rewards: ['300 золота', 'Крупный самоцвет (~400 золота)', 'Зачарованное эльфийское/двемерское оружие', 'Зачарованная броня (соответствующего материала)'] },
        'Эксперты': { levelRange: '15-20', rewards: ['600 золота', 'Зачарованное стеклянное/эбонитовое оружие', 'Зачарованная броня высокого уровня', '🏆 «Выбитые зубы» (эбонитовые перчатки, уникальное зачарование) — только чемпиону группы'] }
    };

    window.renderTournBracketInfo = function () {
        const box = el('tourn-bracket-info');
        if (!box) return;
        const b = TOURNAMENT_BRACKETS[el('tourn-bracket-select').value];
        box.innerHTML = b ? `Уровень персонажа: ${b.levelRange}. Награды: ${b.rewards.join(', ')}` : '';
    };

    window.tournChargeEntryFee = function () {
        const uid = currentInvPlayerUid;
        if (!uid) { alert('Выбери игрока.'); return; }
        gmAddGold(uid, -200, { requireEnough: true }).then(r => {
            el('tourn-result').innerHTML = `<span style="color:#2ecc71;">Залог 200 золота списан (было ${r.before}, стало ${r.after}).</span>`;
        }).catch(e => { el('tourn-result').innerHTML = `<span style="color:#e74c3c;">Залог не списан: ${escapeHtml(e.message)}.</span>`; });
    };

    window.tournGrantReward = function () {
        const uid = currentInvPlayerUid;
        const bracket = el('tourn-bracket-select').value;
        if (!uid) { alert('Выбери игрока.'); return; }
        const rewards = TOURNAMENT_BRACKETS[bracket].rewards;
        const choice = prompt('Какую награду выдать?\n' + rewards.map((r, i) => `${i + 1}. ${r}`).join('\n'), '1');
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || !rewards[idx]) return;
        const rewardText = rewards[idx];
        // Золотые награды просто прибавляем к золоту; предметные — кладём в инвентарь текстом,
        // как и остальные гильдийские награды (без обязательной регистрации в общем каталоге).
        const goldMatch = rewardText.match(/^(\d+)\s*золота/);
        (goldMatch
            ? gmAddGold(uid, parseInt(goldMatch[1]))
            : gmTxInventory(uid, inv => { inv.push({ itemId: rewardText + '_tourn_' + Date.now(), name: rewardText, count: 1, weight: 1, category: 'Награда турнира', effect: `Приз группы «${bracket}» Бойцовского клуба` }); })
        ).then(() => {
            el('tourn-result').innerHTML = `<span style="color:#2ecc71;">Выдано: ${escapeHtml(rewardText)}.</span>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.renderGuildInfoPanel = function () {
        const box = el('guild-info-body');
        const sel = el('guild-info-select');
        if (!box || !sel) return;
        const g = sel.value;
        const info = GUILD_DATA[g];
        if (!info) { box.innerHTML = ''; return; }
        let html = '<h4 style="margin:6px 0 2px;">Квестодатели</h4>';
        html += info.givers.map(giver => `<div style="font-size:12px; margin-top:2px;">👤 <strong>${escapeHtml(giver.name)}</strong> — ${escapeHtml(giver.note)}</div>`).join('');
        html += '<h4 style="margin:8px 0 2px;">Плюшки гильдии</h4>';
        html += `<div style="font-size:12px;">${escapeHtml(info.perks)}</div>`;
        if (info.armorRewards.length) {
            html += '<h4 style="margin:8px 0 2px;">Награды бронёй по порогам</h4>';
            html += info.armorRewards.map(r => `<div style="font-size:12px; margin-top:2px;">🏅 <strong>${r.at} заказов:</strong> ${r.items.map(escapeHtml).join(', ')}${r.note ? ' — ' + escapeHtml(r.note) : ''}</div>`).join('');
        }
        if (info.note) html += `<div style="font-size:11px; opacity:.65; margin-top:8px;">ℹ️ ${escapeHtml(info.note)}</div>`;
        box.innerHTML = html;
    };

    function renderAllEnchantsReference() {
        const box = el('all-enchants-body');
        if (!box) return;
        if (!window.enchantWeaponEffects || !window.enchantArmorEffects) {
            box.innerHTML = '<p style="opacity:.6; font-size:13px;">enchant-data.js не подключён.</p>';
            return;
        }
        let html = '<h4 style="margin:4px 0 2px;">Оружие (все 6, срок 5 дней без подзарядки)</h4>';
        html += window.enchantWeaponEffects.map(e => `<div style="font-size:12px; margin-top:2px;">⚔️ <strong>${escapeHtml(e.name)}</strong> — до ${e.maxValue}${escapeHtml(e.unit)}. ${escapeHtml(e.description)}</div>`).join('');
        html += '<h4 style="margin:10px 0 2px;">Броня/украшения (все 28, постоянно)</h4>';
        html += window.enchantArmorEffects.map(e => `<div style="font-size:12px; margin-top:2px;">🛡️ <strong>${escapeHtml(e.name)}</strong> — до ${e.maxValue}${escapeHtml(e.unit)} · слоты: ${e.slots.join(', ')}. ${escapeHtml(e.description)}</div>`).join('');
        box.innerHTML = html;
    }

    window.toggleGuildMembership = function (guildName, isMember) {
        if (!currentInvPlayerUid) return;
        const gd = currentGuildsData[guildName] || { member: false, orders: 0 };
        currentGuildsData[guildName] = Object.assign({}, gd, { member: isMember });
        db.collection('characters').doc(currentInvPlayerUid).update({ guildsData: currentGuildsData })
            .then(renderGuildsPanel).catch(e => alert('Ошибка: ' + e.message));
    };

    // Заявки на сдачу артефакта в музей Коллегии бардов: игрок сам награду начислить не может (раньше кнопка давала +800 золота бесконечно).
    function renderMuseumRequests() {
        const box = el('museum-requests'); if (!box) return;
        const list = Array.isArray(lastData.museumRequests) ? lastData.museumRequests : [];
        box.innerHTML = list.length ? '<div style="margin-bottom:8px;"><strong>🎼 Заявки в музей коллегии бардов</strong>' + list.map(r =>
            `<div class="party-row" style="display:flex; gap:6px; align-items:center; justify-content:space-between;"><span>${escapeHtml(r.name || '?')}</span><span style="display:flex; gap:4px;">` +
            `<button style="width:auto; padding:2px 8px;" onclick="approveMuseumRequest('${jsq(r.id)}', true)">Принять (+800, +1 песня)</button>` +
            `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="approveMuseumRequest('${jsq(r.id)}', false)">Отклонить</button></span></div>`).join('') + '</div>' : '';
    }
    window.approveMuseumRequest = function (reqId, ok) {
        const ref = db.collection('sessions').doc(currentCode);
        let req = null;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const list = Array.isArray((doc.data() || {}).museumRequests) ? doc.data().museumRequests.slice() : [];
            const i = list.findIndex(r => r.id === reqId);
            if (i < 0) throw new Error('Заявка уже обработана.');
            req = list[i]; list.splice(i, 1);
            tx.update(ref, { museumRequests: list });
        })).then(() => {
            if (!ok) return;
            // update(), а не set(merge): set не разбирает точки в ключе — песня и артефакт не засчитывались.
            const refC = db.collection('characters').doc(req.uid), GN = 'Коллегия бардов';
            return db.runTransaction(tx => tx.get(refC).then(doc => {
                const gd = ((doc.exists ? doc.data() : {}).guildsData || {})[GN];
                const base = typeof gd === 'number' ? { member: gd > 0, orders: gd } : Object.assign({}, gd || {});
                base.orders = (parseInt(base.orders) || 0) + 1;
                base.artifacts = (parseInt(base.artifacts) || 0) + 1;
                const patch = {}; patch['guildsData.' + GN] = base;
                if (doc.exists) tx.update(refC, patch); else tx.set(refC, { guildsData: { [GN]: base } }, { merge: true });
            })).then(() => gmAddGold(req.uid, 800));
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Пойманные на карманной краже (index.html attemptTheft → CloudSync.reportTheftCaught): штраф предложен по правилу
    // «25 + ½ цены вещи, у стражи и знати ×2»; мастер выписывает его одной кнопкой (сумма и владение правятся) или отпускает.
    function renderTheftCases() {
        const box = el('theft-cases'); if (!box) return;
        const list = Array.isArray(lastData.theftCases) ? lastData.theftCases : [];
        box.innerHTML = list.length ? '<div style="margin-bottom:10px; padding:6px; border:1px solid #e74c3c; border-radius:4px;"><strong>🚨 Пойманы на карманной краже</strong>' + list.map(c =>
            `<div class="party-row" style="display:block;"><div>${escapeHtml(c.name || '?')} — ${escapeHtml(c.victim || '?')}, ${escapeHtml(c.what || '')}</div>` +
            `<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-top:4px;"><input type="number" id="theft-fine-${escapeHtml(c.id)}" value="${parseInt(c.fine) || 0}" style="width:80px;">` +
            `<select id="theft-hold-${escapeHtml(c.id)}">${REPUTATION_HOLDS.map(h => `<option value="${escapeHtml(h)}"${h === c.hold ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('')}</select>` +
            `<button style="width:auto; padding:2px 8px;" onclick="resolveTheftCase('${jsq(c.id)}', true)">⚖️ Выписать штраф</button>` +
            `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resolveTheftCase('${jsq(c.id)}', false)">Отпустить</button></div></div>`).join('') + '</div>' : '';
    }
    window.resolveTheftCase = function (caseId, fineIt) {
        const ref = db.collection('sessions').doc(currentCode);
        const amount = Math.max(0, parseInt((el('theft-fine-' + caseId) || {}).value) || 0);
        const holdSel = (el('theft-hold-' + caseId) || {}).value || '';
        let c = null;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const list = Array.isArray((doc.data() || {}).theftCases) ? doc.data().theftCases.slice() : [];
            const i = list.findIndex(r => r.id === caseId);
            if (i < 0) throw new Error('Заявка уже обработана.');
            c = list[i]; list.splice(i, 1);
            tx.update(ref, { theftCases: list });
        })).then(() => {
            if (!fineIt) { gmPostLogEntryText(`🤝 ${c.name} пойман(а) на краже (${c.victim}), но отпущен(а) без штрафа.`); return; }
            if (amount <= 0) return;
            const cref = db.collection('characters').doc(c.uid);
            const reason = `карманная кража: ${c.victim}`;
            let next = null;
            return db.runTransaction(tx => tx.get(cref).then(doc => {
                next = window.StCrime.addFine((doc.data() || {}).crimeState, holdSel, amount, reason);
                tx.update(cref, { crimeState: next });
            })).then(() => {
                if (currentInvPlayerUid === c.uid) { currentCrimeState = next; renderCrimePanel(); }
                const inHold = window.StCrime.amountIn(next, holdSel);
                gmPostLogEntryText(`⚖️ ${c.name}: штраф ${amount} септимов (${holdSel}) за карманную кражу${inHold > amount ? ` — розыск там ${inHold}` : ''}.`);
                try { window.rumAddDeed({ kind: 'crime', amount: amount, reason: reason, hold: holdSel || undefined, who: [c.name].filter(Boolean) }); } catch (e) { }
            });
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Лимиты, которые мастер задаёт игрокам (sessions.playerLimits). Пустое поле = поле не хранится = умолчание на стороне игрока.
    const LIMIT_KEYS = ['forageRolls', 'practice', 'nextDay', 'perform'];
    function renderPlayerLimits() {
        const lim = lastData.playerLimits || {};
        LIMIT_KEYS.forEach(k => {
            const inp = el('lim-' + k); if (!inp || document.activeElement === inp) return;
            inp.value = typeof lim[k] === 'number' ? lim[k] : '';
        });
        const bs = el('bard-song-gm');
        if (bs) bs.innerHTML = lastData.bardSong ? `🎵 Играет «Бардовская баллада»: <strong>${escapeHtml(lastData.bardSong.name || 'бард')}</strong> (союзникам +1 к кубам) <button style="width:auto; padding:2px 10px;" onclick="stopBardSongGm()">Остановить</button>` : '';
    }
    window.stopBardSongGm = function () {
        db.collection('sessions').doc(currentCode).update({ bardSong: firebase.firestore.FieldValue.delete() }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.savePlayerLimits = function () {
        const out = {};
        LIMIT_KEYS.forEach(k => { const v = el('lim-' + k).value; if (v !== '' && !isNaN(parseInt(v)) && parseInt(v) >= 0) out[k] = parseInt(v); });
        db.collection('sessions').doc(currentCode).update({ playerLimits: out })
            .then(() => { el('player-limits-result').innerHTML = '<span style="color:#2ecc71;">✅ Сохранено — игроки подхватят сразу.</span>'; })
            .catch(e => { el('player-limits-result').innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // Заявки игроков на выполнение квестов гильдий: начисление заказа и наград идёт только после решения мастера.
    function renderQuestClaims() {
        const box = el('quest-claims'); if (!box) return;
        const list = Array.isArray(lastData.questClaims) ? lastData.questClaims : [];
        box.innerHTML = list.length ? '<div style="margin-bottom:8px;"><strong>📜 Квесты гильдий и помощь жителям — ждут подтверждения</strong>' + list.map(c =>
            `<div class="party-row" style="display:flex; gap:6px; align-items:center; justify-content:space-between;"><span>${escapeHtml(c.name || '?')}: «${escapeHtml(c.title || '?')}» <span style="opacity:.7;">(${escapeHtml(c.guild || '')})</span></span><span style="display:flex; gap:4px;">` +
            `<button style="width:auto; padding:2px 8px;" onclick="resolveQuestClaim('${jsq(c.id)}', true)">Подтвердить</button>` +
            `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resolveQuestClaim('${jsq(c.id)}', false)">Не выполнен</button></span></div>`).join('') + '</div>' : '';
    }
    window.resolveQuestClaim = function (claimId, ok) {
        const ref = db.collection('sessions').doc(currentCode);
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const d = doc.data() || {};
            const claims = Array.isArray(d.questClaims) ? d.questClaims.slice() : [];
            const i = claims.findIndex(c => c.id === claimId);
            if (i < 0) throw new Error('Заявка уже обработана.');
            const c = claims[i]; claims.splice(i, 1);
            const decisions = Array.isArray(d.questDecisions) ? d.questDecisions.slice() : [];
            decisions.push({ uid: c.uid, questId: c.questId, ok: !!ok, ts: Date.now() });
            tx.update(ref, { questClaims: claims, questDecisions: decisions });
        })).catch(e => alert('Ошибка: ' + e.message));
    };

    window.adjustGuildOrders = function (guildName, delta) {
        if (!currentInvPlayerUid) return;
        const gd = currentGuildsData[guildName] || { member: false, orders: 0 };
        currentGuildsData[guildName] = Object.assign({}, gd, { orders: Math.max(0, gd.orders + delta) });
        db.collection('characters').doc(currentInvPlayerUid).update({ guildsData: currentGuildsData })
            .then(renderGuildsPanel).catch(e => alert('Ошибка: ' + e.message));
    };

    window.resetGuildOrders = function (guildName) {
        if (!currentInvPlayerUid) return;
        if (!confirm(`Сбросить счётчик заказов «${guildName}» до 0?`)) return;
        const gd = currentGuildsData[guildName] || { member: false, orders: 0 };
        currentGuildsData[guildName] = Object.assign({}, gd, { orders: 0 });
        db.collection('characters').doc(currentInvPlayerUid).update({ guildsData: currentGuildsData })
            .then(renderGuildsPanel).catch(e => alert('Ошибка: ' + e.message));
    };

    function saveSupernaturalState() {
        if (!currentInvPlayerUid) return Promise.resolve();
        return db.collection('characters').doc(currentInvPlayerUid).update({ supernaturalState: currentSupernaturalState });
    }

    function renderSupernaturalPanel() {
        const wrap = el('supernatural-panel-body');
        if (!wrap) return;
        if (!currentInvPlayerUid) { wrap.innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>'; return; }
        const s = currentSupernaturalState;
        wrap.innerHTML = `
            <div class="checkbox-group"><input type="checkbox" id="sn-lycan" ${s.lycanthropy ? 'checked' : ''} onchange="toggleSupernaturalFlag('lycanthropy', this.checked)"><label for="sn-lycan">Ликантропия (оборотень)</label></div>
            <div id="sn-werewolf-block" style="display:${s.lycanthropy ? 'block' : 'none'}; padding:6px 0 6px 12px; border-left:2px solid var(--border-color); margin:4px 0;">
                <p style="font-size:12px; opacity:.75;">Базовая форма (всегда): ${escapeHtml(WEREWOLF_BASE_INFO)}</p>
                <label>Съедено сердец: <input type="number" id="sn-hearts" value="${s.werewolf.heartsEaten}" style="width:70px; display:inline;" onchange="setWerewolfHearts(this.value)"></label>
                <label style="margin-top:6px;">Активный тотем Хирсина</label>
                <select id="sn-totem" onchange="setWerewolfTotem(this.value)">
                    ${HIRCINE_TOTEMS.map(t => `<option value="${escapeHtml(t)}" ${s.werewolf.totem === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
                </select>
                <button class="btn-success" style="width:100%; margin-top:6px;" onclick="triggerTransform()">🐺 Обратить в зверя (лог в журнал)</button>
                <label style="margin-top:8px;">Способности (открываются автоматически по числу сердец)</label>
                ${WEREWOLF_ABILITIES.map(a => {
                    const unlocked = (s.werewolf.heartsEaten || 0) >= a.threshold;
                    return `<div style="font-size:12px; margin-top:3px; opacity:${unlocked ? 1 : 0.5};">${unlocked ? '🔓' : '🔒'} <strong>${escapeHtml(a.name)}</strong> (${a.threshold} сердец) — ${escapeHtml(a.desc)}</div>`;
                }).join('')}
            </div>

            <div class="checkbox-group" style="margin-top:8px;"><input type="checkbox" id="sn-vamp" ${s.vampirism ? 'checked' : ''} onchange="toggleSupernaturalFlag('vampirism', this.checked)"><label for="sn-vamp">Вампиризм</label></div>
            <div id="sn-vampire-block" style="display:${s.vampirism ? 'block' : 'none'}; padding:6px 0 6px 12px; border-left:2px solid var(--border-color); margin:4px 0;">
                <p style="font-size:12px; opacity:.75;">Базовое заражение (даётся автоматически): ${escapeHtml(VAMPIRE_BASE_INFO)}</p>
                <label>Стадия голода (0-4, = дней без крови)</label>
                <select id="sn-hunger" onchange="setVampireHunger(this.value)">
                    ${[0, 1, 2, 3, 4].map(n => `<option value="${n}" ${s.vampire.hungerStage === n ? 'selected' : ''}>${n}${n === 0 ? ' (сыт)' : ''}${n === 4 ? ' (стража нападает!)' : ''}</option>`).join('')}
                </select>
                <p style="font-size:12px; opacity:.85; margin:4px 0;">Голод: обычный вампир −2 ко всем хар-кам и холод +10% / огонь −10% за каждый день; вампир-лорд только −1 ко всем хар-кам за день. ${s.vampire.hungerStage >= 4 ? '<strong style="color:#e74c3c;">🚨 4-й день: стража нападает, жители бегут или нападают.</strong>' : ''}</p>
                <button class="btn-success" style="width:100%; margin-top:4px;" onclick="feedVampire()">🩸 Покормить (стадия → 0)</button>
                <p style="font-size:12px; opacity:.75; margin-top:6px;">Пока стоит галочка «Вампиризм»: +5 Хар, +4 Лов, +4 Сил, холод +50%, яды/болезни — иммунитет, огонь −50%, ×2 урон днём; бесплатные заклинания «Вампирское высасывание» и «Подъём сильного трупа». Рангов у обычных вампиров нет.</p>
                <div class="checkbox-group" style="margin-top:8px;"><input type="checkbox" id="sn-vamp-lord" ${s.vampire.isLord ? 'checked' : ''} onchange="toggleVampireLord(this.checked)"><label for="sn-vamp-lord"><strong>Вампир-лорд</strong> (открывает игроку ветку перков вампира-лорда и форму лорда)</label></div>
                ${s.vampire.isLord ? `<div style="font-size:12px; margin-top:4px;">Форма лорда: <strong>${s.vampire.lordForm ? 'включена' : 'выключена'}</strong> · Взято перков: ${Object.keys(s.vampire.lordPerks || {}).filter(k => s.vampire.lordPerks[k]).length}/11${Object.keys(s.vampire.lordPerks || {}).filter(k => s.vampire.lordPerks[k]).length ? '<br>' + Object.keys(s.vampire.lordPerks).filter(k => s.vampire.lordPerks[k]).map(escapeHtml).join(', ') : ''}</div>` : ''}
            </div>
            ${gmLichPanelHtml(s)}
            ${gmCultPanelHtml(s)}
            ${gmPaladinPanelHtml()}`;
    }
    // ---------- Паладин (только просмотр + «Нарушил клятву» / «Простить») ----------
    function gmPaladinPanelHtml() {
        const p = currentPlayerInvData && currentPlayerInvData.paladin;
        if (!p || !p.perks || !p.perks.p1) return '';
        const perks = (window.PALADIN_PERKS || []).filter(x => p.perks[x.id]).map(x => x.name);
        const vow = p.vow && window.PALADIN_VOWS && window.PALADIN_VOWS[p.vow] ? window.PALADIN_VOWS[p.vow] : null;
        const st = p.abandoned ? 'отказался от ветки' : p.fallen ? 'пал (' + escapeHtml(p.fallReason || '') + ')' : 'праведен';
        let h = `<div style="margin-top:12px; padding-top:8px; border-top:1px solid var(--border-color);"><strong>⚜ Путь паладина</strong>`;
        h += `<div style="font-size:12px; margin-top:4px;">Состояние: <strong>${st}</strong> · Клятва: <strong>${vow ? escapeHtml(vow.icon + ' ' + vow.name) : 'не принесена'}</strong>${p.penanceUsed ? ' · покаяние уже было' : ''}</div>`;
        h += `<div style="font-size:12px;">Перки: ${escapeHtml(perks.join(', ') || '—')}${p.vow === 'justice' ? ` · краж с клятвы: ${p.thefts || 0}/10 · штрафов: ${p.finesTotal || 0}/1000` : ''}</div>`;
        if (vow) h += `<div style="font-size:12px; opacity:.8;">Запреты: ${escapeHtml(vow.bans || '')}</div>`;
        if (!p.abandoned) h += `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">` +
            (!p.fallen ? `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmPaladinAdmin('fall')">⛔ Нарушил клятву</button>` : `<button style="width:auto; padding:2px 8px;" onclick="gmPaladinAdmin('forgive')">Простить (вернуть праведность)</button>`) + `</div>`;
        return h + `</div>`;
    }
    window.gmPaladinAdmin = function (op) {
        let reason = '';
        if (op === 'fall') { reason = prompt('Чем паладин нарушил клятву? (увидит игрок)', 'нарушил клятву'); if (reason === null) return; }
        else if (!confirm('Вернуть паладину праведность без покаяния? Его единственное покаяние останется в запасе.')) return;
        gmSendCmd({ type: 'plAdmin', op, reason: String(reason || '').slice(0, 200) }, op === 'fall' ? '{p} лишается праведности (решение мастера).' : '{p}: мастер вернул праведность.').then(ok => { if (ok) setTimeout(renderSupernaturalPanel, 600); });
    };
