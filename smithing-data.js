// ============================================================================
// SMITHING-DATA.JS — материалы и рецепты брони (лёгкая/тяжёлая), из листа
// «Броня,одеяния,оружие». Только позиции, для которых реально есть рецепт —
// остальное (Имперское/Меховое/Фалмерское и т.д.) — лут/покупка, не куётся.
// ============================================================================

// Материалы кузнечного дела: цена/вес за штуку (для расчёта веса/наличия в инвентаре)
const smithingMaterials = {
    "Кожа": { price: 10, weight: 2 },
    "Полоски кожи": { price: 3, weight: 0.1 },
    "Железный слиток": { price: 7, weight: 1 },
    "Стальной слиток": { price: 29, weight: 1 },
    "Корундовый слиток": { price: 40, weight: 1 },
    "Орихалковый слиток": { price: 45, weight: 1 },
    "Эбонитовый слиток": { price: 150, weight: 1 },
    "Двемерский слиток": { price: 30, weight: 1 },
    "Лунный камень": { price: 75, weight: 1 },
    "Малахитовый слиток": { price: 100, weight: 1 },
    "Ртутный слиток": { price: 60, weight: 1 },
    "Сталгрим": { price: 70, weight: 1 },
    "Костная мука": { price: 5, weight: 0.5 },
    "Хитиновая пластина": { price: 15, weight: 1 },
    "Шкура нетча": { price: 20, weight: 2 },
    "Козьи рога": { price: 5, weight: 1 },
    "Золотой слиток": { price: 50, weight: 1 },
    "Серебряный слиток": { price: 25, weight: 1 },
    "Полено": { price: 5, weight: 5 },
    "Корень Нирна": { price: 10, weight: 0.2 },
    "Паслен": { price: 10, weight: 0.2 },
    "Соль пустоты": { price: 125, weight: 0.2 },
    "Огненная соль": { price: 50, weight: 0.333 },
    "Морозная соль": { price: 100, weight: 0.333 },
    "Прах вампира": { price: 25, weight: 0.2 },
    "Череп тролля": { price: 30, weight: 3 },
    "Бивень мамонта": { price: 150, weight: 5 }
};

// Рецепты брони — только те позиции, для которых реально есть рецепт в своде правил.
// perkHint — какой перк "Кузнечного дела" обычно нужен для этого материала (подсказка мастеру,
// финальное решение остаётся за мастером — см. правило "нужно найти мастера, который научит").
const armorRecipes = [
    {
        name: "Сыромятный шлем", armorType: "Легкая броня", slot: "Шлема",
        resistance: 11, weight: 1, price: 25, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Кожа", qty: 2 }]
    },
    {
        name: "Кожаный шлем", armorType: "Легкая броня", slot: "Шлема",
        resistance: 13, weight: 2, price: 60, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Сталгримовый легкий шлем", armorType: "Легкая броня", slot: "Шлема",
        resistance: 18, weight: 2, price: 465, upgradeMaterial: "Сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 3 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }, { name: "Кожа", qty: 2 }]
    },
    {
        name: "Эльфийский шлем", armorType: "Легкая броня", slot: "Шлема",
        resistance: 14, weight: 1, price: 110, upgradeMaterial: "лунный камень",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Полоски кожи", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Ламеллярный шлем", armorType: "Легкая броня", slot: "Шлема",
        resistance: 15, weight: 2, price: 175, upgradeMaterial: "Корундовый",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Корундовый слиток", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стеклянный шлем", armorType: "Легкая броня", slot: "Шлема",
        resistance: 17, weight: 2, price: 450, upgradeMaterial: "Малахитовый",
        perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 2 }, { name: "Лунный камень", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Сыромятная броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 22, weight: 2, price: 50, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Кожа", qty: 4 }]
    },
    {
        name: "Кожаная броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 28, weight: 2, price: 125, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Кожа", qty: 4 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Эльфийская броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 31, weight: 2, price: 225, upgradeMaterial: "Лунный камень",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Эльфийская золоченая броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 35, weight: 2, price: 550, upgradeMaterial: "Ртутный слиток",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 4 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }, { name: "Кожа", qty: 1 }]
    },
    {
        name: "Сталгримовая легкая броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 39, weight: 3, price: 925, upgradeMaterial: "Сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 5 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Ламеллярная броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 34, weight: 2, price: 350, upgradeMaterial: "корундовый",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Корундовый слиток", qty: 2 }, { name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Ламеллярная броня с рогами", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 34, weight: 2, price: 350, upgradeMaterial: "корундовый",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Корундовый слиток", qty: 2 }, { name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 3 }, { name: "Козьи рога", qty: 1 }]
    },
    {
        name: "Стеклянная броня", armorType: "Легкая броня", slot: "Доспехи",
        resistance: 41, weight: 3, price: 900, upgradeMaterial: "Малахитовый слиток",
        perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 4 }, { name: "Лунный камень", qty: 2 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Сыромятные наручи", armorType: "Легкая броня", slot: "Наручи и перчатки",
        resistance: 6, weight: 1, price: 10, upgradeMaterial: "кожа",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Кожа", qty: 1 }]
    },
    {
        name: "Сталгримовые легкие наручи", armorType: "Легкая броня", slot: "Наручи и перчатки",
        resistance: 13, weight: 1, price: 215, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 2 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Кожаные наручи", armorType: "Легкая броня", slot: "Наручи и перчатки",
        resistance: 8, weight: 1, price: 25, upgradeMaterial: "кожа",
        perkHint: null,
        ingredients: [{ name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эльфийские перчатки", armorType: "Легкая броня", slot: "Наручи и перчатки",
        resistance: 9, weight: 1, price: 45, upgradeMaterial: "лунный камень",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 2 }, { name: "Кожа", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Ламеллярные наручи", armorType: "Легкая броня", slot: "Наручи и перчатки",
        resistance: 10, weight: 2, price: 70, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 1 }, { name: "Корундовый слиток", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стеклянные перчатки", armorType: "Легкая броня", slot: "Наручи и перчатки",
        resistance: 12, weight: 2, price: 190, upgradeMaterial: "Малахитовый слиток",
        perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 1 }, { name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сыромятные сапоги", armorType: "Легкая броня", slot: "Сапоги и ботинки",
        resistance: 6, weight: 1, price: 10, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Кожа", qty: 2 }]
    },
    {
        name: "Кожаные сапоги", armorType: "Легкая броня", slot: "Сапоги и ботинки",
        resistance: 8, weight: 1, price: 20, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эльфийские сапоги", armorType: "Легкая броня", slot: "Сапоги и ботинки",
        resistance: 9, weight: 1, price: 45, upgradeMaterial: "",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Ламеллярные сапоги", armorType: "Легкая броня", slot: "Сапоги и ботинки",
        resistance: 10, weight: 2, price: 70, upgradeMaterial: "Корундовый",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Корундовый слиток", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сталгримовые легкие сапоги", armorType: "Легкая броня", slot: "Сапоги и ботинки",
        resistance: 17, weight: 2, price: 450, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 3 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стеклянные сапоги", armorType: "Легкая броня", slot: "Сапоги и ботинки",
        resistance: 12, weight: 2, price: 190, upgradeMaterial: "малахитовый слиток",
        perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 2 }, { name: "Лунный камень", qty: 1 }, { name: "Кожа", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сыромятный щит", armorType: "Легкая броня", slot: "Щиты",
        resistance: 16, weight: 2, price: 25, upgradeMaterial: "Кожа",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Кожа", qty: 4 }]
    },
    {
        name: "Эльфийский щит", armorType: "Легкая броня", slot: "Щиты",
        resistance: 23, weight: 3, price: 115, upgradeMaterial: "лунный камень",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стеклянный щит", armorType: "Легкая броня", slot: "Щиты",
        resistance: 29, weight: 3, price: 450, upgradeMaterial: "малахитовый слиток",
        perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 4 }, { name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сталгримовый щит", armorType: "Легкая броня", slot: "Щиты",
        resistance: 32, weight: 3, price: 600, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 4 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Железный шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 16, weight: 2, price: 60, upgradeMaterial: "Железный слиток",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 3 }]
    },
    {
        name: "Стальной шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 19, weight: 2, price: 125, upgradeMaterial: "Стальной",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стальной рогатый шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 19, weight: 2, price: 125, upgradeMaterial: "Стальной",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Древний нордский шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 14, weight: 3, price: 60, upgradeMaterial: "Железный слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Железный слиток", qty: 2 }, { name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Костяной шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 19, weight: 3, price: 135, upgradeMaterial: "2 костные муки",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Костная мука", qty: 6 }, { name: "Шкура нетча", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Тяжелый хитиновый шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 19, weight: 4, price: 135, upgradeMaterial: "Хитиновая пластина",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Хитиновая пластина", qty: 4 }, { name: "Корундовый слиток", qty: 1 }, { name: "Шкура нетча", qty: 1 }]
    },
    {
        name: "Двемерский шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 20, weight: 5, price: 200, upgradeMaterial: "Двемерский слиток",
        perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стальной пластинчатый шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 21, weight: 3, price: 300, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Корундовый слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Орочий шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 22, weight: 3, price: 500, upgradeMaterial: "Орихалковый  слиток",
        perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сталгримовый шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 22, weight: 3, price: 1165, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 4 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Нордский резной шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 22, weight: 4, price: 550, upgradeMaterial: "Ртутный  слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 4 }, { name: "Эбонитовый слиток", qty: 1 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Эбонитовый шлем", armorType: "Тяжелая броня", slot: "Шлема",
        resistance: 23, weight: 4, price: 750, upgradeMaterial: "Эбонитовый слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 3 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Железные перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 11, weight: 3, price: 25, upgradeMaterial: "Железный слиток",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 2 }]
    },
    {
        name: "Стальные имперские перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 13, weight: 3, price: 55, upgradeMaterial: "Стальной слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Двемерские перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 14, weight: 4, price: 84, upgradeMaterial: "Двемерский слиток",
        perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стальные пластинчатые перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 15, weight: 3, price: 125, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Корундовый слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Древне норские наручи", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 10, weight: 3, price: 25, upgradeMaterial: "Железный слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Железный слиток", qty: 2 }, { name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Костяные перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 13, weight: 2, price: 60, upgradeMaterial: "2 костные муки",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Костная мука", qty: 4 }, { name: "Шкура нетча", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Тяжелые хитиновые перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 14, weight: 4, price: 135, upgradeMaterial: "Хитиновая пластина",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Хитиновая пластина", qty: 3 }, { name: "Корундовый слиток", qty: 1 }, { name: "Шкура нетча", qty: 1 }]
    },
    {
        name: "Орочьи перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 16, weight: 3, price: 200, upgradeMaterial: "Орихалковый слиток",
        perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сталгримовые перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 20, weight: 3, price: 450, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 3 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Нордские резные перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 16, weight: 3, price: 220, upgradeMaterial: "Ртутный слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 3 }, { name: "Эбонитовый слиток", qty: 1 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Эбонитовые перчатки", armorType: "Тяжелая броня", slot: "Наручи и перчатки",
        resistance: 17, weight: 4, price: 275, upgradeMaterial: "Эбонитовый слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 3 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Железная броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 27, weight: 11, price: 125, upgradeMaterial: "Железный слиток",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Железный слиток", qty: 5 }]
    },
    {
        name: "Прочная железная броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 30, weight: 13, price: 200, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Железный слиток", qty: 5 }, { name: "Корундовый слиток", qty: 1 }]
    },
    {
        name: "Стальная броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 33, weight: 11, price: 275, upgradeMaterial: "Стальной слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Стальная броня с наплечниками", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 34, weight: 11, price: 275, upgradeMaterial: "Стальной слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Двемерская броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 37, weight: 16, price: 400, upgradeMaterial: "Двемерский слиток",
        perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Сталгримовая броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 49, weight: 8, price: 2200, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 6 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Древняя нордская броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 25, weight: 11, price: 125, upgradeMaterial: "Железный слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 5 }, { name: "Железный слиток", qty: 2 }, { name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 4 }]
    },
    {
        name: "Костяная броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 34, weight: 12, price: 90, upgradeMaterial: "2 костные муки",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Костная мука", qty: 10 }, { name: "Шкура нетча", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Костяная броня с наплечниками", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 34, weight: 13, price: 90, upgradeMaterial: "2 костные муки",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Костная мука", qty: 10 }, { name: "Шкура нетча", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Тяжелая хитиновая броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 40, weight: 13, price: 650, upgradeMaterial: "Хитиновая пластина",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Хитиновая пластина", qty: 6 }, { name: "Корундовый слиток", qty: 1 }, { name: "Шкура нетча", qty: 3 }]
    },
    {
        name: "Стальная пластинчатая броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 43, weight: 13, price: 625, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Корундовый слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Орочья броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 43, weight: 14, price: 1000, upgradeMaterial: "Орихалковый  слиток",
        perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Нордская резная броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 43, weight: 13, price: 1600, upgradeMaterial: "Ртутный  слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Стальной слиток", qty: 6 }, { name: "Эбонитовый слиток", qty: 1 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Эбонитовая броня", armorType: "Тяжелая броня", slot: "Доспехи",
        resistance: 46, weight: 15, price: 1500, upgradeMaterial: "Эбонитовый слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 5 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Железные сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 11, weight: 2, price: 25, upgradeMaterial: "Железный слиток",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 3 }]
    },
    {
        name: "Стальные сапоги со щитками", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 13, weight: 3, price: 55, upgradeMaterial: "Стальной слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стальные сапоги с оковкой", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 13, weight: 3, price: 55, upgradeMaterial: "Стальной слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Двемерские сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 14, weight: 5, price: 85, upgradeMaterial: "Двемерский слиток",
        perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Стальные пластинчатые сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 15, weight: 4, price: 125, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Корундовый слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Орочьи сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 16, weight: 3, price: 270, upgradeMaterial: "Орихалковый  слиток",
        perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Нордские резные сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 16, weight: 4, price: 220, upgradeMaterial: "Ртутный  слиток",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 3 }, { name: "Ртутный слиток", qty: 1 }, { name: "Эбонитовый слиток", qty: 1 }]
    },
    {
        name: "Древне нордские сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 10, weight: 4, price: 25, upgradeMaterial: "Железный слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 4 }, { name: "Железный слиток", qty: 2 }, { name: "Кожа", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Костяные сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 13, weight: 3, price: 60, upgradeMaterial: "2 костные муки",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Костная мука", qty: 6 }, { name: "Шкура нетча", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Тяжелые хитиновые сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 14, weight: 4, price: 135, upgradeMaterial: "Хитиновая пластина",
        perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Хитиновая пластина", qty: 4 }, { name: "Корундовый слиток", qty: 1 }, { name: "Шкура нетча", qty: 1 }]
    },
    {
        name: "Сталгримовые сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 17, weight: 3, price: 450, upgradeMaterial: "сталгрим",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 4 }, { name: "Ртутный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эбонитовые сапоги", armorType: "Тяжелая броня", slot: "Сапоги и ботинки",
        resistance: 17, weight: 5, price: 275, upgradeMaterial: "",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 3 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Железный щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 22, weight: 5, price: 60, upgradeMaterial: "Железный слиток",
        perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 4 }, { name: "Железный слиток", qty: 4 }]
    },
    {
        name: "Прочный железный щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 24, weight: 6, price: 100, upgradeMaterial: "Корундовый слиток",
        perkHint: "Сложные типы брони",
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Железный слиток", qty: 4 }, { name: "Корундовый слиток", qty: 1 }]
    },
    {
        name: "Стальной щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 26, weight: 4, price: 150, upgradeMaterial: "Стальной слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Двемерский щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 28, weight: 7, price: 225, upgradeMaterial: "Двемерский слиток",
        perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Нордский щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 29, weight: 4, price: 335, upgradeMaterial: "Ртутный  слиток",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 4 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Орочий щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 32, weight: 5, price: 500, upgradeMaterial: "Орихалковый  слиток",
        perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эбонитовый щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 34, weight: 6, price: 750, upgradeMaterial: "",
        perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 4 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Костяной щит", armorType: "Тяжелая броня", slot: "Щиты",
        resistance: 23, weight: 5, price: 95, upgradeMaterial: "2 костные муки",
        perkHint: "Стальные доспехи",
        ingredients: [{ name: "Костная мука", qty: 8 }, { name: "Шкура нетча", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    }
];

window.smithingMaterials = smithingMaterials;
window.armorRecipes = armorRecipes;

// Ювелирные изделия куются с самого начала (перк не нужен — как в оригинальной игре),
// но мастер всё равно должен открыть рецепт игроку (см. правило "нужно найти мастера").
// Данные по составу — по мотивам вики Skyrim (украшения там не описаны в таблице).
const jewelryRecipes = [
    { name: "Золотое кольцо", slot: "jewelry", weight: 0.1, yieldCount: 2, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }] },
    { name: "Золотое кольцо с изумрудом", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Изумруд", qty: 1 }] },
    { name: "Золотое кольцо с сапфиром", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Сапфир", qty: 1 }] },
    { name: "Золотое кольцо с бриллиантом", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Бриллиант", qty: 1 }] },
    { name: "Золотое ожерелье", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }] },
    { name: "Золотое ожерелье с рубином", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Рубин", qty: 1 }] },
    { name: "Золотое ожерелье с бриллиантом", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Бриллиант", qty: 1 }] },
    { name: "Золотое ожерелье с аметистами", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Аметист", qty: 2 }] },
    { name: "Серебряное кольцо", slot: "jewelry", weight: 0.1, yieldCount: 2, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }] },
    { name: "Серебряное кольцо с аметистом", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Аметист", qty: 1 }] },
    { name: "Серебряное кольцо с гранатом", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Гранат", qty: 1 }] },
    { name: "Серебряное кольцо с рубином", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Рубин", qty: 1 }] },
    { name: "Серебряное ожерелье", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }] },
    { name: "Серебряное ожерелье с изумрудом", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Изумруд", qty: 1 }] },
    { name: "Серебряное ожерелье с сапфиром", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Сапфир", qty: 1 }] },
    { name: "Серебряное ожерелье с гранатами", slot: "jewelry", weight: 0.1, yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Гранат", qty: 2 }] }
];
window.jewelryRecipes = jewelryRecipes;

// Рецепты оружия и боеприпасов — те же правила: только то, для чего реально есть рецепт.
// Копья/пики/кастеты/посохи/арбалеты в этой системе не куются вовсе (лут/покупка/квест).
// Рецепты оружия и боеприпасов — те же правила: только то, для чего реально есть рецепт.
// Копья/пики/кастеты/посохи/арбалеты в этой системе не куются вовсе (лут/покупка/квест).
const weaponRecipes = [
    {
        name: "Железный кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 4, weight: 1.0, price: 10, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Стальной кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 5, weight: 2.0, price: 18, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Орочий кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 6, weight: 3.0, price: 30, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Двемерский кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 7, weight: 4.0, price: 55, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эльфийский кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 8, weight: 3.0, price: 95, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 1 }, { name: "Ртутный слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Нордский кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 8, weight: 4.0, price: 115, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Стеклянный кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 9, weight: 3.0, price: 165, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 1 }, { name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эбонитовый кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 10, weight: 4.0, price: 290, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Сталгримовый кинжал", category: "Одноручное", subcat: "Кинжалы",
        damage: 10, weight: 3.0, price: 395, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Железный меч", category: "Одноручное", subcat: "Мечи",
        damage: 7, weight: 3.0, price: 25, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Железный слиток", qty: 2 }]
    },
    {
        name: "Стальной меч", category: "Одноручное", subcat: "Мечи",
        damage: 9, weight: 3.0, price: 45, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Орочий меч", category: "Одноручное", subcat: "Мечи",
        damage: 9, weight: 4.0, price: 75, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Двемерский меч", category: "Одноручное", subcat: "Мечи",
        damage: 10, weight: 5.0, price: 135, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эльфийский меч", category: "Одноручное", subcat: "Мечи",
        damage: 11, weight: 4.0, price: 235, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 1 }, { name: "Ртутный слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Нордский меч", category: "Одноручное", subcat: "Мечи",
        damage: 11, weight: 5.0, price: 290, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Кожа", qty: 1 }, { name: "Стальной слиток", qty: 2 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Стеклянный меч", category: "Одноручное", subcat: "Мечи",
        damage: 12, weight: 5.0, price: 410, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 1 }, { name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эбонитовый меч", category: "Одноручное", subcat: "Мечи",
        damage: 13, weight: 6.0, price: 720, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 2 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Сталгримовый меч", category: "Одноручное", subcat: "Мечи",
        damage: 13, weight: 5.0, price: 985, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Железный боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 8, weight: 4.0, price: 30, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 2 }]
    },
    {
        name: "Стальной боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 9, weight: 5.0, price: 45, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Орочий боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 10, weight: 5.0, price: 90, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Двемерский боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 11, weight: 6.0, price: 165, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эльфийский боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 12, weight: 5.0, price: 280, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 1 }, { name: "Ртутный слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Нордский боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 12, weight: 6.0, price: 350, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 2 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Стеклянный боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 13, weight: 5.0, price: 490, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 1 }, { name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эбонитовый боевой топор", category: "Одноручное", subcat: "Боевые топоры",
        damage: 15, weight: 6.0, price: 865, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 2 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Железная булава", category: "Одноручное", subcat: "Булавы",
        damage: 9, weight: 5.0, price: 35, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 3 }]
    },
    {
        name: "Стальная булава", category: "Одноручное", subcat: "Булавы",
        damage: 10, weight: 5.0, price: 65, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Стальной слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Орочья булава", category: "Одноручное", subcat: "Булавы",
        damage: 11, weight: 5.0, price: 105, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 3 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Двемерская булава", category: "Одноручное", subcat: "Булавы",
        damage: 12, weight: 7.0, price: 190, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эльфийская булава", category: "Одноручное", subcat: "Булавы",
        damage: 13, weight: 5.0, price: 330, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Ртутный слиток", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Нордская булава", category: "Одноручное", subcat: "Булавы",
        damage: 13, weight: 6.0, price: 410, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 1 }, { name: "Стальной слиток", qty: 1 }, { name: "Ртутный слиток", qty: 2 }]
    },
    {
        name: "Стеклянная булава", category: "Одноручное", subcat: "Булавы",
        damage: 14, weight: 5.0, price: 575, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 2 }, { name: "Лунный камень", qty: 1 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Эбонитовая булава", category: "Одноручное", subcat: "Булавы",
        damage: 16, weight: 7.0, price: 1000, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 3 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Сталгримовая булава", category: "Одноручное", subcat: "Булавы",
        damage: 16, weight: 7.0, price: 1375, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 3 }, { name: "Полоски кожи", qty: 1 }]
    },
    {
        name: "Железный двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 16, weight: 6.0, price: 50, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Железный слиток", qty: 4 }]
    },
    {
        name: "Стальной двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 18, weight: 5.0, price: 90, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Стальной слиток", qty: 4 }, { name: "Железный слиток", qty: 2 }]
    },
    {
        name: "Орочий двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 19, weight: 6.0, price: 75, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 4 }, { name: "Железный слиток", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Двемерский двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 20, weight: 7.0, price: 270, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 2 }, { name: "Стальной слиток", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Эльфийский двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 22, weight: 7.0, price: 470, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Ртутный слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Нордский двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 22, weight: 7.0, price: 585, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Стальной слиток", qty: 5 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Стеклянный двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 23, weight: 6.0, price: 820, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 1 }, { name: "Лунный камень", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Эбонитовый двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 24, weight: 8.0, price: 1440, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 5 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Сталгримовый двуручный меч", category: "Двуручное", subcat: "Двуручные мечи",
        damage: 25, weight: 8.0, price: 1970, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 5 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Железная секира", category: "Двуручное", subcat: "Секиры",
        damage: 17, weight: 7.0, price: 55, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Железный слиток", qty: 4 }]
    },
    {
        name: "Стальная секира", category: "Двуручное", subcat: "Секиры",
        damage: 19, weight: 8.0, price: 100, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Орочья секира", category: "Двуручное", subcat: "Секиры",
        damage: 20, weight: 9.0, price: 165, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Двемерская секира", category: "Двуручное", subcat: "Секиры",
        damage: 22, weight: 9.0, price: 300, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 2 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эльфийская секира", category: "Двуручное", subcat: "Секиры",
        damage: 23, weight: 8.0, price: 520, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Ртутный слиток", qty: 1 }, { name: "Железный слиток", qty: 2 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Нордская секира", category: "Двуручное", subcat: "Секиры",
        damage: 23, weight: 8.0, price: 650, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 5 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Стеклянная секира", category: "Двуручное", subcat: "Секиры",
        damage: 24, weight: 9.0, price: 900, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 1 }, { name: "Лунный камень", qty: 2 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Эбонитовая секира", category: "Двуручное", subcat: "Секиры",
        damage: 25, weight: 9.0, price: 1585, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 5 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Сталгримовая секира", category: "Двуручное", subcat: "Секиры",
        damage: 26, weight: 9.0, price: 2150, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 5 }, { name: "Полоски кожи", qty: 2 }]
    },
    {
        name: "Железный боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 19, weight: 13.0, price: 60, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Железный слиток", qty: 5 }]
    },
    {
        name: "Стальной боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 22, weight: 13.0, price: 110, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 2 }, { name: "Стальной слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Орочий боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 23, weight: 13.0, price: 180, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 4 }, { name: "Железный слиток", qty: 1 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Двемерский боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 24, weight: 16.0, price: 325, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Эльфийский боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 25, weight: 14.0, price: 565, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Ртутный слиток", qty: 1 }, { name: "Железный слиток", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Нордский боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 25, weight: 15.0, price: 700, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полоски кожи", qty: 3 }, { name: "Стальной слиток", qty: 5 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Стеклянный боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 26, weight: 14.0, price: 985, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 3 }, { name: "Лунный камень", qty: 2 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Эбонитовый боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 27, weight: 16.0, price: 1725, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 5 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Сталгримовый боевой молот", category: "Двуручное", subcat: "Молоты",
        damage: 28, weight: 15.0, price: 2850, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 5 }, { name: "Полоски кожи", qty: 3 }]
    },
    {
        name: "Огненная стрела", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 1, weight: 0.08, price: 280, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Огненная соль", qty: 2 }, { name: "Железная стрела", qty: 20 }]
    },
    {
        name: "Морозная стрела", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 10, weight: 0.08, price: 350, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Морозная соль", qty: 2 }, { name: "Железная стрела", qty: 20 }]
    },
    {
        name: "Электрическая стрела", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 0, weight: 0.08, price: 400, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Соль пустоты", qty: 2 }, { name: "Железная стрела", qty: 20 }]
    },
    {
        name: "Ядовитая стрела", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 20, weight: 0.08, price: 220, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Корень Нирна", qty: 10 }, { name: "Железная стрела", qty: 20 }]
    },
    {
        name: "Стрела крови", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 3, weight: 0.08, price: 210, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Прах вампира", qty: 1 }, { name: "Железная стрела", qty: 20 }]
    },
    {
        name: "Серебрянная стрела", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 9, weight: 0.04, price: 4, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Серебряный слиток", qty: 1 }]
    },
    {
        name: "Стрела из трольей кости", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 11, weight: 0.04, price: 3, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Череп тролля", qty: 1 }]
    },
    {
        name: "Стрела из мамонтовой кости", category: "Стрелы", subcat: "Стрелы (эффект)",
        damage: 15, weight: 0.04, price: 5, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Бивень мамонта", qty: 1 }]
    },
    {
        name: "Железная стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 8, weight: 0.04, price: 1, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Стальная стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 10, weight: 0.04, price: 2, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Стальной слиток", qty: 1 }]
    },
    {
        name: "Орочья стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 12, weight: 0.08, price: 3, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Орихалковый слиток", qty: 1 }]
    },
    {
        name: "Двемерская стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 14, weight: 0.08, price: 4, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Двемерский слиток", qty: 1 }]
    },
    {
        name: "Нордская стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 14, weight: 0.08, price: 4, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Железный слиток", qty: 1 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Эльфийская стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 16, weight: 0.04, price: 5, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Лунный камень", qty: 1 }]
    },
    {
        name: "Стеклянная стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 18, weight: 0.04, price: 6, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Малахитовый слиток", qty: 1 }]
    },
    {
        name: "Эбонитовая стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 20, weight: 0.08, price: 7, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Эбонитовый слиток", qty: 1 }]
    },
    {
        name: "Древненордская стрела героя", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 23, weight: 0.08, price: 8, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Эбонитовый слиток", qty: 1 }]
    },
    {
        name: "Сталгримовая стрела", category: "Стрелы", subcat: "Стрелы (материал)",
        damage: 20, weight: 0.04, price: 7, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 1 }, { name: "Полено", qty: 1 }]
    },
    {
        name: "Стальной болт", category: "Болты", subcat: "Болты",
        damage: 10, weight: 0.1, price: 3, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Стальной слиток", qty: 1 }]
    },
    {
        name: "Двемерский болт", category: "Болты", subcat: "Болты",
        damage: 14, weight: 0.1, price: 5, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Двемерский слиток", qty: 1 }]
    },
    {
        name: "Стальной болт огня", category: "Болты", subcat: "Болты",
        damage: 10, weight: 0.1, price: 100, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Огненная соль", qty: 2 }, { name: "Стальной болт", qty: 20 }]
    },
    {
        name: "Стальной болт льда", category: "Болты", subcat: "Болты",
        damage: 10, weight: 0.1, price: 100, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Морозная соль", qty: 2 }, { name: "Стальной болт", qty: 20 }]
    },
    {
        name: "стальной болт электричества", category: "Болты", subcat: "Болты",
        damage: 10, weight: 0.1, price: 100, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Соль пустоты", qty: 2 }, { name: "Стальной болт", qty: 20 }]
    },
    {
        name: "стальной болт яда", category: "Болты", subcat: "Болты",
        damage: 20, weight: 0.1, price: 100, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Паслен", qty: 20 }, { name: "Стальной болт", qty: 20 }]
    },
    {
        name: "двемерский болт огня", category: "Болты", subcat: "Болты",
        damage: 15, weight: 0.1, price: 140, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Огненная соль", qty: 2 }, { name: "Двемерский болт", qty: 20 }]
    },
    {
        name: "двемерский болт льда", category: "Болты", subcat: "Болты",
        damage: 15, weight: 0.1, price: 140, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Морозная соль", qty: 2 }, { name: "Двемерский болт", qty: 20 }]
    },
    {
        name: "двемерскийболт электричества", category: "Болты", subcat: "Болты",
        damage: 15, weight: 0.1, price: 140, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Соль пустоты", qty: 2 }, { name: "Двемерский болт", qty: 20 }]
    },
    {
        name: "двемерский болт яда", category: "Болты", subcat: "Болты",
        damage: 24, weight: 0.1, price: 140, slot: null, isAmmo: true,
        yieldCount: 20, perkHint: null,
        ingredients: [{ name: "Паслен", qty: 20 }, { name: "Двемерский болт", qty: 20 }]
    },
    {
        name: "Серебрянный болт", category: "Болты", subcat: "Болты",
        damage: 12, weight: 0.1, price: 5, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: null,
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Серебряный слиток", qty: 1 }]
    },
    {
        name: "Эльфийский болт", category: "Болты", subcat: "Болты",
        damage: 14, weight: 0.1, price: 6, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Лунный камень", qty: 1 }]
    },
    {
        name: "Орочий болт", category: "Болты", subcat: "Болты",
        damage: 15, weight: 0.1, price: 5, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Орихалковый слиток", qty: 1 }]
    },
    {
        name: "сталгримовый", category: "Болты", subcat: "Болты",
        damage: 18, weight: 0.1, price: 8, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 1 }, { name: "Полено", qty: 1 }]
    },
    {
        name: "эбонитовый", category: "Болты", subcat: "Болты",
        damage: 20, weight: 0.1, price: 8, slot: null, isAmmo: true,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Полено", qty: 1 }, { name: "Эбонитовый слиток", qty: 1 }]
    },
    {
        name: "Орочий лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 11, weight: 4.0, price: 150, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Орочьи доспехи",
        ingredients: [{ name: "Орихалковый слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }]
    },
    {
        name: "Двемерский лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 13, weight: 7.0, price: 270, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Двемерские доспехи",
        ingredients: [{ name: "Двемерский слиток", qty: 2 }, { name: "Железный слиток", qty: 1 }, { name: "Стальной слиток", qty: 1 }]
    },
    {
        name: "Эльфийский лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 14, weight: 5.0, price: 470, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эльфийские доспехи",
        ingredients: [{ name: "Лунный камень", qty: 2 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Нордский лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 14, weight: 5.0, price: 580, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стальные доспехи",
        ingredients: [{ name: "Стальной слиток", qty: 3 }, { name: "Ртутный слиток", qty: 1 }]
    },
    {
        name: "Эбонитовый лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 18, weight: 6.0, price: 1440, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Эбонитовый слиток", qty: 3 }]
    },
    {
        name: "Стеклянный лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 16, weight: 4.0, price: 820, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Стеклянные доспехи",
        ingredients: [{ name: "Малахитовый слиток", qty: 2 }, { name: "Лунный камень", qty: 1 }]
    },
    {
        name: "Сталгримовый лук", category: "Луки", subcat: "Луки (обычные)",
        damage: 18, weight: 6.0, price: 1800, slot: 'melee', isAmmo: false,
        yieldCount: 1, perkHint: "Эбонитовые доспехи",
        ingredients: [{ name: "Сталгрим", qty: 3 }]
    }
];
window.weaponRecipes = weaponRecipes;
