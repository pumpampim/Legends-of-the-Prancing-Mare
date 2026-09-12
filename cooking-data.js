// ============================================================================
// COOKING-DATA.JS — ингредиенты и рецепты (из листа «Кулинария и еда»)
// ============================================================================

const cookingIngredients = {
    "Сырая": { price: 0, weight: 0, category: "Еда (сырое)" },
    "Куриная грудка": { price: 3, weight: 0.2, category: "Еда (сырое)" },
    "Мясо устрицы": { price: 1, weight: 0.1, category: "Еда (сырое)" },
    "Собачатина": { price: 3, weight: 0.2, category: "Еда (сырое)" },
    "Мясо хоркера": { price: 3, weight: 1.0, category: "Еда (сырое)" },
    "Конина": { price: 3, weight: 2.0, category: "Еда (сырое)" },
    "Козий окорок": { price: 3, weight: 1.0, category: "Еда (сырое)" },
    "Хобот мамонта": { price: 6, weight: 3.0, category: "Еда (сырое)" },
    "Фазанья грудка": { price: 3, weight: 0.2, category: "Еда (сырое)" },
    "Сырая говядина": { price: 4, weight: 0.2, category: "Еда (сырое)" },
    "Сырая кроличья ножка": { price: 2, weight: 0.1, category: "Еда (сырое)" },
    "Лососина": { price: 3, weight: 0.1, category: "Еда (сырое)" },
    "Оленина": { price: 4, weight: 2.0, category: "Еда (сырое)" },
    "Капуста": { price: 2, weight: 0.25, category: "Еда (сырое)" },
    "Морковь": { price: 1, weight: 0.1, category: "Еда (сырое)" },
    "Тыква": { price: 1, weight: 0.2, category: "Еда (сырое)" },
    "Зелёное яблоко": { price: 3, weight: 0.1, category: "Еда (сырое)" },
    "Лук-порей": { price: 1, weight: 0.1, category: "Еда (сырое)" },
    "Картофель": { price: 1, weight: 0.1, category: "Еда (сырое)" },
    "Красное яблоко": { price: 3, weight: 0.1, category: "Еда (сырое)" },
    "Помидор": { price: 4, weight: 0.1, category: "Еда (сырое)" },
    "Мясо кабана": { price: 2, weight: 1.0, category: "Еда (сырое)" },
    "Мясо пепельного прыгуна": { price: 2, weight: 2.0, category: "Еда (сырое)" },
    "Нога пепельного прыгуна": { price: 2, weight: 1.0, category: "Еда (сырое)" },
    "Пепельный батат": { price: 1, weight: 10.0, category: "Еда (сырое)" },
    "Яблочный пирог": { price: 5, weight: 0.5, category: "Готовый продукт" },
    "Печёный картофель": { price: 2, weight: 0.1, category: "Готовый продукт" },
    "Пирожное с заварным кремом": { price: 4, weight: 0.5, category: "Готовый продукт" },
    "Хлеб": { price: 2, weight: 0.2, category: "Готовый продукт" },
    "Капустный суп": { price: 5, weight: 0.5, category: "Готовый продукт" },
    "Кусок эйдарского сыра": { price: 5, weight: 0.25, category: "Готовый продукт" },
    "Круг эйдарского сыра": { price: 13, weight: 2.0, category: "Готовый продукт" },
    "Кусок козьего сыра": { price: 5, weight: 0.25, category: "Готовый продукт" },
    "Круг козьего сыра": { price: 10, weight: 2.0, category: "Готовый продукт" },
    "Жареный лук-порей": { price: 2, weight: 0.1, category: "Готовый продукт" },
    "Орехи в меду": { price: 2, weight: 0.1, category: "Готовый продукт" },
    "Жареная рыба-убийца": { price: 5, weight: 0.1, category: "Готовый продукт" },
    "Початый круг эйдарского сыра": { price: 10, weight: 2.0, category: "Готовый продукт" },
    "Початый круг козьего сыра": { price: 8, weight: 2.0, category: "Готовый продукт" },
    "Сладкий рулет": { price: 2, weight: 0.1, category: "Готовый продукт" },
    "Вареное мясо кабана": { price: 15, weight: 0, category: "Готовый продукт" },
    "Черновересковый мёд": { price: 25, weight: 0.2, category: "Напиток" },
    "Мёд Хоннинга": { price: 20, weight: 0.5, category: "Напиток" },
    "Вино «Алто»": { price: 12, weight: 0.5, category: "Напиток" },
    "Нордский мёд": { price: 5, weight: 0.5, category: "Напиток" },
    "Коловианский бренди": { price: 100, weight: 0.5, category: "Напиток" },
    "Огненное вино": { price: 137, weight: 0.5, category: "Напиток" },
    "Вино": { price: 7, weight: 0.5, category: "Напиток" },
    "Пряное вино": { price: 7, weight: 0.5, category: "Напиток" },
    "Строс М'Кайский ром": { price: 12, weight: 0.5, category: "Напиток" },
    "Черновересковый мёд отборный": { price: 100, weight: 0.5, category: "Напиток" },
    "Мед с можжевеловыми ягодами": { price: 5, weight: 0.5, category: "Напиток" },
    "Аргонианский эль": { price: 5, weight: 2.0, category: "Напиток" },
    "Вино Джесики": { price: 12, weight: 0.5, category: "Напиток" },
    "Зольный мед(алко)": { price: 50, weight: 2.0, category: "Напиток" },
    "Мацт": { price: 5, weight: 2.0, category: "Напиток" },
    "Суджамма": { price: 10, weight: 2.0, category: "Напиток" },
    "Угольное вино": { price: 15, weight: 2.0, category: "Напиток" },
    "Флин": { price: 15, weight: 2.0, category: "Напиток" },
    "Шейн": { price: 10, weight: 2.0, category: "Напиток" },
    "Красноводная скума": { price: 75, weight: 2.0, category: "Напиток" },
    "Зелье крови": { price: 100, weight: 2.0, category: "Напиток" },
    "Кувшин молока": { price: 2, weight: 1.0, category: "Напиток" },
    "Белянка": { price: 2, weight: 0.333, category: "Алхимия (для готовки)" },
    "Лаванда": { price: 2, weight: 0.1, category: "Алхимия (для готовки)" },
    "Лунный сахар": { price: 50, weight: 0.333, category: "Алхимия (для готовки)" },
    "Лютый гриб": { price: 12, weight: 0.2, category: "Алхимия (для готовки)" },
    "Мора тапинелла": { price: 4, weight: 0.333, category: "Алхимия (для готовки)" },
    "Чеснок": { price: 1, weight: 0.333, category: "Алхимия (для готовки)" },
    "Соль": { price: 2.0, weight: 0.2, category: "Бытовое (для готовки)" },
    "Мешок муки": { price: 1.0, weight: 0.5, category: "Бытовое (для готовки)" }
};

const recipes = [
    {
        name: "Капустный суп с картошкой",
        weight: 0.5,
        price: 25,
        needsWater: true,
        ingredients: [{ name: "Соль", qty: 2 }, { name: "Картофель", qty: 3 }, { name: "Лук-порей", qty: 2 }, { name: "Капуста", qty: 2 }],
        effect: "+20 хп на 45 ходов"
    },
    {
        name: "Томатный суп",
        weight: 0.5,
        price: 25,
        needsWater: true,
        ingredients: [{ name: "Соль", qty: 2 }, { name: "Помидор", qty: 3 }, { name: "Чеснок", qty: 1 }, { name: "Лук-порей", qty: 2 }],
        effect: "+10 урона заклинаний заклинания на 45 ходов"
    },
    {
        name: "Похлёбка из капусты и яблок",
        weight: 0.5,
        price: 25,
        needsWater: true,
        ingredients: [{ name: "Соль", qty: 1 }, { name: "Красное яблоко", qty: 3 }, { name: "Капуста", qty: 2 }],
        effect: "+10 урона для атак ближнего боя на 45 ходов"
    },
    {
        name: "Говяжья похлёбка",
        weight: 0.5,
        price: 28,
        needsWater: true,
        ingredients: [{ name: "Соль", qty: 2 }, { name: "Сырая говядина", qty: 1 }, { name: "Морковь", qty: 2 }, { name: "Чеснок", qty: 1 }],
        effect: "+20 хп на 45 ходов"
    },
    {
        name: "Овощной суп",
        weight: 0.5,
        price: 25,
        needsWater: true,
        ingredients: [{ name: "Капуста", qty: 2 }, { name: "Картофель", qty: 3 }, { name: "Лук-порей", qty: 2 }, { name: "Помидор", qty: 2 }],
        effect: "+10% к сопротивлению ядам на 45 ходов"
    },
    {
        name: "Похлёбка из оленины",
        weight: 0.5,
        price: 28,
        needsWater: true,
        ingredients: [{ name: "Соль", qty: 2 }, { name: "Оленина", qty: 1 }, { name: "Картофель", qty: 3 }, { name: "Лук-порей", qty: 2 }],
        effect: "+5 к скорости на 45 ходов"
    },
    {
        name: "Похлёбка из хоркера",
        weight: 0.5,
        price: 28,
        needsWater: true,
        ingredients: [{ name: "Лаванда", qty: 1 }, { name: "Помидор", qty: 3 }, { name: "Чеснок", qty: 1 }, { name: "Мясо хоркера", qty: 1 }],
        effect: "+20 к брони на 45 ходов"
    },
    {
        name: "Эльсвейрcкое фондю",
        weight: 0.5,
        price: 25,
        needsWater: false,
        ingredients: [{ name: "Круг эйдарского сыра", qty: 2 }, { name: "Лунный сахар", qty: 1 }],
        effect: "Запас магии увеличен на 25 на 45 ходов"
    },
    {
        name: "Суп из молюсков",
        weight: 0.5,
        price: 25,
        needsWater: true,
        ingredients: [{ name: "Картофель", qty: 2 }, { name: "Мясо устрицы", qty: 3 }, { name: "Соль", qty: 1 }],
        effect: "шанс 10 % поглотить заклинания на 45 ходов"
    },
    {
        name: "Чесночный хлеб",
        weight: 0.5,
        price: 25,
        needsWater: false,
        ingredients: [{ name: "Хлеб", qty: 1 }, { name: "Чеснок", qty: 1 }],
        effect: "+25% сопротивления к болезням на 45 ходов"
    },
    {
        name: "Булка плетенка",
        weight: 0.5,
        price: 25,
        needsWater: true,
        ingredients: [{ name: "Мешок муки", qty: 2 }, { name: "Соль", qty: 1 }],
        effect: "+20 переносимого веса на 45 ходов"
    },
    {
        name: "Картофельный хлеб",
        weight: 0.5,
        price: 25,
        needsWater: false,
        ingredients: [{ name: "Хлеб", qty: 1 }, { name: "Картофель", qty: 1 }, { name: "Соль", qty: 1 }],
        effect: "+20% сопротивления к ядам на 45 ходов"
    },
    {
        name: "Слойка с яблоками",
        weight: 0.5,
        price: 35,
        needsWater: false,
        ingredients: [{ name: "Мешок муки", qty: 1 }, { name: "Зелёное яблоко", qty: 2 }, { name: "Красное яблоко", qty: 2 }],
        effect: "+10 к урону через броню на 45 ходов"
    },
    {
        name: "Слойка с ланвандой",
        weight: 0.5,
        price: 35,
        needsWater: false,
        ingredients: [{ name: "Мешок муки", qty: 1 }, { name: "Лунный сахар", qty: 2 }, { name: "Лаванда", qty: 2 }],
        effect: "+10% сопротивления к магии на 45 ходов"
    },
    {
        name: "Слойка с курцей",
        weight: 0.5,
        price: 35,
        needsWater: false,
        ingredients: [{ name: "Мешок муки", qty: 1 }, { name: "Куриная грудка", qty: 2 }, { name: "Лук-порей", qty: 2 }, { name: "Чеснок", qty: 1 }, { name: "Соль", qty: 1 }],
        effect: "+5% к физическому урону на 45 ходов"
    },
    {
        name: "Пирог с виноградом",
        weight: 1,
        price: 40,
        needsWater: false,
        ingredients: [{ name: "Мешок муки", qty: 1 }],
        effect: "+10% сопротивления к огню на 45 ходов"
    },
    {
        name: "Пирог с снежными ягодами",
        weight: 1,
        price: 40,
        needsWater: false,
        ingredients: [{ name: "Мешок муки", qty: 1 }],
        effect: "+10% сопротивления к холоду на 45 ходов"
    },
    {
        name: "Пирог с можевельником",
        weight: 1,
        price: 40,
        needsWater: false,
        ingredients: [{ name: "Мешок муки", qty: 1 }],
        effect: "+10% сопротивления к электричеству на 45 ходов"
    },
    {
        name: "Похлёбка из лютого гриба",
        weight: 0.5,
        price: 40,
        needsWater: false,
        ingredients: [{ name: "Лютый гриб", qty: 1 }, { name: "Чеснок", qty: 1 }, { name: "Кувшин молока", qty: 1 }],
        effect: "+20 хп на 45 ходов"
    },
    {
        name: "Похлёбка из белянки",
        weight: 0.5,
        price: 40,
        needsWater: false,
        ingredients: [{ name: "Белянка", qty: 1 }, { name: "Чеснок", qty: 1 }, { name: "Кувшин молока", qty: 1 }],
        effect: "+30 мп на 45 ходов"
    },
    {
        name: "Похлёбка из мора тапинеллы",
        weight: 0.5,
        price: 40,
        needsWater: false,
        ingredients: [{ name: "Мора тапинелла", qty: 1 }, { name: "Чеснок", qty: 1 }, { name: "Кувшин молока", qty: 1 }],
        effect: "5 к скорости на 45 ходов"
    }
];

// Блюдо, которое получится, если игрок готовит без рецепта / не угадал состав.
// Источник: свод правил, раздел "Кулинария и еда".
const failedDish = { name: "Похлёбка", weight: 1, price: 0, effect: "+10 хп на 45 ходов" };

window.cookingIngredients = cookingIngredients;
window.recipes = recipes;
window.failedDish = failedDish;
