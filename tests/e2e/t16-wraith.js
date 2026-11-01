const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code;
  await S.gmAddEnemy(gm, 'Ледяное приведение'); await S.gmAddEnemy(gm, 'Ледяное приведение'); await S.gmAddEnemy(gm, 'Ледяное приведение');
  await wait(2000);
  const en = () => H.store[sk].doc.enemies;
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  console.log('resist', JSON.stringify(en()[0].resist), 'hp', en()[0].curHp);
  const [a, b, c] = en().map(e => e.id);
  // 1. игрок: огонь 30 и холод 30 через общий путь
  await pl.evaluate(([a]) => window.CloudSync.applyDamageToEnemy(a, 30, 'Тест', 'огонь', 'fire'), [a]); await wait(1000);
  check(en()[0].curHp === 230 - 40, 'огонь 30 → −40: hp ' + en()[0].curHp);
  await pl.evaluate(([a]) => window.CloudSync.applyDamageToEnemy(a, 30, 'Тест', 'холод', 'frost'), [a]); await wait(1000);
  check(en()[0].curHp === 190 - 30, 'холод 30 → −30: hp ' + en()[0].curHp);
  // 2. игрок кастует «Огненная стрела»
  await pl.evaluate(() => { characterLevel = 80; document.querySelectorAll('[data-raw-val]').forEach(e => e.setAttribute('data-raw-val', 100)); updateAll(); learnSpellIntoBook('destr', 'Огненная стрела'); window.__al = []; window.alert = m => window.__al.push(String(m)); window.confirm = () => true; });
  const acts = await pl.evaluate(() => { window.renderAttackTargetSelect(); return Array.from(document.getElementById('attack-action-select').options).map(o => o.value + '=' + o.text); });
  const act = (acts.find(x => /Огненная стрела/.test(x)) || '').split('=')[0];
  console.log('act', act);
  const rr = await S.plAttack(pl, b, act, { tries: 12 }); const last = rr[rr.length - 1];
  await pl.evaluate(() => document.getElementById('cur-mp').value = 999);
  await wait(1200);
  console.log('atk', JSON.stringify(last).slice(0, 400));
  check(last.dmgType === 'fire' && 230 - en()[1].curHp === Math.round(last.dmg * 1.33), 'стрела: урон ' + last.dmg + ' → hp ' + en()[1].curHp);
  // 3. мастер: массовый урон огнём 30 по третьему
  await gm.evaluate((c) => { window.confirm = () => true; window.alert = () => {}; gmToggleEnemySel(c, true); document.getElementById('gm-bulk-n').value = 30; document.getElementById('gm-bulk-type').value = 'fire'; gmBulkDamage(); }, c);
  await wait(1500);
  check(en()[2].curHp === 190, 'мастер огонь 30 → −40: hp ' + en()[2].curHp);
  const pv = await gm.evaluate(() => JSON.stringify(window.StCombat.previewDamage({ resist: { fire: -33 } }, 100, 'fire', 0)));
  console.log('preview', pv);
  console.log('issues', JSON.stringify(H.issues).slice(0, 800));
  console.log(ok ? 'ALL OK' : 'HAS FAILS');
  await H.close();
})();
