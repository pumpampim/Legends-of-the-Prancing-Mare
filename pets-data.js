// ============================================================================
// PETS-DATA.JS — животные, которых игроки покупают у продавцов (не боевые спутники).
// Здоровье собаки, злокрыса и паука берётся из базы врагов (как у волка, злокрыса и морозного паука), чтобы
// при правке enemies-data.js цифры не расходились; запасное значение — на случай, если базы нет на странице.
// sellers — где продаются: city (город, как его ставит мастер на карте: partyPos.name) и hold (владение,
// как в holds-data.js / session.currentHold). loot — что выпадает с мёртвого животного (имена из базы предметов).
// rideable — на животном можно ехать верхом (галочка «Верхом»: +15 скорости, +100 к весу, урон 70/30).
// Своих животных мастер добавляет на экране мастера («🐾 Животные и питомцы») — они приходят в сессию.
// ============================================================================
(function () {
    const hpOf = (enemyName, fallback) => {
        const e = (window.enemiesData || []).find(x => x.name === enemyName);
        return e && e.hp ? parseInt(e.hp) : fallback;
    };
    const STABLES = [
        { city: 'Вайтран', hold: 'Вайтран' },
        { city: 'Солитьюд', hold: 'Солитьюд (Хаафингар)' },
        { city: 'Виндхельм', hold: 'Истмарк (Виндхельм)' },
        { city: 'Маркарт', hold: 'Маркарт (Предел)' },
        { city: 'Рифтен', hold: 'Рифт' }
    ];
    window.PET_TEMPLATES = [
        { id: 'dog', icon: '🐕', name: 'Собака', kind: 'Собака', get hp() { return hpOf('Волк', 50); }, price: 500,
          sellers: [{ city: 'Маркарт', hold: 'Маркарт (Предел)', who: 'Продавец собак' }],
          loot: [{ name: 'Волчья шкура', qty: 1 }], rideable: false },
        { id: 'skeever', icon: '🐀', name: 'Злокрыс', kind: 'Злокрыс', get hp() { return hpOf('Злокрыс', 20); }, price: 200,
          sellers: [{ city: 'Морфал', hold: 'Хьялмарк (Морфал)', who: 'Продавец злокрысов' }],
          loot: [{ name: 'Хвост злокрыса', qty: 1 }], rideable: false },
        { id: 'frostspider', icon: '🕷️', name: 'Морозный паук', kind: 'Морозный паук', get hp() { return hpOf('Морозный паук', 100); }, price: 500,
          sellers: [{ city: 'Рифтен', hold: 'Рифт', who: 'Продавец морозных пауков' }],
          // «Яд обморожения» паука в базе предметов отдельным ингредиентом нет — ближайший готовый яд из алхимии.
          loot: [{ name: 'Яд: Урон здоровью (Базовое)', qty: 1 }], rideable: false },
        { id: 'horse', icon: '🐎', name: 'Лошадь', kind: 'Лошадь', hp: 250, price: 1000,
          sellers: STABLES.map(s => Object.assign({ who: 'Конюшни' }, s)),
          loot: [{ name: 'Лошадиная шкура', qty: 1 }, { name: 'Конина', qty: 2 }], rideable: true }
    ];
    // Верхом: бонусы и доля урона, которую принимает лошадь.
    window.PET_RIDING = { speed: 15, carry: 100, horseShare: 0.7 };

    // Торговцы животными — такие же живые торговцы, как кузнец или алхимик: мастер «завозит» их во владение
    // (gm.js, «🏪 Живые торговцы»), игрок покупает во вкладке торговли. who — какой продавец из sellers выше
    // торгует этим животным; завезти торговца можно только во владение, где такой продавец есть.
    // Цены — из PET_TEMPLATES; лошадь 1000 и собака 500 — из «Всё, что для жизни надо», лист «Свое поместье».
    // «Торговец животными» продаёт своих животных мастера (session.customPets) там, где мастер их указал.
    window.PET_MERCHANTS = {
        stables: { label: 'Конюшни', who: 'Конюшни', gold: 1000, qty: [1, 3] },
        dogBreeder: { label: 'Продавец собак', who: 'Продавец собак', gold: 500, qty: [1, 3] },
        skeeverBreeder: { label: 'Продавец злокрысов', who: 'Продавец злокрысов', gold: 300, qty: [2, 4] },
        spiderBreeder: { label: 'Продавец морозных пауков', who: 'Продавец морозных пауков', gold: 500, qty: [1, 2] },
        petTrader: { label: 'Торговец животными', custom: true, gold: 500, qty: [1, 2] }
    };
    // Владение продавца («Маркарт (Предел)») против владения торговца у мастера («Предел»), город — тоже годится.
    const holdMatch = (seller, hold) => {
        const h = String(hold || '').toLowerCase(); if (!h) return false;
        return [seller.hold, seller.city, seller.place].some(v => {
            const x = String(v || '').toLowerCase();
            return !!x && (x === h || x.indexOf(h) !== -1 || h.indexOf(x) !== -1);
        });
    };
    // Каких животных этот торговец продаёт в этом владении (customPets — свои животные мастера из сессии).
    window.petsForMerchant = function (typeKey, hold, customPets) {
        const def = window.PET_MERCHANTS[typeKey]; if (!def) return [];
        if (def.custom) return (Array.isArray(customPets) ? customPets : []).filter(t => !(t.sellers || []).length || t.sellers.some(s => holdMatch(s, hold)));
        return window.PET_TEMPLATES.filter(t => (t.sellers || []).some(s => s.who === def.who && holdMatch(s, hold)));
    };
    // Где этот торговец вообще есть — для подсказки мастеру.
    window.petMerchantPlaces = function (typeKey) {
        const def = window.PET_MERCHANTS[typeKey]; if (!def || def.custom) return [];
        const out = [];
        window.PET_TEMPLATES.forEach(t => (t.sellers || []).forEach(s => { if (s.who === def.who && out.indexOf(s.city || s.hold) === -1) out.push(s.city || s.hold); }));
        return out;
    };
})();
