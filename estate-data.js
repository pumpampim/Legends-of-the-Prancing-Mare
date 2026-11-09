// ============================================================================
// ESTATE-DATA.JS — каталоги поместья: стройматериалы, детали постройки, мебель, крылья, урожай, персонал.
// Цены и сроки согласованы с Никитой 2026-11-08 (см. reports/houses-draft-2026-11-08.md).
// ============================================================================
window.ESTATE_DATA = (function () {
    // Материалы: покупаются игроками у лесопилки/каменоломни/торговца и ложатся на склад поместья.
    const MATERIALS = {
        log: { name: 'Брёвна', icon: '🪵', price: 5 },
        plank: { name: 'Доски', icon: '🟫', price: 8 },
        nails: { name: 'Гвозди', icon: '📌', price: 2 },
        stone: { name: 'Камень', icon: '🪨', price: 6 },
        brick: { name: 'Кирпич', icon: '🧱', price: 10 },
        iron: { name: 'Железные слитки', icon: '⛓️', price: 25 },
        glass: { name: 'Стекло', icon: '🔷', price: 15 }
    };
    const SHOPS = [
        { id: 'sawmill', name: 'Лесопилка Фолкрита', mats: ['log', 'plank', 'nails'] },
        { id: 'quarry', name: 'Каменоломня', mats: ['stone', 'brick'] },
        { id: 'general', name: 'Торговец строительными товарами', mats: ['iron', 'glass', 'nails'] }
    ];
    // Детали постройки (слой found/build/roof). cost — материалы на клетку, work — рабочих дней на клетку.
    const PIECES = {
        found: { name: 'Фундамент', icon: '▫️', layer: 'found', cost: { stone: 2 }, work: 0.2 },
        floor: { name: 'Пол', icon: '🟫', layer: 'build', cost: { plank: 1 }, work: 0.1, needs: 'found' },
        wall: { name: 'Стена', icon: '🧱', layer: 'build', cost: { stone: 1, plank: 1, nails: 1 }, work: 0.3, needs: 'found' },
        door: { name: 'Дверь', icon: '🚪', layer: 'build', cost: { plank: 2, iron: 1 }, work: 0.5, needs: 'found' },
        window: { name: 'Окно', icon: '🪟', layer: 'build', cost: { glass: 1, plank: 1 }, work: 0.5, needs: 'found' },
        roof: { name: 'Крыша', icon: '🛖', layer: 'roof', cost: { plank: 1, nails: 1 }, work: 0.2, needs: 'found' }
    };
    // Крылья: игроки выбирают любые пять из девяти. Мебель крыла можно ставить, только пока крыло выбрано.
    const WINGS = {
        armory: { name: 'Оружейная', icon: '⚔️' }, library: { name: 'Библиотека', icon: '📚' }, kitchen: { name: 'Кухня', icon: '🍲' },
        alchemy: { name: 'Алхимическая лаборатория', icon: '⚗️' }, enchant: { name: 'Башня зачарования', icon: '🔮' },
        greenhouse: { name: 'Теплица', icon: '🌿' }, smithy: { name: 'Мастерская с кузней', icon: '🔨' },
        trophy: { name: 'Комната трофеев', icon: '🏆' }, bedroom: { name: 'Спальни', icon: '🛏️' }
    };
    const MAX_WINGS = 5;
    // Что даёт крыло. need — сколько предметов крыла должно стоять, чтобы оно считалось действующим.
    // use — предмет, у которого можно «пользоваться» крылом раз в день партии (эффект действует до следующего сна, учитывает мастер).
    const WING_INFO = {
        armory: { need: 2, store: 10, effect: '+10 мест в хранилище. У оружейной стойки раз в день: «Заточка», +1 к урону оружием до сна.', use: { furn: 'rack', label: 'Взять оружие со стойки', id: 'eff-armory', name: 'Заточка', desc: '⚔️ +1 к урону оружием до следующего сна (мастер учитывает).' } },
        library: { need: 2, effect: 'У книжного шкафа раз в день: «Начитанность», +1 успех к проверкам знаний и Интеллекта до сна.', use: { furn: 'bookcase', label: 'Почитать', id: 'eff-library', name: 'Начитанность', desc: '📚 +1 успех к проверкам знаний и Интеллекта до следующего сна (мастер учитывает).' } },
        kitchen: { need: 2, effect: 'У очага раз в день: «Сытный стол», +5 временных ОЗ до сна. С поваром готовит блюдо.', use: { furn: 'hearth', label: 'Поесть у очага', hp: 5, id: 'eff-kitchen', name: 'Сытный стол', desc: '🍲 +5 временных ОЗ до следующего сна (мастер учитывает).' } },
        alchemy: { need: 1, effect: 'У алхимического стола раз в день: «Домашняя лаборатория», первое сваренное зелье даёт +1 порцию.', use: { furn: 'alchtable', label: 'Работать в лаборатории', id: 'eff-alchemy', name: 'Домашняя лаборатория', desc: '⚗️ Первое сваренное сегодня зелье даёт +1 порцию (мастер учитывает).' } },
        enchant: { need: 2, effect: 'У стола зачарования раз в день: «Спокойная башня», одно зачарование не тратит камень душ.', use: { furn: 'enchtable', label: 'Зачаровывать в башне', id: 'eff-enchant', name: 'Спокойная башня', desc: '🔮 Одно зачарование не потратит камень душ (считается автоматически).' } },
        greenhouse: { need: 1, effect: 'Каждую неделю +2 лаванды в хранилище. Шесть грядок под стеклом растят круглый год.' },
        smithy: { need: 2, effect: 'У точила раз в день: «Острый клинок», +1 к урону до сна. Ремонт и ковка дома без платы кузнецу.', use: { furn: 'grindstone', label: 'Наточить оружие', id: 'eff-smithy', name: 'Острый клинок', desc: '🔨 Оружие наточено: +1 к урону до следующего сна (мастер учитывает).' } },
        trophy: { need: 1, effect: 'У трофейной стены раз в день: «Слава», +1 успех к проверкам Харизмы перед жителями до сна.', use: { furn: 'trophy', label: 'Полюбоваться трофеями', id: 'eff-trophy', name: 'Слава', desc: '🏆 +1 успех к проверкам Харизмы перед жителями до следующего сна (мастер учитывает).' } },
        bedroom: { need: 1, effect: 'В постели раз в день: «Выспался», +10% к росту навыков до следующего сна.', use: { furn: 'bed', label: 'Лечь спать', id: 'eff-wellrested', name: 'Выспался', desc: '😴 +10% к прогрессу навыков за удачные проверки до следующего сна (считается автоматически).' } }
    };
    // Мебель. gold — золото, mats — материалы со склада. indoor — только на пол; block — загораживает клетку.
    // wing — нужно выбранное крыло. weekly — недельная выработка в хранилище. limit — не больше штук на участок.
    const FURN = {
        bed: { name: 'Кровать', icon: '🛏️', gold: 60, mats: { plank: 3 }, indoor: true, block: false, wing: 'bedroom', limit: 4 },
        table: { name: 'Стол', icon: '🪑', gold: 25, mats: { plank: 2 }, indoor: true, block: true },
        chair: { name: 'Стул', icon: '💺', gold: 10, mats: { plank: 1 }, indoor: true, block: false },
        rug: { name: 'Ковёр', icon: '🟥', gold: 20, mats: {}, indoor: true, block: false },
        lamp: { name: 'Светильник', icon: '🕯️', gold: 12, mats: {}, indoor: true, block: false },
        chest: { name: 'Сундук', icon: '🧰', gold: 80, mats: { plank: 3, iron: 1 }, indoor: true, block: true },
        shelf: { name: 'Полки', icon: '🗄️', gold: 30, mats: { plank: 2 }, indoor: true, block: true },
        bookcase: { name: 'Книжный шкаф', icon: '📚', gold: 90, mats: { plank: 4 }, indoor: true, block: true, wing: 'library' },
        hearth: { name: 'Очаг', icon: '🔥', gold: 70, mats: { stone: 4 }, indoor: true, block: true, wing: 'kitchen' },
        larder: { name: 'Кладовая', icon: '🥫', gold: 50, mats: { plank: 3 }, indoor: true, block: true, wing: 'kitchen' },
        alchtable: { name: 'Алхимический стол', icon: '⚗️', gold: 150, mats: { plank: 3, glass: 2 }, indoor: true, block: true, wing: 'alchemy' },
        enchtable: { name: 'Стол зачарования', icon: '🔮', gold: 300, mats: { plank: 3, iron: 2 }, indoor: true, block: true, wing: 'enchant' },
        soulcase: { name: 'Витрина камней душ', icon: '💎', gold: 120, mats: { plank: 2, glass: 2 }, indoor: true, block: true, wing: 'enchant' },
        forge: { name: 'Кузнечный горн', icon: '🔥', gold: 250, mats: { stone: 6, iron: 2 }, indoor: true, block: true, wing: 'smithy' },
        grindstone: { name: 'Точило', icon: '⚙️', gold: 90, mats: { stone: 2, iron: 1 }, indoor: true, block: true, wing: 'smithy' },
        rack: { name: 'Оружейная стойка', icon: '🗡️', gold: 70, mats: { plank: 3, iron: 1 }, indoor: true, block: true, wing: 'armory' },
        dummy: { name: 'Манекен', icon: '🪆', gold: 40, mats: { plank: 2 }, indoor: true, block: true, wing: 'armory' },
        trophy: { name: 'Трофейная стена', icon: '🏆', gold: 60, mats: { plank: 2 }, indoor: true, block: true, wing: 'trophy' },
        planter: { name: 'Грядка', icon: '🟤', gold: 15, mats: { plank: 2 }, indoor: false, block: false, plot: true },
        glassbed: { name: 'Грядка в теплице', icon: '🪴', gold: 40, mats: { plank: 2, glass: 1 }, indoor: true, block: false, plot: true, wing: 'greenhouse', limit: 6 },
        hive: { name: 'Улей', icon: '🐝', gold: 60, mats: { plank: 3 }, indoor: false, block: true, weekly: { 'Мёд': 3 } },
        coop: { name: 'Курятник', icon: '🐔', gold: 80, mats: { plank: 4 }, indoor: false, block: true, weekly: { 'Куриное яйцо': 3 } },
        cowpen: { name: 'Коровник', icon: '🐄', gold: 120, mats: { plank: 6 }, indoor: false, block: true, weekly: { 'Кувшин молока': 3 } },
        stairup: { name: 'Лестница вверх', icon: '🪜', gold: 40, mats: { plank: 6 }, indoor: true, block: false, stair: 1 },
        stairdown: { name: 'Лестница вниз', icon: '⬇️', gold: 40, mats: { plank: 6 }, indoor: true, block: false, stair: -1 },
        mill: { name: 'Мельница', icon: '🌾', gold: 200, mats: { plank: 6, stone: 6, iron: 2 }, indoor: false, block: true }
    };
    // Что можно сажать. yieldN — штук с грядки за урожай; growDays — дней роста. По решению Никиты: растят и сельхоз, и алхимические растения.
    const CROPS = {
        'Пшеница': { icon: '🌾' }, 'Картофель': { icon: '🥔' }, 'Капуста': { icon: '🥬' }, 'Тыква': { icon: '🎃' },
        'Морковь': { icon: '🥕' }, 'Чеснок': { icon: '🧄' }, 'Лаванда': { icon: '💜' }
    };
    const GROW_DAYS = 7, YIELD_PLANTER = 6, YIELD_GLASSBED = 4;
    const GREENHOUSE_WEEKLY = { 'Лаванда': 2 };
    // Персонал: цены в месяц (септимы). Жалование платят вперёд; не продлили месяц — работник уходит.
    const STAFF = {
        steward: { name: 'Управляющий', icon: '🧑‍💼', wage: 750, desc: 'Ведёт хозяйство, охраняет хранилище от краж. Продаёт готовые дом, этажи, крылья и обстановку комнат.' },
        guard: { name: 'Охранник', icon: '💂', wage: 600, desc: 'Охраняет дом, пока отряд в походе (кражи не проходят).' },
        cook: { name: 'Повар', icon: '🧑‍🍳', wage: 500, desc: 'Готовит блюдо из запасов дома раз в сутки (по решению мастера).' },
        builder: { name: 'Строитель', icon: '👷', wage: 500, desc: 'Прибавляет 4 рабочих дня в сутки к стройке.' },
        bard: { name: 'Бард', icon: '🎻', wage: 400, desc: 'Раз в сутки песня: вечер в доме веселее (бонус «Выспался» по решению мастера).' },
        farmhand: { name: 'Работник на огороде и пасеке', icon: '🧑‍🌾', wage: 300, desc: 'Собирает созревший урожай на склад сам.' },
        trader: { name: 'Торговец-гость', icon: '🧳', wage: 300, desc: 'Раз в неделю приезжает выбранный вами торговец.' }
    };
    const TRADER_KINDS = { smith: 'Кузнец', alchemist: 'Алхимик', general: 'Общий торговец', mage: 'Маг', fletcher: 'Лучник-оружейник' };
    const BASE_WORK = 4, BUILDER_WORK = 4;
    const BASE_STORE_STACKS = 10, CHEST_STACKS = 20;
    const MEAD = { in: 'Мёд', inQty: 2, out: 'Медовуха', outQty: 1 };
    const PRESETS = {
        lakeview: { name: 'Озёрный дом', w: 50, h: 50, costMult: 1.4, kind: 'manor' },
        solitude: { name: 'Гордость шпиля', w: 30, h: 30, costMult: 1, kind: 'house' }
    };
    return { WING_INFO, MATERIALS, SHOPS, PIECES, WINGS, MAX_WINGS, FURN, CROPS, GROW_DAYS, YIELD_PLANTER, YIELD_GLASSBED, GREENHOUSE_WEEKLY, STAFF, TRADER_KINDS, BASE_WORK, BUILDER_WORK, BASE_STORE_STACKS, CHEST_STACKS, MEAD, PRESETS };
})();
