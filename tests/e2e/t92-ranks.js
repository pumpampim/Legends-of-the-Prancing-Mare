// Ранги врагов и сложность боя: элита крепче, подсказка ранга по уровню отряда, строка сложности у мастера.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const sk = 'sessions/' + code;
  await wait(1500);
  const pc = H.store[sk].doc.participants.p1;
  check(typeof pc.level === 'number', 'игрок передаёт уровень в сессию: ' + pc.level);
  const opts = await gm.evaluate(() => Array.from(document.getElementById('enemy-rank-select').options).map(o => o.value));
  check(opts.join() === 'normal,veteran,elite,legend', 'список рангов');
  const base = await gm.evaluate(() => enemiesData.find(e => e.name === 'Бандит'));
  await S.gmAddEnemy(gm, 'Бандит');
  await gm.evaluate(() => { document.getElementById('enemy-rank-select').value = 'elite'; });
  await S.gmAddEnemy(gm, 'Бандит');
  await wait(800);
  const en = H.store[sk].doc.enemies;
  const [n, e] = en;
  console.log(JSON.stringify(en.map(x => [x.name, x.maxHp, x.weaponDmg, x.resist, x.rank])));
  check(n.maxHp === base.hp && !n.rank, 'обычный бандит как в базе: ' + n.maxHp);
  check(e.maxHp === Math.round(base.hp * 3.4) && e.curHp === e.maxHp, 'элита: ОЗ ×3.4 = ' + e.maxHp);
  check(e.weaponDmg === Math.round(n.weaponDmg * 1.5), 'элита: урон ×1.5 (' + n.weaponDmg + ' → ' + e.weaponDmg + ')');
  check(((e.resist || {}).physical || 0) === Math.min(85, ((n.resist || {}).physical || 0) + 10), 'элита: физ. резист +10');
  check(/\(элита\)$/.test(e.name) && e.rank === 'elite', 'имя и метка ранга');
  const diff = await gm.evaluate(() => document.getElementById('gm-difficulty').textContent);
  check(/Сложность боя: (Легко|Нормально|Тяжело|Смертельно)/.test(diff), 'строка сложности: ' + diff.slice(0, 90));
  // юнит: формула сложности и рекомендация
  const u = await gm.evaluate(() => {
    const R = EnemyRanks;
    const party = [{ curHp: 100, dmg: 20, level: 10 }, { curHp: 100, dmg: 20, level: 20 }];
    return [R.recommend(1).id, R.recommend(15).id, R.recommend(33).id, R.recommend(65).id,
      R.difficulty(party, [{ curHp: 40, weaponDmg: 5 }]).level.id,
      R.difficulty(party, [{ curHp: 400, weaponDmg: 60 }, { curHp: 400, weaponDmg: 60 }]).level.id,
      R.difficulty(party, []) === null, R.difficulty(party, [{ curHp: 50, weaponDmg: 10, summoned: true }]) === null];
  });
  check(JSON.stringify(u) === '["normal","veteran","elite","legend","easy","deadly",true,true]', 'формулы: ' + JSON.stringify(u));
  if (!ok) process.exitCode = 1;
  await H.close();
})();
