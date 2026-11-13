// Характеристики врагов из базы (2026-11-13, бестиарий D&D, вариант B): у каждого врага есть 6 характеристик,
// в бой они переходят, урон оружием = база + значение СИЛ (лук — ЛОВ), сложность боя учитывает СИЛ.
const S = require('./setup');
(async () => {
  const { gm, code, H, wait } = await S.setupSession();
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const sk = 'sessions/' + code;
  const miss = await gm.evaluate(() => enemiesData.filter(e => ['str', 'dex', 'con', 'int', 'wis', 'cha'].some(k => typeof e[k] !== 'number')).map(e => e.name));
  check(miss.length === 0, 'у всех 108 врагов есть характеристики' + (miss.length ? ': нет у ' + miss.join(', ') : ''));
  await S.gmAddEnemy(gm, 'Волк');
  await S.gmAddEnemy(gm, 'Фалмер (лучник)');
  await wait(800);
  const [w, f] = H.store[sk].doc.enemies;
  check(w.str === 12 && w.dex === 13 && w.int === 3, 'волк в бою с характеристиками: СИЛ ' + w.str + ', ЛОВ ' + w.dex);
  const dW = await gm.evaluate(e => StBonuses.collectEnemyAttackBonuses(e), w);
  check(dW.total === 30 + 12 && dW.label === 'СИЛ', 'удар волка = 30 + СИЛ 12 = ' + dW.total);
  check(f.isRanged === true, 'фалмер-лучник стреляет');
  const dF = await gm.evaluate(e => StBonuses.collectEnemyAttackBonuses(e), f);
  check(dF.label === 'ЛОВ' && dF.total === f.weaponDmg + f.dex, 'выстрел лучника = урон + ЛОВ: ' + dF.total);
  const r = await gm.evaluate(e => EnemyRanks.enemyRoundDmg(e), w);
  check(r === 42, 'сложность боя считает урон волка с СИЛ: ' + r);
  if (!ok) process.exitCode = 1;
  await H.close();
})();
