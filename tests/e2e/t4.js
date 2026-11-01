// Perks & armor & spells at high level
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({ players: [{ uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 12, wis: 10, cha: 10 } }] });
  const pl = players[0];
  // max skills, level 80, perk points
  const res = await pl.evaluate(() => {
    skillNames.forEach((n, i) => document.getElementById('skill-' + i).setAttribute('data-raw-val', 100));
    characterLevel = 80; perkPointsAvailable = 200; updateAll();
    const take = (perkName, steps) => {
      for (let si = 0; si < skillNames.length; si++) { const L = fullPerksManifest[skillNames[si]] || []; const pi = L.findIndex(p => p.name === perkName);
        if (pi >= 0) { const out = []; for (let s = 1; s <= (steps || L[pi].steps); s++) { const c = document.getElementById(`perk-${si}-${pi}-${s}`); if (!c.checked) { c.checked = true; validatePerkCheck(c); } out.push(c.checked); } return out; } }
      return 'notfound';
    };
    window.__take = take;
    return { lvl: characterLevel, skills: skillNames.map(n => getEffectiveSkillValue(n)) };
  });
  console.log(JSON.stringify(res));
  // armor items
  for (const n of ['Стальной шлем', 'Стальная броня', 'Стальные пластинчатые перчатки', 'Стальные сапоги со щитками', 'Стальной щит']) await S.gmGive(gm, n, 1);
  await wait(700);
  console.log(JSON.stringify(await pl.evaluate(() => playerInventory.map(i => [i.name, i.armorValue, i.slot, i.category]))));
  for (const [n, s] of [['Стальной шлем', 'helmet'], ['Стальная броня', 'chest'], ['Стальные пластинчатые перчатки', 'gloves'], ['Стальные сапоги со щитками', 'boots']]) console.log(n, await S.plEquip(pl, n, s));
  const sh = async (label) => { const x = await S.sheet(pl); console.log(label, 'armor', x.armor, 'speed', x.speed, 'w', x.curW, '/', x.maxW, 'res', x.res, 'mp', x.maxMp, 'eqarmor', await pl.evaluate(() => document.getElementById('eq-armor').value)); };
  await sh('base heavy set');
  const take = async (n, st) => console.log('take', n, JSON.stringify(await pl.evaluate(([n, st]) => window.__take(n, st), [n, st])));
  await take('Джаггернаут'); await sh('juggernaut5');
  await take('Хорошая экипировка'); await sh('+full set1');
  await take('Стальные кулаки'); await take('Мягкая подбивка'); await take('Упорная тренировка'); await sh('+weightless');
  await take('Центр тяжести'); await take('Полный комплект'); await sh('+full set2');
  console.log('dialogs', pl.__dialogs);
  console.log(JSON.stringify(H.issues, null, 1).slice(0, 3000));
  await H.close();
})();
