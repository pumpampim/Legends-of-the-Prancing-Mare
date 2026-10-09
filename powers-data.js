// Особые способности — ТОЛЬКО по вашим документам (раньше я подставлял свои и ванильные, что было неверно):
//   • расовые и знаки рождения — «Sistema 2.2.docx» (разделы «Особенности расы» и «Камни-хранители»),
//   • оборотень — «Фракции.xlsx», лист «Соратники» (тотемы Хирсина),
//   • вампир-лорд — «Фракции.xlsx», лист «Стража рассвета и Вампиры» (список в gm.js → VAMPIRE_ABILITIES).
// Числа и формулировки можно править здесь без изменения кода.
//
// Поля:
//   id, source ('race' | 'sign' | 'werewolf' | 'vampire'), race / sign — для какой расы / знака
//   name, desc     — название и текст правила
//   perDay         — 1: один раз до сброса (кнопка «Следующий день» = длительный отдых / рассвет), 0 — без лимита
//   group          — общий лимит для нескольких способностей (Змей: либо одно, либо другое)
//   turns          — длительность в ходах (0 — мгновенно)
//   requiresBelowHalf      — только когда текущие ХП ниже половины максимума (Кора хиста)
//   requiresTransformed    — только в облике зверя (оборотень)
//   requiresTotem          — нужен выбранный мастером тотем Хирсина
//   requiresAbility        — способность вампира должна быть открыта мастером
//   effect:
//     healLevelMult        — лечение = N × уровень героя
//     healDiceByLevel      — [[мин. уровень, кубов d10], …] + модификатор healMod (Дар Мары)
//     healLevelMod         — лечение = N × уровень × модификатор healMod; излишек становится временными ХП (Кровь Севера)
//     tempHpLevelMult      — временные ХП = N × уровень (Берсерк)
//     speed                — +N фт. скорости на время эффекта
//     flag                 — 'berserk' | 'adrenaline' | 'mist' — механический флаг (см. index.html)
//     taunt                — враги атакуют только вас N ходов (Боевой клич) + хриплый голос до конца дня
//     poison               — { diceByLevel } ядовитое касание (Змей)
//     saveDc               — подсказка Сл. спасброска: 8 + лучший из модификаторов
//     gmDecides            — результат определяет мастер (запись в общий журнал)
(function () {
    const BATTLE_CRY = {
        perDay: 1, turns: 0,
        desc: 'Действием: все враги, которые вас видят, начинают атаковать только вас в течение 15 ходов. После этого ваш голос до конца дня хриплый (−1 к убеждению, +1 к угрозе). Снова — после длительного отдыха.',
        effect: { taunt: 15 }
    };
    const list = [
        // ---------------- Расовые (Sistema 2.2, «Особенности …») ----------------
        { id: 'histskin', source: 'race', race: 'argonian', name: 'Кора хиста', perDay: 1, turns: 0, requiresBelowHalf: true,
          desc: 'Когда текущие хитпоинты ниже половины максимума, действием мгновенно восстановить ХП, равные 10 × ваш уровень. Один раз за длительный отдых.',
          effect: { healLevelMult: 10 } },
        { id: 'berserk', source: 'race', race: 'orc', name: 'Берсерк', perDay: 1, turns: 10,
          desc: 'Действием: в течение 10 ходов вы получаете временные ХП, равные уровню × 10, и преимущество на одну атаку на каждый второй ваш ход. Один раз за длительный отдых.',
          effect: { tempHpLevelMult: 10, flag: 'berserk' } },
        { id: 'aggression', source: 'race', race: 'orc', name: 'Агрессия', perDay: 0, turns: 0,
          desc: 'Бонусным действием продвинуться с обычной скоростью к выбранному противнику, которого вы видите или слышите; движение должно закончиться ближе к врагу, чем началось.',
          effect: { gmDecides: true } },
        { id: 'adrenaline', source: 'race', race: 'redguard', name: 'Выброс адреналина', perDay: 1, turns: 3,
          desc: '3 ваших хода: скорость +10 фт., к броскам атаки и урона добавляется d10. В начале боя можно использовать реакцию. Один раз за длительный отдых.',
          effect: { speed: 10, flag: 'adrenaline' } },
        Object.assign({ id: 'battlecry_argonian', source: 'race', race: 'argonian', name: 'Боевой клич' }, BATTLE_CRY),
        Object.assign({ id: 'battlecry_imperial', source: 'race', race: 'imperial', name: 'Боевой клич' }, BATTLE_CRY),
        Object.assign({ id: 'battlecry_khajiit', source: 'race', race: 'khajiit', name: 'Боевой клич' }, BATTLE_CRY),
        Object.assign({ id: 'battlecry_nord', source: 'race', race: 'nord', name: 'Боевой клич' }, BATTLE_CRY),
        Object.assign({ id: 'battlecry_orc', source: 'race', race: 'orc', name: 'Боевой клич' }, BATTLE_CRY),
        Object.assign({ id: 'battlecry_redguard', source: 'race', race: 'redguard', name: 'Боевой клич' }, BATTLE_CRY),

        // ---------------- Знаки рождения (Sistema 2.2, «Камни-хранители») ----------------
        { id: 'ritual_mara', source: 'sign', sign: 'ritual', name: 'Дар Мары', perDay: 1, turns: 0,
          desc: 'Действием восстановить ХП: 2d10 + модификатор Телосложения (3d10 с 5-го уровня, 4d10 с 11-го, 5d10 с 17-го). Один раз до следующего рассвета.',
          effect: { healDiceByLevel: [[1, 2], [5, 3], [11, 4], [17, 5]], healMod: 'con' } },
        { id: 'ritual_word', source: 'sign', sign: 'ritual', name: 'Благословенное Слово', perDay: 1, turns: 2,
          desc: 'Действием: нежить в 30 футах делает спасбросок Мудрости (Сл. 8 + ваш модификатор Мудрости или Харизмы — на ваш выбор); при провале обращается на 2 её хода или пока не получит урон — бежит от вас и не может пользоваться реакциями. Один раз до рассвета.',
          effect: { saveDc: ['wis', 'cha'], gmDecides: true } },
        { id: 'lover_kiss', source: 'sign', sign: 'lover', name: 'Поцелуй любовника', perDay: 1, turns: 2,
          desc: 'Действием коснуться гуманоида: спасбросок Мудрости (Сл. 8 + ваш модификатор Телосложения или Мудрости) или паралич на 2 его хода. Паралич снимается уроном; в конце каждого своего хода цель может перебросить спасбросок. Один раз до рассвета.',
          effect: { saveDc: ['con', 'wis'], gmDecides: true } },
        { id: 'lord_blood', source: 'sign', sign: 'lord', name: 'Кровь Севера', perDay: 1, turns: 0,
          desc: 'Действием восстановить ХП: 2 × ваш уровень × модификатор Телосложения. Излишек сверх максимума становится временными ХП на 6 ходов. Один раз до рассвета. (Родство с троллями: весь получаемый урон огнём увеличивается на 2d6 — это учитывает мастер.)',
          effect: { healLevelMod: 2, healMod: 'con' } },
        { id: 'shadow_moon', source: 'sign', sign: 'shadow', name: 'Лунная тень', perDay: 1, turns: 12,
          desc: 'Действием наложить на себя заклинание «Невидимость» без затрат магии (12 ходов, до первого взаимодействия с предметами или атаки). Один раз до рассвета.',
          effect: { invisible: true } },
        { id: 'tower_key', source: 'sign', sign: 'tower', name: 'Башенный ключ', perDay: 1, turns: 0,
          desc: 'Действием разыграть заклинание «Открывание» без затрат магии. Один раз до рассвета.',
          effect: { gmDecides: true } },
        { id: 'zmey_cure', source: 'sign', sign: 'zmey', group: 'zmey', name: 'Змей: очищение', perDay: 1, turns: 0,
          desc: 'Раз в день (ЛИБО это, ЛИБО ядовитое касание): действием излечить себя от одной немагической болезни и снять с себя один магический эффект.',
          effect: { gmDecides: true } },
        { id: 'zmey_poison', source: 'sign', sign: 'zmey', group: 'zmey', name: 'Змей: ядовитое касание', perDay: 1, turns: 15,
          desc: 'Раз в день (ЛИБО это, ЛИБО очищение): коснуться существа — мгновенно 1d6 урона ядом и ещё 1d10 в начале каждого вашего хода 15 ходов; урон игнорирует сопротивление. С 5-го уровня кубов на 1 больше (2d6), с 11-го — 3d6, с 17-го — 4d6.',
          effect: { poison: { diceByLevel: [[1, 1], [5, 2], [11, 3], [17, 4]] }, gmDecides: true } },

        // ---------------- Оборотень («Фракции.xlsx» → «Соратники»): одно активное умение по выбранному тотему ----------------
        { id: 'wolf_hunt', source: 'werewolf', name: 'Запах крови (Тотем Охоты)', perDay: 0, turns: 3, requiresTransformed: true, requiresTotem: 'Тотем Охоты',
          desc: 'Показывает вокруг всех живых существ. Действует 3 хода. (С тотемом хищника — на весь данж или 200 футов, видно, спокойны ли враги, ищут ли что-то или сражаются.)',
          effect: { gmDecides: true } },
        { id: 'wolf_pack', source: 'werewolf', name: 'Вой стаи (Тотем Братства)', perDay: 0, turns: 0, requiresTransformed: true, requiresTotem: 'Тотем Братства',
          desc: 'Призывает на помощь двух волков. (С тотемом ледяных братьев — снежных волков, с тотемом луны — вервольфов.)',
          effect: { gmDecides: true } },
        { id: 'wolf_fear', source: 'werewolf', name: 'Жуткий вой (Тотем Страха)', perDay: 0, turns: 0, requiresTransformed: true, requiresTotem: 'Тотем Страха',
          desc: 'Все существа и люди вокруг до 12 уровня разбегаются в страхе. (С тотемом ужаса — до 18 уровня.)',
          effect: { gmDecides: true } },

        // ---------------- Вампир-лорд («Фракции.xlsx» → «Стража рассвета и Вампиры»; открывает мастер) ----------------
        { id: 'vamp_grip', source: 'vampire', name: 'Хватка вампира', perDay: 0, turns: 0, requiresAbility: 'Хватка вампира',
          desc: 'Магия крови — притянуть и придушить живое существо с менее чем 10% здоровья.', effect: { gmDecides: true } },
        { id: 'vamp_gargoyle', source: 'vampire', name: 'Вызов гаргульи', perDay: 0, turns: 0, requiresAbility: 'Вызов гаргульи',
          desc: 'Магия крови — призвать гаргулью-союзника.', effect: { gmDecides: true } },
        { id: 'vamp_corpse_curse', source: 'vampire', name: 'Трупное проклятье', perDay: 0, turns: 4, requiresAbility: 'Трупное проклятье',
          desc: 'Магия крови — парализовать противника на 4 его хода (Сл. спасброска 17 + мудрость).', effect: { gmDecides: true } },
        { id: 'vamp_detect', source: 'vampire', name: 'Обнаружение существ', perDay: 0, turns: 0, requiresAbility: 'Обнаружение существ',
          desc: 'Сила ночи — обнаружение всех существ, включая двемерских автоматонов.', effect: { gmDecides: true } },
        { id: 'vamp_mist', source: 'vampire', name: 'Туманная форма', perDay: 0, turns: 3, requiresAbility: 'Туманная форма',
          desc: 'Сила ночи — неуязвимое туманное облако на 3 ваших хода (нельзя ни наносить, ни получать урон).', effect: { flag: 'mist' } },
        { id: 'vamp_reflexes', source: 'vampire', name: 'Сверхъестественные рефлексы', perDay: 0, turns: 4, requiresAbility: 'Сверхъестественные рефлексы',
          desc: 'Сила ночи — следующие 4 атаки получают +4 к кубам (учтено как эффект на 4 хода).', effect: { gmDecides: true } }
    ];
    window.powersData = list;
})();
