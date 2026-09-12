// ============================================================================
// ENCHANT-DATA.JS — эффекты зачарования брони/оружия + калькулятор силы
// Формула подтверждена пользователем: maxValue × %камня_душ × (навык/100)
// ============================================================================

// Сила зачарования базовой брони/оружия = maxValue × %камня_душ × (навык "Зачарование"/100)
// Камни душ: Крохотный 25%, Маленький 50%, Обычный 100%, Большой 125%, Великий 150%.
const soulGemPower = { "Крохотный": 0.25, "Маленький": 0.5, "Обычный": 1.0, "Большой": 1.25, "Великий": 1.5 };

const enchantArmorEffects = [
    { name: "Повышение навыка:«Блокирование»", slots: ["gauntlets", "shield", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "эффективнее от базового значения брони щита" },
    { name: "Повышение навыка:«Взлом»", slots: ["helmet", "gauntlets", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "Каждые 10% зачарования +1 к кубам" },
    { name: "Повышение навыка:«Восстановление»", slots: ["helmet", "armor", "amulet", "ring"], maxValue: 25.0, unit: "%", description: "Заклинания школы на х% сильнее" },
    { name: "Повышение навыка: «Двуручное оружие»", slots: ["gauntlets", "boots", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "эффективнее от базового значения атаки оружия" },
    { name: "Повышение навыка:«Изменение»", slots: ["helmet", "armor", "amulet", "ring"], maxValue: 25.0, unit: "%", description: "Заклинания школы на х% сильнее" },
    { name: "Повышение навыка:«Иллюзия»", slots: ["helmet", "armor", "amulet", "ring"], maxValue: 25.0, unit: "%", description: "Заклинания школы на х% сильнее" },
    { name: "Повышение навыка: «Карманные кражи»", slots: ["gauntlets", "boots", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "Каждые 10% зачарования +1 к кубам" },
    { name: "Повышение навыка:«Колдовство»", slots: ["helmet", "armor", "amulet", "ring"], maxValue: 25.0, unit: "%", description: "Заклинания школы на х% сильнее" },
    { name: "Повышение навыка:«Одноручное оружие»", slots: ["gauntlets", "boots", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "эффективнее от базового значения атаки оружия" },
    { name: "Повышение навыка:«Разрушение»", slots: ["helmet", "armor", "amulet", "ring"], maxValue: 25.0, unit: "%", description: "Заклинания школы на х% сильнее" },
    { name: "Повышение навыка:«Стрельба»", slots: ["helmet", "gauntlets", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "эффективнее от базового значения атаки оружия" },
    { name: "Повышение навыка:«Скрытность»", slots: ["gauntlets", "boots", "amulet", "ring"], maxValue: 40.0, unit: "%", description: "Каждые 10% зачарования +1 к кубам" },
    { name: "Повышение навыка:«Тяжёлая броня»", slots: ["armor", "gauntlets", "amulet", "ring"], maxValue: 35, unit: "брони", description: "увеличение класса брони" },
    { name: "Повышение навыка: «Легкая броня»", slots: ["armor", "gauntlets", "amulet", "ring"], maxValue: 25, unit: "брони", description: "увеличение класса брони" },
    { name: "Повышение искусства торговли", slots: ["amulet"], maxValue: 25.0, unit: "%", description: "цены выгоднее" },
    { name: "Водное дыхание", slots: ["helmet", "amulet"], maxValue: null, unit: "", description: "Возможность дышать под водой" },
    { name: "Приглушение шагов", slots: ["boots"], maxValue: null, unit: "", description: "Ваши шаги не издают звука" },
    { name: "Повышение переносимого веса", slots: ["gauntlets", "boots", "amulet", "ring"], maxValue: 37, unit: "", description: "Повышение переносимого веса" },
    { name: "Повышение здоровья", slots: ["armor", "shield", "amulet", "ring"], maxValue: 62, unit: "", description: "Повышение здоровья" },
    { name: "Повышение магии", slots: ["amulet", "ring"], maxValue: 62, unit: "", description: "Повышение мана пула" },
    { name: "Сопротивление болезням", slots: ["armor", "amulet", "ring"], maxValue: 62.0, unit: "%", description: "Сопротивление к возможности заболеть" },
    { name: "Сопротивление магии", slots: ["helmet", "gauntlets", "boots", "shield", "amulet", "ring"], maxValue: 20, unit: "%", description: "Сопротивление к урону магией" },
    { name: "Сопротивление огню", slots: ["boots", "shield", "amulet", "ring"], maxValue: 37, unit: "%", description: "Сопротивление к урону огнем" },
    { name: "Сопротивление холоду", slots: ["boots", "shield", "amulet", "ring"], maxValue: 37, unit: "%", description: "Сопротивление к урону холодом" },
    { name: "Сопротивление электричеству", slots: ["boots", "shield", "amulet", "ring"], maxValue: 37, unit: "%", description: "Сопротивление к урону электричеством" },
    { name: "Сопротивление яду", slots: ["armor", "shield", "amulet", "ring"], maxValue: 37, unit: "%", description: "Сопротивление к урону ядом" },
    { name: "Усиление рукопашного боя", slots: ["armor", "ring"], maxValue: 20, unit: "", description: "При атаках перчатками добавляется ввиде доп урона к классу брони перчаток" },
    { name: "Повышение навыка: «Алхимия»", slots: ["helmet", "gauntlets", "amulet", "ring"], maxValue: 24, unit: "", description: "Повышает навык Алхимии " }
];

const enchantWeaponEffects = [
    { name: "Урон огнем", maxValue: 20, unit: "урона", description: "Дополнительный урон огнем" },
    { name: "Урон холодом", maxValue: 20, unit: "урона", description: "Дополнительный урон холодом" },
    { name: "Урон электричеством", maxValue: 20, unit: "урона", description: "Дополнительный урон электричеством" },
    { name: "Паралич", maxValue: 1, unit: "ход", description: "Противник до 17 лвла паралезуется" },
    { name: "Страх", maxValue: 1, unit: "ход", description: "Противник до 17 лвла впадает в страх" },
    { name: "Захват души", maxValue: null, unit: "", description: "Захватывает душу и заполняет камень души" }
];

// Возвращает {value, unit} — величину эффекта при данных камне душ и навыке Зачарования (0-100+).
function calcEnchantPower(effect, soulGemName, enchantSkill) {
    if (effect.maxValue === null) return { value: null, unit: effect.unit, boolean: true };
    const gemPct = soulGemPower[soulGemName] || 0;
    const skillFrac = (enchantSkill || 0) / 100;
    const value = effect.maxValue * gemPct * skillFrac;
    return { value: Math.round(value * 100) / 100, unit: effect.unit, boolean: false };
}

window.soulGemPower = soulGemPower;
window.enchantArmorEffects = enchantArmorEffects;
window.enchantWeaponEffects = enchantWeaponEffects;
window.calcEnchantPower = calcEnchantPower;
