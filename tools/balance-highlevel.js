// ============================================================================
// tools/balance-highlevel.js — сила героев 50 уровня против сильнейших врагов (стенд, не CI).
// Запуск из корня: node tools/balance-highlevel.js
// Для каждого билда: 50 уровень, характеристики билда, его навыки 100, все перки билда, эбонит/стекло.
// Читает с листа урон за удар, ОЗ и броню, потом считает, за сколько ударов герой кладёт врага
// каждого ранга (enemy-ranks.js) и за сколько ударов враг кладёт героя (с учётом брони героя).
// ============================================================================
const path = require('path');
process.env.SITE = process.env.SITE || path.resolve(__dirname, '..');
const S = require('../tests/e2e/setup');
const BUILDS = [
  { id: 'two-handed', stats: { str: 26, dex: 14, con: 22, int: 10, wis: 10, cha: 10 }, skills: { 'Двуручное оружие': 100, 'Тяжелая броня': 100, 'Кузнечное дело': 100, 'Восстановление': 50 },
    gear: [['Эбонитовый боевой молот', 'melee'], ['Эбонитовая броня', 'chest'], ['Эбонитовый шлем', 'helmet'], ['Эбонитовые перчатки', 'gloves'], ['Эбонитовые сапоги', 'boots']] },
  { id: 'knight', stats: { str: 24, dex: 14, con: 24, int: 10, wis: 10, cha: 10 }, skills: { 'Одноручное оружие': 100, 'Блокирование': 100, 'Тяжелая броня': 100, 'Кузнечное дело': 80 },
    gear: [['Эбонитовый меч', 'melee'], ['Эбонитовый щит', 'shield'], ['Эбонитовая броня', 'chest'], ['Эбонитовый шлем', 'helmet'], ['Эбонитовые перчатки', 'gloves'], ['Эбонитовые сапоги', 'boots']] },
  { id: 'archer', stats: { str: 12, dex: 26, con: 18, int: 10, wis: 14, cha: 10 }, skills: { 'Стрельба': 100, 'Легкая броня': 100, 'Скрытность': 100, 'Кузнечное дело': 60 },
    gear: [['Эбонитовый лук', 'ranged'], ['Эбонитовая стрела', 'ammo'], ['Стеклянная броня', 'chest'], ['Стеклянный шлем', 'helmet'], ['Стеклянные перчатки', 'gloves'], ['Стеклянные сапоги', 'boots']] },
  { id: 'destruction', stats: { str: 10, dex: 12, con: 18, int: 26, wis: 20, cha: 10 }, skills: { 'Разрушение': 100, 'Восстановление': 80, 'Изменение': 80, 'Зачарование': 60 }, gear: [] }
];
const TARGETS = ['Драугр-повелитель', 'Вампир хозяин ночи', 'Жрец-дракон', 'Мамонт'];
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  const rows = [];
  for (const b of BUILDS) {
    await pl.evaluate((b) => {
      saveLocalStorage(true);
      const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6'));
      const build = buildsData.find(x => x.id === b.id);
      d.characterLevel = 50; d.levelScheme = 2; d.levelUpProgress = 0; d.perkPointsAvailable = 0;
      d.stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => String(b.stats[k]));
      d.skills = skillNames.map(n => String(b.skills[n] || 30));
      d.perkStates = {};
      build.perks.forEach(p => {
        const si = skillNames.indexOf(p.tree), pi = (fullPerksManifest[p.tree] || []).findIndex(x => x.name === p.perk);
        if (si < 0 || pi < 0) return;
        const steps = p.steps || fullPerksManifest[p.tree][pi].steps || 1;
        for (let k = 1; k <= steps; k++) d.perkStates[`skill${si}-perk${pi}-step${k}`] = true;
      });
      d.inventory = []; d.equippedSlots = {};
      applyCharacterData(d); updateAll(); saveLocalStorage(true);
    }, b);
    await wait(800);
    for (const [n, slot] of b.gear) { await S.gmGive(gm, n, slot === 'ammo' ? 30 : 1); await wait(300); }
    await wait(800);
    for (const [n, slot] of b.gear) { const r = await S.plEquip(pl, n, slot); if (typeof r === 'string' && /NOITEM/.test(r)) console.log(b.id, r); }
    await pl.evaluate(() => updateAll()); await wait(500);
    const sh = await S.sheet(pl);
    let dmg = parseInt(sh.dmg) || 0, how = 'оружие';
    if (b.id === 'destruction') {
      // лучшее заклинание Разрушения по базе (урон из описания), с перками и бонусами листа
      const r = await pl.evaluate(() => {
        let best = { dmg: 0 };
        Object.values(spellsData.destr || {}).flat().forEach(s => {
          if (!s || !s.name) return;
          const text = String(s.desc || '').split(/Усил/i)[0];
          const m = text.match(/(\d+)\s*(?:единиц[а-яё]*\s*)?урон/i) || text.match(/нанос[а-яё]*\s+(\d+)/i);
          const base = m ? parseInt(m[1]) : 0;
          if (!base) return;
          const c = computeSpellDamage(s.name, 'destr', base);
          if (c.dmg > best.dmg) best = { dmg: c.dmg, name: s.name, base, cost: s.baseCost };
        });
        return best;
      });
      dmg = r.dmg; how = (r.name || '?') + ' (база ' + r.base + ', мана ' + r.cost + ')';
    }
    rows.push({ id: b.id, lvl: sh.lvl, hp: +sh.maxHp, mp: +sh.maxMp, armor: +sh.armor, dmg, how, phys: (sh.res || '').replace(/\s+/g, ' ').slice(0, 60) });
  }
  const en = await gm.evaluate((T) => T.map(n => { const e = enemiesData.find(x => x.name === n); return EnemyRanks.RANKS.map(r => { const a = EnemyRanks.apply({ name: e.name, maxHp: e.hp, curHp: e.hp, weaponDmg: e.weaponDmg || 0, spells: e.spells || [], resist: e.resist || {} }, r.id); return { name: e.name, rank: r.name, hp: a.maxHp, hit: EnemyRanks.enemyRoundDmg(a), phys: (a.resist || {}).physical || 0, magic: (a.resist || {}).magic || 0 }; }); }).flat(), TARGETS);
  console.log(JSON.stringify({ heroes: rows, enemies: en }, null, 1));
  await H.close();
})();
