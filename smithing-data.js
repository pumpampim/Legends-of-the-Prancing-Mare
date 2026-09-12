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
    "Серебряный слиток": { price: 25, weight: 1 }
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
    { name: "Золотое кольцо", slot: "jewelry", yieldCount: 2, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }] },
    { name: "Золотое кольцо с изумрудом", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Изумруд", qty: 1 }] },
    { name: "Золотое кольцо с сапфиром", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Сапфир", qty: 1 }] },
    { name: "Золотое кольцо с бриллиантом", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Бриллиант", qty: 1 }] },
    { name: "Золотое ожерелье", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }] },
    { name: "Золотое ожерелье с рубином", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Рубин", qty: 1 }] },
    { name: "Золотое ожерелье с бриллиантом", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Бриллиант", qty: 1 }] },
    { name: "Золотое ожерелье с аметистами", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Золотой слиток", qty: 1 }, { name: "Аметист", qty: 2 }] },
    { name: "Серебряное кольцо", slot: "jewelry", yieldCount: 2, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }] },
    { name: "Серебряное кольцо с аметистом", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Аметист", qty: 1 }] },
    { name: "Серебряное кольцо с гранатом", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Гранат", qty: 1 }] },
    { name: "Серебряное кольцо с рубином", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Рубин", qty: 1 }] },
    { name: "Серебряное ожерелье", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }] },
    { name: "Серебряное ожерелье с изумрудом", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Изумруд", qty: 1 }] },
    { name: "Серебряное ожерелье с сапфиром", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Сапфир", qty: 1 }] },
    { name: "Серебряное ожерелье с гранатами", slot: "jewelry", yieldCount: 1, perkHint: null, ingredients: [{ name: "Серебряный слиток", qty: 1 }, { name: "Гранат", qty: 2 }] }
];
window.jewelryRecipes = jewelryRecipes;
