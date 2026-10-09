// ============================================================================
// ENEMIES-DATA.JS — база противников из таблицы «Враги.xlsx» (для мастера).
// Урон/резисты/заклинания там, где в таблице не было точных цифр — досчитаны
// разумно (см. пояснение в чате), проверь и поправь под свою игру.
// ============================================================================

const enemiesData = [
    {
        name: "Волк", category: "Животные", soul: "petty", hp: 50, carrierOfDisease: "Каменная подагра", diseaseChance: 15,
        weaponDmg: 30, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Волчья шкура, маленький шанс на до 15 монет"
    },
    {
        name: "Снежный волк", category: "Животные", soul: "lesser", hp: 160,
        weaponDmg: 30, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура снежного волка, маленький шанс на до 15 монет"
    },
    {
        name: "Злокрыс", category: "Животные", soul: "petty", hp: 20, carrierOfDisease: "Атаксия", diseaseChance: 30,
        weaponDmg: 10, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Хвост злокрыса"
    },
    {
        name: "Рыба-убийца", category: "Животные", soul: "petty", hp: 40,
        weaponDmg: 15, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Чешуя рыбы убийцы и ее икра"
    },
    {
        name: "Медведь", category: "Животные", soul: "lesser", hp: 290, carrierOfDisease: "Кровавая лихорадка", diseaseChance: 15,
        weaponDmg: 40, weaponNote: "40 ,удар 2 лапами",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура медведя,Медвежьи когти"
    },
    {
        name: "Пещерный медведь", category: "Животные", soul: "common", hp: 450,
        weaponDmg: 40, weaponNote: "40 ,удар 2 лапами",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура пещ.медведя,Медвежьи когти"
    },
    {
        name: "Снежный медведь", category: "Животные", soul: "common", hp: 550,
        weaponDmg: 50, weaponNote: "50 ,удар 2 лапами",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура снеж.медведя,Медвежьи когти"
    },
    {
        name: "Грязевой краб", category: "Животные", soul: "petty", hp: 50,
        weaponDmg: 20, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Клещня гр.краба, Крабовые ноги"
    },
    {
        name: "Саблезуб", category: "Животные", soul: "lesser", hp: 170, carrierOfDisease: "Насморк Пелиниала", diseaseChance: 10,
        weaponDmg: 35, weaponNote: "35 удар 2 раза подряд",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура саблезуба, глаз саблезуба, клык саблезуба"
    },
    {
        name: "Снежный саблезуб", category: "Животные", soul: "lesser", hp: 275,
        weaponDmg: 45, weaponNote: "45 удар 2 раза подряд",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура снежного саблезуба, глаз саблезуба, клык саблезуба"
    },
    {
        name: "Мамонт", category: "Животные", soul: "grand", hp: 950,
        weaponDmg: 65, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Бивень мамонта, хобот мамонта"
    },
    {
        name: "Морозный паук", category: "Монстры", soul: "petty", hp: 100,
        weaponDmg: 15, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "яд обморожения(20 урона ядом)"
    },
    {
        name: "Гигантский морозный паук", category: "Монстры", soul: "lesser", hp: 430,
        weaponDmg: 80, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "2 яд обморожения(20 урона ядом)"
    },
    {
        name: "Великан", category: "Монстры", soul: "greater", hp: 590,
        weaponDmg: 60, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Палец великана, Шкуры"
    },
    {
        name: "Ворожея", category: "Монстры", soul: "common", hp: 500,
        weaponDmg: 35, weaponNote: "",
        resist: {  },
        spells: [{ name: "Огненная стрела", dmg: 25, cost: 20 }, { name: "Огненный шар", dmg: 40, cost: 60 }, { name: "Быстрое лечение", dmg: 50, cost: 30 }],
        shouts: [],
        loot: "Перья ворожеи, коготь ворожеи, случайный ингредиент."
    },
    {
        name: "Тролль", category: "Монстры", soul: "lesser", hp: 300,
        weaponDmg: 40, weaponNote: "",
        resist: { fire: -40 },
        spells: [],
        shouts: [],
        loot: "Шкура толля,Жир тролля"
    },
    {
        name: "Ледяной тролль", category: "Монстры", soul: "common", hp: 500,
        weaponDmg: 65, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Шкура толля,Жир тролля"
    },
    {
        name: "Ледяное приведение", category: "Монстры", soul: "lesser", hp: 230,
        weaponDmg: 50, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Зубы ледяного привидения эссенция ледяного привидения.Нейтрализует 20% урона от холода, действует 10 ходов"
    },
    {
        name: "Сприган", category: "Монстры", soul: "lesser", hp: 200,
        weaponDmg: 35, weaponNote: "",
        resist: {  },
        spells: [{ name: "Невидимость", dmg: 1, cost: 30 }, { name: "Быстрое лечение", dmg: 200, cost: 1 }, { name: "Рой спригана", dmg: 30, cost: 30 }],
        shouts: [],
        loot: "Стержневой корень, Живица сприганов"
    },
    {
        name: "Сприган-матрона", category: "Монстры", soul: "common", hp: 500,
        weaponDmg: 45, weaponNote: "",
        resist: {  },
        spells: [{ name: "Невидимость", dmg: 1, cost: 30 }, { name: "Быстрое лечение", dmg: 200, cost: 1 }, { name: "Рой спригана", dmg: 30, cost: 30 }],
        shouts: [],
        loot: "Стержневой корень, Живица сприганов"
    },
    {
        name: "Корус", category: "Монстры", soul: "lesser", hp: 300, carrierOfDisease: "Заумь", diseaseChance: 20,
        weaponDmg: 70, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Хитин коруса, яйцо коруса"
    },
    {
        name: "Нежить", category: "Монстры", soul: null, hp: 0,
        weaponDmg: null, weaponNote: "Вся нежить доп наносит 3 урона по хп в ход за каждую атаку в течении 1 круга",
        resist: {  },
        spells: [],
        shouts: [],
        loot: ""
    },
    {
        name: "Скелет", category: "Монстры", soul: "petty", hp: 50,
        weaponDmg: 12, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Древне нордское оружие, Костная мука 1-2"
    },
    {
        name: "Скелет-маг", category: "Монстры", soul: "petty", hp: 50,
        weaponDmg: 12, weaponNote: "",
        resist: {  },
        spells: [{ name: "Ледяной шип", dmg: 22, cost: 22 }],
        shouts: [],
        loot: "Древне нордское оружие, Костная мука 1-2"
    },
    {
        // Все 7 ступеней драугров из Враги.xlsx (я раньше вытащил только базовую, самую первую).
        // "Оружие и урон" в источнике задан как список из нескольких вариантов + множитель
        // ("урон оружия X.X") — множитель применяется к базовому урону оружия, у меня плоское
        // число на противника, поэтому взял среднее древнонордское оружие как базу (~10 урона) и
        // умножил. weaponOptions — для рандомайзера: при добавлении в бой один вариант выбирается
        // случайно и попадает в weaponNote.
        name: "Драугр", category: "Монстры", soul: "petty", hp: 30,
        weaponDmg: 5, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Древне нордское оружие, Костная мука 1-2, золото (до 10), драг камень, свитки заклинаний"
    },
    {
        name: "Беспокойный драугр", category: "Монстры", soul: "lesser", hp: 175, mana: 50,
        weaponDmg: 15, weaponOptions: ["Древне нордское оружие", "Железный щит"],
        resist: {  },
        spells: [{ name: "Обморожение", dmg: 15, cost: 15 }],
        shouts: [],
        loot: "Древне нордское оружие, Костная мука 1-2, золото (до 10), драг камень, свитки заклинаний"
    },
    {
        name: "Драугр-призрак", category: "Монстры", soul: null, hp: 400, mana: 120,
        weaponDmg: 20, weaponOptions: ["Древне нордская секира", "Древне нордский боевой топор", "Древне нордский лук", "Железный щит"],
        resist: {  },
        spells: [{ name: "Обморожение", dmg: 15, cost: 15 }, { name: "Ледяное копье", dmg: 22, cost: 22 }],
        shouts: [],
        loot: "Древне нордское оружие, Костная мука 1-2, золото (до 10), драг камень, свитки заклинаний"
    },
    {
        name: "Драугр-палач", category: "Монстры", soul: "common", hp: 900, mana: 160,
        weaponDmg: 25, weaponOptions: ["Древне нордская секира", "Древне нордский боевой топор", "Древне нордский лук", "Железный щит"],
        resist: {  },
        spells: [{ name: "Обморожение", dmg: 15, cost: 15 }, { name: "Ледяное копье", dmg: 22, cost: 22 }, { name: "Призыв ледяного атронаха", dmg: 0, cost: 60 }],
        shouts: [{ name: "Безжалостная сила", cooldown: 15, effect: "Отталкивает игроков, попавшие получают −1 к кубам на 1 ход" }],
        loot: "Древне нордское оружие, Костная мука 1-2, золото (до 10)"
    },
    {
        name: "Драугр-главный палач", category: "Монстры", soul: "common", hp: 880, mana: 60,
        weaponDmg: 30, weaponOptions: ["Зачарованная древне нордская секира", "Зачарованный древне нордский боевой топор", "Зачарованный древне нордский лук", "Железный щит"],
        resist: {  },
        spells: [{ name: "Морозное дыхание", dmg: 60, cost: 60 }],
        shouts: [
            { name: "Безжалостная сила", cooldown: 15, effect: "Отталкивает на 10 фт., упавшие получают −1 к кубам на 1 ход (дальнее оружие −2)" },
            { name: "Разоружение", cooldown: 15, effect: "Игрок должен заново взять оружие в руки" }
        ],
        loot: "Древне нордское оружие, Костная мука 1-2, золото (до 10), драг камень, свитки заклинаний"
    },
    {
        name: "Драугр-повелитель", category: "Монстры", soul: "greater", hp: 1300, mana: 0,
        weaponDmg: 35, weaponOptions: ["Зачарованная древне нордская секира", "Зачарованный древне нордский боевой топор", "Зачарованный древне нордский лук", "Железный щит"],
        resist: {  },
        spells: [{ name: "Морозный плащ", dmg: 16, cost: 0, note: "Аура: наносит урон всем в пределах 5 футов каждый ход, без затрат маны" }],
        shouts: [
            { name: "Безжалостная сила", cooldown: 15, effect: "Отталкивает на 10 фт., упавшие получают −1 к кубам на 1 ход (дальнее оружие −2)" },
            { name: "Разоружение", cooldown: 15, effect: "Игрок должен заново взять оружие в руки" }
        ],
        loot: "Древне нордское оружие, Костная мука 1-2, золото (до 10), драг камень, свитки заклинаний"
    },
    {
        name: "Неуклюжий драугр", category: "Монстры", soul: null, hp: 1000, mana: 0,
        weaponDmg: 10, weaponNote: "Безоружный — только крики",
        resist: {  },
        spells: [],
        shouts: [
            { name: "Безжалостная сила", cooldown: 15, effect: "Отталкивает игроков" },
            { name: "Разоружение", cooldown: 15, effect: "Игрок должен заново взять оружие в руки" },
            { name: "Морозное дыхание", cooldown: 15, effect: "Урон холодом по конусу" }
        ],
        loot: ""
    },
    {
        name: "Луркер", category: "Монстры", soul: null, hp: 818,
        weaponDmg: null, weaponNote: "Кислотный плевок 50 урона Плевок луркера 30 урона",
        resist: { magic: 25, frost: 25, poison: 33, physical: 20 },
        spells: [],
        shouts: [],
        loot: "Уровневая сумма денег (250–600 септимов); 1 зачарованное ожерелье, кольцо или обруч; 50 % шанс на каждый предмет из списка: икра рыбы-убийцы, чешуя рыбы-убийцы, клык хоркера, шкура нетча, что доказывает, что это амфибия или существо, которое охотится на морских обитателей; 25 % шанс на каждый предмет из списка: незачарованное кольцо, обруч или ожерелье; 20 % шанс получения случайного камня душ (полного или пустого)."
    },
    {
        name: "Луркер часовой", category: "Монстры", soul: null, hp: 1450,
        weaponDmg: null, weaponNote: "Кислотный плевок 80 урона Плевок луркера 40 урона",
        resist: { magic: 25, frost: 25, poison: 33, physical: 20 },
        spells: [],
        shouts: [],
        loot: "Уровневая сумма денег (250–600 септимов); 1 зачарованное ожерелье, кольцо или обруч; 50 % шанс на каждый предмет из списка: икра рыбы-убийцы, чешуя рыбы-убийцы, клык хоркера, шкура нетча, что доказывает, что это амфибия или существо, которое охотится на морских обитателей; 25 % шанс на каждый предмет из списка: незачарованное кольцо, обруч или ожерелье; 20 % шанс получения случайного камня душ (полного или пустого)."
    },
    {
        name: "Медведь оборотни", category: "Монстры", soul: "common", hp: 241,
        weaponDmg: 80, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Пчелиный мёд, человечье мясо, медовые соты, рваные штаны. Обычно встречаются по 2-3"
    },
    {
        name: "Нетч", category: "Монстры", soul: "greater", hp: 1000,
        weaponDmg: 70, weaponNote: "70 урона электричеством",
        resist: { shock: 50 },
        spells: [],
        shouts: [],
        loot: "Желе нетча, шкура нетча"
    },
    {
        name: "Горелый сприган", category: "Монстры", soul: "greater", hp: 945,
        weaponDmg: null, weaponNote: "Ближний урон 50.Используют только одно заклинание — усиленное пламя, которое наносит 20 единиц огненного урона в секунду; Как и обычные спригганы, обладают способностью «Щит сприггана», которая даёт 25 единиц защиты от физической атаки; После смерти существо взрывается, нанося 50 единиц огненного урона в радиусе 25 футов.",
        resist: { fire: 100 },
        spells: [],
        shouts: [],
        loot: "древесину горелого сприггана,"
    },
    {
        name: "Пепельный прыгун", category: "Монстры", soul: "lesser", hp: 155,
        weaponDmg: 30, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Желе пепельного прыгуна, мясо пепельного прыгуна, нога пепельного прыгуна, хитиновая пластина"
    },
    {
        name: "Порождение пепла", category: "Монстры", soul: "common", hp: 440,
        weaponDmg: 24, weaponNote: "24 урона и 16 урона огнем. Выпускает пригрошню углей нанося 25 урона огнем",
        resist: { fire: 75 },
        spells: [],
        shouts: [],
        loot: "Пепел порождения, руда, драгоценные камни"
    },
    {
        name: "Щетиноспин", category: "Монстры", soul: "lesser", hp: 260,
        weaponDmg: 25, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Мясо кабана, Кабаний клык"
    },
    {
        name: "Риклинг", category: "Монстры", soul: "lesser", hp: 200,
        weaponDmg: 45, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Копье риклингов и пару септимов/немного еды"
    },
    {
        name: "Фалмер (воин)", category: "Воины", soul: "lesser", hp: 150,
        weaponDmg: 15, weaponNote: "15 и 15 урона ядом",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-мастер укрытий (воин)", category: "Воины", soul: "lesser", hp: 200,
        weaponDmg: 20, weaponNote: "20 и 20 урона ядом",
        resist: { physical: 5 },
        spells: [],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-сумрачный страж (воин)", category: "Воины", soul: "common", hp: 250,
        weaponDmg: 35, weaponNote: "35 и 25 урона ядом",
        resist: { physical: 10 },
        spells: [],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-ночной охотник (воин)", category: "Воины", soul: "greater", hp: 350,
        weaponDmg: 40, weaponNote: "40 и 25 урона ядом",
        resist: { physical: 15 },
        spells: [],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер (шаман)", category: "Шаманы", soul: "lesser", hp: 150,
        weaponDmg: null, weaponNote: "",
        resist: {  },
        spells: [{ name: "Ледяной шип", dmg: 22, cost: 22 }, { name: "Искры", dmg: 15, cost: 17 }, { name: "Быстрое лечение", dmg: 0, cost: 35 }, { name: "Малый оберег", dmg: 0, cost: 17 }, { name: "Дубовая плоть", dmg: 0, cost: 50 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-мастер укрытий (шаман)", category: "Шаманы", soul: "lesser", hp: 200,
        weaponDmg: null, weaponNote: "",
        resist: { physical: 5 },
        spells: [{ name: "Молния", dmg: 25, cost: 25 }, { name: "Обморожение", dmg: 15, cost: 15 }, { name: "Устойчивый оберег", dmg: 0, cost: 27 }, { name: "Каменная плоть", dmg: 0, cost: 77 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-сумрачный страж (шаман)", category: "Шаманы", soul: "common", hp: 250,
        weaponDmg: null, weaponNote: "",
        resist: { physical: 10 },
        spells: [{ name: "Плащ молний", dmg: 20, cost: 140 }, { name: "Ледяной шип", dmg: 22, cost: 22 }, { name: "Обморожение", dmg: 15, cost: 15 }, { name: "Быстрое лечение", dmg: 0, cost: 35 }, { name: "Устойчивый оберег", dmg: 0, cost: 27 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-ночной охотник (шаман)", category: "Шаманы", soul: "common", hp: 350,
        weaponDmg: null, weaponNote: "",
        resist: { physical: 15 },
        spells: [{ name: "Ледяной шип", dmg: 22, cost: 22 }, { name: "Искры", dmg: 15, cost: 17 }, { name: "Быстрое лечение", dmg: 0, cost: 35 }, { name: "Устойчивый оберег", dmg: 0, cost: 27 }, { name: "Каменная плоть", dmg: 0, cost: 77 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер (боевой маг)", category: "Боевые маги", soul: "lesser", hp: 150,
        weaponDmg: null, weaponNote: "",
        resist: {  },
        spells: [{ name: "Обморожение", dmg: 15, cost: 15 }, { name: "Лечение", dmg: 0, cost: 10 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-мастер укрытий (боевой маг)", category: "Боевые маги", soul: "lesser", hp: 200,
        weaponDmg: null, weaponNote: "",
        resist: { physical: 5 },
        spells: [{ name: "Ледяной шип", dmg: 22, cost: 22 }, { name: "Искры", dmg: 15, cost: 17 }, { name: "Лечение", dmg: 0, cost: 10 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-сумрачный страж (боевой маг)", category: "Боевые маги", soul: "common", hp: 250,
        weaponDmg: null, weaponNote: "",
        resist: { physical: 10 },
        spells: [{ name: "Морозный плащ", dmg: 0, cost: 135 }, { name: "Молния", dmg: 25, cost: 25 }, { name: "Обморожение", dmg: 15, cost: 15 }, { name: "Лечение", dmg: 0, cost: 10 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Фалмер-ночной охотник (боевой маг)", category: "Боевые маги", soul: "greater", hp: 350,
        weaponDmg: null, weaponNote: "",
        resist: { physical: 15 },
        spells: [{ name: "Цепная молния", dmg: 32, cost: 77 }, { name: "Ледяной шип", dmg: 22, cost: 22 }, { name: "Искры", dmg: 15, cost: 17 }, { name: "Лечение", dmg: 0, cost: 10 }],
        shouts: [],
        loot: "Фалмерские уши,золото,яды,фалмерское оружие"
    },
    {
        name: "Двемерская балиста", category: "Двемерские ловушки", soul: "none", hp: 600,
        weaponDmg: 70, weaponNote: "",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "двемерский металлолом, двемерское масло, драгоценные камни, а также обычный камень душ"
    },
    {
        name: "Двемерский часовой", category: "Двемерские ловушки", soul: "none", hp: 400,
        weaponDmg: 30, weaponNote: "30 с каждого меча(их 3)",
        resist: {  },
        spells: [],
        shouts: [],
        loot: "двемерский металлолом, двемерское масло, драгоценные камни, а также обычный камень душ"
    },
    {
        name: "Двемерский страж", category: "Двемерские ловушки", soul: "none", hp: 700,
        weaponDmg: 60, weaponNote: "60(30 электричеством)",
        resist: { magic: 25 },
        spells: [],
        shouts: [],
        loot: "Сердечник центуриона,Стреллы (12 шт)(зависит от уровня), Великий камень душ, Двемерское масло, драгоценные камни"
    },
    { name: "Фалмер (лучник)", category: "Монстры", soul: "lesser", hp: 150, weaponDmg: 25, weaponNote: "+ 15 урона ядом, дальний бой", resist: {}, spells: [], shouts: [], loot: "Фалмерские уши, золото, яды, фалмерское оружие" },
    { name: "Фалмер-мастер укрытий (лучник)", category: "Монстры", soul: "lesser", hp: 200, weaponDmg: 30, weaponNote: "+ 20 урона ядом, дальний бой", resist: { physical: 5 }, spells: [], shouts: [], loot: "Фалмерские уши, золото, яды, фалмерское оружие" },
    { name: "Фалмер-сумрачный страж (лучник)", category: "Монстры", soul: "common", hp: 250, weaponDmg: 35, weaponNote: "+ 25 урона ядом, дальний бой", resist: { physical: 5 }, spells: [], shouts: [], loot: "Фалмерские уши, золото, яды, фалмерское оружие" },
    { name: "Фалмер-ночной охотник (лучник)", category: "Монстры", soul: "greater", hp: 350, weaponDmg: 40, weaponNote: "+ 25 урона ядом, дальний бой", resist: { physical: 10 }, spells: [], shouts: [], loot: "Фалмерские уши, золото, яды, фалмерское оружие" },
    { name: "Двемерская сфера", category: "Монстры", soul: "none", hp: 400, weaponDmg: 70, resist: { magic: 25 }, spells: [{ name: "Дальний выстрел", dmg: 45, cost: 0 }], shouts: [], loot: "Двемерский металлолом, двемерское масло, драгоценные камни, камни душ разной силы" },
    { name: "Двемерский паук", category: "Монстры", soul: "none", hp: 220, weaponDmg: 30, resist: { magic: 25 }, spells: [{ name: "Молния (х3 за бой)", dmg: 25, cost: 0 }, { name: "Взрыв при гибели (10 фт.)", dmg: 25, cost: 0 }], shouts: [], loot: "Двемерский металлолом, двемерское масло, драгоценные камни, камни душ разной силы" },
    { name: "Двемерский центурион", category: "Монстры", soul: "none", hp: 800, weaponDmg: 110, resist: {}, spells: [{ name: "Паровое дыхание (конус)", dmg: 90, cost: 0 }], shouts: [], loot: "Сердечник центуриона, стрелы (12 шт, зависит от уровня), Великий камень душ, двемерское масло, драгоценные камни" },
    { name: "Лорд дремора", category: "Монстры", soul: "black", hp: 390, weaponDmg: 71, resist: { physical: 32 }, spells: [], shouts: [] },
    { name: "Огненный атронах", category: "Монстры", soul: "lesser", hp: 150, weaponDmg: 20, weaponNote: "Аура: все враги в 5 фт. получают 10 урона огнём каждый ход", resist: {}, spells: [], shouts: [], loot: "Огненная соль" },
    { name: "Ледяной атронах", category: "Монстры", soul: "common", hp: 450, weaponDmg: 40, weaponNote: "Иммунитет к холоду, получает на 33% больше урона от огня", resist: { frost: 100 }, spells: [], shouts: [], loot: "Морозная соль" },
    { name: "Грозовой атронах", category: "Монстры", soul: "greater", hp: 550, weaponDmg: 40, weaponNote: "Урон электричеством. Иммунитет к электричеству", resist: { shock: 100 }, spells: [], shouts: [], loot: "Соль пустоты" },
    { name: "Бандит", category: "Монстры", soul: "black", hp: 110, weaponDmg: 8, weaponNote: "Железное оружие, сыромятная броня, длинный лук", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Бандит-маг", category: "Монстры", soul: "black", hp: 110, mana: 100, weaponDmg: 0, weaponNote: "Одеяние мага (+25 маны)", resist: {}, spells: [{ name: "3 заклинания новичка", dmg: 15, cost: 15 }], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни, свитки" },
    { name: "Разбойник", category: "Монстры", soul: "black", hp: 150, weaponDmg: 12, weaponNote: "Железное-стальное оружие, железная броня, имперский лук (×1.5 к базовому)", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Разбойник-маг", category: "Монстры", soul: "black", hp: 140, mana: 125, weaponDmg: 0, weaponNote: "Одеяние мага (+50 маны)", resist: {}, spells: [{ name: "4 новичка + 2 ученика", dmg: 20, cost: 20 }], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни, свитки" },
    { name: "Громила", category: "Монстры", soul: "black", hp: 240, weaponDmg: 15, weaponNote: "Железное оружие, железная броня, имперский лук (×1.5)", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Громила-маг", category: "Монстры", soul: "black", hp: 220, mana: 150, weaponDmg: 0, weaponNote: "Одеяние мага (-10% стоимости, +25 маны)", resist: {}, spells: [{ name: "5 новичка + 4 ученика", dmg: 22, cost: 22 }], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни, свитки" },
    { name: "Грабитель", category: "Монстры", soul: "black", hp: 320, weaponDmg: 18, weaponNote: "Стальное-двемерское оружие/броня, двемерский лук (×1.5)", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Грабитель-маг", category: "Монстры", soul: "black", hp: 290, mana: 175, weaponDmg: 0, weaponNote: "Одеяние мага (-10% стоимости, +25 маны)", resist: {}, spells: [{ name: "5 новичка + 3 ученика + 1 адепта", dmg: 28, cost: 28 }], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни, свитки" },
    { name: "Головорез", category: "Монстры", soul: "black", hp: 400, weaponDmg: 24, weaponNote: "Двемерское оружие, стальная пластинчатая броня, двемерский лук (×2.0)", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Головорез-маг", category: "Монстры", soul: "black", hp: 360, mana: 200, weaponDmg: 0, weaponNote: "Одеяние мага (-15% стоимости, +50 маны)", resist: {}, spells: [{ name: "5 новичка + 3 ученика + 3 адепта", dmg: 32, cost: 32 }], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Мародер", category: "Монстры", soul: "black", hp: 500, weaponDmg: 28, weaponNote: "Орочье оружие/броня, орочий лук (×2.0)", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни" },
    { name: "Мародер-маг", category: "Монстры", soul: "black", hp: 450, mana: 300, weaponDmg: 0, weaponNote: "Одеяние мага (-15% стоимости, +50 маны)", resist: {}, spells: [{ name: "6 новичка + 4 ученика + 3 адепта + 2 эксперта", dmg: 40, cost: 40 }], shouts: [], loot: "Оружие с тела, броня, золото, отмычки, драг. камни, свитки" },
    { name: "Главарь бандитов", category: "Монстры", soul: "black", hp: 500, weaponDmg: 35, weaponNote: "Орочье оружие и выше, щит и броня от пластинчатой (×2.5)", resist: {}, spells: [], shouts: [], loot: "Оружие с тела, броня, золото (150-200), отмычки, драг. камни" },
    { name: "Изгой", category: "Монстры", soul: "black", hp: 150, weaponDmg: 25, weaponNote: "Броня и оружие изгоев. Оружие похищает доп. 5 хп и мп за удар", resist: {}, spells: [], shouts: [], loot: "Оружие изгоев, стрелы изгоев" },
    { name: "Изгой-шаман", category: "Монстры", soul: "black", hp: 105, mana: 110, weaponDmg: 10, weaponNote: "Броня изгоев, кинжал изгоев", resist: {}, spells: [{ name: "Призыв огненного атронаха", dmg: 0, cost: 60 }, { name: "Огненная стрела", dmg: 20, cost: 20 }, { name: "Пламя", dmg: 15, cost: 15 }, { name: "Лечение", dmg: 0, cost: 15 }, { name: "Малый оберег", dmg: 0, cost: 15 }], shouts: [], loot: "Кинжал изгоев, крохотный/маленький камень душ" },
    { name: "Изгой вересковое сердце", category: "Монстры", soul: "black", hp: 535, weaponDmg: 50, weaponNote: "Броня изгоев ×2, оружие изгоев ×3. Оружие похищает доп. 15 хп и мп за удар", resist: {}, spells: [{ name: "Призыв ледяного атронаха", dmg: 0, cost: 90 }, { name: "Морозный плащ", dmg: 16, cost: 40 }, { name: "Ледяное копье", dmg: 22, cost: 22 }, { name: "Ледяная буря", dmg: 70, cost: 70 }, { name: "Ледяной шип", dmg: 22, cost: 22 }, { name: "Устойчивый оберег", dmg: 0, cost: 25 }], shouts: [], loot: "Оружие изгоев, стрелы изгоев, вересковое сердце" },
    { name: "Вервольф (враг)", category: "Монстры", soul: "lesser", hp: 300, weaponDmg: 35, weaponNote: "Когти, физ. резист 10%", resist: { physical: 10 }, spells: [], shouts: [], loot: "Волчья шкура, человечье мясо, золото, драг. камень и/или кольцо" },
    { name: "Вампир", category: "Монстры", soul: "black", hp: 120, mana: 120, weaponDmg: 15, weaponNote: "Стальной кинжал, физ. резист 5%", resist: { physical: 5 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 100 }, { name: "Вампирское высасывание", dmg: 5, cost: 0 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Кровавый вампир", category: "Монстры", soul: "black", hp: 330, mana: 169, weaponDmg: 30, weaponNote: "Стальной кинжал ×2, физ. резист 5%", resist: { physical: 5 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 100 }, { name: "Вампирское высасывание", dmg: 8, cost: 0 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Вампир ночной охотник", category: "Монстры", soul: "black", hp: 413, mana: 280, weaponDmg: 45, weaponNote: "Стеклянный кинжал ×3, физ. резист 10%", resist: { physical: 10 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 50 }, { name: "Вампирское высасывание", dmg: 12, cost: 0 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Древний вампир", category: "Монстры", soul: "black", hp: 583, mana: 340, weaponDmg: 45, weaponNote: "Стеклянный кинжал ×3, физ. резист 10%", resist: { physical: 10 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 50 }, { name: "Вампирское высасывание", dmg: 15, cost: 0 }, { name: "Ледяной шип", dmg: 20, cost: 20 }, { name: "Молния", dmg: 20, cost: 20 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Волкихарский вампир", category: "Монстры", soul: "black", hp: 823, mana: 415, weaponDmg: 60, weaponNote: "Эбонитовый кинжал ×4, физ. резист 15%", resist: { physical: 15 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 50 }, { name: "Вампирское высасывание", dmg: 25, cost: 0 }, { name: "Ледяной шип", dmg: 35, cost: 20 }, { name: "Цепная молния", dmg: 35, cost: 20 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Мастер вампир", category: "Монстры", soul: "black", hp: 500, mana: 310, weaponDmg: 45, weaponNote: "Стеклянный кинжал ×4, физ. резист 15%", resist: { physical: 15 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 50 }, { name: "Вампирское высасывание", dmg: 15, cost: 0 }, { name: "Ледяной шип", dmg: 20, cost: 20 }, { name: "Молния", dmg: 20, cost: 20 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Волкихарский мастер вампир", category: "Монстры", soul: "black", hp: 968, mana: 460, weaponDmg: 60, weaponNote: "Стеклянный кинжал ×5, физ. резист 15%", resist: { physical: 15 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 50 }, { name: "Вампирское высасывание", dmg: 35, cost: 0 }, { name: "Ледяной шип", dmg: 20, cost: 20 }, { name: "Молния", dmg: 20, cost: 20 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Вампир хозяин ночи", category: "Монстры", soul: "black", hp: 1226, mana: 530, weaponDmg: 60, weaponNote: "Стеклянный кинжал ×5, физ. резист 20%", resist: { physical: 20 }, spells: [{ name: "Оживление зомби", dmg: 0, cost: 50 }, { name: "Вампирское высасывание", dmg: 20, cost: 0 }, { name: "Ледяной шип", dmg: 20, cost: 20 }, { name: "Молния", dmg: 20, cost: 20 }], shouts: [], loot: "Драг. камни, зелья/яды, золото, книги, отмычки, украшения, прах вампира" },
    { name: "Гончая смерти", category: "Монстры", soul: "lesser", hp: 120, weaponDmg: 15, weaponNote: "Цель теряет 5 фт. скорости на 6 ходов", resist: {}, spells: [], shouts: [], loot: "Собачатина, ошейник гончей смерти (50 септимов, вес 2)" },
    { name: "Горгулья", category: "Монстры", soul: "lesser", hp: 240, weaponDmg: 20, weaponNote: "Похищает 5 хп за удар, физ. резист 30%", resist: { physical: 30 }, spells: [], shouts: [], loot: "Случайное кол-во руды (по уровню) и драг. камней" },
    { name: "Горгулья-страж", category: "Монстры", soul: "lesser", hp: 700, weaponDmg: 35, weaponNote: "Похищает 12 хп за удар, физ. резист 30%", resist: { physical: 30 }, spells: [], shouts: [], loot: "Случайное кол-во руды (по уровню) и драг. камней" },
    { name: "Горгулья-бестия", category: "Монстры", soul: "lesser", hp: 550, weaponDmg: 50, weaponNote: "Похищает 15 хп за удар, физ. резист 30%", resist: { physical: 30 }, spells: [], shouts: [], loot: "Случайное кол-во руды (по уровню) и драг. камней" },

    // ===== Новые существа (захват душ). HP — по UESP; урон — оценка под масштаб этой игры. =====
    { name: "Олень (самка)", category: "Животные", soul: "petty", hp: 50, weaponDmg: 8, weaponNote: "Обычно убегает", resist: {}, spells: [], shouts: [], loot: "Оленина, оленья шкура, малые рога (50%)" },
    { name: "Олень (самец)", category: "Животные", soul: "petty", hp: 50, weaponDmg: 10, weaponNote: "Обычно убегает", resist: {}, spells: [], shouts: [], loot: "Оленина, оленья шкура, большие рога (50%)" },
    { name: "Лось", category: "Животные", soul: "petty", hp: 130, weaponDmg: 15, weaponNote: "HP и урон — оценка", resist: {}, spells: [], shouts: [], loot: "Оленина, оленья шкура, рога (50%)" },
    { name: "Лиса", category: "Животные", soul: "petty", hp: 22, weaponDmg: 5, weaponNote: "Обычно убегает", resist: {}, spells: [], shouts: [], loot: "Лисья шкура" },
    { name: "Снежная лиса", category: "Животные", soul: "petty", hp: 22, weaponDmg: 5, weaponNote: "Обычно убегает; HP — как у лисы", resist: {}, spells: [], shouts: [], loot: "Шкура снежной лисы" },
    { name: "Кролик", category: "Животные", soul: "petty", hp: 5, weaponDmg: 0, weaponNote: "Не нападает", resist: {}, spells: [], shouts: [], loot: "Сырая кроличья лапка" },
    { name: "Коза", category: "Животные", soul: "petty", hp: 25, weaponDmg: 5, weaponNote: "", resist: {}, spells: [], shouts: [], loot: "Козья шкура, козья нога, козьи рога (50%)" },
    { name: "Корова", category: "Животные", soul: "petty", hp: 87, weaponDmg: 0, weaponNote: "Не нападает", resist: {}, spells: [], shouts: [], loot: "Сырая говядина, коровья шкура" },
    { name: "Курица", category: "Животные", soul: "petty", hp: 5, weaponDmg: 0, weaponNote: "Не нападает", resist: {}, spells: [], shouts: [], loot: "Куриное мясо, перья" },
    { name: "Хоркер", category: "Животные", soul: "petty", hp: 175, weaponDmg: 25, weaponNote: "В игре 15–22 урона", resist: {}, spells: [], shouts: [], loot: "Мясо хоркера, бивень хоркера, малый шанс сокровища" },
    { name: "Собака", category: "Животные", soul: "petty", hp: 60, weaponDmg: 15, weaponNote: "HP и урон — оценка", resist: {}, spells: [], shouts: [], loot: "Собачатина" },
    { name: "Лошадь", category: "Животные", soul: null, hp: 200, weaponDmg: 10, weaponNote: "HP, урон и размер души — оценка/не подтверждены (при захвате спросит размер)", resist: {}, spells: [], shouts: [], loot: "Конина" },
    { name: "Жрец-дракон", category: "Монстры", soul: "grand", hp: 1490, weaponDmg: 60, weaponNote: "Урон — оценка", resist: { magic: 50 }, spells: [{ name: "Молния", dmg: 60, cost: 60 }, { name: "Огненный шар", dmg: 60, cost: 60 }, { name: "Ледяной шип", dmg: 60, cost: 60 }], shouts: [], loot: "Маска жреца-дракона, древнее нордское оружие, золото, драг. камни" }
];
window.enemiesData = enemiesData;

// ============================================================================
// Уровень (level) и тип (kind) существа — нужны для заклинаний «до N уровня»
// (Страх, Успокоение, Ярость, Отпугивание нежити, Полиморф, Изгнание даэдра…).
// kind: animal | monster | people | undead | daedra | automaton.
// Уровни — ОЦЕНКА по Skyrim (у фалмеров/бандитов — по рангу); мастер может поправить
// прямо в карточке врага в бою. Значение null/отсутствует = уровень неизвестен.
// ============================================================================
(function () {
    const M = {
        'Волк': [4, 'animal'], 'Снежный волк': [8, 'animal'], 'Злокрыс': [1, 'animal'], 'Рыба-убийца': [2, 'animal'],
        'Медведь': [8, 'animal'], 'Пещерный медведь': [12, 'animal'], 'Снежный медведь': [16, 'animal'], 'Грязевой краб': [2, 'animal'],
        'Саблезуб': [10, 'animal'], 'Снежный саблезуб': [14, 'animal'], 'Мамонт': [20, 'animal'],
        'Олень (самка)': [1, 'animal'], 'Олень (самец)': [1, 'animal'], 'Лось': [3, 'animal'], 'Лиса': [1, 'animal'], 'Снежная лиса': [1, 'animal'],
        'Кролик': [1, 'animal'], 'Коза': [1, 'animal'], 'Корова': [2, 'animal'], 'Курица': [1, 'animal'], 'Хоркер': [5, 'animal'], 'Собака': [2, 'animal'], 'Лошадь': [3, 'animal'],
        'Морозный паук': [7, 'animal'], 'Гигантский морозный паук': [14, 'animal'],
        'Великан': [20, 'monster'], 'Ворожея': [16, 'monster'], 'Тролль': [10, 'monster'], 'Ледяной тролль': [16, 'monster'],
        'Ледяное приведение': [10, 'undead'], 'Сприган': [8, 'monster'], 'Сприган-матрона': [16, 'monster'], 'Корус': [6, 'animal'],
        'Нежить': [1, 'undead'], 'Скелет': [3, 'undead'], 'Скелет-маг': [6, 'undead'], 'Драугр': [4, 'undead'], 'Беспокойный драугр': [8, 'undead'],
        'Драугр-призрак': [14, 'undead'], 'Драугр-палач': [18, 'undead'], 'Драугр-главный палач': [18, 'undead'], 'Драугр-повелитель': [24, 'undead'], 'Неуклюжий драугр': [22, 'undead'],
        'Луркер': [20, 'monster'], 'Луркер часовой': [28, 'monster'], 'Медведь оборотни': [14, 'monster'], 'Нетч': [18, 'animal'], 'Горелый сприган': [18, 'monster'],
        'Пепельный прыгун': [8, 'monster'], 'Порождение пепла': [12, 'monster'], 'Щетиноспин': [8, 'monster'], 'Риклинг': [5, 'monster'],
        'Двемерская сфера': [12, 'automaton'], 'Двемерский паук': [8, 'automaton'], 'Двемерский центурион': [20, 'automaton'],
        'Лорд дремора': [18, 'daedra'], 'Огненный атронах': [8, 'daedra'], 'Ледяной атронах': [14, 'daedra'], 'Грозовой атронах': [20, 'daedra'],
        'Бандит': [3, 'people'], 'Бандит-маг': [3, 'people'], 'Разбойник': [5, 'people'], 'Разбойник-маг': [5, 'people'], 'Громила': [8, 'people'], 'Громила-маг': [8, 'people'],
        'Грабитель': [11, 'people'], 'Грабитель-маг': [11, 'people'], 'Головорез': [14, 'people'], 'Головорез-маг': [14, 'people'], 'Мародер': [17, 'people'], 'Мародер-маг': [17, 'people'],
        'Главарь бандитов': [19, 'people'], 'Изгой': [5, 'people'], 'Изгой-шаман': [5, 'people'], 'Изгой вересковое сердце': [15, 'people'], 'Вервольф (враг)': [14, 'monster'],
        'Вампир': [10, 'people'], 'Кровавый вампир': [14, 'people'], 'Вампир ночной охотник': [17, 'people'], 'Древний вампир': [20, 'people'], 'Волкихарский вампир': [22, 'people'],
        'Мастер вампир': [18, 'people'], 'Волкихарский мастер вампир': [25, 'people'], 'Вампир хозяин ночи': [30, 'people'],
        'Гончая смерти': [8, 'undead'], 'Горгулья': [14, 'monster'], 'Горгулья-страж': [24, 'monster'], 'Горгулья-бестия': [18, 'monster'], 'Жрец-дракон': [30, 'undead'],
        'Двемерская балиста': [12, 'automaton'], 'Двемерский часовой': [8, 'automaton'], 'Двемерский страж': [14, 'automaton']
    };
    const FALMER_RANK = { '': 5, 'мастер укрытий': 9, 'сумрачный страж': 13, 'ночной охотник': 17 };
    enemiesData.forEach(function (e) {
        let m = M[e.name];
        if (!m) {
            const f = /^Фалмер(?:-([^(]+?))?\s*\(/.exec(e.name);
            if (f) m = [FALMER_RANK[(f[1] || '').trim()] || 5, 'monster'];
        }
        if (m) { e.level = m[0]; e.kind = m[1]; }
    });
})();

