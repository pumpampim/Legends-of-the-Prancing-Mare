// Рыбы Anniversary Edition (Creation Club «Fishing») — все виды с учётом ИХ ПОЛОЖЕНИЯ.
// Русские названия — официальные (из русской локализации AE). Вес/цена — по вики (UESP / Fandom Skyrim Wiki);
// у видов с пометкой estimated на вики не нашлись точные цифры сырой рыбы — стоят оценочные (по приготовленной).
//
// Положение (habitats) — тройки [вода, погода, редкость]:
//   вода:    freezing — ледяные воды · lake — тёплые озёра · stream — тёплые реки и ручьи · underground — подземные водоёмы
//   погода:  any — любая · clear — ясно/пасмурно/туман · rain — дождь/гроза
//   редкость: common / uncommon / rare  (при рыбалке вес выбора 6 / 3 / 1)
// Рыбалка (index.html → goFishing) выбирает воду по региону/владению сессии, погоду — по currentWeather.
// Файл ДОПОЛНЯЕТ базы: добавляет недостающие предметы в window.allItems и продукты кухни в window.cookingIngredients (поэтому подключается после items/alchemy/cooking-data.js).
(function () {
    const F = [
        // ---- уже были в базе как алхимические ингредиенты (предмет не создаём, добавляем только положение) ----
        { name: 'Абесинский окунь', existing: true, size: 'small', h: [['freezing', 'any', 'common'], ['lake', 'clear', 'common'], ['lake', 'rain', 'uncommon']] },
        { name: 'Бойцовая рыбка', existing: true, size: 'small', h: [['stream', 'clear', 'common'], ['stream', 'rain', 'common']] },
        { name: 'Серебристый окунь', existing: true, size: 'small', h: [['lake', 'clear', 'common']] },
        { name: 'Сиродильский лопатохвост', existing: true, size: 'small', h: [['lake', 'clear', 'uncommon'], ['lake', 'rain', 'common']] },
        { name: 'Хисткарп', existing: true, size: 'small', h: [['stream', 'clear', 'uncommon'], ['stream', 'rain', 'uncommon']] },

        // ---- новые: ингредиенты (мелкая рыба, вес 0.25) ----
        { name: 'Золотая рыбка', en: 'Goldfish', kind: 'ingredient', weight: 0.25, price: 10, size: 'small', h: [['lake', 'clear', 'uncommon']],
          spots: 'пруды с чистой водой; пруд к юго-западу от Виндхельма',
          alch: ['Увеличение физ.урона', 'Повышение навыка: Тяжелая броня', 'Водное дыхание', 'Сопротивление холоду'] },
        { name: 'Рыба-ангел', en: 'Angelfish', kind: 'ingredient', weight: 0.25, price: 30, size: 'small', h: [['lake', 'clear', 'rare'], ['lake', 'rain', 'rare']],
          spots: 'тёплые озёра в любую погоду; Поляна Предков', rod: 'аликрская удочка',
          alch: ['Регенерация здоровья', 'Сопротивление огню', 'Повышение искусства лучника', 'Водное дыхание'] },
        { name: 'Стеклянный окунь', en: 'Glassfish', kind: 'ingredient', weight: 0.25, price: 1, size: 'small', h: [['lake', 'clear', 'common'], ['lake', 'rain', 'uncommon']],
          spots: 'тёплые озёра (например, озеро Илиналта)',
          alch: ['Восстановление магии', 'Невидимость', 'Повышение навыка: Иллюзия', 'Повышение искусства торговли'] },
        { name: 'Лирохвостый окунь', en: 'Lyretail Anthias', kind: 'ingredient', weight: 0.25, price: 30, size: 'small', h: [['stream', 'clear', 'rare'], ['stream', 'rain', 'rare']],
          spots: 'ручьи и реки у Ривервуда', rod: 'аликрская удочка',
          alch: ['Восстановление магии', 'Повышение навыка: Изменение', 'Повышение навыка: Колдовство', 'Повышение переносимого веса'] },
        { name: 'Карапус', en: 'Pearlfish', kind: 'ingredient', weight: 0.25, price: 15, size: 'small', h: [['lake', 'rain', 'uncommon'], ['stream', 'rain', 'uncommon']],
          spots: 'реки и озёра в дождь; ручей у Ривервуда',
          alch: ['Увеличение физ.урона', 'Сопротивление холоду', 'Повышение навыка: Кузнечное дело', 'Повышение навыка: Одноручное оружие'] },
        { name: 'Карликовый солнечник', en: 'Pygmy Sunfish', kind: 'ingredient', weight: 0.25, price: 2, size: 'small', h: [['lake', 'rain', 'uncommon']],
          spots: 'озёра в дождь; Поляна Предков' },
        { name: 'Рыба-лопата', en: 'Spadefish', kind: 'ingredient', weight: 0.25, price: 15, estimated: true, size: 'small', h: [['stream', 'clear', 'uncommon'], ['stream', 'rain', 'uncommon']],
          spots: 'большинство рек и ручьёв, под водопадами', rod: 'аликрская удочка' },
        { name: 'Малек удильщика', en: 'Angler Larvae', kind: 'ingredient', weight: 0.25, price: 0, size: 'small', h: [['freezing', 'any', 'common']],
          spots: 'ледяные воды, особенно у Коллегии Винтерхолда' },
        { name: 'Молодой грязевой краб', en: 'Juvenile Mudcrab', kind: 'ingredient', weight: 0.25, price: 10, size: 'small', h: [['freezing', 'any', 'uncommon'], ['lake', 'clear', 'uncommon'], ['stream', 'clear', 'uncommon']],
          spots: 'встречается в разных водах; один живёт в аквариуме рыбацкого промысла в Рифтене' },

        // ---- новые: рыба-еда (крупная) ----
        { name: 'Карп', en: 'Carp', kind: 'food', weight: 0.5, price: 2, size: 'large', h: [['lake', 'clear', 'uncommon'], ['stream', 'clear', 'uncommon'], ['stream', 'rain', 'uncommon']],
          spots: 'склад Восточной имперской компании в Солитьюде' },
        { name: 'Сом', en: 'Catfish', kind: 'food', weight: 1, price: 2, size: 'large', h: [['lake', 'rain', 'common']],
          spots: 'озёра в дождь (например, озеро Илиналта); у Зала Гейрмунда' },
        { name: 'Страж-рыба', en: 'Pogfish', kind: 'food', weight: 1, price: 2, size: 'large', h: [['stream', 'clear', 'common'], ['stream', 'rain', 'common']],
          spots: 'реки и ручьи по всему Скайриму', rod: 'аргонианская удочка' },
        { name: 'Мелководный окунь', en: 'Brook Bass', kind: 'food', weight: 0.5, price: 1, size: 'large', h: [['lake', 'clear', 'uncommon'], ['stream', 'clear', 'common'], ['stream', 'rain', 'common']],
          spots: 'ручьи в любую погоду' },
        { name: 'Лосось', en: 'Salmon', kind: 'food', weight: 1, price: 8, estimated: true, size: 'large', h: [['lake', 'clear', 'common'], ['lake', 'rain', 'uncommon'], ['stream', 'clear', 'common'], ['stream', 'rain', 'common']],
          spots: 'реки, озёра и пруды' },
        { name: 'Люторыба', en: 'Direfish', kind: 'food', weight: 1, price: 2, size: 'large', h: [['underground', 'any', 'common']],
          spots: 'подземные пещеры', rod: 'аргонианская удочка' },
        { name: 'Стеклянный сомик', en: 'Glass Catfish', kind: 'food', weight: 0.5, price: 2, size: 'large', h: [['underground', 'any', 'common']],
          spots: 'подземные водоёмы, в том числе Потерянный Нож' },
        { name: 'Трёхногая рыба-паук', en: 'Tripod Spiderfish', kind: 'food', weight: 0.5, price: 10, size: 'large', h: [['underground', 'any', 'uncommon']],
          spots: 'глубокие подземные водоёмы' },
        { name: 'Рыба-вампир', en: 'Vampire Fish', kind: 'food', weight: 1, price: 10, size: 'large', h: [['underground', 'any', 'uncommon']],
          spots: 'подземные воды, в том числе Потерянный Нож' },
        { name: 'Скорпена', en: 'Scorpion Fish', kind: 'food', weight: 1, price: 30, size: 'large', h: [['underground', 'any', 'rare']],
          spots: 'редкие подземные ловилища', rod: 'аргонианская удочка' },
        { name: 'Полярный голец', en: 'Arctic Char', kind: 'food', weight: 1, price: 10, size: 'large', h: [['freezing', 'any', 'uncommon']],
          spots: 'ледяные воды севера' },
        { name: 'Полярный хариус', en: 'Arctic Grayling', kind: 'food', weight: 0.5, price: 5, estimated: true, size: 'large', h: [['freezing', 'any', 'common']],
          spots: 'ледяные воды севера' },
        { name: 'Треска', en: 'Cod', kind: 'food', weight: 1, price: 15, size: 'large', h: [['freezing', 'any', 'uncommon']],
          spots: 'ледяные воды у доков Виндхельма, у мельницы Анги' },
        { name: 'Удильщик', en: 'Angler', kind: 'food', weight: 2, price: 30, size: 'large', h: [['freezing', 'any', 'rare']],
          spots: 'глубокие ледяные воды севера', rod: 'аргонианская удочка' }
    ];

    const WATER = { freezing: 'ледяные воды', lake: 'тёплые озёра', stream: 'реки и ручьи', underground: 'подземные водоёмы' };
    const WEATHER = { any: 'любая погода', clear: 'ясно', rain: 'дождь' };
    const RARITY = { common: 'обычная', uncommon: 'необычная', rare: 'редкая' };

    function describe(f) {
        const places = f.h.map(([w, wt, r]) => `${WATER[w]} (${WEATHER[wt]}, ${RARITY[r]})`).join('; ');
        return `Рыба Anniversary Edition${f.size === 'small' ? ' (мелкая)' : ' (крупная)'}. Ловится: ${places}.` +
            (f.spots ? ` Места: ${f.spots}.` : '') + (f.rod ? ` Лучше всего ${f.rod}.` : '') +
            (f.estimated ? ' (Вес/цена оценочные — точные значения сырой рыбы на вики не найдены.)' : '');
    }

    window.fishData = F.map(f => Object.assign({}, f, { habitats: f.h }));
    window.fishNames = new Set(F.map(f => f.name));
    window.FISH_WATER_LABELS = WATER;

    const items = window.allItems = window.allItems || [];
    const have = new Set(items.map(i => i.name));
    F.forEach(f => {
        if (f.existing) return;
        if (!have.has(f.name)) {
            items.push({ name: f.name, category: 'Сырые продукты', type: 'misc', weight: f.weight, price: f.price, effect: describe(f) });
            have.add(f.name);
        }
    });

    // Кухня: рыба — продукт для готовки (раньше кухня не знала ни одной рыбы, даже пяти старых) + куриное яйцо из рецептов.
    const ck = window.cookingIngredients = window.cookingIngredients || {};
    const stats = n => { const it = items.find(i => i.name === n); return { price: it ? it.price : 1, weight: it ? it.weight : 0.25, category: 'Еда (сырое)' }; };
    F.forEach(f => { if (!ck[f.name]) ck[f.name] = stats(f.name); });
    if (!ck['Куриное яйцо']) ck['Куриное яйцо'] = stats('Куриное яйцо');
})();
