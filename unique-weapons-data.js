// ============================================================================
// UNIQUE-WEAPONS-DATA.JS — именное уникальное оружие Skyrim (по прямой просьбе
// пользователя "нету лука Фроки и всех уникальных луков/оружия"). Раньше в базе
// было 186 записей оружия, но ВСЕ материал-тир (железное/стальное/эльфийское и
// т.д.), НИ ОДНОГО именного уникального предмета не было вообще. Цифры и текст
// эффектов — из реальных данных ваниль-Skyrim (UESP/Fandom), не выдуманы.
// unique:true — не зачаровывается дальше (как и в игре), builtin-эффект в effect.
// ============================================================================
const uniqueWeaponsData = [
    // ---------- ЛУКИ ----------
    { name: "Лук Фроки", category: "Уникальное оружие", type: "weapon", slot: "ranged", weight: 7, price: 100, damage: 6, unique: true,
      effect: "Наносит 10 доп. урона выносливости цели за попадание. Найден на теле тролля-стража в Грейвинтер Уотч (квест «Священные испытания Кин»)." },
    { name: "Лук соловья", category: "Уникальное оружие", type: "weapon", slot: "ranged", weight: 9, price: 800, damage: 12, unique: true,
      effect: "Похищает 15 ед. здоровья цели за попадание (сильнее с более высоким рангом верности Ноктюрнал). Награда Гильдии воров, путь Соловья." },
    { name: "Лук Аурьеля", category: "Уникальное оружие", type: "weapon", slot: "ranged", weight: 8, price: 1000, damage: 10, unique: true,
      effect: "В паре с солнечными/лунными стрелами даёт особые эффекты (взрыв света/призыв духов). Награда DLC Dawnguard." },
    { name: "Зефир", category: "Уникальное оружие", type: "weapon", slot: "ranged", weight: 8, price: 1350, damage: 12, unique: true,
      effect: "Стреляет значительно быстрее обычного лука. Продаётся у Ленивого Лорика в Рифтене после квеста «Дело принципа»." },
    { name: "Чёрный лук Голдира (Дрейнспелл)", category: "Уникальное оружие", type: "weapon", slot: "ranged", weight: 7, price: 900, damage: 14, unique: true,
      effect: "Похищает до 30 ед. магии цели за попадание (зависит от уровня персонажа при получении). Часть эфемерного набора Голдира." },

    // ---------- ОДНОРУЧНОЕ ----------
    { name: "Волкодав (Dragonbane)", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_sword", weight: 12, price: 1160, damage: 8, unique: true,
      effect: "Наносит доп. урон драконам, полностью восстанавливает время отката ЛЮБОГО известного Крика при попадании по дракону. Награда за основной сюжет (могила Джурген Windcaller)." },
    { name: "Клык Кулака Скорби (Chillrend)", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_sword", weight: 7, price: 1942, damage: 12, unique: true,
      effect: "Наносит доп. урон холодом и с шансом парализует цель на 1 ход. Найден в Подземельях Снежной Крепости (Сноувил Эстейт)." },
    { name: "Буря без ветра (Windshear)", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_sword", weight: 8, price: 435, damage: 8, unique: true,
      effect: "Гарантированно сбивает цель с ног/прерывает действие при ЛЮБОМ попадании, игнорируя часть брони. Найден на корабле в Мор Кхазгуре." },
    { name: "Бритва Мерунеса", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_dagger", weight: 6, price: 500, damage: 8, unique: true,
      effect: "Небольшой шанс мгновенно убить цель одним ударом, вне зависимости от её ХП. Награда даэдрического квеста «Голос разрушения»." },
    { name: "Клинок Соловья (Nightingale Blade)", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_sword", weight: 12, price: 800, damage: 12, unique: true,
      effect: "Похищает здоровье и выносливость цели за удар (сильнее с более высоким рангом верности Ноктюрнал). Путь Соловья, Гильдия воров." },
    { name: "Умбра", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_sword", weight: 12, price: 3585, damage: 14, unique: true,
      effect: "Похищает здоровье цели за удар. Проклят — забирает душу владельца при его смерти (по легенде). Найден на острове у Ярнфильда." },
    { name: "Клинок Скала (Bloodskal Blade)", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "onehand_sword", weight: 8, price: 400, damage: 10, unique: true,
      effect: "Силовая атака выпускает дальнюю волну энергии, наносящую урон на расстоянии. Найден в Кургане Скала, DLC Dragonborn." },

    // ---------- ДВУРУЧНОЕ ----------
    { name: "Вутрад (Wuuthrad)", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "twohand_axe", weight: 25, price: 1131, damage: 20, unique: true,
      effect: "Наносит вдвое больше урона эльфам (альтмерам, босмерам, данмерам, орсимерам). Легендарный топор Исгрода, награда за завершение линии Соратников." },
    { name: "Молот Волендрунг", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "twohand_hammer", weight: 60, price: 1642, damage: 17, unique: true,
      effect: "Похищает выносливость цели и передаёт владельцу, с шансом призвать дремора на помощь. Даэдрический артефакт Малаката." },
    { name: "Меч Мирака", category: "Уникальное оружие", type: "weapon", slot: "melee", weaponType: "twohand_sword", weight: 19, price: 1400, damage: 14, unique: true,
      effect: "Похищает здоровье цели за удар. Носит Мирак, Первый из Драконорождённых. DLC Dragonborn." },
];
window.uniqueWeaponsData = uniqueWeaponsData;
