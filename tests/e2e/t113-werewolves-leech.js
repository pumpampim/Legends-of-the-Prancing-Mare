// 2026-11-13: оборотень изгоев (характеристики медведя-оборотня, фракция изгоев), вервольф с перками, пиявка (25 фт., все болезни).
const S = require('./setup');
(async () => {
  const { gm, code, H, wait } = await S.setupSession();
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const sk = 'sessions/' + code;
  const t = await gm.evaluate(() => {
    const ts = document.getElementById('enemy-type-select'); ts.value = 'forsworn'; ts.dispatchEvent(new Event('change'));
    const forsworn = Array.from(document.getElementById('enemy-db-select').options).map(o => o.text);
    const bear = enemiesData.find(e => e.name === 'Медведь оборотни'), fw = enemiesData.find(e => e.name === 'Оборотень-изгой');
    return { forsworn, same: ['hp', 'weaponDmg', 'level', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'kind'].every(k => bear[k] === fw[k]), n: enemiesData.length };
  });
  check(t.forsworn.some(x => /Оборотень-изгой/.test(x)), 'оборотень-изгой в списке «Изгои»');
  check(t.same, 'у оборотня-изгоя характеристики медведя-оборотня (ХП, урон, уровень, СИЛ…ХАР)');
  check(t.n === 110, 'в базе 110 врагов');
  await S.gmAddEnemy(gm, 'Оборотень-изгой'); await S.gmAddEnemy(gm, 'Вервольф (враг)'); await S.gmAddEnemy(gm, 'Пиявка');
  await wait(800);
  const [fw, ww, lc] = H.store[sk].doc.enemies;
  check(!fw.equip && fw.perks.some(g => g.name === 'Звериная сила') && fw.faction === 'Изгои', 'оборотень-изгой: без снаряжения изгоев, перки оборотня, фракция — ' + fw.perks.map(g => g.name).join(', '));
  check(ww.perks.some(g => g.name === 'Звериная сила'), 'вервольф получил перки оборотня');
  check(lc.speed === 25 && lc.maxHp === 250 && lc.weaponDmg === 29, 'пиявка: 250 ХП, 25 фт., 29 урона');
  let r;
  for (let i = 0; i < 15; i++) { r = await S.gmAttack(gm, lc.id, 'p1', 'weapon', { once: true }); if (r[0].hit) break; }
  await wait(1200);
  const eff = ((H.store['characters/p1'] || {}).doc || {}).activeTimedEffects || [];
  const dis = eff.filter(x => x && /^Болезнь: /.test(x.effectName)).map(x => x.effectName.slice(9));
  check(r[0].hit && dis.length === 8 && !dis.some(d => /ликантроп|вампир/i.test(d)), 'укус пиявки: все 8 болезней — ' + dis.join(', '));
  if (!ok) process.exitCode = 1;
  await H.close();
})();
